import { spawn, execFile } from 'node:child_process'
import { createInterface } from 'node:readline'
import { promisify } from 'node:util'
import { AppError } from '@shared/errors'
import type {
  ApprovalDecision,
  CodexAccountSnapshot,
  CodexDailyUsageBucket,
  CodexRateLimitBucket,
  CodexRateLimitWindow,
  CodexThreadDetail,
  CodexThreadIndex,
  CodexThreadItem,
  CodexThreadSummary,
  CodexThreadTurn,
  CodexUsageSummary,
  ProviderStatus
} from '@shared/types/domain'
import { redactString } from '@main/infrastructure/logging/redaction'
import type {
  AgentProvider,
  ProviderEvent,
  ProviderEventListener,
  ProviderResumeRequest,
  ProviderSessionRef,
  ProviderStartRequest
} from '../provider'
import { normalizeCodexNotification } from './event-normalizer'
import { discoverCodexExecutableCandidates } from './codex-executable-discovery'

const execFileAsync = promisify(execFile)

interface RpcMessage {
  id?: number | string
  method?: string
  params?: Record<string, unknown>
  result?: unknown
  error?: { code?: number; message?: string; data?: unknown }
}

interface PendingRequest {
  resolve: (value: any) => void
  reject: (reason: Error) => void
  timer: NodeJS.Timeout
}

type ExecutableResolver = () => Promise<string[]>

const THREAD_SOURCE_KINDS = [
  'cli',
  'vscode',
  'exec',
  'appServer',
  'subAgent',
  'subAgentReview',
  'subAgentCompact',
  'subAgentThreadSpawn',
  'subAgentOther',
  'unknown'
]
const THREAD_PAGE_SIZE = 100
const MAX_THREAD_PAGES = 200
const MAX_THREADS = THREAD_PAGE_SIZE * MAX_THREAD_PAGES
const MAX_THREAD_TURNS = 1_000
const MAX_THREAD_ITEM_CHARS = 20_000
const MAX_THREAD_DETAIL_CHARS = 2_000_000

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

function stringValue(value: unknown, maxLength = 2_000): string | null {
  return typeof value === 'string' ? redactString(value).slice(0, maxLength) : null
}

