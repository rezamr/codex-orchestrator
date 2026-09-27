import { mkdtemp, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { afterEach, describe, expect, it } from 'vitest'
import { OrchestrationStore } from '@main/infrastructure/database/store'
import { AGENT_PROFILES } from '@main/domain/agent-profiles'

const directories: string[] = []

afterEach(async () => {
  for (const directory of directories.splice(0))
    await rm(directory, { recursive: true, force: true })
})

async function databasePath(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), 'codex-orchestrator-db-'))
  directories.push(directory)
  return join(directory, 'test.db')
}

describe('SQLite migrations and repositories', () => {
  it('applies explicit migrations and persists lifecycle state across reopen', async () => {
    const path = await databasePath()
    const projectDirectory = await mkdtemp(join(tmpdir(), 'codex-orchestrator-project-'))
    directories.push(projectDirectory)
    let store = new OrchestrationStore(path)
    expect(store.schemaVersion()).toBe(5)
    store.updateSettings({ maxConcurrentJobs: 4 })
    const project = store.createProject('Project', projectDirectory)
    const job = store.createJob({
      projectId: project.id,
      objective: 'Persist this objective',
      provider: 'fake',
      retryPolicy: { maxAutomaticAttempts: 3, baseDelaySeconds: 60, maxDelaySeconds: 3600 },
      verification: [],
      powerPolicy: { action: 'none', countdownSeconds: 60, preventSleepWhileActive: true },
      startImmediately: true
    })
    store.transitionJob(job.id, 'STARTING', 'start')
    store.transitionJob(job.id, 'RUNNING', 'run')
    store.close()

    store = new OrchestrationStore(path)
    expect(store.getJob(job.id).state).toBe('RUNNING')
    expect(store.listEvents(job.id).length).toBeGreaterThanOrEqual(3)
    store.close()
  })

  it('upgrades a representative version-one database without discarding history', async () => {
    const path = await databasePath()
    let store = new OrchestrationStore(path)
    store.database.exec('DROP TABLE profiles; DELETE FROM schema_migrations WHERE version = 2;')
    store.close()
    store = new OrchestrationStore(path)
    expect(store.schemaVersion()).toBe(5)
    const profileTable = store.database
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'profiles'")
      .get()
    expect(profileTable).toBeTruthy()
    store.close()
  })

  it('removes the obsolete manual Codex executable path while preserving other settings', async () => {
    const path = await databasePath()
    let store = new OrchestrationStore(path)
    store.database
      .prepare('INSERT INTO settings(key, value_json, updated_at) VALUES (?, ?, ?)')
      .run(
        'codexExecutablePath',
        JSON.stringify(join(tmpdir(), 'ChatGPT.exe')),
        new Date().toISOString()
      )
    store.updateSettings({ maxConcurrentJobs: 5 })
    store.database.exec('DELETE FROM schema_migrations WHERE version = 3;')
    store.close()

    store = new OrchestrationStore(path)
    expect(store.schemaVersion()).toBe(5)
    expect(store.getSettings().maxConcurrentJobs).toBe(5)
    expect(
      store.database.prepare("SELECT key FROM settings WHERE key = 'codexExecutablePath'").get()
    ).toBeUndefined()
    store.close()
  })

  it('persists an atomic delegation relationship and bounded routing metadata', async () => {
    const path = await databasePath()
    const projectDirectory = await mkdtemp(join(tmpdir(), 'codex-orchestrator-delegation-'))
    directories.push(projectDirectory)
    const store = new OrchestrationStore(path)
    const project = store.createProject('Delegation', projectDirectory)
    const parent = store.createJob({
      projectId: project.id,
      objective: 'Route one child',
      provider: 'fake',
      kind: 'controller',
      requestedModel: 'gpt-6-astra',
      requestedEffort: 'high',
      retryPolicy: { maxAutomaticAttempts: 2, baseDelaySeconds: 5, maxDelaySeconds: 10 },
      verification: [],
      powerPolicy: { action: 'none', countdownSeconds: 60, preventSleepWhileActive: true },
      startImmediately: true
    })
    store.transitionJob(parent.id, 'STARTING', 'start')
    store.transitionJob(parent.id, 'RUNNING', 'run')
    const attempt = store.createAttempt(parent.id, 'start')
    const { delegation, child } = store.createDelegation(
      parent.id,
      attempt.id,
      {
        action: 'delegate',
        summary: 'Delegate once.',
        child: {
          profile: 'LUNA_DEV',
          taskClass: 'development',
          complexity: 'low',
          bounded: true,
          rootCauseProven: true,
          expectedFiles: 2,
          multiModule: false,
          risk: {
            authentication: 'no',
            workspaceScope: 'no',
            query: 'no',
            security: 'no',
            database: 'no',
            deployment: 'no',
            architecture: 'no'
          },
          instruction: 'Verify the candidate.'
        }
      },
      {
        requestedProfile: 'LUNA_DEV',
        selectedProfile: AGENT_PROFILES.LUNA_DEV,
        policyMatch: 'accepted',
        whySelected: 'Runtime QA.',
        whyNotOtherDeveloper: 'Independent QA.',
        escalatedTo: null
      }
    )
    expect(store.getJob(parent.id).state).toBe('WAITING_FOR_CHILD')
    expect(child.kind).toBe('delegated-child')
    expect(delegation.requestedModel).toBe('gpt-5.6-luna')
    store.close()

    const reopened = new OrchestrationStore(path)
    expect(reopened.getDelegationForChild(child.id)).toMatchObject({
      parentJobId: parent.id,
      status: 'child_queued',
      requestedEffort: 'max'
    })
    reopened.markDelegatedChildRunning(child.id, 'fixture-child-attempt')
    reopened.settleDelegation(child.id, 'child_failed', {
      status: 'failed',
      summary: 'Controlled Luna failure.',
      evidence: [],
      nextAction: null
    })
    reopened.markParentResuming(parent.id)
    reopened.markParentResumed(parent.id)
    expect(reopened.lunaDevelopmentFailed(parent.id)).toBe(true)
    reopened.close()
  })
})
