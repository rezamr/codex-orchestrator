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
import { AppError } from '@shared/errors'
import type { ProviderResumeRequest } from '@main/infrastructure/providers/provider'

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
  it('requires review for an external writer, retains the session, and retries only manually', async () => {
    const { orchestrator, store, power, project } = await setup()
    const job = store.createJob({
      ...jobInput(project.id, 'Continue safely', 'shutdown'),
      startImmediately: false
    })
    store.saveSession(job.id, 'fake', 'fixture-codex-thread-active')
    let busy = true
    const realResume = FakeProvider.prototype.resume
    const resumeSpy = vi.spyOn(FakeProvider.prototype, 'resume').mockImplementation(async function (
      this: FakeProvider,
      request: ProviderResumeRequest
    ) {
      if (busy)
        throw new AppError(
          'PROVIDER_BUSY',
          'This conversation is owned by another active Codex client. No instruction was sent.'
        )
      return realResume.call(this, request)
    })
    try {
      await orchestrator.jobAction(job.id, 'start')
      await waitForState(store, job.id, 'NEEDS_REVIEW')
      await new Promise((resolve) => setTimeout(resolve, 100))
      expect(resumeSpy).toHaveBeenCalledTimes(1)
      expect(store.getJobDetail(job.id).sessions[0]?.externalId).toBe('fixture-codex-thread-active')
      expect(store.getJobDetail(job.id).attempts[0]?.providerTurnId).toBeNull()
      expect(store.listPendingSchedules()).toHaveLength(0)
      expect(store.getJob(job.id).automaticAttempts).toBe(0)
      expect(power.actions).toHaveLength(0)
      // Audit retention must not erase the proof that the original instruction was never sent.
      store.database
        .prepare("DELETE FROM job_events WHERE job_id = ? AND type = 'provider.busy'")
        .run(job.id)
      busy = false
      await orchestrator.jobAction(job.id, 'retry')
      await waitForState(store, job.id, 'COMPLETED')
      expect(resumeSpy).toHaveBeenCalledTimes(2)
      expect(resumeSpy.mock.calls[1]?.[0].continuation).toBe('Continue safely')
      expect(store.getJobDetail(job.id).sessions).toHaveLength(1)
      const countdown = store.listPendingSchedules()[0]
      if (countdown) orchestrator.cancelPowerCountdown(countdown.id)
    } finally {
      resumeSpy.mockRestore()
    }
  })

  it('keeps live transcript out of all persisted rows and diagnostic output', async () => {
    const { orchestrator, store, project } = await setup()
    const job = await orchestrator.createJob(jobInput(project.id, '[stream] coherent response'))
    await waitForState(store, job.id, 'COMPLETED')
    const messages = orchestrator.getJobDetail(job.id).conversation.messages
    expect(messages).toHaveLength(1)
    expect(messages[0]?.text).toContain('One coherent response.')
    expect(messages[0]?.status).toBe('completed')
    const tables = store.database
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'")
      .all() as Array<{ name: string }>
    const rows = tables.flatMap(({ name }) =>
      store.database.prepare(`SELECT * FROM "${name.replaceAll('"', '""')}"`).all()
    )
    expect(JSON.stringify(rows)).not.toContain('One coherent response.')
    expect(JSON.stringify(await orchestrator.diagnostics('test'))).not.toContain(
      'One coherent response.'
    )
  })

  it('reads the saved job transcript with its own provider and sanitizes legacy audit without rewriting it', async () => {
    const { store, project } = await setup()
    const modes: string[] = []
    const reader = new Orchestrator(
      store,
      new FakePowerAdapter(),
      new StructuredLogger(),
      () => undefined,
      (mode) => {
        modes.push(mode)
        return new FakeProvider()
      }
    )
    // This reader shares the store but never initializes a scheduler or starts work.
    const job = store.createJob({
      ...jobInput(project.id, 'Legacy review'),
      startImmediately: false
    })
    store.saveSession(job.id, 'fake', 'fixture-codex-thread-active')
    store.updateSettings({ providerMode: 'codex' })
    const oldText = '\u001b[31mlegacy diagnostic\u001b[0m'
    store.appendEvent(job.id, null, 'activity', 'info', oldText)
    const transcript = await reader.readJobConversation(job.id)
    expect(modes).toEqual(['fake'])
    expect(transcript.turns[0]?.items[1]?.text).toContain('without contacting Codex')
    expect(
      reader.getJobDetail(job.id).events.find((event) => event.type === 'activity')?.message
    ).toBe('legacy diagnostic')
    expect(
      store.getJobDetail(job.id).events.find((event) => event.type === 'activity')?.message
    ).toBe(oldText)
    expect(store.getLatestAttempt(job.id)).toBeNull()
    await reader.shutdown()
  })
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

  it('requires manual scheduling when a usage reset time is unknown', async () => {
    const { orchestrator, store, project } = await setup()
    const job = await orchestrator.createJob({
      ...jobInput(project.id, '[limit-unknown] choose a manual resume time'),
      retryPolicy: { maxAutomaticAttempts: 0, baseDelaySeconds: 5, maxDelaySeconds: 10 }
    })

    await waitForState(store, job.id, 'WAITING_FOR_LIMIT')
    expect(store.getJob(job.id).nextActionAt).toBeNull()
    expect(
      store
        .listPendingSchedules()
        .filter((schedule) => schedule.jobId === job.id && schedule.kind === 'resume')
    ).toHaveLength(0)

    const dueAt = new Date(Date.now() + 150).toISOString()
    orchestrator.scheduleManualResume(job.id, dueAt)

    const scheduled = store
      .listPendingSchedules()
      .find((schedule) => schedule.jobId === job.id && schedule.kind === 'resume')
    expect(scheduled?.source).toBe('user')
    expect(scheduled?.dueAt).toBe(dueAt)
    expect(store.getJob(job.id).nextActionAt).toBe(dueAt)

    await waitForState(store, job.id, 'COMPLETED', 3_000)
    const detail = store.getJobDetail(job.id)
    expect(detail.attempts).toHaveLength(2)
    expect(detail.job.automaticAttempts).toBe(0)
  })

  it('rejects invalid manual resume times outside the usage-limit wait state', async () => {
    const { orchestrator, project } = await setup()
    const job = await orchestrator.createJob({
      ...jobInput(project.id, 'Remain in a normal job'),
      startImmediately: false
    })
    await expect(
      Promise.resolve().then(() =>
        orchestrator.scheduleManualResume(job.id, new Date(Date.now() + 60_000).toISOString())
      )
    ).rejects.toThrow('only be set while waiting for a usage reset')
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
