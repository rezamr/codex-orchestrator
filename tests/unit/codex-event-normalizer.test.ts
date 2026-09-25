import { describe, expect, it } from 'vitest'
import { normalizeCodexNotification } from '@main/infrastructure/providers/codex/event-normalizer'

describe('Codex app-server event normalization', () => {
  it('maps stable thread and turn notifications', () => {
    expect(normalizeCodexNotification('thread/started', { thread: { id: 'thr_1' } })).toEqual([
      { type: 'session.started', sessionId: 'thr_1' }
    ])
    expect(
      normalizeCodexNotification('turn/started', { threadId: 'thr_1', turn: { id: 'turn_1' } })
    ).toEqual([{ type: 'turn.started', sessionId: 'thr_1', turnId: 'turn_1' }])
  })

  it('maps command lifecycle without exposing raw provider contracts', () => {
    expect(
      normalizeCodexNotification('item/started', {
        item: { type: 'commandExecution', command: ['npm', 'test'], status: 'inProgress' }
      })
    ).toEqual([{ type: 'command.started', message: 'npm test' }])
  })

  it('normalizes a structured usage limit', () => {
    const events = normalizeCodexNotification(
      'account/rateLimits/updated',
      { rateLimits: { rateLimitReachedType: 'primary', resetsAt: 1_800_000_000 } },
      new Date('2026-01-01T00:00:00.000Z')
    )
    expect(events?.[0]?.type).toBe('provider.rate_limited')
    if (events?.[0]?.type === 'provider.rate_limited') {
      expect(events[0].evidence.source).toBe('provider-structured')
    }
  })
})
