import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Orchestrator } from '@main/application/orchestrator'
import { OrchestrationStore } from '@main/infrastructure/database/store'
import { StructuredLogger } from '@main/infrastructure/logging/logger'
import { FakePowerAdapter } from '@main/infrastructure/platform/power-adapter'
import { FakeProvider } from '@main/infrastructure/providers/fake-provider'
import type { JobState, PowerAction } from '@shared/types/domain'

const directories: string[] = []
const instances: Array<{ orchestrator: Orchestrator; store: OrchestrationStore }> = []

afterEach(async () => {
  for (const instance of instances.splice(0)) {
    await instance.orchestrator.shutdown()
    instance.store.close()
  }
  for (const directory of directories.splice(0))
    await rm(directory, { recursive: true, force: true })
})

async function setup() {
  const projectPath = await mkdtemp(join(tmpdir(), 'codex-orchestrator-flow-'))
  directories.push(projectPath)
  const store = new OrchestrationStore(':memory:')
  const power = new FakePowerAdapter()
  const orchestrator = new Orchestrator(store, power, new StructuredLogger())
  instances.push({ orchestrator, store })
  await orchestrator.initialize()
  const project = await orchestrator.createProject('Flow', projectPath)
  return { projectPath, store, power, orchestrator, project }
}

async function waitForState(
  store: OrchestrationStore,
  id: string,
  expected: JobState,
  timeout = 2_000
) {
  const deadline = Date.now() + timeout
  while (Date.now() < deadline) {
    const job = store.getJob(id)
    if (job.state === expected) return job
    await new Promise((resolve) => setTimeout(resolve, 10))
  }
  throw new Error(`Timed out waiting for ${expected}; current state is ${store.getJob(id).state}`)
}

function jobInput(projectId: string, objective: string, action: PowerAction = 'none') {
  return {
    projectId,
    objective,
    provider: 'fake' as const,
    retryPolicy: { maxAutomaticAttempts: 3, baseDelaySeconds: 5, maxDelaySeconds: 10 },
    verification: [],
    powerPolicy: { action, countdownSeconds: 5, preventSleepWhileActive: true },
    startImmediately: true
  }
}

