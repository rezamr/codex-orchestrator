import { realpath, stat } from 'node:fs/promises'
import { basename, isAbsolute, resolve } from 'node:path'
import { AppError, PROVIDER_BUSY_STOP_REASON } from '@shared/errors'
import type {
  AppSettings,
  ApprovalDecision,
  CodexConnectionSnapshot,
  CodexThreadDetail,
  CodexThreadIndex,
  CodexWorkspaceSnapshot,
  ContinueCodexThreadInput,
  CreateJobInput,
  DashboardSnapshot,
  DiagnosticSnapshot,
  DelegationResultPacket,
  Job,
  JobEvent,
  JobState,
  Project,
  ProviderStatus,
  Schedule
} from '@shared/types/domain'
import { classifyLimit, computeRetryAt } from '@main/domain/retry-policy'
import { evaluatePowerEligibility } from '@main/domain/power-policy'
import { isProtectedState, isTerminalState, resumableState } from '@main/domain/state-machine'
import type { OrchestrationStore } from '@main/infrastructure/database/store'
import type { StructuredLogger } from '@main/infrastructure/logging/logger'
import { redact } from '@main/infrastructure/logging/redaction'
import { CodexAppServerProvider } from '@main/infrastructure/providers/codex/codex-provider'
import { FakeProvider } from '@main/infrastructure/providers/fake-provider'
import type {
  AgentProvider,
  ProviderEvent,
  ProviderSessionRef
} from '@main/infrastructure/providers/provider'
import type { PowerAdapter } from '@main/infrastructure/platform/power-adapter'
import { DurableScheduler } from './scheduler'
import { VerificationEngine } from './verification-engine'
import { ConversationBuffer } from './conversation-buffer'
import {
  controllerDecisionOutputSchema,
  controllerRoutingPrompt,
  delegatedChildOutputSchema,
  failedResultPacket,
  MAX_DELEGATIONS_PER_PARENT,
  parentResultPrompt,
  parseControllerDecision,
  parseDelegatedChildResult
} from '@main/domain/delegation-contracts'
import { AGENT_PROFILES, applyRoutingPolicy } from '@main/domain/agent-profiles'

interface RuntimeAttempt {
  provider: AgentProvider
  attemptId: string
  ref: ProviderSessionRef | null
  unsubscribe: () => void
}

export type StateListener = (event: JobEvent | null) => void
export type Notify = (title: string, body: string) => void

const CONTINUATION_PROMPT = `Continue the existing objective from the current repository and session state.
Inspect work already completed before making changes. Do not repeat completed work.
Resolve remaining requirements and run configured verification before claiming completion.
If blocked by a decision that requires the user, stop and request input.`

export class Orchestrator {
  private readonly listeners = new Set<StateListener>()
  private readonly runtimes = new Map<string, RuntimeAttempt>()
  private readonly eventChains = new Map<string, Promise<void>>()
  private readonly scheduler: DurableScheduler
  private readonly verification: VerificationEngine
  private readonly verifyingJobs = new Set<string>()
  private queueChain: Promise<void> = Promise.resolve()
  private inhibitorHandle: string | null = null
  private shuttingDown = false
  private readonly conversations = new ConversationBuffer()
  private readonly conversationListeners = new Set<(jobId: string) => void>()
  private readonly changedConversations = new Set<string>()
  private conversationTimer: NodeJS.Timeout | null = null

  constructor(
    private readonly store: OrchestrationStore,
    private readonly power: PowerAdapter,
    private readonly logger: StructuredLogger,
    private readonly notify: Notify = () => undefined,
    private readonly providerFactory: (
      mode: Job['provider'],
      settings: AppSettings
    ) => AgentProvider = (mode, _settings) =>
      mode === 'fake' ? new FakeProvider() : new CodexAppServerProvider()
  ) {
    this.scheduler = new DurableScheduler(store, (schedule) => this.executeSchedule(schedule))
    this.verification = new VerificationEngine(store)
  }

  async initialize(): Promise<void> {
    await this.recoverUnfinishedJobs()
    this.store.cleanupEvents(this.store.getSettings().eventRetentionDays)
    this.scheduler.start()
    await this.syncInhibitor()
    void this.processQueue()
  }

  async shutdown(): Promise<void> {
    this.shuttingDown = true
    if (this.conversationTimer) clearTimeout(this.conversationTimer)
    this.conversationTimer = null
    this.changedConversations.clear()
    await this.scheduler.stop()
    for (const [jobId] of this.runtimes) await this.finishRuntime(jobId)
    if (this.inhibitorHandle) await this.power.releaseInhibitor(this.inhibitorHandle)
    this.inhibitorHandle = null
    this.conversations.clear()
  }

  subscribe(listener: StateListener): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  subscribeConversation(listener: (jobId: string) => void): () => void {
    this.conversationListeners.add(listener)
    return () => this.conversationListeners.delete(listener)
  }

  async createProject(name: string, inputPath: string): Promise<Project> {
    const canonical = await this.validateProjectPath(inputPath)
    const project = this.store.createProject(name.trim(), canonical)
    this.emit(null)
    return project
  }

  listProjects(): Project[] {
    return this.store.listProjects()
  }

  removeProject(projectId: string): void {
    const active = this.store
      .listJobs()
      .some((job) => job.projectId === projectId && !isTerminalState(job.state))
    if (active)
      throw new AppError('VALIDATION', 'A project with unfinished jobs cannot be removed.')
    this.store.removeProject(projectId)
    this.emit(null)
  }

  async createJob(input: CreateJobInput): Promise<Job> {
    const project = this.store.getProject(input.projectId)
    await this.validateProjectPath(project.path)
    const normalized: CreateJobInput =
      input.kind === 'controller'
        ? {
            ...input,
            profile: AGENT_PROFILES.ASTRA_CONTROLLER.id,
            requestedModel: AGENT_PROFILES.ASTRA_CONTROLLER.model,
            requestedEffort: AGENT_PROFILES.ASTRA_CONTROLLER.effort
          }
        : input
    const job = this.store.createJob(normalized)
    this.emit(null)
    if (input.startImmediately) void this.processQueue()
    return job
  }

  listJobs(includeArchived = false): Job[] {
    return this.store.listJobs(includeArchived)
  }

  getJobDetail(jobId: string) {
    return {
      ...redact(this.store.getJobDetail(jobId)),
      conversation: this.conversations.read(jobId)
    }
  }

  async readJobConversation(jobId: string): Promise<CodexThreadDetail> {
    const detail = this.store.getJobDetail(jobId)
    const session = detail.sessions[0]
    if (!session)
      throw new AppError('VALIDATION', 'This job has no saved provider conversation yet.')
    const provider = this.providerFactory(detail.job.provider, this.store.getSettings())
    try {
      return await provider.readThread(session.externalId)
    } finally {
      await provider.disconnect()
    }
  }

