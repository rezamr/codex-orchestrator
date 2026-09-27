import type {
  ApprovalDecision,
  CodexAccountSnapshot,
  CodexThreadDetail,
  CodexThreadIndex,
  LimitEvidence,
  ProviderStatus
} from '@shared/types/domain'
import type { ReasoningEffort } from '@shared/types/domain'

export interface ProviderStartRequest {
  objective: string
  cwd: string
  profile: string
  model?: string
  effort?: ReasoningEffort
  outputSchema?: Record<string, unknown>
}

export interface ProviderResumeRequest extends ProviderStartRequest {
  sessionId: string
  continuation: string
}

export interface ProviderSessionRef {
  sessionId: string
  turnId: string
}

export type ProviderEvent =
  | {
      type: 'message.updated'
      itemId: string
      turnId: string
      text: string
      mode: 'start' | 'delta' | 'complete'
    }
  | { type: 'session.started'; sessionId: string }
  | { type: 'turn.started'; sessionId: string; turnId: string }
  | { type: 'activity'; message: string; metadata?: Record<string, unknown> }
  | { type: 'command.started'; message: string; metadata?: Record<string, unknown> }
  | {
      type: 'command.completed'
      message: string
      success: boolean
      metadata?: Record<string, unknown>
    }
  | {
      type: 'approval.requested'
      requestId: string
      kind: 'command' | 'file-change' | 'user-input'
      title: string
      detail: string
    }
  | { type: 'approval.resolved'; requestId: string }
  | { type: 'provider.rate_limited'; evidence: LimitEvidence }
  | { type: 'provider.authentication_required'; message: string }
  | { type: 'provider.disconnected'; message: string }
  | { type: 'turn.completed'; sessionId: string; turnId: string; message: string }
  | { type: 'turn.failed'; message: string; retryable: boolean }

export type ProviderEventListener = (event: ProviderEvent) => void

export interface AgentProvider {
  probe(): Promise<ProviderStatus>
  connect(): Promise<void>
  disconnect(): Promise<void>
  readAccountSnapshot(): Promise<CodexAccountSnapshot>
  listThreads(): Promise<CodexThreadIndex>
  readThread(threadId: string, includeTurns?: boolean): Promise<CodexThreadDetail>
  start(request: ProviderStartRequest): Promise<ProviderSessionRef>
  resume(request: ProviderResumeRequest): Promise<ProviderSessionRef>
  interrupt(session: ProviderSessionRef): Promise<void>
  respondToApproval(
    requestId: string,
    decision: ApprovalDecision,
    input?: Record<string, string>
  ): Promise<void>
  subscribe(listener: ProviderEventListener): () => void
}
