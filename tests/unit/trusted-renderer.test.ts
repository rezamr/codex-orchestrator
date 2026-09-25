import { describe, expect, it } from 'vitest'
import { isTrustedRendererUrl } from '@main/security/trusted-renderer'

describe('trusted renderer URL boundary', () => {
  it('accepts only the packaged application host', () => {
    expect(isTrustedRendererUrl('app://-/index.html')).toBe(true)
    expect(isTrustedRendererUrl('app://attacker/index.html')).toBe(false)
    expect(isTrustedRendererUrl('https://example.com')).toBe(false)
  })

  it('compares the complete development origin instead of a vulnerable string prefix', () => {
    const developmentUrl = 'http://localhost:5173/'
    expect(isTrustedRendererUrl('http://localhost:5173/src/main.ts', developmentUrl)).toBe(true)
    expect(isTrustedRendererUrl('http://localhost:5173.evil.example/', developmentUrl)).toBe(false)
    expect(isTrustedRendererUrl('http://localhost:5174/', developmentUrl)).toBe(false)
  })
})
