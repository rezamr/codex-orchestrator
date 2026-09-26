import { describe, expect, it } from 'vitest'
import { ConversationBuffer } from '@main/application/conversation-buffer'

describe('ephemeral conversation projection', () => {
  it('merges deltas, replaces final text, and ignores late fragments', () => {
    const buffer = new ConversationBuffer()
    const event = { type: 'message.updated' as const, turnId: 't', itemId: 'm' }
    buffer.update('j', 'a', { ...event, text: 'one ', mode: 'delta' })
    buffer.update('j', 'a', { ...event, text: 'message ', mode: 'delta' })
    expect(buffer.read('j').messages).toHaveLength(1)
    expect(buffer.read('j').messages[0]?.text).toBe('one message ')
    buffer.update('j', 'a', { ...event, text: 'Authoritative message.', mode: 'complete' })
    buffer.update('j', 'a', { ...event, text: 'late', mode: 'delta' })
    expect(buffer.read('j').messages[0]).toMatchObject({
      text: 'Authoritative message.',
      status: 'completed'
    })
  })

  it('withholds split credentials and redacts after assembly without altering the buffer', () => {
    const buffer = new ConversationBuffer()
    const event = { type: 'message.updated' as const, turnId: 't', itemId: 'm' }
    buffer.update('j', 'a', { ...event, text: 'Result sk-abcdef', mode: 'delta' })
    expect(buffer.read('j').messages[0]?.text).toBe('Result ')
    buffer.update('j', 'a', { ...event, text: 'ghijklmnop ', mode: 'delta' })
    expect(buffer.read('j').messages[0]?.text).toBe('Result [REDACTED] ')
    buffer.interrupt('j')
    expect(buffer.read('j').messages[0]?.status).toBe('interrupted')
  })

  it('isolates jobs and turns, and does not expose mutable internal state', () => {
    const buffer = new ConversationBuffer()
    const event = {
      type: 'message.updated' as const,
      itemId: 'm',
      text: 'answer',
      mode: 'complete' as const
    }
    buffer.update('j', 'a', { ...event, turnId: 't1' })
    buffer.update('j', 'a', { ...event, turnId: 't2' })
    buffer.update('other', 'a', { ...event, turnId: 't1' })
    const view = buffer.read('j')
    view.messages[0]!.text = 'mutation'
    expect(buffer.read('j').messages).toHaveLength(2)
    expect(buffer.read('other').messages).toHaveLength(1)
    expect(buffer.read('j').messages[0]?.text).toBe('answer')
    buffer.clear()
    expect(buffer.read('j').messages).toHaveLength(0)
  })

  it('bounds message length, total output, message count, and retained jobs', () => {
    const buffer = new ConversationBuffer()
    for (let index = 0; index < 105; index++) {
      buffer.update('j', 'a', {
        type: 'message.updated',
        turnId: 't',
        itemId: String(index),
        text: 'x'.repeat(70_000),
        mode: 'complete'
      })
    }
    const view = buffer.read('j')
    expect(view.truncated).toBe(true)
    expect(view.messages).toHaveLength(100)
    expect(view.messages[0]?.text.length).toBeLessThanOrEqual(64_000)
    expect(
      view.messages.reduce((total, message) => total + message.text.length, 0)
    ).toBeLessThanOrEqual(2_000_000)
    for (let index = 0; index < 20; index++)
      buffer.update(`j${index}`, 'a', {
        type: 'message.updated',
        itemId: 'm',
        turnId: 't',
        text: 'bounded',
        mode: 'complete'
      })
    expect(buffer.read('j').messages).toHaveLength(0)
  })

  it('does not expose an unfinished secret at interruption or the clipping boundary', () => {
    const buffer = new ConversationBuffer()
    buffer.update('j', 'a', {
      type: 'message.updated',
      itemId: 'm',
      turnId: 't',
      text: 'Safe sk-abc',
      mode: 'delta'
    })
    buffer.interrupt('j')
    expect(buffer.read('j').messages[0]?.text).toBe('Safe ')
    buffer.update('j2', 'a', {
      type: 'message.updated',
      itemId: 'm',
      turnId: 't',
      text: 'x'.repeat(63_990) + ' sk-abcdefghijklmnop',
      mode: 'complete'
    })
    expect(buffer.read('j2').messages[0]?.text).not.toContain('sk-')
    expect(buffer.read('j2').truncated).toBe(true)
  })
})
