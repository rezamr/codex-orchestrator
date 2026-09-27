import { describe, expect, it } from 'vitest'
import { classifyLimit, computeRetryAt, isRateLimitReached } from '@main/domain/retry-policy'

describe('retry and limit policy', () => {
  const policy = { maxAutomaticAttempts: 3, baseDelaySeconds: 10, maxDelaySeconds: 25 }

  it('uses bounded exponential backoff for transient failures', () => {
    const now = new Date('2026-01-01T00:00:00.000Z')
    expect(computeRetryAt(1, policy, now).toISOString()).toBe('2026-01-01T00:00:10.000Z')
    expect(computeRetryAt(4, policy, now).toISOString()).toBe('2026-01-01T00:00:25.000Z')
  })

  it('reads the documented nested primary Codex reset window', () => {
    const now = new Date('2026-01-01T00:00:00.000Z')
    const reset = Date.parse('2026-01-01T01:00:00.000Z') / 1_000
    const data = {
      rateLimits: {
        primary: { usedPercent: 100, windowDurationMins: 300, resetsAt: reset },
        secondary: null,
        rateLimitReachedType: 'rate_limit_reached'
      }
    }
    const evidence = classifyLimit(data, now)
    expect(isRateLimitReached(data)).toBe(true)
    expect(evidence.source).toBe('provider-structured')
    expect(evidence.confidence).toBe('high')
    expect(evidence.retryAt).toBe('2026-01-01T01:00:00.000Z')
  })

  it('uses the secondary reset when the secondary window is the blocker', () => {
    const now = new Date('2026-01-01T00:00:00.000Z')
    const evidence = classifyLimit(
      {
        primary: {
          usedPercent: 42,
          resetsAt: Date.parse('2026-01-01T00:30:00.000Z') / 1_000
        },
        secondary: {
          usedPercent: 100,
          resetsAt: Date.parse('2026-01-01T02:00:00.000Z') / 1_000
        },
        rateLimitReachedType: 'rate_limit_reached'
      },
      now
    )
    expect(evidence.retryAt).toBe('2026-01-01T02:00:00.000Z')
  })

  it('waits for the latest reset when multiple windows are simultaneously blocking', () => {
    const now = new Date('2026-01-01T00:00:00.000Z')
    const evidence = classifyLimit(
      {
        rateLimitsByLimitId: {
          short: {
            primary: {
              usedPercent: 100,
              resetsAt: Date.parse('2026-01-01T00:30:00.000Z') / 1_000
            },
            rateLimitReachedType: 'rate_limit_reached'
          },
          weekly: {
            secondary: {
              usedPercent: 100,
              resetsAt: Date.parse('2026-01-02T00:00:00.000Z') / 1_000
            },
            rateLimitReachedType: 'rate_limit_reached'
          }
        }
      },
      now
    )
    expect(evidence.retryAt).toBe('2026-01-02T00:00:00.000Z')
  })

  it('returns unknown with no guessed timestamp when reset time is unavailable', () => {
    const now = new Date('2026-01-01T00:00:00.000Z')
    const evidence = classifyLimit(
      { rateLimitReachedType: 'rate_limit_reached', primary: { usedPercent: 100 } },
      now
    )
    expect(evidence.retryAt).toBeNull()
    expect(evidence.source).toBe('unknown')
    expect(evidence.confidence).toBe('low')
  })

  it('keeps conservative text parsing for explicit provider retry text', () => {
    const now = new Date('2026-01-01T00:00:00.000Z')
    const evidence = classifyLimit('Usage limit reached. Try again in 120 seconds.', now)
    expect(evidence.source).toBe('provider-parsed')
    expect(evidence.retryAt).toBe('2026-01-01T00:02:00.000Z')
  })
})
