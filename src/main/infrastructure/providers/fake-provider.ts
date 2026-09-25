import { randomUUID } from 'node:crypto'
import { cwd } from 'node:process'
import type {
  CodexAccountSnapshot,
  CodexThreadDetail,
  CodexThreadIndex,
  ProviderStatus
} from '@shared/types/domain'
import type {
  AgentProvider,
  ProviderEvent,
  ProviderEventListener,
  ProviderResumeRequest,
  ProviderSessionRef,
  ProviderStartRequest
} from './provider'

export class FakeProvider implements AgentProvider {
  private readonly listeners = new Set<ProviderEventListener>()
  private readonly timers = new Set<NodeJS.Timeout>()
  private readonly sessions = new Map<string, ProviderSessionRef>()
  private connected = false
  private pendingApproval: { requestId: string; ref: ProviderSessionRef } | null = null

  async probe(): Promise<ProviderStatus> {
    return {
      mode: 'fake',
      state: 'ready',
      executablePath: null,
      version: 'deterministic-1',
      authenticated: true,
      message: 'Deterministic fake provider ready',
      capabilities: ['start', 'resume', 'interrupt', 'approvals', 'streaming']
    }
  }

  async connect(): Promise<void> {
    this.connected = true
  }

  async disconnect(): Promise<void> {
    this.connected = false
    for (const timer of this.timers) clearTimeout(timer)
    this.timers.clear()
  }

  async readAccountSnapshot(): Promise<CodexAccountSnapshot> {
    return {
      authMode: 'simulated',
      planType: 'simulated',
      rateLimits: [
        {
          id: 'fixture-codex-limit',
          name: 'Simulated Codex window',
          primary: {
            usedPercent: 25,
            windowDurationMins: 300,
            resetsAt: Math.floor(Date.now() / 1_000) + 3_600
          },
          secondary: null,
          reachedType: null
        }
      ],
      usage: {
        summary: {
          lifetimeTokens: 0,
          peakDailyTokens: 0,
          longestRunningTurnSec: 0,
          currentStreakDays: 0,
          longestStreakDays: 0
        },
        dailyBuckets: []
      },
      fetchedAt: new Date().toISOString()
    }
  }

  async listThreads(): Promise<CodexThreadIndex> {
    const now = Math.floor(Date.now() / 1_000)
    return {
      fetchedAt: new Date().toISOString(),
      truncated: false,
      threads: [
        {
          id: 'fixture-codex-thread-active',
          name: 'Simulated Codex session',
          preview: 'A deterministic history item for UI testing.',
          createdAt: now - 3_600,
          updatedAt: now - 300,
          archived: false,
          pinned: true,
          sourceKind: 'appServer',
          modelProvider: 'fake',
          model: 'fixture-model',
          cwd: cwd(),
          projectId: 'fixture-project',
          managedJobId: null,
          status: 'idle'
        },
        {
          id: 'fixture-codex-thread-archived',
          name: 'Archived simulated session',
          preview: 'A deterministic archived history item.',
          createdAt: now - 86_400,
          updatedAt: now - 80_000,
          archived: true,
          pinned: false,
          sourceKind: 'cli',
          modelProvider: 'fake',
          model: 'fixture-model',
          cwd: cwd(),
          projectId: 'fixture-project',
          managedJobId: null,
          status: 'notLoaded'
        }
      ]
    }
  }

  async readThread(threadId: string): Promise<CodexThreadDetail> {
    const index = await this.listThreads()
    const summary = index.threads.find((thread) => thread.id === threadId)
    if (!summary) throw new Error('Simulated Codex thread was not found.')
    const detail: CodexThreadDetail = {
      summary,
      truncated: false,
      turns: [
        {
          id: `fixture-turn-${threadId}`,
          status: 'completed',
          items: [
            {
              id: `fixture-user-${threadId}`,
              type: 'userMessage',
              label: 'User',
              text: 'Show the simulated Codex history view.'
            },
            {
              id: `fixture-agent-${threadId}`,
              type: 'agentMessage',
              label: 'Codex',
              text: 'This fixture verifies the read-only history UI without contacting Codex.'
            }
          ]
        }
      ]
    }
    return detail
  }

