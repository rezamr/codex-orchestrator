import { describe, expect, it } from 'vitest'
import { redact, redactString } from '@main/infrastructure/logging/redaction'

describe('diagnostic redaction', () => {
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
