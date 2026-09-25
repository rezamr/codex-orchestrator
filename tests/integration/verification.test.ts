import { describe, expect, it } from 'vitest'
import { VerificationEngine } from '@main/application/verification-engine'
import { OrchestrationStore } from '@main/infrastructure/database/store'

function createJob(store: OrchestrationStore) {
  const project = store.createProject('Test', process.cwd())
  return store.createJob({
    projectId: project.id,
    objective: 'verify',
    provider: 'fake',
    retryPolicy: { maxAutomaticAttempts: 1, baseDelaySeconds: 5, maxDelaySeconds: 10 },
    verification: [],
    powerPolicy: { action: 'none', countdownSeconds: 5, preventSleepWhileActive: true },
    startImmediately: false
  })
}

describe('verification engine', () => {
  it('persists bounded evidence and blocks on required failure', async () => {
    const store = new OrchestrationStore(':memory:')
    const job = createJob(store)
    const engine = new VerificationEngine(store)
    const passed = await engine.run(job.id, process.cwd(), [
      {
        id: 'failure',
        kind: 'custom',
        label: 'Required failure',
        command: process.execPath,
        args: ['-e', 'console.error("expected"); process.exit(2)'],
        required: true,
        timeoutMs: 5_000
      }
    ])
    expect(passed).toBe(false)
    const run = store.getVerificationRuns(job.id)[0]!
    expect(run.status).toBe('failed')
    expect(run.checks[0]?.exitCode).toBe(2)
    expect(run.checks[0]?.output).toContain('expected')
    store.close()
  })
})