  async jobAction(jobId: string, action: string): Promise<Job> {
    const job = this.store.getJob(jobId)
    switch (action) {
      case 'verify': {
        const attempt = this.store.getLatestAttempt(jobId)
        if (
          !['VERIFICATION_FAILED', 'NEEDS_REVIEW'].includes(job.state) ||
          attempt?.status !== 'completed' ||
          this.runtimes.has(jobId) ||
          this.verifyingJobs.has(jobId)
        ) {
          throw new AppError(
            'INVALID_TRANSITION',
            'Verification requires a completed provider turn and no active run.'
          )
        }
        const settings = this.store.getSettings()
        if (
          this.store.activeJobCount() >= settings.maxConcurrentJobs ||
          (settings.perProjectExclusive && this.hasProjectConflict(job))
        )
          throw new AppError(
            'CONCURRENCY_LIMIT',
            'Other protected work must finish before verification can run.'
          )
        this.transition(
          jobId,
          'VERIFYING',
          'Rerunning checks only; no Codex turn will be started.',
          attempt.id
        )
        void this.runVerification(jobId, attempt.id).catch((error) =>
          this.recordUnexpected(jobId, error)
        )
        break
      }
      case 'start':
        if (job.state !== 'DRAFT')
          throw new AppError('INVALID_TRANSITION', 'Only a draft job can be started.')
        this.transition(jobId, 'QUEUED', 'Job queued by the user.')
        void this.processQueue()
        break
      case 'pause':
        await this.pause(job)
        break
      case 'resume':
        if (!resumableState(job.state))
          throw new AppError('INVALID_TRANSITION', 'Job is not resumable.')
        this.cancelPendingSchedules(jobId)
        this.transition(jobId, 'QUEUED', 'Job queued for manual resume.')
        void this.processQueue()
        break
      case 'interrupt':
        await this.interrupt(job)
        break
      case 'cancel':
        await this.cancel(job)
        break
      case 'retry':
        if (!['FAILED', 'VERIFICATION_FAILED', 'NEEDS_REVIEW'].includes(job.state)) {
          throw new AppError('INVALID_TRANSITION', 'Job is not in a retryable state.')
        }
        this.cancelPendingSchedules(jobId)
        this.transition(jobId, 'QUEUED', 'Job queued for manual retry.')
        void this.processQueue()
        break
      case 'archive':
        if (!isTerminalState(job.state) && job.state !== 'VERIFICATION_FAILED') {
          throw new AppError('INVALID_TRANSITION', 'Only finished jobs can be archived.')
        }
        this.store.archiveJob(jobId)
        this.emit(null)
        break
      default:
        throw new AppError('VALIDATION', 'Unknown job action.')
    }
    return this.store.getJob(jobId)
  }

  scheduleManualResume(jobId: string, resumeAt: string): Job {
    const job = this.store.getJob(jobId)
    if (job.state !== 'WAITING_FOR_LIMIT') {
      throw new AppError(
        'INVALID_TRANSITION',
        'A manual resume time can only be set while waiting for a usage reset.'
      )
    }

    const parsed = new Date(resumeAt)
    if (!Number.isFinite(parsed.getTime()) || parsed.getTime() <= Date.now()) {
      throw new AppError('VALIDATION', 'Resume time must be a valid future date and time.')
    }

    this.cancelPendingSchedules(jobId)
    const dueAt = parsed.toISOString()
    const schedule = this.store.createSchedule(jobId, 'resume', dueAt, 'user', 'high', {
      reason: 'User selected the resume time because no reliable provider reset time was available.'
    })
    const event = this.store.appendEvent(
      jobId,
      null,
      'resume.scheduled_manual',
      'info',
      `Resume scheduled by the user for ${dueAt}.`,
      { scheduleId: schedule.id, dueAt, source: 'user' }
    )
    this.scheduler.changed()
    this.emit(event)
    this.notify('Resume scheduled', `Job will resume at ${parsed.toLocaleString()}.`)
    return this.store.getJob(jobId)
  }

  async respondToApproval(
    approvalId: string,
    decision: ApprovalDecision,
    input?: Record<string, string>
  ): Promise<void> {
    const approval = this.store.getApproval(approvalId)
    if (approval.status !== 'pending')
      throw new AppError('VALIDATION', 'Approval is already resolved.')
    const runtime = this.runtimes.get(approval.jobId)
    if (!runtime) {
      this.transition(
        approval.jobId,
        'NEEDS_REVIEW',
        'Approval could not be restored after provider disconnect.'
      )
      throw new AppError(
        'PROVIDER_UNAVAILABLE',
        'The original provider request is no longer connected.'
      )
    }
    await runtime.provider.respondToApproval(approval.providerRequestId, decision, input)
    this.store.resolveApproval(
      approvalId,
      decision === 'accept' || decision === 'acceptForSession'
        ? 'accepted'
        : decision === 'decline'
          ? 'declined'
          : 'cancelled'
    )
    const current = this.store.getJob(approval.jobId)
    if (
      (decision === 'accept' || decision === 'acceptForSession') &&
      ['WAITING_FOR_APPROVAL', 'WAITING_FOR_INPUT'].includes(current.state)
    ) {
      this.transition(
        approval.jobId,
        'RUNNING',
        'Human response sent to the provider.',
        runtime.attemptId
      )
    }
    this.emit(null)
  }

  cancelPowerCountdown(scheduleId: string): void {
    const schedule = this.store.listPendingSchedules().find((entry) => entry.id === scheduleId)
    if (!schedule || schedule.kind !== 'power')
      throw new AppError('VALIDATION', 'Power countdown was not found.')
    this.store.resolveSchedule(schedule.id, 'cancelled')
    const event = this.store.appendEvent(
      schedule.jobId,
      null,
      'power.cancelled',
      'warning',
      'Post-completion power action was cancelled by the user.',
      { scheduleId }
    )
    this.scheduler.changed()
    this.emit(event)
  }

  getSettings(): AppSettings {
    return this.store.getSettings()
  }

  updateSettings(patch: Partial<AppSettings>): AppSettings {
    const settings = this.store.updateSettings(patch)
    this.emit(null)
    return settings
  }

  async probeProvider(): Promise<ProviderStatus> {
    const settings = this.store.getSettings()
    const provider = this.providerFactory(settings.providerMode, settings)
    try {
      return await provider.probe()
    } finally {
      await provider.disconnect()
    }
  }

  async checkCodexConnection(): Promise<CodexConnectionSnapshot> {
    const settings = this.store.getSettings()
    const provider = this.providerFactory(settings.providerMode, settings)
    try {
      await provider.connect()
      const status = await provider.probe()
      const account = await provider.readAccountSnapshot()
      const reportedStatus =
        status.state === 'ready'
          ? {
              ...status,
              state: 'available' as const,
              message:
                'Codex app-server responded successfully; the temporary connection was closed.'
            }
          : status
      return { provider: reportedStatus, account }
    } finally {
      await provider.disconnect()
    }
  }

  async listCodexThreads(): Promise<CodexThreadIndex> {
    const settings = this.store.getSettings()
    const provider = this.providerFactory(settings.providerMode, settings)
    try {
      return this.withManagedJobs(await provider.listThreads(), settings.providerMode)
    } finally {
      await provider.disconnect()
    }
  }

