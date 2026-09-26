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
  it('persists a synchronous invalid-argument launch failure instead of rejecting and leaving a running run', async () => {
    const store = new OrchestrationStore(':memory:')
    try {
      const job = createJob(store)
      expect(
        await new VerificationEngine(store).run(job.id, process.cwd(), [
          {
            id: 'invalid',
            kind: 'custom',
            label: 'Invalid argument',
            command: process.execPath,
            args: ['\0'],
            required: true,
            timeoutMs: 5_000
          }
        ])
      ).toBe(false)
      const run = store.getVerificationRuns(job.id)[0]!
      expect(run.status).toBe('failed')
      expect(run.endedAt).not.toBeNull()
      expect(run.checks[0]).toMatchObject({ passed: false, exitCode: null })
      expect(run.checks[0]?.error).toBeTruthy()
    } finally {
      store.close()
    }
  })

  it('preserves shell metacharacters as literal native-process arguments', async () => {
    const store = new OrchestrationStore(':memory:')
    try {
      const job = createJob(store)
      const argument = 'literal & echo NOT_A_COMMAND | %PATH% "quoted"'
      expect(
        await new VerificationEngine(store).run(job.id, process.cwd(), [
          {
            id: 'literal',
            kind: 'custom',
            label: 'Literal arguments',
            command: process.execPath,
            args: ['-e', 'console.log(process.argv[1])', argument],
            required: true,
            timeoutMs: 5_000
          }
        ])
      ).toBe(true)
      expect(store.getVerificationRuns(job.id)[0]?.checks[0]?.output.trim()).toBe(argument)
    } finally {
      store.close()
    }
  })

  it.skipIf(process.platform !== 'win32')(
    'launches installed npm through Node without a batch shell',
    async () => {
      const store = new OrchestrationStore(':memory:')
      try {
        const job = createJob(store)
        expect(
          await new VerificationEngine(store).run(job.id, process.cwd(), [
            {
              id: 'npm',
              kind: 'custom',
              label: 'npm version',
              command: 'npm',
              args: ['--version'],
              required: true,
              timeoutMs: 10_000
            }
          ])
        ).toBe(true)
        expect(store.getVerificationRuns(job.id)[0]?.checks[0]?.output).toMatch(/\d+\.\d+\.\d+/)
      } finally {
        store.close()
      }
    }
  )

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
