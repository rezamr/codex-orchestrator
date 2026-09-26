import { classifyLimit } from '@main/domain/retry-policy'
import { redactString } from '@main/infrastructure/logging/redaction'
import type { ProviderEvent } from '../provider'

function nestedString(value: unknown, ...path: string[]): string | null {
  let current: unknown = value
  for (const part of path) {
    if (typeof current !== 'object' || current === null) return null
    current = (current as Record<string, unknown>)[part]
  }
  return typeof current === 'string' ? current : null
}

export function normalizeCodexNotification(
  method: string,
  params: Record<string, unknown>,
  now = new Date()
): ProviderEvent[] | null {
  if (method === 'thread/started') {
    const sessionId = nestedString(params, 'thread', 'id')
    return sessionId ? [{ type: 'session.started', sessionId }] : []
  }
  if (method === 'turn/started') {
    return [
      {
        type: 'turn.started',
        sessionId: typeof params.threadId === 'string' ? params.threadId : '',
        turnId: nestedString(params, 'turn', 'id') ?? ''
      }
    ]
  }
  if (method === 'item/agentMessage/delta') {
    // Deltas are fragments, not audit entries. item/completed supplies the authoritative message.
    return []
  }
  if (method === 'item/started' || method === 'item/completed') {
    const item = (params.item ?? {}) as Record<string, unknown>
    const type = typeof item.type === 'string' ? item.type : 'activity'
    if (type === 'agentMessage' && method === 'item/started') return []
    if (type === 'commandExecution') {
      const command = Array.isArray(item.command)
        ? item.command.map(String).join(' ')
        : typeof item.command === 'string'
          ? item.command
          : 'Command'
      if (method === 'item/started') {
        return [{ type: 'command.started', message: redactString(command).slice(0, 2_000) }]
      }
      return [
        {
          type: 'command.completed',
          message: redactString(command).slice(0, 2_000),
          success: item.status === 'completed'
        }
      ]
    }
    const text =
      typeof item.text === 'string'
        ? item.text
        : typeof item.message === 'string'
          ? item.message
          : `${type} ${method === 'item/started' ? 'started' : 'completed'}`
    return [
      {
        type: 'activity',
        message: redactString(text).slice(0, 2_000),
        metadata: { itemType: type }
      }
    ]
  }
  if (method === 'account/rateLimits/updated') {
    const limit = params.rateLimits as Record<string, unknown> | undefined
    if (!limit?.rateLimitReachedType) return []
    return [
      {
        type: 'provider.rate_limited',
        evidence: classifyLimit(limit, now, new Date(now.getTime() + 3_600_000))
      }
    ]
  }
  if (method === 'account/updated' && params.authMode === null) {
    return [
      { type: 'provider.authentication_required', message: 'Codex authentication is required.' }
    ]
  }
  if (method === 'turn/completed') {
    const turn = (params.turn ?? {}) as Record<string, unknown>
    const status = String(turn.status ?? '')
    const error = turn.error as Record<string, unknown> | null | undefined
    const message = redactString(
      typeof error?.message === 'string'
        ? error.message
        : `Codex turn finished with status ${status}.`
    )
    if (status === 'completed') {
      return [
        {
          type: 'turn.completed',
          sessionId: String(params.threadId ?? turn.threadId ?? ''),
          turnId: String(turn.id ?? ''),
          message
        }
      ]
    }
    if (/rate.?limit|usage limit|quota/i.test(message)) {
      return [
        {
          type: 'provider.rate_limited',
          evidence: classifyLimit(error ?? message, now, new Date(now.getTime() + 3_600_000))
        }
      ]
    }
    if (/auth|unauthorized|sign.?in|login/i.test(message)) {
      return [{ type: 'provider.authentication_required', message }]
    }
    return [{ type: 'turn.failed', message, retryable: status !== 'interrupted' }]
  }
  return null
}