  async readCodexThread(threadId: string, includeTurns = true): Promise<CodexThreadDetail> {
    const settings = this.store.getSettings()
    const provider = this.providerFactory(settings.providerMode, settings)
    try {
      const detail = await provider.readThread(threadId, includeTurns)
      detail.summary.managedJobId = this.store.jobIdForSession(settings.providerMode, threadId)
      return detail
    } finally {
      await provider.disconnect()
    }
  }

  async loadCodexWorkspace(): Promise<CodexWorkspaceSnapshot> {
    const settings = this.store.getSettings()
    const provider = this.providerFactory(settings.providerMode, settings)
    try {
      await provider.connect()
      const status = await provider.probe()
      const [account, threads] = await Promise.all([
        provider.readAccountSnapshot(),
        provider.listThreads()
      ])
      return {
        provider:
          status.state === 'ready'
            ? {
                ...status,
                state: 'available',
                message: 'Codex app-server responded; history and account were refreshed.'
              }
            : status,
        account,
        threads: this.withManagedJobs(threads, settings.providerMode)
      }
    } finally {
      await provider.disconnect()
    }
  }

  async continueCodexThread(input: ContinueCodexThreadInput): Promise<Job> {
    const settings = this.store.getSettings()
    const mode = settings.providerMode
    if (this.store.jobIdForSession(mode, input.threadId)) {
      throw new AppError(
        'CONCURRENCY_LIMIT',
        'This Codex conversation is already managed by a job.'
      )
    }
    const provider = this.providerFactory(mode, settings)
    let detail: CodexThreadDetail
    let listedThread: CodexThreadIndex['threads'][number] | undefined
    try {
      listedThread = (await provider.listThreads()).threads.find(
        (entry) => entry.id === input.threadId
      )
      if (!listedThread) throw new AppError('VALIDATION', 'Codex conversation was not found.')
      detail = await provider.readThread(input.threadId, false)
    } finally {
      await provider.disconnect()
    }
    const thread = {
      ...listedThread,
      ...detail.summary,
      archived: listedThread.archived,
      cwd: listedThread.cwd ?? detail.summary.cwd
    }
    if (thread.archived)
      throw new AppError('VALIDATION', 'Archived conversations cannot be continued.')
    if (
      ['active', 'running'].includes(listedThread.status ?? '') ||
      ['active', 'running'].includes(detail.summary.status ?? '')
    ) {
      throw new AppError('CONCURRENCY_LIMIT', 'This Codex conversation has an active turn.')
    }
    if (!thread.cwd)
      throw new AppError('VALIDATION', 'Codex did not report a workspace for this conversation.')
    const canonical = await this.validateProjectPath(thread.cwd)
    let project = this.store.listProjects().find((entry) => entry.path === canonical)
    if (!project)
      project = this.store.createProject(basename(canonical) || 'Codex workspace', canonical)
    const job = this.store.createJobForSession(
      {
        projectId: project.id,
        objective: input.objective,
        provider: mode,
        profile: 'default',
        retryPolicy: input.retryPolicy,
        verification: input.verification,
        powerPolicy: input.powerPolicy,
        startImmediately: true
      },
      input.threadId
    )
    this.emit(null)
    void this.processQueue()
    return job
  }

  private withManagedJobs(index: CodexThreadIndex, provider: Job['provider']): CodexThreadIndex {
    const linkedJobs = this.store.sessionJobIds(provider)
    return {
      ...index,
      threads: index.threads.map((thread) => ({
        ...thread,
        managedJobId: linkedJobs.get(thread.id) ?? null
      }))
    }
  }

  async getSnapshot(): Promise<DashboardSnapshot> {
    const jobs = this.store.listJobs()
    const pendingSchedules = this.store.listPendingSchedules()
    return {
      jobs,
      projects: this.store.listProjects(),
      provider: await this.probeProvider(),
      pendingApprovals: this.store.pendingApprovals(),
      upcomingSchedules: pendingSchedules,
      activePowerCountdowns: pendingSchedules
        .filter((schedule) => schedule.kind === 'power')
        .map((schedule) => ({
          scheduleId: schedule.id,
          jobId: schedule.jobId,
          action: String(schedule.payload.action) as Job['powerPolicy']['action'],
          dueAt: schedule.dueAt,
          cancelled: false
        }))
    }
  }

  async diagnostics(appVersion: string): Promise<DiagnosticSnapshot> {
    return redact({
      generatedAt: new Date().toISOString(),
      appVersion,
      platform: `${process.platform}/${process.arch}`,
      databaseSchemaVersion: this.store.schemaVersion(),
      provider: await this.probeProvider(),
      counts: this.store.counts(),
      recentEvents: this.store.listEvents(undefined, 200)
    })
  }

  private processQueue(): Promise<void> {
    this.queueChain = this.queueChain
      .then(() => this.drainQueue())
      .catch((error) =>
        this.logger
          .write({
            level: 'error',
            subsystem: 'queue',
            message: error instanceof Error ? error.message : String(error)
          })
          .then(() => undefined)
      )
    return this.queueChain
  }

  private async drainQueue(): Promise<void> {
    if (this.shuttingDown) return
    const settings = this.store.getSettings()
    const jobs = this.store.listJobs()
    const resumableParents = jobs.filter((entry) => {
      if (entry.state !== 'WAITING_FOR_CHILD') return false
      const delegation = this.store.getLatestDelegationForParent(entry.id)
      return Boolean(
        delegation?.result &&
        ['child_completed', 'child_blocked', 'child_failed'].includes(delegation.status)
      )
    })
    for (const job of [...resumableParents, ...jobs.filter((entry) => entry.state === 'QUEUED')]) {
      if (this.store.activeJobCount() >= settings.maxConcurrentJobs) return
      if (settings.perProjectExclusive && this.hasProjectConflict(job)) continue
      await this.startJob(job.id)
    }
  }