function numberValue(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function mapRateLimitWindow(value: unknown): CodexRateLimitWindow | null {
  const window = asRecord(value)
  if (!window) return null
  return {
    usedPercent: numberValue(window.usedPercent),
    windowDurationMins: numberValue(window.windowDurationMins),
    resetsAt: numberValue(window.resetsAt)
  }
}

function mapRateLimits(value: unknown): CodexRateLimitBucket[] | null {
  const response = asRecord(value)
  if (!response) return null
  const buckets = asRecord(response.rateLimitsByLimitId)
  const entries = buckets
    ? Object.entries(buckets)
    : response.rateLimits
      ? [['codex', response.rateLimits] as [string, unknown]]
      : []
  return entries.flatMap(([key, raw]) => {
    const bucket = asRecord(raw)
    if (!bucket) return []
    return [
      {
        id: stringValue(bucket.limitId, 100) ?? key.slice(0, 100),
        name: stringValue(bucket.limitName, 100),
        primary: mapRateLimitWindow(bucket.primary),
        secondary: mapRateLimitWindow(bucket.secondary),
        reachedType: stringValue(bucket.rateLimitReachedType, 100)
      }
    ]
  })
}

function mapUsageSummary(value: unknown): CodexUsageSummary | null {
  const summary = asRecord(value)
  if (!summary) return null
  return {
    lifetimeTokens: numberValue(summary.lifetimeTokens),
    peakDailyTokens: numberValue(summary.peakDailyTokens),
    longestRunningTurnSec: numberValue(summary.longestRunningTurnSec),
    currentStreakDays: numberValue(summary.currentStreakDays),
    longestStreakDays: numberValue(summary.longestStreakDays)
  }
}

function mapDailyUsage(value: unknown): CodexDailyUsageBucket[] | null {
  if (!Array.isArray(value)) return null
  return value.slice(0, 5_000).flatMap((entry) => {
    const bucket = asRecord(entry)
    if (!bucket || typeof bucket.startDate !== 'string' || typeof bucket.tokens !== 'number')
      return []
    return [{ startDate: bucket.startDate.slice(0, 40), tokens: bucket.tokens }]
  })
}

function mapThreadSummary(value: unknown, archived: boolean): CodexThreadSummary | null {
  const thread = asRecord(value)
  if (!thread || typeof thread.id !== 'string' || !thread.id.trim()) return null
  const status = asRecord(thread.status)
  return {
    id: stringValue(thread.id, 512) ?? '',
    name: stringValue(thread.name, 500),
    preview: stringValue(thread.preview, 1_000),
    createdAt: numberValue(thread.createdAt),
    updatedAt: numberValue(thread.updatedAt),
    archived,
    pinned: thread.isPinned === true,
    sourceKind: stringValue(thread.sourceKind, 100),
    modelProvider: stringValue(thread.modelProvider, 100),
    status: stringValue(status?.type, 100)
  }
}

function textFromContent(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value.flatMap((part) => {
    const record = asRecord(part)
    return record?.type === 'text' && typeof record.text === 'string' ? [record.text] : []
  })
}

function threadItemText(item: Record<string, unknown>, type: string): string {
  const lines: string[] = []
  if (type === 'userMessage') lines.push(...textFromContent(item.content))
  if (type === 'agentMessage' || type === 'plan') {
    if (typeof item.text === 'string') lines.push(item.text)
  }
  if (type === 'reasoning') {
    const summary = item.summary
    if (typeof summary === 'string') lines.push(summary)
    else if (Array.isArray(summary)) {
      lines.push(...summary.flatMap((part) => (typeof part === 'string' ? [part] : [])))
    }
  }
  if (type === 'commandExecution') {
    if (typeof item.command === 'string') lines.push(`Command: ${item.command}`)
    if (typeof item.aggregatedOutput === 'string') lines.push(item.aggregatedOutput)
  }
  if (type === 'fileChange' && Array.isArray(item.changes)) {
    for (const rawChange of item.changes) {
      const change = asRecord(rawChange)
      if (!change) continue
      const path = typeof change.path === 'string' ? change.path : 'Changed file'
      const diff = typeof change.diff === 'string' ? change.diff : ''
      lines.push([path, diff].filter(Boolean).join('\n'))
    }
  }
  if (type === 'mcpToolCall') {
    const label = [item.server, item.tool].filter((part) => typeof part === 'string').join('/')
    if (label) lines.push(`Tool: ${label}`)
    if (typeof item.result === 'string') lines.push(item.result)
    if (typeof item.error === 'string') lines.push(item.error)
  }
  return redactString(lines.join('\n\n')).slice(0, MAX_THREAD_ITEM_CHARS)
}

function mapThreadDetail(value: unknown, summary: CodexThreadSummary): CodexThreadDetail {
  const thread = asRecord(value)
  const turnsRaw = Array.isArray(thread?.turns) ? thread.turns : []
  let remaining = MAX_THREAD_DETAIL_CHARS
  let truncated = turnsRaw.length > MAX_THREAD_TURNS
  const turns: CodexThreadTurn[] = turnsRaw
    .slice(0, MAX_THREAD_TURNS)
    .flatMap((rawTurn, turnIndex) => {
      const turn = asRecord(rawTurn)
      if (!turn) return []
      const rawItems = Array.isArray(turn.items) ? turn.items : []
      const items: CodexThreadItem[] = []
      for (const [itemIndex, rawItem] of rawItems.entries()) {
        const item = asRecord(rawItem)
        if (!item) continue
        const type = stringValue(item.type, 100) ?? 'unknown'
        let text = threadItemText(item, type)
        if (!text) continue
        if (remaining <= 0) {
          truncated = true
          break
        }
        if (text.length > remaining) {
          text = text.slice(0, remaining)
          truncated = true
        }
        remaining -= text.length
        items.push({
          id: stringValue(item.id, 512) ?? `${turnIndex}-${itemIndex}`,
          type,
          label:
            type === 'userMessage'
              ? 'User'
              : type === 'agentMessage'
                ? 'Codex'
                : type === 'reasoning'
                  ? 'Reasoning summary'
                  : type,
          text
        })
      }
      return [
        {
          id: stringValue(turn.id, 512) ?? `turn-${turnIndex}`,
          status: stringValue(turn.status, 100),
          items
        }
      ]
    })
  return { summary, turns, truncated }
}

function nestedString(value: unknown, ...path: string[]): string | null {
  let current: unknown = value
  for (const part of path) {
    if (typeof current !== 'object' || current === null) return null
    current = (current as Record<string, unknown>)[part]
  }
  return typeof current === 'string' ? current : null
}

export class CodexAppServerProvider implements AgentProvider {
  private readonly listeners = new Set<ProviderEventListener>()
  private readonly pending = new Map<number | string, PendingRequest>()
  private readonly serverRequests = new Map<string, { id: number | string; kind: string }>()
  private process: ReturnType<typeof spawn> | null = null
  private requestId = 0
  private closing = false
  private authMode: CodexAccountSnapshot['authMode'] = null
  private planType: string | null = null
  private status: ProviderStatus = {
    mode: 'codex',
    state: 'disconnected',
    executablePath: null,
    version: null,
    authenticated: null,
    message: 'Codex is not connected.',
    capabilities: []
  }

  constructor(
    private readonly appServerArgs: string[] = ['app-server', '--stdio'],
    private readonly executableResolver: ExecutableResolver = () =>
      discoverCodexExecutableCandidates()
  ) {}

  async probe(): Promise<ProviderStatus> {
    const candidates = await this.executableResolver()
    if (candidates.length === 0) {
      this.status = {
        ...this.status,
        state: 'error',
        executablePath: null,
        version: null,
        authenticated: null,
        message:
          'Codex CLI was not found. Install or repair Codex; its location is detected automatically.',
        capabilities: []
      }
      return this.status
    }

    let lastError: unknown = null
    for (const executablePath of candidates) {
      try {
        const { stdout, stderr } = await execFileAsync(executablePath, ['--version'], {
          timeout: 10_000,
          windowsHide: true
        })
        const version = (stdout || stderr).trim()
        if (!version) throw new Error('Codex CLI returned an empty version string.')
        this.status = {
          ...this.status,
          executablePath,
          version,
          state: this.process ? this.status.state : 'available',
          message: this.process
            ? this.status.message
            : 'Codex CLI found and version-checked; connect to inspect authentication and history.',
          capabilities: [
            'app-server',
            'start',
            'resume',
            'interrupt',
            'approvals',
            'streaming',
            'account-read',
            'usage-read',
            'thread-history-read'
          ]
        }
        return this.status
      } catch (error) {
        lastError = error
      }
    }

    const code = asRecord(lastError)?.code
    const reason = typeof code === 'string' ? ` (${code})` : ''
    this.status = {
      ...this.status,
      state: 'error',
      executablePath: null,
      version: null,
      authenticated: null,
      message: `Codex CLI was found but could not be launched${reason}. Check the installation and permissions.`,
      capabilities: []
    }
    return this.status
  }

  async connect(): Promise<void> {
    if (this.process) return
    const probed = await this.probe()
    if (!probed.executablePath) {
      throw new AppError('PROVIDER_UNAVAILABLE', probed.message)
    }

    this.closing = false
    this.status = { ...probed, state: 'connecting', message: 'Starting Codex app-server…' }
    const child = spawn(probed.executablePath, this.appServerArgs, {
      stdio: ['pipe', 'pipe', 'pipe'],
      windowsHide: true,
      shell: false,
      env: process.env
    })
    this.process = child
    child.once('error', (error) => this.handleDisconnect(`Could not start Codex: ${error.message}`))
    child.once('exit', (code, signal) => {
      const detail = this.closing
        ? 'Codex app-server stopped.'
        : `Codex app-server exited unexpectedly (code ${String(code)}, signal ${String(signal)}).`
      this.handleDisconnect(detail)
    })

    const reader = createInterface({ input: child.stdout })
    reader.on('line', (line) => this.handleLine(line))
    child.stderr.on('data', (chunk: Buffer) => {
      const message = redactString(chunk.toString('utf8').trim()).slice(0, 2_000)
      if (message) this.emit({ type: 'activity', message: `Codex diagnostic: ${message}` })
    })

    try {
      await this.request('initialize', {
        clientInfo: {
          name: 'codex_orchestrator',
          title: 'Codex Orchestrator',
          version: '0.1.0-alpha.0'
        },
        capabilities: null
      })
      this.notify('initialized', {})
      const account = await this.request<Record<string, unknown>>('account/read', {
        refreshToken: false
      })
      const accountDetails = asRecord(account.account)
      const accountType = accountDetails?.type
      this.authMode =
        accountType === 'chatgpt' || accountType === 'apiKey' || accountType === 'amazonBedrock'
          ? accountType
          : account.requiresOpenaiAuth === false
            ? 'none'
            : null
      this.planType = stringValue(accountDetails?.planType, 100)
      const authenticated = account.account != null || account.requiresOpenaiAuth === false
      this.status = {
        ...this.status,
        state: authenticated ? 'ready' : 'authentication-required',
        authenticated,
        message: authenticated
          ? 'Codex app-server is connected.'
          : 'Codex authentication is required. Sign in with the supported Codex flow.'
      }
      if (!authenticated) {
        this.emit({ type: 'provider.authentication_required', message: this.status.message })
      }
    } catch (error) {
      await this.disconnect()
      throw error
    }
  }

  async disconnect(): Promise<void> {
    this.closing = true
    const child = this.process
    this.process = null
    if (child && !child.killed) child.kill()
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timer)
      pending.reject(new AppError('PROVIDER_UNAVAILABLE', 'Codex disconnected.'))
    }
    this.pending.clear()
    this.status = { ...this.status, state: 'disconnected', message: 'Codex is disconnected.' }
  }

  async readAccountSnapshot(): Promise<CodexAccountSnapshot> {
    await this.ensureConnected()
    const [rateLimitResult, usageResult] =
      this.status.authenticated === true
        ? await Promise.allSettled([
            this.request<unknown>('account/rateLimits/read', {}),
            this.request<unknown>('account/usage/read', {})
          ])
        : [null, null]
    const rateLimitValue =
      rateLimitResult?.status === 'fulfilled' ? mapRateLimits(rateLimitResult.value) : null
    const usageResponse = usageResult?.status === 'fulfilled' ? asRecord(usageResult.value) : null
    return {
      authMode: this.authMode,
      planType: this.planType,
      rateLimits: rateLimitValue,
      usage: usageResponse
        ? {
            summary: mapUsageSummary(usageResponse.summary),
            dailyBuckets: mapDailyUsage(usageResponse.dailyUsageBuckets)
          }
        : null,
      fetchedAt: new Date().toISOString()
    }
  }

  async listThreads(): Promise<CodexThreadIndex> {
    await this.ensureConnected()
    const threads = new Map<string, CodexThreadSummary>()
    let truncated = false

    for (const archived of [false, true]) {
      let cursor: string | null = null
      const cursors = new Set<string>()
      let pageCount = 0
      do {
        const params: Record<string, unknown> = {
          limit: THREAD_PAGE_SIZE,
          sortKey: 'updated_at',
          sortDirection: 'desc',
          archived,
          sourceKinds: THREAD_SOURCE_KINDS,
          useStateDbOnly: true
        }
        if (cursor) params.cursor = cursor
        const response = asRecord(await this.request<unknown>('thread/list', params))
        const data = Array.isArray(response?.data) ? response.data : []
        for (const row of data) {
          const summary = mapThreadSummary(row, archived)
          if (summary) threads.set(summary.id, summary)
          if (threads.size >= MAX_THREADS) {
            truncated = true
            break
          }
        }
        const nextCursor = typeof response?.nextCursor === 'string' ? response.nextCursor : null
        pageCount += 1
        if (!nextCursor || nextCursor === cursor || cursors.has(nextCursor)) {
          if (nextCursor) truncated = true
          cursor = null
        } else {
          cursors.add(nextCursor)
          cursor = nextCursor
        }
        if (pageCount >= MAX_THREAD_PAGES && cursor) truncated = true
      } while (cursor && pageCount < MAX_THREAD_PAGES && threads.size < MAX_THREADS)
      if (truncated || threads.size >= MAX_THREADS) break
    }

    return {
      threads: [...threads.values()].sort(
        (left, right) => (right.updatedAt ?? 0) - (left.updatedAt ?? 0)
      ),
      fetchedAt: new Date().toISOString(),
      truncated
    }
  }

  async readThread(threadId: string): Promise<CodexThreadDetail> {
    await this.ensureConnected()
    const response = asRecord(
      await this.request<unknown>('thread/read', { threadId, includeTurns: true })
    )
    const thread = asRecord(response?.thread) ?? response
    const summary =
      mapThreadSummary(thread, thread?.archived === true) ??
      ({
        id: threadId,
        name: null,
        preview: null,
        createdAt: null,
        updatedAt: null,
        archived: false,
        pinned: false,
        sourceKind: null,
        modelProvider: null,
        status: null
      } satisfies CodexThreadSummary)
    return mapThreadDetail(thread, summary)
  }

  private async ensureConnected(): Promise<void> {
    if (!this.process) await this.connect()
    if (!this.process) {
      throw new AppError('PROVIDER_UNAVAILABLE', 'Codex app-server did not start.')
    }
  }

  async start(request: ProviderStartRequest): Promise<ProviderSessionRef> {
    await this.connect()
    this.ensureReady()
    const thread = await this.request<Record<string, any>>('thread/start', {
      cwd: request.cwd,
      approvalPolicy: 'on-request',
      sandbox: 'workspace-write',
      ephemeral: false
    })
    const sessionId = nestedString(thread, 'thread', 'id')
    if (!sessionId) throw new AppError('PROTOCOL_ERROR', 'Codex did not return a thread id.')
    return this.startTurn(sessionId, request.objective, request.cwd)
  }

  async resume(request: ProviderResumeRequest): Promise<ProviderSessionRef> {
    await this.connect()
    this.ensureReady()
    await this.request('thread/resume', {
      threadId: request.sessionId,
      cwd: request.cwd,
      approvalPolicy: 'on-request',
      sandbox: 'workspace-write',
      excludeTurns: true
    })
    return this.startTurn(request.sessionId, request.continuation, request.cwd)
  }

  async interrupt(session: ProviderSessionRef): Promise<void> {
    await this.request('turn/interrupt', {
      threadId: session.sessionId,
      turnId: session.turnId
    })
  }

  async respondToApproval(
    requestId: string,
    decision: ApprovalDecision,
    input?: Record<string, string>
  ): Promise<void> {
    const pending = this.serverRequests.get(requestId)
    if (!pending) throw new AppError('PROTOCOL_ERROR', 'Approval request is no longer pending.')
    const result = pending.kind === 'user-input' ? { answers: input ?? {} } : { decision }
    this.write({ id: pending.id, result })
    this.serverRequests.delete(requestId)
  }

  subscribe(listener: ProviderEventListener): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  private async startTurn(
    sessionId: string,
    text: string,
    cwd: string
  ): Promise<ProviderSessionRef> {
    const response = await this.request<Record<string, any>>('turn/start', {
      threadId: sessionId,
      cwd,
      input: [{ type: 'text', text }]
    })
    const turnId = nestedString(response, 'turn', 'id')
    if (!turnId) throw new AppError('PROTOCOL_ERROR', 'Codex did not return a turn id.')
    return { sessionId, turnId }
  }

  private ensureReady(): void {
    if (this.status.state === 'authentication-required') {
      throw new AppError('AUTHENTICATION_REQUIRED', this.status.message)
    }
    if (this.status.state !== 'ready') {
      throw new AppError('PROVIDER_UNAVAILABLE', this.status.message)
    }
  }

  private request<T = unknown>(method: string, params: Record<string, unknown>): Promise<T> {
    const id = ++this.requestId
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id)
        reject(new AppError('PROTOCOL_ERROR', `Codex request timed out: ${method}`))
      }, 30_000)
      this.pending.set(id, { resolve, reject, timer })
      this.write({ id, method, params })
    })
  }

  private notify(method: string, params: Record<string, unknown>): void {
    this.write({ method, params })
  }

  private write(message: RpcMessage): void {
    const child = this.process
    const stdin = child?.stdin
    if (!stdin?.writable) {
      throw new AppError('PROVIDER_UNAVAILABLE', 'Codex app-server is not writable.')
    }
    stdin.write(`${JSON.stringify(message)}\n`)
  }

  private handleLine(line: string): void {
    let message: RpcMessage
    try {
      message = JSON.parse(line) as RpcMessage
    } catch {
      this.emit({ type: 'turn.failed', message: 'Codex emitted invalid JSON.', retryable: true })
      return
    }

    if (message.id !== undefined && message.method) {
      this.handleServerRequest(message)
      return
    }
    if (message.id !== undefined) {
      const pending = this.pending.get(message.id)
      if (!pending) return
      clearTimeout(pending.timer)
      this.pending.delete(message.id)
      if (message.error) {
        pending.reject(
          new AppError(
            'PROTOCOL_ERROR',
            redactString(message.error.message ?? 'Codex request failed.'),
            {
              code: message.error.code
            }
          )
        )
      } else {
        pending.resolve(message.result)
      }
      return
    }
    if (message.method) this.handleNotification(message.method, message.params ?? {})
  }

  private handleServerRequest(message: RpcMessage): void {
    const id = String(message.id)
    const method = message.method ?? ''
    let kind: 'command' | 'file-change' | 'user-input' | null = null
    if (method === 'item/commandExecution/requestApproval') kind = 'command'
    if (method === 'item/fileChange/requestApproval') kind = 'file-change'
    if (method === 'item/tool/requestUserInput') kind = 'user-input'
    if (!kind) {
      this.write({
        id: message.id,
        error: { code: -32601, message: 'Unsupported client request.' }
      })
      return
    }
    this.serverRequests.set(id, { id: message.id!, kind })
    const params = message.params ?? {}
    const detail =
      typeof params.command === 'string'
        ? params.command
        : typeof params.reason === 'string'
          ? params.reason
          : kind === 'file-change'
            ? 'Codex requests permission to apply file changes.'
            : 'Codex requests user input.'
    this.emit({
      type: 'approval.requested',
      requestId: id,
      kind,
      title:
        kind === 'command'
          ? 'Command approval'
          : kind === 'file-change'
            ? 'File change approval'
            : 'Input required',
      detail: redactString(detail).slice(0, 4_000)
    })
  }

  private handleNotification(method: string, params: Record<string, unknown>): void {
    if (method === 'serverRequest/resolved') {
      const requestId = String(params.requestId ?? '')
      if (requestId) {
        this.serverRequests.delete(requestId)
        this.emit({ type: 'approval.resolved', requestId })
      }
      return
    }
    const events = normalizeCodexNotification(method, params)
    if (!events) return
    for (const event of events) this.emit(event)
    if (events.some((event) => event.type === 'provider.authentication_required')) {
      this.status = {
        ...this.status,
        state: 'authentication-required',
        authenticated: false,
        message: 'Codex authentication is required.'
      }
    }
  }

  private handleDisconnect(message: string): void {
    this.process = null
    this.status = { ...this.status, state: 'disconnected', message }
    if (!this.closing) this.emit({ type: 'provider.disconnected', message })
  }

  private emit(event: ProviderEvent): void {
    for (const listener of this.listeners) listener(event)
  }
}
