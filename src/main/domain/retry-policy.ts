import type { LimitEvidence, RetryPolicy } from '@shared/types/domain'

const ISO_DATE_PATTERN = /\b\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2})?(?:\.\d+)?Z\b/
const RETRY_SECONDS_PATTERN = /(?:retry|try again)\s+(?:after|in)\s+(\d{1,6})\s*(?:s|sec|seconds?)/i

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

function epochSecondsToFutureIso(value: unknown, now: Date): string | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null
  const milliseconds = value > 10_000_000_000 ? value : value * 1_000
  const parsed = new Date(milliseconds)
  return parsed.getTime() > now.getTime() ? parsed.toISOString() : null
}

function stringToFutureIso(value: unknown, now: Date): string | null {
  if (typeof value !== 'string') return null
  const parsed = new Date(value)
  return Number.isFinite(parsed.getTime()) && parsed.getTime() > now.getTime()
    ? parsed.toISOString()
    : null
}

interface BlockingWindow {
  resetAt: string
  label: string
}

function windowCandidate(
  value: unknown,
  label: string,
  now: Date,
  assumeBlocking: boolean
): BlockingWindow | null {
  const window = asRecord(value)
  if (!window) return null
  const usedPercent =
    typeof window.usedPercent === 'number' && Number.isFinite(window.usedPercent)
      ? window.usedPercent
      : null
  const resetAt =
    epochSecondsToFutureIso(window.resetsAt, now) ?? stringToFutureIso(window.resetsAt, now)
  if (!resetAt) return null
  if (!assumeBlocking && (usedPercent === null || usedPercent < 100)) return null
  return { resetAt, label }
}

function collectBucketWindows(
  value: unknown,
  label: string,
  now: Date
): BlockingWindow[] {
  const bucket = asRecord(value)
  if (!bucket) return []

  const reached =
    typeof bucket.rateLimitReachedType === 'string'
      ? bucket.rateLimitReachedType
      : typeof bucket.reachedType === 'string'
        ? bucket.reachedType
        : null

  const lowerReached = reached?.toLowerCase() ?? ''
  const primaryOnly = lowerReached.includes('primary')
  const secondaryOnly = lowerReached.includes('secondary')
  const genericReached = Boolean(reached) && !primaryOnly && !secondaryOnly

  if (primaryOnly) {
    const primary = windowCandidate(bucket.primary, `${label}:primary`, now, true)
    return primary ? [primary] : []
  }

  if (secondaryOnly) {
    const secondary = windowCandidate(bucket.secondary, `${label}:secondary`, now, true)
    return secondary ? [secondary] : []
  }

  const strictPrimary = windowCandidate(bucket.primary, `${label}:primary`, now, false)
  const strictSecondary = windowCandidate(bucket.secondary, `${label}:secondary`, now, false)
  const strict = [strictPrimary, strictSecondary].filter(
    (entry): entry is BlockingWindow => entry !== null
  )

  if (strict.length || !genericReached) return strict

  // A generic reached marker with sparse usage data does not identify a single window.
  // In that case, include all future windows so we never resume before a possible blocker clears.
  const primary = windowCandidate(bucket.primary, `${label}:primary`, now, true)
  const secondary = windowCandidate(bucket.secondary, `${label}:secondary`, now, true)
  return [primary, secondary].filter((entry): entry is BlockingWindow => entry !== null)
}

function collectStructuredWindows(value: unknown, now: Date): BlockingWindow[] {
  if (Array.isArray(value)) {
    return value.flatMap((entry, index) => collectBucketWindows(entry, `bucket-${index + 1}`, now))
  }

  const record = asRecord(value)
  if (!record) return []

  // Current app-server account/rateLimits/read shape.
  const byId = asRecord(record.rateLimitsByLimitId)
  if (byId) {
    return Object.entries(byId).flatMap(([id, bucket]) => collectBucketWindows(bucket, id, now))
  }

  // Current app-server notification/read wrapper shape.
  if (record.rateLimits !== undefined) {
    const nested = record.rateLimits
    if (Array.isArray(nested)) return collectStructuredWindows(nested, now)
    const nestedRecord = asRecord(nested)
    const nestedById = asRecord(nestedRecord?.rateLimitsByLimitId)
    if (nestedById) {
      return Object.entries(nestedById).flatMap(([id, bucket]) =>
        collectBucketWindows(bucket, id, now)
      )
    }
    const bucketWindows = collectBucketWindows(nested, 'codex', now)
    if (bucketWindows.length) return bucketWindows
  }

  const directBucket = collectBucketWindows(record, 'codex', now)
  if (directBucket.length) return directBucket

  // Compatibility with older/direct retry metadata.
  const directReset =
    epochSecondsToFutureIso(record.resetsAt ?? record.retryAt ?? record.retry_after, now) ??
    stringToFutureIso(record.resetsAt ?? record.retryAt ?? record.retry_after, now)
  return directReset ? [{ resetAt: directReset, label: 'direct' }] : []
}

export function isRateLimitReached(data: unknown): boolean {
  if (Array.isArray(data)) return data.some((entry) => isRateLimitReached(entry))
  const record = asRecord(data)
  if (!record) return false

  if (
    (typeof record.rateLimitReachedType === 'string' && record.rateLimitReachedType.length > 0) ||
    (typeof record.reachedType === 'string' && record.reachedType.length > 0)
  ) {
    return true
  }

  const primary = asRecord(record.primary)
  const secondary = asRecord(record.secondary)
  if (
    (typeof primary?.usedPercent === 'number' && primary.usedPercent >= 100) ||
    (typeof secondary?.usedPercent === 'number' && secondary.usedPercent >= 100)
  ) {
    return true
  }

  if (record.rateLimits !== undefined && isRateLimitReached(record.rateLimits)) return true
  const byId = asRecord(record.rateLimitsByLimitId)
  return byId ? Object.values(byId).some((entry) => isRateLimitReached(entry)) : false
}

export function computeRetryAt(attempt: number, policy: RetryPolicy, now: Date, jitter = 0): Date {
  const exponent = Math.max(0, attempt - 1)
  const delay = Math.min(policy.maxDelaySeconds, policy.baseDelaySeconds * 2 ** exponent)
  const boundedJitter = Math.max(-0.2, Math.min(0.2, jitter))
  return new Date(now.getTime() + Math.round(delay * (1 + boundedJitter)) * 1_000)
}

export function classifyLimit(data: unknown, now: Date): LimitEvidence {
  const structured = collectStructuredWindows(data, now)
  if (structured.length) {
    const latest = structured.reduce((current, candidate) =>
      new Date(candidate.resetAt).getTime() > new Date(current.resetAt).getTime()
        ? candidate
        : current
    )
    return {
      retryAt: latest.resetAt,
      source: 'provider-structured',
      confidence: 'high',
      redactedEvidence:
        structured.length > 1
          ? 'Codex supplied structured reset timestamps; the latest blocking window was selected.'
          : 'Codex supplied a structured reset timestamp.'
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
    retryAt: null,
    source: 'unknown',
    confidence: 'low',
    redactedEvidence:
      'Codex usage limit was reached, but no reliable provider reset time was available.'
  }
}