  private async startJob(jobId: string): Promise<void> {
    if (this.runtimes.has(jobId))
      throw new AppError('CONCURRENCY_LIMIT', 'Job already has an active attempt.')
    let job = this.store.getJob(jobId)
    const startingState = job.state
    if (startingState === 'WAITING_FOR_CHILD') {
      const delegation = this.store.getLatestDelegationForParent(jobId)
      if (
        !delegation?.result ||
        !['child_completed', 'child_blocked', 'child_failed'].includes(delegation.status)
      ) {
        throw new AppError(
          'INVALID_TRANSITION',
          'PARENT_MODEL_ACTIVE_WHILE_CHILD_RUNNING=FALSE: a terminal child result is required before parent resume.'
        )
      }
    }
    if (
      ![
        'QUEUED',
        'WAITING_FOR_LIMIT',
        'WAITING_FOR_RETRY',
        'WAITING_FOR_CHILD',
        'PAUSED',
        'NEEDS_REVIEW',
        'FAILED'
      ].includes(job.state)
    ) {
      throw new AppError('INVALID_TRANSITION', `Job cannot start from ${job.state}.`)
    }
    const project = this.store.getProject(job.projectId)
    await this.validateProjectPath(project.path)
    const session = this.store.latestSession(jobId)
    const latestDelegation =
      job.kind === 'controller' ? this.store.getLatestDelegationForParent(jobId) : null
    const delegatedContinuation =
      latestDelegation?.result &&
      ['child_completed', 'child_blocked', 'child_failed', 'parent_resuming'].includes(
        latestDelegation.status
      )
        ? parentResultPrompt(latestDelegation.result)
        : null
    const previousAttempt = this.store.getLatestAttempt(jobId)
    const rejectedBeforeTurn =
      previousAttempt?.providerTurnId === null &&
      previousAttempt.stopReason === PROVIDER_BUSY_STOP_REASON
    const kind = session ? 'resume' : this.store.getLatestAttempt(jobId) ? 'retry' : 'start'
    const attempt = this.store.createAttempt(jobId, kind)
    if (startingState === 'WAITING_FOR_CHILD') this.store.markParentResuming(jobId)
    job = this.transition(
      jobId,
      'STARTING',
      `${kind === 'start' ? 'Starting' : 'Resuming'} provider attempt ${attempt.number}.`,
      attempt.id
    )
    const settings = this.store.getSettings()
    const provider = this.providerFactory(job.provider, settings)
    const unsubscribe = provider.subscribe((event) => this.enqueueProviderEvent(jobId, event))
    const runtime: RuntimeAttempt = { provider, attemptId: attempt.id, ref: null, unsubscribe }
    this.runtimes.set(jobId, runtime)

    try {
      await provider.connect()
      const ref = session
        ? await provider.resume({
            objective: job.objective,
            continuation:
              delegatedContinuation ??
              (attempt.number === 1 || rejectedBeforeTurn ? job.objective : CONTINUATION_PROMPT),
            cwd: project.path,
            profile: job.profile,
            model: job.requestedModel ?? undefined,
            effort: job.requestedEffort ?? undefined,
            outputSchema:
              job.kind === 'controller'
                ? controllerDecisionOutputSchema
                : job.kind === 'delegated-child'
                  ? delegatedChildOutputSchema
                  : undefined,
            sessionId: session.externalId
          })
        : await provider.start({
            objective:
              job.kind === 'controller' ? controllerRoutingPrompt(job.objective) : job.objective,
            cwd: project.path,
            profile: job.profile,
            model: job.requestedModel ?? undefined,
            effort: job.requestedEffort ?? undefined,
            outputSchema:
              job.kind === 'controller'
                ? controllerDecisionOutputSchema
                : job.kind === 'delegated-child'
                  ? delegatedChildOutputSchema
                  : undefined
          })
      runtime.ref = ref
      this.store.saveSession(jobId, job.provider, ref.sessionId)
      this.store.updateAttempt(attempt.id, {
        status: 'running',
        providerSessionId: ref.sessionId,
        providerTurnId: ref.turnId
      })
      const current = this.store.getJob(jobId)
      if (current.state === 'STARTING')
        this.transition(jobId, 'RUNNING', 'Provider turn is running.', attempt.id)
      if (job.kind === 'delegated-child') this.store.markDelegatedChildRunning(jobId, attempt.id)
      if (job.kind === 'controller' && delegatedContinuation) {
        this.store.markParentControllerTurnStarted(jobId)
        this.store.markParentResumed(jobId)
      }
      await this.syncInhibitor()
    } catch (error) {
      await this.handleStartFailure(jobId, attempt.id, error)
    }
  }

  private hasProjectConflict(job: Job): boolean {
    const delegation =
      job.kind === 'delegated-child' ? this.store.getDelegationForChild(job.id) : null
    return this.store
      .listJobs()
      .some(
        (candidate) =>
          candidate.id !== job.id &&
          candidate.projectId === job.projectId &&
          isProtectedState(candidate.state) &&
          candidate.id !== delegation?.parentJobId
      )
  }

  private enqueueProviderEvent(jobId: string, event: ProviderEvent): void {
    const previous = this.eventChains.get(jobId) ?? Promise.resolve()
    const next = previous
      .then(() => this.handleProviderEvent(jobId, event))
      .catch((error) => this.recordUnexpected(jobId, error))
    this.eventChains.set(jobId, next)
  }

  private async handleProviderEvent(jobId: string, providerEvent: ProviderEvent): Promise<void> {
    const runtime = this.runtimes.get(jobId)
    const attemptId = runtime?.attemptId ?? this.store.getLatestAttempt(jobId)?.id ?? null
    const currentState = this.store.getJob(jobId).state
    if (
      ['PAUSED', 'CANCELLED'].includes(currentState) &&
      ['turn.failed', 'provider.disconnected'].includes(providerEvent.type)
    ) {
      this.emit(
        this.store.appendEvent(
          jobId,
          attemptId,
          'provider.event_ignored',
          'info',
          `Ignored ${providerEvent.type} after an intentional user stop.`
        )
      )
      return
    }
    switch (providerEvent.type) {
      case 'session.started':
        this.store.saveSession(jobId, this.store.getJob(jobId).provider, providerEvent.sessionId)
        this.emit(
          this.store.appendEvent(
            jobId,
            attemptId,
            providerEvent.type,
            'info',
            'Provider session started.',
            {
              sessionId: providerEvent.sessionId
            }
          )
        )
        break
      case 'turn.started':
        if (attemptId) {
          this.store.updateAttempt(attemptId, {
            status: 'running',
            providerSessionId: providerEvent.sessionId,
            providerTurnId: providerEvent.turnId
          })
        }
        if (this.store.getJob(jobId).state === 'STARTING') {
          this.transition(jobId, 'RUNNING', 'Provider turn started.', attemptId)
        }
        break
      case 'message.updated':
        if (!runtime || !attemptId) return
        this.conversations.update(jobId, attemptId, {
          ...providerEvent,
          turnId:
            providerEvent.turnId || this.store.getLatestAttempt(jobId)?.providerTurnId || attemptId
        })
        this.changedConversations.add(jobId)
        if (!this.conversationTimer && !this.shuttingDown) {
          this.conversationTimer = setTimeout(() => {
            this.conversationTimer = null
            const changedJobs = [...this.changedConversations]
            this.changedConversations.clear()
            for (const changedJob of changedJobs) {
              for (const listener of this.conversationListeners) listener(changedJob)
            }
          }, 250)
        }
        return
      case 'activity':
      case 'command.started':
        this.emit(
          this.store.appendEvent(
            jobId,
            attemptId,
            providerEvent.type,
            'info',
            providerEvent.message,
            providerEvent.metadata ?? {}
          )
        )
        break
      case 'command.completed':
        this.emit(
          this.store.appendEvent(
            jobId,
            attemptId,
            providerEvent.type,
            providerEvent.success ? 'info' : 'warning',
            providerEvent.message,
            providerEvent.metadata ?? {}
          )
        )
        break
      case 'approval.requested': {
        const approval = this.store.createApproval(
          jobId,
          attemptId,
          providerEvent.requestId,
          providerEvent.kind,
          providerEvent.title,
          providerEvent.detail
        )
        const waiting: JobState =
          providerEvent.kind === 'user-input' ? 'WAITING_FOR_INPUT' : 'WAITING_FOR_APPROVAL'
        this.transition(jobId, waiting, providerEvent.title, attemptId)
        this.notify(
          'Codex Orchestrator needs you',
          `${providerEvent.title}: ${providerEvent.detail}`
        )
        this.emit(
          this.store.appendEvent(
            jobId,
            attemptId,
            providerEvent.type,
            'warning',
            providerEvent.title,
            {
              approvalId: approval.id,
              kind: approval.kind
            }
          )
        )
        break
      }
      case 'approval.resolved':
        this.emit(
          this.store.appendEvent(
            jobId,
            attemptId,
            providerEvent.type,
            'info',
            'Provider approval request resolved.',
            {
              providerRequestId: providerEvent.requestId
            }
          )
        )
        break
      case 'provider.rate_limited':
        await this.handleLimit(jobId, attemptId, providerEvent)
        break
      case 'provider.authentication_required':
        if (attemptId)
          this.store.updateAttempt(
            attemptId,
            { status: 'failed', stopReason: providerEvent.message },
            true
          )
        this.transition(jobId, 'NEEDS_REVIEW', providerEvent.message, attemptId)
        this.notify('Codex authentication required', providerEvent.message)
        await this.finishRuntime(jobId)
        await this.settleFailedDelegatedChild(jobId, providerEvent.message)
        break
      case 'provider.disconnected':
        await this.handleTransientFailure(jobId, attemptId, providerEvent.message)
        break
      case 'turn.completed':
        if (this.store.getJob(jobId).kind === 'controller') {
          await this.handleControllerCompletion(jobId, attemptId, providerEvent)
        } else if (this.store.getJob(jobId).kind === 'delegated-child') {
          await this.handleDelegatedChildCompletion(jobId, attemptId, providerEvent)
        } else {
          await this.handleCandidateCompletion(jobId, attemptId, providerEvent.message)
        }
        break
      case 'turn.failed':
        if (providerEvent.retryable)
          await this.handleTransientFailure(jobId, attemptId, providerEvent.message)
        else {
          if (attemptId)
            this.store.updateAttempt(
              attemptId,
              { status: 'failed', stopReason: providerEvent.message },
              true
            )
          this.transition(jobId, 'FAILED', providerEvent.message, attemptId)
          await this.finishRuntime(jobId)
          this.notify('Job failed', providerEvent.message)
          await this.settleFailedDelegatedChild(jobId, providerEvent.message)
        }
        break
    }
    await this.syncInhibitor()
  }

