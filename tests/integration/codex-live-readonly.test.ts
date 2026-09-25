import { describe, expect, it } from 'vitest'
import { CodexAppServerProvider } from '@main/infrastructure/providers/codex/codex-provider'

const enabled = process.env.CODEX_ORCHESTRATOR_LIVE_CODEX_TEST === '1'

describe('installed Codex read-only compatibility (opt-in)', () => {
  it.skipIf(!enabled)(
    'discovers the installed CLI and reads account, usage, and local thread history',
    async () => {
      const provider = new CodexAppServerProvider()
      try {
        await provider.connect()
        const status = await provider.probe()
        expect(status.executablePath).not.toBeNull()
        expect(status.version).toBeTruthy()

        const account = await provider.readAccountSnapshot()
        expect(account.fetchedAt).toBeTruthy()
        expect(account.planType === null || typeof account.planType === 'string').toBe(true)

        const index = await provider.listThreads()
        expect(Array.isArray(index.threads)).toBe(true)
        if (index.threads[0]) {
          const transcript = await provider.readThread(index.threads[0].id)
          expect(transcript.summary.id).toBe(index.threads[0].id)
          expect(Array.isArray(transcript.turns)).toBe(true)
        }
      } finally {
        await provider.disconnect()
      }
    },
    60_000
  )
})
