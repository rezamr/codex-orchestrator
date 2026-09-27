import { describe, expect, it } from 'vitest'
import { normalizeCodexNotification } from '@main/infrastructure/providers/codex/event-normalizer'

describe('Codex app-server event normalization', () => {
  it('projects message identities and fragments without turning them into audit entries', () => {
    expect(
      normalizeCodexNotification('item/agentMessage/delta', { itemId: 'm1', delta: 'hel' })
    ).toEqual([{ type: 'message.updated', itemId: 'm1', turnId: '', text: 'hel', mode: 'delta' }])
    expect(
      normalizeCodexNotification('item/agentMessage/delta', { itemId: 'm1', delta: 'lo' })
    ).toEqual([{ type: 'message.updated', itemId: 'm1', turnId: '', text: 'lo', mode: 'delta' }])
    expect(
      normalizeCodexNotification('item/started', {
        item: { type: 'agentMessage', id: 'm1', text: '' }
      })
    ).toEqual([{ type: 'message.updated', itemId: 'm1', turnId: '', text: '', mode: 'start' }])
    expect(
      normalizeCodexNotification('item/completed', {
        item: { type: 'agentMessage', id: 'm1', text: 'hello world' }
      })
    ).toEqual([
      { type: 'message.updated', itemId: 'm1', turnId: '', text: 'hello world', mode: 'complete' }
    ])
  })
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

  it('normalizes the documented nested Codex usage-limit window', () => {
    const events = normalizeCodexNotification(
      'account/rateLimits/updated',
      {
        rateLimits: {
          primary: {
            usedPercent: 100,
            windowDurationMins: 300,
            resetsAt: 1_800_000_000
          },
          secondary: null,
          rateLimitReachedType: 'rate_limit_reached'
        }
      },
      new Date('2026-01-01T00:00:00.000Z')
    )
    expect(events?.[0]?.type).toBe('provider.rate_limited')
    if (events?.[0]?.type === 'provider.rate_limited') {
      expect(events[0].evidence.source).toBe('provider-structured')
      expect(events[0].evidence.retryAt).toBe('2027-01-15T08:00:00.000Z')
    }
  })

  it('does not invent a reset time for a sparse reached notification', () => {
    const events = normalizeCodexNotification(
      'account/rateLimits/updated',
      {
        rateLimits: {
          primary: { usedPercent: 100 },
          rateLimitReachedType: 'rate_limit_reached'
        }
      },
      new Date('2026-01-01T00:00:00.000Z')
    )
    expect(events?.[0]?.type).toBe('provider.rate_limited')
    if (events?.[0]?.type === 'provider.rate_limited') {
      expect(events[0].evidence.retryAt).toBeNull()
      expect(events[0].evidence.source).toBe('unknown')
    }
  })
})