  private async handleControllerCompletion(
    jobId: string,
    attemptId: string | null,
    event: Extract<ProviderEvent, { type: 'turn.completed' }>
  ): Promise<void> {
    if (this.store.getJob(jobId).state !== 'RUNNING') return
    if (attemptId) this.store.recordControllerTurnFinished(jobId, attemptId)
    const text = this.conversations.latestCompletedText(jobId, event.turnId)
    if (!text) {
      await this.failStructuredTurn(
        jobId,
        attemptId,
        'Controller completed without one authoritative structured decision.'
      )
      return
    }
    let decision
    try {
      decision = parseControllerDecision(text)
    } catch {
      await this.failStructuredTurn(
        jobId,
        attemptId,
        'Controller decision did not match the required schema.'
      )
      return
    }
    if (decision.action === 'blocked') {
      if (attemptId)
        this.store.updateAttempt(
          attemptId,
          { status: 'completed', stopReason: decision.summary },
          true
        )
      this.transition(jobId, 'NEEDS_REVIEW', decision.summary, attemptId)
      await this.finishRuntime(jobId)
      return
    }
    if (decision.action === 'complete') {
      await this.handleCandidateCompletion(jobId, attemptId, decision.summary)
      return
    }
    if (!attemptId) {
      await this.failStructuredTurn(
        jobId,
        null,
        'Controller dispatch had no durable parent attempt.'
      )
      return
    }
    if (this.store.delegationCount(jobId) >= MAX_DELEGATIONS_PER_PARENT) {
      await this.failStructuredTurn(
        jobId,
        attemptId,
        `Controller reached the ${MAX_DELEGATIONS_PER_PARENT}-child delegation limit.`
      )
      return
    }
    const routing = applyRoutingPolicy(decision, {
      lunaDevelopmentFailed: this.store.lunaDevelopmentFailed(jobId)
    })
    this.store.updateAttempt(attemptId, { status: 'completed', stopReason: decision.summary }, true)
    try {
      this.store.createDelegation(jobId, attemptId, decision, routing)
    } catch (error) {
      await this.failStructuredTurn(
        jobId,
        attemptId,
        error instanceof Error ? error.message : 'Delegation policy rejected the child dispatch.'
      )
      return
    }
    await this.finishRuntime(jobId)
    void this.processQueue()
  }

  private async handleDelegatedChildCompletion(
    jobId: string,
    attemptId: string | null,
    event: Extract<ProviderEvent, { type: 'turn.completed' }>
  ): Promise<void> {
    const text = this.conversations.latestCompletedText(jobId, event.turnId)
    if (!text) {
      await this.failStructuredTurn(
        jobId,
        attemptId,
        'Delegated child completed without an authoritative structured result.'
      )
      await this.settleFailedDelegatedChild(jobId, 'Delegated child result was missing.')
      return
    }
    let result: DelegationResultPacket
    try {
      result = parseDelegatedChildResult(text)
    } catch {
      await this.failStructuredTurn(
        jobId,
        attemptId,
        'Delegated child result did not match the required schema.'
      )
      await this.settleFailedDelegatedChild(jobId, 'Delegated child result was invalid.')
      return
    }
    if (result.status === 'blocked') {
      if (attemptId)
        this.store.updateAttempt(
          attemptId,
          { status: 'completed', stopReason: result.summary },
          true
        )
      this.transition(jobId, 'NEEDS_REVIEW', result.summary, attemptId)
      await this.finishRuntime(jobId)
      await this.settleDelegatedChild(jobId, 'child_blocked', result)
      return
    }
    await this.handleCandidateCompletion(jobId, attemptId, result.summary)
  }

  private async failStructuredTurn(
    jobId: string,
    attemptId: string | null,
    message: string
  ): Promise<void> {
    if (attemptId)
      this.store.updateAttempt(attemptId, { status: 'failed', stopReason: message }, true)
    const state = this.store.getJob(jobId).state
    if (['STARTING', 'RUNNING'].includes(state)) {
      this.transition(jobId, 'NEEDS_REVIEW', message, attemptId)
    }
    await this.finishRuntime(jobId)
  }

