import { resolve } from 'node:path'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { CodexAppServerProvider } from '@main/infrastructure/providers/codex/codex-provider'
import {
  discoverCodexExecutableCandidates,
  isSupportedCodexExecutable
} from '@main/infrastructure/providers/codex/codex-executable-discovery'
import type { ProviderEvent } from '@main/infrastructure/providers/provider'

const temporaryDirectories: string[] = []

afterEach(async () => {
  for (const directory of temporaryDirectories.splice(0))
    await rm(directory, { recursive: true, force: true })
})

async function waitFor(
  events: ProviderEvent[],
  predicate: (event: ProviderEvent) => boolean,
  timeoutMs = 2_000
): Promise<ProviderEvent> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const found = events.find(predicate)
    if (found) return found
    await new Promise((resolveWait) => setTimeout(resolveWait, 10))
  }
  throw new Error('Timed out waiting for fixture provider event.')
}

describe('Codex app-server JSONL transport', () => {
  it('handshakes, starts, resumes, interrupts, and handles approval responses', async () => {
    const provider = new CodexAppServerProvider(
      [resolve('tests/fixtures/fake-codex-app-server.mjs')],
      async () => [process.execPath]
    )
    const events: ProviderEvent[] = []
    provider.subscribe((event) => events.push(event))

    await provider.connect()
    const started = await provider.start({
      objective: 'approval required',
      cwd: process.cwd(),
      profile: 'default'
    })
    const approval = await waitFor(events, (event) => event.type === 'approval.requested')
    expect(started.sessionId).toBe('fixture-thread-1')
    if (approval.type !== 'approval.requested') throw new Error('Expected approval event.')
    await provider.respondToApproval(approval.requestId, 'accept')
    await waitFor(events, (event) => event.type === 'turn.completed')

    const resumed = await provider.resume({
      objective: 'original',
      continuation: 'continue without approval',
      cwd: process.cwd(),
      profile: 'default',
      sessionId: started.sessionId
    })
    expect(resumed.sessionId).toBe(started.sessionId)
    await provider.interrupt(resumed)
    await provider.disconnect()
  })

  it('autodiscovers only the Codex CLI, including the desktop-managed Windows installation', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'codex-discovery-'))
    temporaryDirectories.push(directory)
    const localAppData = join(directory, 'local')
    const bundledCli = join(localAppData, 'OpenAI', 'Codex', 'bin', 'build-123', 'codex.exe')
    const chatGptApp = join(directory, 'ChatGPT.exe')
    await import('node:fs/promises').then(({ mkdir }) =>
      mkdir(join(localAppData, 'OpenAI', 'Codex', 'bin', 'build-123'), { recursive: true })
    )
    await writeFile(bundledCli, '')
    await writeFile(chatGptApp, '')

    expect(isSupportedCodexExecutable(chatGptApp, 'win32')).toBe(false)
    expect(
      await discoverCodexExecutableCandidates({
        platform: 'win32',
        env: { LOCALAPPDATA: localAppData },
        locate: async () => `${chatGptApp}\r\n${bundledCli}\r\n${join(directory, 'codex.cmd')}`
      })
    ).toEqual([bundledCli])
  })

  it('continues to the next discovered CLI when an earlier candidate cannot be launched', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'codex-fallback-'))
    temporaryDirectories.push(directory)
    const staleCandidate = join(directory, 'stale-install', 'codex.exe')
    const provider = new CodexAppServerProvider([], async () => [staleCandidate, process.execPath])

    const status = await provider.probe()
    expect(status.state).toBe('available')
    expect(status.executablePath).toBe(process.execPath)
    expect(status.version).toBeTruthy()
  })

  it('reads account usage and every active/archived thread page without resuming stored threads', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'codex-app-server-test-'))
    temporaryDirectories.push(directory)
    const callLog = join(directory, 'rpc-methods.log')
    const provider = new CodexAppServerProvider(
      [resolve('tests/fixtures/fake-codex-app-server.mjs'), callLog],
      async () => [process.execPath]
    )

    const account = await provider.readAccountSnapshot()
    expect(account.planType).toBe('pro')
    expect(account.authMode).toBe('chatgpt')
    expect(account.rateLimits?.[0]).toMatchObject({ id: 'codex', primary: { usedPercent: 20 } })
    expect(account.usage?.summary?.lifetimeTokens).toBe(1234)
    expect(account.usage?.dailyBuckets).toEqual([{ startDate: '2026-09-24', tokens: 321 }])
    expect(JSON.stringify(account)).not.toContain('must-not-be-exposed@example.test')

    const index = await provider.listThreads()
    expect(index.threads.map((thread) => [thread.id, thread.archived])).toEqual([
      ['fixture-active-1', false],
      ['fixture-active-2', false],
      ['fixture-archived', true]
    ])
    expect(index.threads[0]).toMatchObject({
      cwd: process.cwd(),
      projectId: 'fixture-project',
      sourceKind: 'vscode',
      model: 'fixture-model',
      status: 'notLoaded'
    })
    const transcript = await provider.readThread('fixture-active-1')
    expect(transcript.turns[0]?.items.map((item) => item.text)).toContain(
      'This transcript is read without resuming.'
    )
    expect(JSON.stringify(transcript)).not.toContain('private raw reasoning')
    const metadataOnly = await provider.readThread('fixture-active-1', false)
    expect(metadataOnly.turns).toHaveLength(0)
    expect(metadataOnly.summary.cwd).toBe(process.cwd())

    const largeTranscript = await provider.readThread('fixture-large')
    expect(largeTranscript.turns).toHaveLength(1_000)
    expect(largeTranscript.truncated).toBe(true)

    const methods = (await readFile(callLog, 'utf8')).trim().split(/\r?\n/)
    expect(methods).toContain('thread/list')
    expect(methods).toContain('thread/read')
    expect(methods).not.toContain('thread/resume')
    expect(methods).not.toContain('account/rateLimitResetCredit/consume')
    await provider.disconnect()
  })
})