describe('orchestrator fake-provider workflows', () => {
  it('reruns only checks after failure, rejects duplicates, and never repeats provider work', async () => {
    const { orchestrator, store, power, project, projectPath } = await setup()
    const job = await orchestrator.createJob({
      ...jobInput(project.id, 'Verify once then fix the check'),
      verification: [
        {
          id: 'test',
          kind: 'test',
          label: 'Controlled check',
          command: process.execPath,
          args: [
            '-e',
            'setTimeout(() => process.exit(require("node:fs").existsSync("allow") ? 0 : 1), 100)'
          ],
          required: true,
          timeoutMs: 5_000
        }
      ]
    })
    await waitForState(store, job.id, 'VERIFICATION_FAILED')
    await writeFile(join(projectPath, 'allow'), '')
    await orchestrator.jobAction(job.id, 'verify')
    await expect(orchestrator.jobAction(job.id, 'cancel')).rejects.toThrow(
      'Workspace protection remains held'
    )
    expect(store.getJob(job.id).state).toBe('VERIFYING')
    await expect(orchestrator.jobAction(job.id, 'verify')).rejects.toThrow(
      'completed provider turn'
    )
    await waitForState(store, job.id, 'COMPLETED')
    expect(store.getJobDetail(job.id).attempts).toHaveLength(1)
    expect(store.getVerificationRuns(job.id).map((run) => run.status)).toEqual(['passed', 'failed'])
    expect(power.actions).toHaveLength(0)
  })

  it('fails closed on verification infrastructure errors and continues queued work', async () => {
    const { orchestrator, store, project } = await setup()
    const failure = vi.spyOn(store, 'startVerificationRun').mockImplementationOnce(() => {
      throw new Error('Controlled persistence failure')
    })
    const job = await orchestrator.createJob(jobInput(project.id, 'Persistence failure'))
    await waitForState(store, job.id, 'NEEDS_REVIEW')
    expect(
      store
        .listEvents(job.id)
        .some((event) => event.message.includes('Controlled persistence failure'))
    ).toBe(true)
    failure.mockRestore()
    const next = await orchestrator.createJob(jobInput(project.id, 'Queue still works'))
    await waitForState(store, next.id, 'COMPLETED')
  })

  it('recovers interrupted verification without starting a second provider attempt', async () => {
    const { orchestrator, store, project } = await setup()
    const job = store.createJob({
      ...jobInput(project.id, 'Interrupted checks'),
      startImmediately: false
    })
    store.transitionJob(job.id, 'QUEUED', 'queued')
    store.transitionJob(job.id, 'STARTING', 'started')
    const attempt = store.createAttempt(job.id, 'start')
    store.updateAttempt(attempt.id, { status: 'completed' }, true)
    store.transitionJob(job.id, 'RUNNING', 'running')
    store.transitionJob(job.id, 'VERIFYING', 'checks')
    store.startVerificationRun(job.id)
    await orchestrator.shutdown()
    instances.splice(0)
    const recovered = new Orchestrator(store, new FakePowerAdapter(), new StructuredLogger())
    instances.push({ orchestrator: recovered, store })
    await recovered.initialize()
    expect(store.getJob(job.id).state).toBe('NEEDS_REVIEW')
    expect(store.getVerificationRuns(job.id)[0]?.status).toBe('failed')
    await recovered.jobAction(job.id, 'verify')
    await waitForState(store, job.id, 'COMPLETED')
    expect(store.getJobDetail(job.id).attempts).toHaveLength(1)
  })

  it('loads a connected workspace and explicitly continues one saved session without duplicating it', async () => {
    const store = new OrchestrationStore(':memory:')
    const orchestrator = new Orchestrator(
      store,
      new FakePowerAdapter(),
      new StructuredLogger(),
      () => undefined,
      () => new FakeProvider()
    )
    instances.push({ orchestrator, store })
    await orchestrator.initialize()
    const workspace = await orchestrator.loadCodexWorkspace()
    expect(workspace.threads.threads).toHaveLength(2)
    expect(workspace.threads.threads[0]?.cwd).toBe(process.cwd())
    expect(store.listJobs()).toHaveLength(0)
    await expect(
      orchestrator.continueCodexThread({
        threadId: 'fixture-codex-thread-archived',
        objective: 'Do not run',
        retryPolicy: { maxAutomaticAttempts: 0, baseDelaySeconds: 5, maxDelaySeconds: 10 },
        verification: [],
        powerPolicy: { action: 'none', countdownSeconds: 5, preventSleepWhileActive: true }
      })
    ).rejects.toThrow('Archived')
    const input = {
      threadId: 'fixture-codex-thread-active',
      objective: 'Continue safely',
      retryPolicy: { maxAutomaticAttempts: 0, baseDelaySeconds: 5, maxDelaySeconds: 10 },
      verification: [],
      powerPolicy: { action: 'none' as const, countdownSeconds: 5, preventSleepWhileActive: true }
    }
    const job = await orchestrator.continueCodexThread(input)
    await waitForState(store, job.id, 'COMPLETED')
    expect(store.getJobDetail(job.id).sessions.map((session) => session.externalId)).toEqual([
      'fixture-codex-thread-active'
    ])
    expect((await orchestrator.listCodexThreads()).threads[0]?.managedJobId).toBe(job.id)
    await expect(orchestrator.continueCodexThread(input)).rejects.toThrow('already managed')
    expect(store.listJobs()).toHaveLength(1)
  })

  it('reads a Codex thread into the current response without persisting transcript content', async () => {
    const projectPath = await mkdtemp(join(tmpdir(), 'codex-orchestrator-history-'))
    directories.push(projectPath)
    const store = new OrchestrationStore(':memory:')
    const orchestrator = new Orchestrator(
      store,
      new FakePowerAdapter(),
      new StructuredLogger(),
      () => undefined,
      () => new FakeProvider()
    )
    instances.push({ orchestrator, store })
    await orchestrator.initialize()

    const index = await orchestrator.listCodexThreads()
    const transcript = await orchestrator.readCodexThread(index.threads[0]!.id)
    expect(transcript.turns[0]?.items[1]?.text).toContain('without contacting Codex')

    const tables = store.database
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'")
      .all() as Array<{ name: string }>
    const persistedRows = tables.flatMap(({ name }) => {
      const escapedTable = name.replaceAll('"', '""')
      return store.database.prepare(`SELECT * FROM "${escapedTable}"`).all()
    })
    expect(JSON.stringify(persistedRows)).not.toContain(
      'This fixture verifies the read-only history UI without contacting Codex.'
    )
  })

  it('completes a durable job and records attempts and sessions', async () => {
    const { orchestrator, store, project } = await setup()
    const job = await orchestrator.createJob(jobInput(project.id, 'Complete normally'))
    await waitForState(store, job.id, 'COMPLETED')
    const detail = store.getJobDetail(job.id)
    expect(detail.attempts).toHaveLength(1)
    expect(detail.sessions).toHaveLength(1)
    expect(detail.verificationRuns[0]?.status).toBe('passed')
  })

  it('halts for approval and resumes only after a human decision', async () => {
    const { orchestrator, store, project } = await setup()
    const job = await orchestrator.createJob(
      jobInput(project.id, '[approval] complete after approval')
    )
    await waitForState(store, job.id, 'WAITING_FOR_APPROVAL')
    const approval = store.pendingApprovals(job.id)[0]!
    await orchestrator.respondToApproval(approval.id, 'accept')
    await waitForState(store, job.id, 'COMPLETED')
    expect(store.getApproval(approval.id).status).toBe('accepted')
  })

  it('halts for user input and resumes after a persisted response', async () => {
    const { orchestrator, store, project } = await setup()
    const job = await orchestrator.createJob(jobInput(project.id, '[input] ask for clarification'))
    await waitForState(store, job.id, 'WAITING_FOR_INPUT')
    const approval = store.pendingApprovals(job.id)[0]!
    expect(approval.kind).toBe('user-input')
    await orchestrator.respondToApproval(approval.id, 'accept', {
      answer: 'Use the documented default.'
    })
    await waitForState(store, job.id, 'COMPLETED')
  })

  it('keeps an intentionally paused job paused when the provider acknowledges interruption', async () => {
    const { orchestrator, store, project } = await setup()
    const job = await orchestrator.createJob(jobInput(project.id, '[approval] pause safely'))
    await waitForState(store, job.id, 'WAITING_FOR_APPROVAL')
    await orchestrator.jobAction(job.id, 'pause')
    await new Promise((resolve) => setTimeout(resolve, 50))
    expect(store.getJob(job.id).state).toBe('PAUSED')
    expect(store.listEvents(job.id).some((event) => event.type === 'provider.event_ignored')).toBe(
      true
    )
  })

  it('holds same-project work in the queue while approval keeps a protected slot active', async () => {
    const { orchestrator, store, project } = await setup()
    const first = await orchestrator.createJob(jobInput(project.id, '[approval] protected slot'))
    await waitForState(store, first.id, 'WAITING_FOR_APPROVAL')
    const second = await orchestrator.createJob(jobInput(project.id, 'queued behind approval'))
    await new Promise((resolve) => setTimeout(resolve, 50))
    expect(store.getJob(second.id).state).toBe('QUEUED')
    const approval = store.pendingApprovals(first.id)[0]!
    await orchestrator.respondToApproval(approval.id, 'accept')
    await waitForState(store, first.id, 'COMPLETED')
    await waitForState(store, second.id, 'COMPLETED')
  })

  it('persists a limit schedule and resumes the same session in a new attempt', async () => {
    const { orchestrator, store, project } = await setup()
    const job = await orchestrator.createJob(jobInput(project.id, '[limit] resume later'))
    await waitForState(store, job.id, 'WAITING_FOR_LIMIT')
    expect(
      store.getJobDetail(job.id).schedules.find((schedule) => schedule.kind === 'resume')?.source
    ).toBe('provider-structured')
    await waitForState(store, job.id, 'COMPLETED', 3_000)
    const detail = store.getJobDetail(job.id)
    expect(detail.attempts).toHaveLength(2)
    expect(new Set(detail.sessions.map((session) => session.externalId)).size).toBe(1)
  })

  it('reconciles an ambiguous running job to needs-review after restart', async () => {
    const { orchestrator, store, project } = await setup()
    const job = store.createJob({
      ...jobInput(project.id, 'Interrupted by crash'),
      startImmediately: false
    })
    store.transitionJob(job.id, 'QUEUED', 'queued')
    store.transitionJob(job.id, 'STARTING', 'started')
    store.transitionJob(job.id, 'RUNNING', 'running')
    await orchestrator.shutdown()
    instances.splice(0)
    const recovered = new Orchestrator(store, new FakePowerAdapter(), new StructuredLogger())
    instances.push({ orchestrator: recovered, store })
    await recovered.initialize()
    expect(store.getJob(job.id).state).toBe('NEEDS_REVIEW')
  })

  it('executes eligible power behavior only through the fake adapter', async () => {
    const { orchestrator, store, power, project } = await setup()
    const job = store.createJob({
      ...jobInput(project.id, 'Power simulation', 'shutdown'),
      startImmediately: false
    })
    store.transitionJob(job.id, 'QUEUED', 'queued')
    store.transitionJob(job.id, 'STARTING', 'start')
    store.transitionJob(job.id, 'RUNNING', 'run')
    store.transitionJob(job.id, 'VERIFYING', 'verify')
    store.transitionJob(job.id, 'COMPLETED', 'complete')
    store.createSchedule(
      job.id,
      'power',
      new Date(Date.now() - 100).toISOString(),
      'user',
      'high',
      {
        action: 'shutdown'
      }
    )
    await orchestrator.shutdown()
    instances.splice(0)
    const resumed = new Orchestrator(store, power, new StructuredLogger())
    instances.push({ orchestrator: resumed, store })
    await resumed.initialize()
    await new Promise((resolve) => setTimeout(resolve, 100))
    expect(power.actions).toHaveLength(1)
    expect(power.actions[0]).toMatchObject({ action: 'shutdown', simulated: true })
  })
})