  private async handleLimit(
    jobId: string,
    attemptId: string | null,
    event: Extract<ProviderEvent, { type: 'provider.rate_limited' }>
  ): Promise<void> {
    const job = this.store.getJob(jobId)
    if (attemptId)
      this.store.updateAttempt(
        attemptId,
        { status: 'stopped', stopReason: 'Usage limit wait.' },
        true
      )

    let evidence = event.evidence
    const runtime = this.runtimes.get(jobId)

    // Rate-limit notifications may be sparse. Before declaring the reset time unknown,
    // refresh the authoritative account/rateLimits snapshot through the connected provider.
    if (!evidence.retryAt && runtime) {
      try {
        const snapshot = await runtime.provider.readAccountSnapshot()
        const refreshed = classifyLimit(snapshot.rateLimits, new Date())
        if (refreshed.retryAt) evidence = refreshed
      } catch (error) {
        this.emit(
          this.store.appendEvent(
            jobId,
            attemptId,
            'provider.rate_limit_refresh_failed',
            'warning',
            'Could not refresh Codex rate-limit details; manual resume scheduling may be required.',
            { error: String(error) }
          )
        )
      }
    }

    if (!evidence.retryAt || evidence.source === 'unknown') {
      const reason =
        'Codex usage limit was reached, but no reliable reset time was available. Choose a future date and time to resume.'
      this.transition(jobId, 'WAITING_FOR_LIMIT', reason, attemptId, null)
      this.notify('Resume time required', 'Choose when this job should resume.')
      await this.finishRuntime(jobId)
      return
    }

    if (job.automaticAttempts >= job.retryPolicy.maxAutomaticAttempts) {
      this.transition(
        jobId,
        'NEEDS_REVIEW',
        'Maximum automatic resume attempts reached.',
        attemptId
      )
      await this.finishRuntime(jobId)
      await this.settleFailedDelegatedChild(jobId, 'Maximum automatic retry attempts reached.')
      return
    }

    const dueAt = evidence.retryAt
    const source =
      evidence.source === 'provider-structured' ? 'provider-structured' : 'provider-parsed'
    this.store.createSchedule(jobId, 'resume', dueAt, source, evidence.confidence, {
      evidence: evidence.redactedEvidence
    })
    this.transition(jobId, 'WAITING_FOR_LIMIT', evidence.redactedEvidence, attemptId, dueAt)
    this.notify(
      'Job waiting for usage reset',
      `Scheduled to resume at ${new Date(dueAt).toLocaleString()}.`
    )
    await this.finishRuntime(jobId)
    this.scheduler.changed()
  }

  private async handleTransientFailure(
    jobId: string,
    attemptId: string | null,
    message: string
  ): Promise<void> {
    const job = this.store.getJob(jobId)
    if (attemptId)
      this.store.updateAttempt(attemptId, { status: 'failed', stopReason: message }, true)
    if (job.automaticAttempts >= job.retryPolicy.maxAutomaticAttempts) {
      this.transition(jobId, 'NEEDS_REVIEW', 'Maximum automatic retry attempts reached.', attemptId)
      await this.finishRuntime(jobId)
      await this.settleFailedDelegatedChild(
        jobId,
        'Delegated child exhausted automatic transient retries.'
      )
      return
    }
    const dueAt = computeRetryAt(
      job.automaticAttempts + 1,
      job.retryPolicy,
      new Date()
    ).toISOString()
    this.store.createSchedule(jobId, 'retry', dueAt, 'fallback', 'low', { reason: message })
    this.transition(jobId, 'WAITING_FOR_RETRY', message, attemptId, dueAt)
    await this.finishRuntime(jobId)
    this.scheduler.changed()
  }

  private async handleCandidateCompletion(
    jobId: string,
    attemptId: string | null,
    message: string
  ): Promise<void> {
    if (this.store.getJob(jobId).state !== 'RUNNING') return
    if (attemptId)
      this.store.updateAttempt(attemptId, { status: 'completed', stopReason: message }, true)
    this.transition(jobId, 'VERIFYING', 'Provider completed; verification is running.', attemptId)
    try {
      await this.finishRuntime(jobId)
    } catch (error) {
      this.transition(
        jobId,
        'NEEDS_REVIEW',
        'Provider cleanup failed before verification; review is required.',
        attemptId
      )
      throw error
    }
    await this.runVerification(jobId, attemptId)
  }

  private async runVerification(jobId: string, attemptId: string | null): Promise<void> {
    if (this.verifyingJobs.has(jobId))
      throw new AppError('CONCURRENCY_LIMIT', 'Verification is already running.')
    this.verifyingJobs.add(jobId)
    const job = this.store.getJob(jobId)
    const project = this.store.getProject(job.projectId)
    try {
      const passed = await this.verification.run(jobId, project.path, job.verification)
      if (this.store.getJob(jobId).state !== 'VERIFYING') return
      if (!passed) {
        this.transition(
          jobId,
          'VERIFICATION_FAILED',
          'One or more required verification checks failed.',
          attemptId
        )
        this.notify('Verification failed', `${project.name}: required checks did not pass.`)
        await this.settleFailedDelegatedChild(jobId, 'Delegated child verification did not pass.')
        return
      }
      const completed = this.transition(
        jobId,
        'COMPLETED',
        'Job completed with required verification evidence.',
        attemptId
      )
      this.notify('Job completed', `${project.name}: ${completed.objective.slice(0, 120)}`)
      if (completed.kind === 'delegated-child') {
        const attempt = this.store.getLatestAttempt(jobId)
        const text = this.conversations.latestCompletedText(
          jobId,
          attempt?.providerTurnId ?? undefined
        )
        let result: DelegationResultPacket
        try {
          result = text
            ? parseDelegatedChildResult(text)
            : failedResultPacket(
                'Delegated child completed but its structured result was unavailable.'
              )
        } catch {
          result = failedResultPacket(
            'Delegated child completed but its structured result was invalid.'
          )
        }
        await this.settleDelegatedChild(
          jobId,
          result.status === 'completed' ? 'child_completed' : 'child_failed',
          result
        )
      } else {
        await this.schedulePowerIfEligible(completed)
      }
    } catch (error) {
      await this.recordUnexpected(jobId, error)
      if (this.store.getJob(jobId).state === 'VERIFYING') {
        this.transition(
          jobId,
          'NEEDS_REVIEW',
          'Verification could not finish; inspect the error and rerun checks without repeating Codex work.',
          attemptId
        )
        await this.settleFailedDelegatedChild(
          jobId,
          'Delegated child verification could not finish.'
        )
      }
    } finally {
      this.verifyingJobs.delete(jobId)
      await this.syncInhibitor()
      void this.processQueue()
    }
  }

  private async settleFailedDelegatedChild(jobId: string, summary: string): Promise<void> {
    if (this.store.getJob(jobId).kind !== 'delegated-child') return
    await this.settleDelegatedChild(jobId, 'child_failed', failedResultPacket(summary))
  }

  private async settleDelegatedChild(
    childJobId: string,
    status: 'child_completed' | 'child_blocked' | 'child_failed',
    result: DelegationResultPacket
  ): Promise<void> {
    const settled = this.store.settleDelegation(childJobId, status, result)
    if (!settled) return
    this.emit(
      this.store.appendEvent(
        settled.parentJobId,
        settled.parentAttemptId,
        'delegation.settled',
        status === 'child_completed' ? 'info' : 'warning',
        `Delegated child reached ${result.status}; controller will resume once.`,
        { delegationId: settled.id, childJobId, status: result.status }
      )
    )
    const parent = this.store.getJob(settled.parentJobId)
    if (parent.state !== 'WAITING_FOR_CHILD') return
    void this.processQueue()
  }

