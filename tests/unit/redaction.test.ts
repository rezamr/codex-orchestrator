import { describe, expect, it } from 'vitest'
import { redact, redactString } from '@main/infrastructure/logging/redaction'

describe('diagnostic redaction', () => {
  it('removes terminal styling and OSC hyperlinks before detecting secrets', () => {
    const result = redactString(
      '\u001b[31mfailed sk-abcdef\u001b[0mghijklmnop\n\u001b]8;;https://example.test\u0007safe\u001b]8;;\u0007'
    )
    expect(result).toBe('failed [REDACTED]\nsafe')
  })
  it('redacts known secret keys recursively', () => {
    const value = redact({
      authorization: 'Bearer secret',
      nested: { accessToken: 'abc', safe: 'visible' },
      cookies: ['private']
    })
    expect(value).toEqual({
      authorization: '[REDACTED]',
      nested: { accessToken: '[REDACTED]', safe: 'visible' },
      cookies: '[REDACTED]'
    })
  })

  it('redacts token-looking values embedded in messages', () => {
    expect(redactString('failed with sk-abcdefghijklmnop')).not.toContain('abcdefghijklmnop')
  })
})
