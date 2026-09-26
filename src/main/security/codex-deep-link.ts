import { codexThreadIdSchema } from '@shared/schemas/ipc'

/** Only an existing local thread route; never composer text, settings, or arbitrary schemes. */
export function codexThreadDeepLink(threadId: unknown): string {
  const id = codexThreadIdSchema.parse(threadId)
  if (['new', '.', '..'].includes(id)) throw new Error('A saved Codex thread is required.')
  return `codex://threads/${encodeURIComponent(id)}`
}
