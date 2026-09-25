import type { LimitEvidence, RetryPolicy } from '@shared/types/domain'

const ISO_DATE_PATTERN = /\b\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2})?(?:\.\d+)?Z\b/
const RETRY_SECONDS_PATTERN = /(?:retry|try again)\s+(?:after|in)\s+(\d{1,6})\s*(?:s|sec|seconds?)/i

export function computeRetryAt(attempt: number, policy: RetryPolicy, now: Date, jitter = 0): Date {
  const exponent = Math.max(0, attempt - 1)
  const delay = Math.min(policy.maxDelaySeconds, policy.baseDelaySeconds * 2 ** exponent)
  const boundedJitter = Math.max(-0.2, Math.min(0.2, jitter))
  return new Date(now.getTime() + Math.round(delay * (1 + boundedJitter)) * 1_000)
}

export function classifyLimit(data: unknown, now: Date, fallbackAt: Date): LimitEvidence {
  if (typeof data === 'object' && data !== null) {
    const value = data as Record<string, unknown>
    const resetsAt = value.resetsAt ?? value.retryAt ?? value.retry_after
    if (typeof resetsAt === 'number') {
      const milliseconds = resetsAt > 10_000_000_000 ? resetsAt : resetsAt * 1_000
      const parsed = new Date(milliseconds)
      if (parsed.getTime() > now.getTime()) {
        return {
          retryAt: parsed.toISOString(),
          source: 'provider-structured',
          confidence: 'high',
          redactedEvidence: 'Provider supplied a structured reset timestamp.'
        }
      }
    }
    if (typeof resetsAt === 'string') {
      const parsed = new Date(resetsAt)
      if (Number.isFinite(parsed.getTime()) && parsed.getTime() > now.getTime()) {
        return {
          retryAt: parsed.toISOString(),
          source: 'provider-structured',
          confidence: 'high',
          redactedEvidence: 'Provider supplied a structured reset timestamp.'
        }
      }
    }
  }

  const text = typeof data === 'string' ? data : JSON.stringify(data ?? '')
  const isoMatch = text.match(ISO_DATE_PATTERN)
  if (isoMatch?.[0]) {
    const parsed = new Date(isoMatch[0])
    if (parsed.getTime() > now.getTime()) {
      return {
        retryAt: parsed.toISOString(),
        source: 'provider-parsed',
        confidence: 'medium',
        redactedEvidence: 'A reset timestamp was conservatively parsed from provider text.'
      }
    }
  }

  const secondsMatch = text.match(RETRY_SECONDS_PATTERN)
  if (secondsMatch?.[1]) {
    const seconds = Number(secondsMatch[1])
    return {
      retryAt: new Date(now.getTime() + seconds * 1_000).toISOString(),
      source: 'provider-parsed',
      confidence: 'medium',
      redactedEvidence: 'A retry delay was conservatively parsed from provider text.'
    }
  }

  return {
    retryAt: fallbackAt.toISOString(),
    source: 'fallback',
    confidence: 'low',
    redactedEvidence: 'No reliable provider reset time was available; bounded fallback applied.'
  }
}
