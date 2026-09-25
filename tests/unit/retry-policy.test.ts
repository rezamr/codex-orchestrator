import { describe, expect, it } from 'vitest'
import { classifyLimit, computeRetryAt } from '@main/domain/retry-policy'

describe('retry and limit policy', () => {
  const policy = { maxAutomaticAttempts: 3, baseDelaySeconds: 10, maxDelaySeconds: 25 }

  it('uses bounded exponential backoff', () => {
    const now = new Date('2026-01-01T00:00:00.000Z')
    expect(computeRetryAt(1, policy, now).toISOString()).toBe('2026-01-01T00:00:10.000Z')
    expect(computeRetryAt(4, policy, now).toISOString()).toBe('2026-01-01T00:00:25.000Z')
  })

  it('prefers structured provider reset metadata', () => {
    const now = new Date('2026-01-01T00:00:00.000Z')
    const evidence = classifyLimit(
      { resetsAt: Date.parse('2026-01-01T01:00:00.000Z') / 1_000 },
      now,
      new Date('2026-01-01T02:00:00.000Z')
    )
    expect(evidence.source).toBe('provider-structured')
    expect(evidence.confidence).toBe('high')
    expect(evidence.retryAt).toBe('2026-01-01T01:00:00.000Z')
  })

  it('labels an unknown reset time as fallback rather than exact provider evidence', () => {
    const now = new Date('2026-01-01T00:00:00.000Z')
    const fallback = new Date('2026-01-01T01:00:00.000Z')
    const evidence = classifyLimit('quota exhausted', now, fallback)
    expect(evidence.source).toBe('fallback')
    expect(evidence.confidence).toBe('low')
  })
})