  private async schedulePowerIfEligible(job: Job): Promise<void> {
    if (job.powerPolicy.action === 'none') return
    const capabilities = await this.power.capabilities()
    const settings = this.store.getSettings()
    const siblings = this.store
      .listJobs()
      .filter((candidate) => candidate.id !== job.id && isProtectedState(candidate.state)).length
    const eligibility = evaluatePowerEligibility({
      job,
      requiredVerificationPassed: true,
      hasPendingApprovalOrInput: this.store.pendingApprovals(job.id).length > 0,
      protectedSiblingCount: siblings,
      settings,
      capabilities
    })
    if (!eligibility.eligible) {
      this.emit(
        this.store.appendEvent(
          job.id,
          null,
          'power.blocked',
          'warning',
          'Configured power action is not eligible.',
          { reasons: eligibility.reasons }
        )
      )
      return
    }
    const dueAt = new Date(Date.now() + job.powerPolicy.countdownSeconds * 1_000).toISOString()
    this.store.createSchedule(job.id, 'power', dueAt, 'user', 'high', {
      action: job.powerPolicy.action
    })
    this.notify(
      'Power action countdown',
      `${job.powerPolicy.action} in ${job.powerPolicy.countdownSeconds} seconds.`
    )
    this.scheduler.changed()
    this.emit(null)
  }

  private async executeSchedule(schedule: Schedule): Promise<void> {
    const job = this.store.getJob(schedule.jobId)
    if (schedule.kind === 'power') {
      await this.executePowerSchedule(schedule, job)
      return
    }
    if (!['WAITING_FOR_LIMIT', 'WAITING_FOR_RETRY'].includes(job.state)) {
      this.store.resolveSchedule(schedule.id, 'obsolete')
      this.emit(
        this.store.appendEvent(
          job.id,
          null,
          'schedule.obsolete',
          'info',
          'Scheduled continuation was no longer applicable.',
          {
            scheduleId: schedule.id,
            state: job.state
          }
        )
      )
      return
    }
    const userScheduled = schedule.source === 'user'
    if (!userScheduled && job.automaticAttempts >= job.retryPolicy.maxAutomaticAttempts) {
      this.store.resolveSchedule(schedule.id, 'failed')
      this.transition(
        job.id,
        'NEEDS_REVIEW',
        'Maximum automatic attempts reached before scheduled continuation.'
      )
      return
    }
    this.store.resolveSchedule(schedule.id, 'completed')
    if (!userScheduled) this.store.incrementAutomaticAttempts(job.id)
    await this.startJob(job.id)
  }

  private async executePowerSchedule(schedule: Schedule, job: Job): Promise<void> {
    const action = String(schedule.payload.action) as Job['powerPolicy']['action']
    const latest = this.store.getVerificationRuns(job.id)[0]
    const capabilities = await this.power.capabilities()
    const eligibility = evaluatePowerEligibility({
      job,
      requiredVerificationPassed: job.verification.length === 0 || latest?.status === 'passed',
      hasPendingApprovalOrInput: this.store.pendingApprovals(job.id).length > 0,
      protectedSiblingCount: this.store
        .listJobs()
        .filter((candidate) => candidate.id !== job.id && isProtectedState(candidate.state)).length,
      settings: this.store.getSettings(),
      capabilities
    })
    if (!eligibility.eligible || action !== job.powerPolicy.action) {
      this.store.resolveSchedule(schedule.id, 'failed')
      this.emit(
        this.store.appendEvent(
          job.id,
          null,
          'power.blocked',
          'warning',
          'Final power eligibility check failed.',
          {
            reasons: eligibility.reasons
          }
        )
      )
      return
    }
    this.store.resolveSchedule(schedule.id, 'running')
    try {
      const result = await this.power.execute(action)
      this.store.resolveSchedule(schedule.id, 'completed')
      this.emit(
        this.store.appendEvent(job.id, null, 'power.executed', 'warning', result.message, {
          action,
          simulated: result.simulated
        })
      )
    } catch (error) {
      this.store.resolveSchedule(schedule.id, 'failed')
      this.emit(
        this.store.appendEvent(
          job.id,
          null,
          'power.failed',
          'error',
          'Power action failed safely.',
          {
            error: String(error)
          }
        )
      )
    }
  }

  private async recoverUnfinishedJobs(): Promise<void> {
    for (const job of this.store.listJobs()) {
      if (
        ['STARTING', 'RUNNING', 'VERIFYING', 'WAITING_FOR_APPROVAL', 'WAITING_FOR_INPUT'].includes(
          job.state
        )
      ) {
        if (job.state === 'VERIFYING') {
          for (const run of this.store.getVerificationRuns(job.id)) {
            if (run.status === 'running') this.store.completeVerificationRun(run.id, 'failed')
          }
        }
        this.store.resolvePendingApprovals(job.id)
        this.transition(
          job.id,
          'NEEDS_REVIEW',
          'The previous process ended while work was active; review is required before resuming to avoid duplicate work.'
        )
      }
    }
    for (const schedule of this.store.listPendingSchedules()) {
      const job = this.store.getJob(schedule.jobId)
      if (isTerminalState(job.state) && schedule.kind !== 'power')
        this.store.resolveSchedule(schedule.id, 'obsolete')
    }
    await this.recoverDelegations()
  }

  private async recoverDelegations(): Promise<void> {
    for (const delegation of this.store.listOpenDelegations()) {
      const parent = this.store.getJob(delegation.parentJobId)
      const child = this.store.getJob(delegation.childJobId)
      if (
        ['child_completed', 'child_blocked', 'child_failed'].includes(delegation.status) &&
        delegation.result &&
        parent.state === 'WAITING_FOR_CHILD'
      ) {
        continue
      }
      if (
        ['child_queued', 'child_running'].includes(delegation.status) &&
        ['COMPLETED', 'VERIFICATION_FAILED', 'FAILED', 'CANCELLED'].includes(child.state)
      ) {
        const status = child.state === 'COMPLETED' ? 'child_completed' : 'child_failed'
        const result: DelegationResultPacket =
          child.state === 'COMPLETED'
            ? {
                status: 'completed',
                summary: 'Child completion was recovered without its in-memory structured result.',
                evidence: [],
                nextAction: null
              }
            : failedResultPacket(`Child was reconciled after restart in ${child.state}.`)
        this.store.settleDelegation(child.id, status, result)
      }
      if (
        ['child_queued', 'child_running'].includes(delegation.status) &&
        child.state === 'NEEDS_REVIEW' &&
        parent.state === 'WAITING_FOR_CHILD'
      ) {
        this.emit(
          this.store.appendEvent(
            parent.id,
            delegation.parentAttemptId,
            'delegation.recovery_review',
            'warning',
            'Child ownership or completion is uncertain after restart; parent remains asleep and no duplicate child was started.',
            { delegationId: delegation.id, childJobId: child.id }
          )
        )
      }
    }
  }

