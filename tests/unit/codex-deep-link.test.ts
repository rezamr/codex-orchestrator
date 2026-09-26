import { describe, expect, it } from 'vitest'
import { codexThreadDeepLink } from '@main/security/codex-deep-link'

describe('official ChatGPT desktop thread links', () => {
  it('opens only the canonical existing-thread route', () => {
    expect(codexThreadDeepLink('thread_123')).toBe('codex://threads/thread_123')
    expect(codexThreadDeepLink('thread:123')).toBe('codex://threads/thread%3A123')
  })
  it.each([
    'new',
    '.',
    '..',
    '../settings',
    'id?prompt=send',
    'id#route',
    'https://example.com',
    '',
    'id\0bad'
  ])('rejects renderer route injection %j', (id) => {
    expect(() => codexThreadDeepLink(id)).toThrow()
  })
})