  async start(request: ProviderStartRequest): Promise<ProviderSessionRef> {
    if (!this.connected) await this.connect()
    const ref = { sessionId: randomUUID(), turnId: randomUUID() }
    this.sessions.set(ref.sessionId, ref)
    this.emit({ type: 'session.started', sessionId: ref.sessionId })
    this.emit({ type: 'turn.started', ...ref })
    this.runScenario(request.objective, ref)
    return ref
  }

  async resume(request: ProviderResumeRequest): Promise<ProviderSessionRef> {
    if (!this.connected) await this.connect()
    const ref = { sessionId: request.sessionId, turnId: randomUUID() }
    this.sessions.set(ref.sessionId, ref)
    this.emit({ type: 'session.started', sessionId: ref.sessionId })
    this.emit({ type: 'turn.started', ...ref })
    this.runScenario(request.objective.replace('[limit]', ''), ref)
    return ref
  }

  async interrupt(session: ProviderSessionRef): Promise<void> {
    this.emit({
      type: 'turn.failed',
      message: `Turn ${session.turnId} was interrupted by the user.`,
      retryable: false
    })
  }

  async respondToApproval(requestId: string, decision: string): Promise<void> {
    if (!this.pendingApproval || this.pendingApproval.requestId !== requestId) return
    const pending = this.pendingApproval
    this.pendingApproval = null
    this.emit({ type: 'approval.resolved', requestId })
    if (decision === 'accept' || decision === 'acceptForSession') {
      this.later(() => this.complete(pending.ref), 30)
    } else {
      this.emit({
        type: 'turn.failed',
        message: 'The requested action was declined.',
        retryable: false
      })
    }
  }

  subscribe(listener: ProviderEventListener): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  private runScenario(objective: string, ref: ProviderSessionRef): void {
    this.later(
      () => this.emit({ type: 'activity', message: 'Inspecting the selected project.' }),
      10
    )
    if (objective.includes('[approval]') || objective.includes('[input]')) {
      const requestId = randomUUID()
      this.pendingApproval = { requestId, ref }
      const needsInput = objective.includes('[input]')
      this.later(
        () =>
          this.emit({
            type: 'approval.requested',
            requestId,
            kind: needsInput ? 'user-input' : 'command',
            title: needsInput ? 'Clarification required' : 'Run project verification',
            detail: needsInput ? 'Provide the requested clarification.' : 'npm test'
          }),
        20
      )
      return
    }
    if (objective.includes('[limit]')) {
      this.later(
        () =>
          this.emit({
            type: 'provider.rate_limited',
            evidence: {
              retryAt: new Date(Date.now() + 100).toISOString(),
              source: 'provider-structured',
              confidence: 'high',
              redactedEvidence: 'Fake provider supplied a structured retry time.'
            }
          }),
        20
      )
      return
    }
    if (objective.includes('[fail]')) {
      this.later(
        () =>
          this.emit({
            type: 'turn.failed',
            message: 'Deterministic provider failure.',
            retryable: true
          }),
        20
      )
      return
    }
    this.later(() => this.complete(ref), 30)
  }

  private complete(ref: ProviderSessionRef): void {
    this.emit({
      type: 'turn.completed',
      ...ref,
      message: 'The provider completed the requested objective.'
    })
  }

  private later(callback: () => void, milliseconds: number): void {
    const timer = setTimeout(() => {
      this.timers.delete(timer)
      callback()
    }, milliseconds)
    this.timers.add(timer)
  }

  private emit(event: ProviderEvent): void {
    for (const listener of this.listeners) listener(event)
  }
}