  private async pause(job: Job): Promise<void> {
    if (
      ![
        'QUEUED',
        'STARTING',
        'RUNNING',
        'WAITING_FOR_APPROVAL',
        'WAITING_FOR_INPUT',
        'WAITING_FOR_LIMIT',
        'WAITING_FOR_RETRY'
      ].includes(job.state)
    ) {
      throw new AppError('INVALID_TRANSITION', 'Job cannot be paused from its current state.')
    }
    const runtime = this.runtimes.get(job.id)
    this.store.resolvePendingApprovals(job.id)
    this.cancelPendingSchedules(job.id)
    this.transition(job.id, 'PAUSED', 'Job paused by the user.', runtime?.attemptId)
    if (runtime) {
      try {
        if (runtime.ref) await runtime.provider.interrupt(runtime.ref)
      } finally {
        this.store.updateAttempt(
          runtime.attemptId,
          { status: 'interrupted', stopReason: 'User pause.' },
          true
        )
        await this.finishRuntime(job.id)
      }
    }
  }

  private async interrupt(job: Job): Promise<void> {
    const runtime = this.runtimes.get(job.id)
    if (!runtime?.ref)
      throw new AppError('INVALID_TRANSITION', 'No active provider turn can be interrupted.')
    this.transition(job.id, 'PAUSED', 'Provider turn interrupted by the user.', runtime.attemptId)
    try {
      await runtime.provider.interrupt(runtime.ref)
    } finally {
      this.store.updateAttempt(
        runtime.attemptId,
        { status: 'interrupted', stopReason: 'User interrupt.' },
        true
      )
      await this.finishRuntime(job.id)
    }
  }

  private async cancel(job: Job): Promise<void> {
    if (isTerminalState(job.state))
      throw new AppError('INVALID_TRANSITION', 'Job is already finished.')
    if (job.state === 'VERIFYING') {
      throw new AppError(
        'INVALID_TRANSITION',
        'Checks are still running. Workspace protection remains held until they finish or reach their configured timeout.'
      )
    }
    if (job.state === 'WAITING_FOR_CHILD') {
      const delegation = this.store.getLatestDelegationForParent(job.id)
      if (delegation) {
        const child = this.store.getJob(delegation.childJobId)
        if (child.state === 'VERIFYING') {
          throw new AppError(
            'INVALID_TRANSITION',
            'The delegated child is verifying. Workspace protection remains held until checks finish.'
          )
        }
        this.store.cancelDelegation(job.id)
        if (!isTerminalState(child.state)) await this.cancel(child)
      } else {
        this.store.cancelDelegation(job.id)
      }
    }
    const runtime = this.runtimes.get(job.id)
    this.store.resolvePendingApprovals(job.id)
    this.cancelPendingSchedules(job.id)
    this.transition(job.id, 'CANCELLED', 'Job cancelled by the user.', runtime?.attemptId)
    if (runtime) {
      try {
        if (runtime.ref) await runtime.provider.interrupt(runtime.ref)
      } finally {
        this.store.updateAttempt(
          runtime.attemptId,
          { status: 'interrupted', stopReason: 'User cancellation.' },
          true
        )
        await this.finishRuntime(job.id)
      }
    }
    void this.processQueue()
  }

  private cancelPendingSchedules(jobId: string): void {
    for (const schedule of this.store
      .listPendingSchedules()
      .filter((entry) => entry.jobId === jobId)) {
      this.store.resolveSchedule(schedule.id, 'cancelled')
    }
    this.scheduler.changed()
  }

  private async handleStartFailure(
    jobId: string,
    attemptId: string,
    error: unknown
  ): Promise<void> {
    const appError =
      error instanceof AppError ? error : new AppError('PROVIDER_UNAVAILABLE', String(error))
    this.store.updateAttempt(
      attemptId,
      {
        status: 'failed',
        stopReason: appError.code === 'PROVIDER_BUSY' ? PROVIDER_BUSY_STOP_REASON : appError.message
      },
      true
    )
    const current = this.store.getJob(jobId)
    if (current.state === 'STARTING') {
      if (appError.code === 'PROVIDER_BUSY') {
        this.cancelPendingSchedules(jobId)
        this.emit(
          this.store.appendEvent(jobId, attemptId, 'provider.busy', 'warning', appError.message, {
            code: 'PROVIDER_BUSY'
          })
        )
        this.notify('Conversation needs review', appError.message)
      }
      this.transition(
        jobId,
        ['AUTHENTICATION_REQUIRED', 'PROVIDER_BUSY'].includes(appError.code)
          ? 'NEEDS_REVIEW'
          : 'FAILED',
        appError.message,
        attemptId
      )
    }
    await this.finishRuntime(jobId)
    await this.settleFailedDelegatedChild(jobId, appError.message)
  }

  private async finishRuntime(jobId: string): Promise<void> {
    const runtime = this.runtimes.get(jobId)
    if (!runtime) return
    this.runtimes.delete(jobId)
    this.conversations.interrupt(jobId)
    runtime.unsubscribe()
    await runtime.provider.disconnect()
    await this.syncInhibitor()
  }

  private transition(
    jobId: string,
    state: JobState,
    reason: string,
    attemptId: string | null = null,
    nextActionAt: string | null = null
  ): Job {
    try {
      const job = this.store.transitionJob(jobId, state, reason, { attemptId, nextActionAt })
      const event = this.store.listEvents(jobId, 1)[0] ?? null
      this.emit(event)
      void this.logger.write({
        level: state === 'FAILED' || state === 'VERIFICATION_FAILED' ? 'error' : 'info',
        subsystem: 'orchestration',
        jobId,
        message: reason,
        metadata: { state }
      })
      void this.syncInhibitor()
      return job
    } catch (error) {
      if (error instanceof AppError && error.code === 'INVALID_TRANSITION') {
        const event = this.store.appendEvent(
          jobId,
          attemptId,
          'job.transition_rejected',
          'error',
          error.message,
          {
            requestedState: state
          }
        )
        this.emit(event)
      }
      throw error
    }
  }

  private async syncInhibitor(): Promise<void> {
    const shouldInhibit = this.store
      .listJobs()
      .some((job) => isProtectedState(job.state) && job.powerPolicy.preventSleepWhileActive)
    if (shouldInhibit && !this.inhibitorHandle) {
      this.inhibitorHandle = await this.power.inhibitSleep(
        'Codex Orchestrator has protected work in progress.'
      )
    } else if (!shouldInhibit && this.inhibitorHandle) {
      await this.power.releaseInhibitor(this.inhibitorHandle)
      this.inhibitorHandle = null
    }
  }

  private async validateProjectPath(inputPath: string): Promise<string> {
    const normalized = resolve(inputPath)
    if (!isAbsolute(normalized)) throw new AppError('VALIDATION', 'Project path must be absolute.')
    let info
    try {
      info = await stat(normalized)
    } catch {
      throw new AppError('VALIDATION', 'Project path does not exist.')
    }
    if (!info.isDirectory()) throw new AppError('VALIDATION', 'Project path must be a directory.')
    return realpath(normalized)
  }

  private async recordUnexpected(jobId: string, error: unknown): Promise<void> {
    const message = error instanceof Error ? error.message : String(error)
    const event = this.store.appendEvent(jobId, null, 'orchestrator.error', 'error', message)
    this.emit(event)
    await this.logger.write({
      level: 'error',
      subsystem: 'orchestration',
      jobId,
      message
    })
  }

  private emit(event: JobEvent | null): void {
    for (const listener of this.listeners) listener(event)
  }
}
