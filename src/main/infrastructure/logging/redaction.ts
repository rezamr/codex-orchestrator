const SECRET_KEY_PATTERN =
  /(?:token|secret|password|authorization|cookie|api[-_]?key|access[-_]?token|refresh[-_]?token)/i
const SECRET_VALUE_PATTERNS = [
  /\bsk-[A-Za-z0-9_-]{12,}\b/g,
  /\bBearer\s+[^\s,;]+/gi,
  /\b(?:eyJ[A-Za-z0-9_-]+\.){2}[A-Za-z0-9_-]+\b/g
]

export function redactString(value: string): string {
  return SECRET_VALUE_PATTERNS.reduce(
    (current, pattern) => current.replace(pattern, '[REDACTED]'),
    value
  )
}

export function redact<T>(value: T, seen = new WeakSet<object>()): T {
  if (typeof value === 'string') return redactString(value) as T
  if (Array.isArray(value)) return value.map((entry) => redact(entry, seen)) as T
  if (typeof value !== 'object' || value === null) return value
  if (seen.has(value)) return '[CIRCULAR]' as T
  seen.add(value)

  const result: Record<string, unknown> = {}
  for (const [key, nested] of Object.entries(value)) {
    result[key] = SECRET_KEY_PATTERN.test(key) ? '[REDACTED]' : redact(nested, seen)
  }
  return result as T
}
