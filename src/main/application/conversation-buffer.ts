import type { JobConversation, ConversationMessage } from '@shared/types/domain'
import type { ProviderEvent } from '@main/infrastructure/providers/provider'
import { redactString } from '@main/infrastructure/logging/redaction'

type MessageEvent = Extract<ProviderEvent, { type: 'message.updated' }>
const MAX_JOBS = 20
const MAX_MESSAGES = 100
const MAX_MESSAGE_CHARS = 64_000
const MAX_JOB_CHARS = 2_000_000

function withoutTrailingToken(text: string): string {
  let boundary = text.length
  // Walk backwards once: an unanchored suffix regex can backtrack quadratically on long output.
  while (boundary > 0 && !/\s/.test(text[boundary - 1]!)) boundary--
  return text.slice(0, boundary)
}

/** Ephemeral transcript only. Never pass this buffer to a database or diagnostic exporter. */
export class ConversationBuffer {
  private readonly jobs = new Map<string, JobConversation>()

  update(jobId: string, attemptId: string, event: MessageEvent): void {
    let conversation = this.jobs.get(jobId)
    if (!conversation) {
      if (this.jobs.size >= MAX_JOBS) this.jobs.delete(this.jobs.keys().next().value!)
      conversation = { messages: [], truncated: false }
      this.jobs.set(jobId, conversation)
    }
    const turnId = event.turnId || attemptId
    const id = `${turnId}:${event.itemId}`
    let message = conversation.messages.find((entry) => entry.id === id)
    if (!message) {
      if (conversation.messages.length >= MAX_MESSAGES) {
        conversation.truncated = true
        return
      }
      message = { id, turnId, text: '', status: 'streaming', truncated: false }
      conversation.messages.push(message)
    }
    // Late duplicates/deltas must not corrupt an authoritative completed message.
    if (message.status === 'completed' && event.mode !== 'complete') return
    const text = event.mode === 'delta' ? message.text + event.text : event.text
    const otherChars = conversation.messages.reduce(
      (total, entry) => total + (entry === message ? 0 : entry.text.length),
      0
    )
    const capacity = Math.min(MAX_MESSAGE_CHARS, MAX_JOB_CHARS - otherChars)
    message.text = text.slice(0, capacity)
    message.truncated ||= text.length > capacity
    conversation.truncated ||= message.truncated
    message.status = event.mode === 'complete' ? 'completed' : 'streaming'
  }

  interrupt(jobId: string): void {
    for (const message of this.jobs.get(jobId)?.messages ?? []) {
      if (message.status === 'streaming') message.status = 'interrupted'
    }
  }

  read(jobId: string): JobConversation {
    const conversation = this.jobs.get(jobId)
    return {
      truncated: conversation?.truncated ?? false,
      messages: (conversation?.messages ?? []).map((message): ConversationMessage => ({
        ...message,
        // Withhold the unfinished trailing token so split credentials cannot escape redaction.
        text: redactString(
          message.status !== 'completed' || message.truncated
            ? withoutTrailingToken(message.text)
            : message.text
        )
      }))
    }
  }

  latestCompletedText(jobId: string, turnId?: string): string | null {
    const messages = this.jobs.get(jobId)?.messages ?? []
    const message = [...messages]
      .reverse()
      .find((entry) => entry.status === 'completed' && (!turnId || entry.turnId === turnId))
    if (!message || message.truncated) return null
    return redactString(message.text)
  }

  clear(): void {
    this.jobs.clear()
  }
}
