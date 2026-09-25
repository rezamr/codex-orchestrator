import { realpath, stat } from 'node:fs/promises'
import { basename, isAbsolute, resolve } from 'node:path'
import { AppError } from '@shared/errors'
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
  Job,
  JobEvent,
  JobState,
  Project,
  ProviderStatus,
  Schedule
} from '@shared/types/domain'
import { computeRetryAt } from '@main/domain/retry-policy'
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
  private queueChain: Promise<void> = Promise.resolve()
  private inhibitorHandle: string | null = null
  private shuttingDown = false

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
    await this.scheduler.stop()
    for (const [jobId] of this.runtimes) await this.finishRuntime(jobId)
    if (this.inhibitorHandle) await this.power.releaseInhibitor(this.inhibitorHandle)
    this.inhibitorHandle = null
  }

  subscribe(listener: StateListener): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
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
    const job = this.store.createJob(input)
    this.emit(null)
    if (input.startImmediately) void this.processQueue()
    return job
  }

  listJobs(includeArchived = false): Job[] {
    return this.store.listJobs(includeArchived)
  }

  getJobDetail(jobId: string) {
    return this.store.getJobDetail(jobId)
  }

  async jobAction(jobId: string, action: string): Promise<Job> {
    const job = this.store.getJob(jobId)
    switch (action) {
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

  async readCodexThread(threadId: string): Promise<CodexThreadDetail> {
    const settings = this.store.getSettings()
    const provider = this.providerFactory(settings.providerMode, settings)
    try {
      const detail = await provider.readThread(threadId)
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
    for (const job of this.store.listJobs().filter((entry) => entry.state === 'QUEUED')) {
      if (this.store.activeJobCount() >= settings.maxConcurrentJobs) return
      if (settings.perProjectExclusive && this.store.activeJobCount(job.projectId) > 0) continue
      await this.startJob(job.id)
    }
  }

  private async startJob(jobId: string): Promise<void> {
    if (this.runtimes.has(jobId))
      throw new AppError('CONCURRENCY_LIMIT', 'Job already has an active attempt.')
    let job = this.store.getJob(jobId)
    if (
      ![
        'QUEUED',
        'WAITING_FOR_LIMIT',
        'WAITING_FOR_RETRY',
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
    const kind = session ? 'resume' : this.store.getLatestAttempt(jobId) ? 'retry' : 'start'
    const attempt = this.store.createAttempt(jobId, kind)
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
            continuation: attempt.number === 1 ? job.objective : CONTINUATION_PROMPT,
            cwd: project.path,
            profile: job.profile,
            sessionId: session.externalId
          })
        : await provider.start({
            objective: job.objective,
            cwd: project.path,
            profile: job.profile
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
      await this.syncInhibitor()
    } catch (error) {
      await this.handleStartFailure(jobId, attempt.id, error)
    }
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
        break
      case 'provider.disconnected':
        await this.handleTransientFailure(jobId, attemptId, providerEvent.message)
        break
      case 'turn.completed':
        await this.handleCandidateCompletion(jobId, attemptId, providerEvent.message)
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
        }
        break
    }
    await this.syncInhibitor()
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
    if (job.automaticAttempts >= job.retryPolicy.maxAutomaticAttempts) {
      this.transition(
        jobId,
        'NEEDS_REVIEW',
        'Maximum automatic resume attempts reached.',
        attemptId
      )
      await this.finishRuntime(jobId)
      return
    }
    const dueAt =
      event.evidence.retryAt ??
      computeRetryAt(job.automaticAttempts + 1, job.retryPolicy, new Date()).toISOString()
    this.store.createSchedule(
      jobId,
      'resume',
      dueAt,
      event.evidence.source,
      event.evidence.confidence,
      { evidence: event.evidence.redactedEvidence }
    )
    this.transition(jobId, 'WAITING_FOR_LIMIT', event.evidence.redactedEvidence, attemptId, dueAt)
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
    if (attemptId)
      this.store.updateAttempt(attemptId, { status: 'completed', stopReason: message }, true)
    const job = this.transition(
      jobId,
      'VERIFYING',
      'Provider completed; verification is running.',
      attemptId
    )
    await this.finishRuntime(jobId)
    const project = this.store.getProject(job.projectId)
    const passed = await this.verification.run(jobId, project.path, job.verification)
    if (!passed) {
      this.transition(
        jobId,
        'VERIFICATION_FAILED',
        'One or more required verification checks failed.',
        attemptId
      )
      this.notify('Verification failed', `${project.name}: required checks did not pass.`)
      return
    }
    const completed = this.transition(
      jobId,
      'COMPLETED',
      'Job completed with required verification evidence.',
      attemptId
    )
    this.notify('Job completed', `${project.name}: ${completed.objective.slice(0, 120)}`)
    await this.schedulePowerIfEligible(completed)
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
    if (job.automaticAttempts >= job.retryPolicy.maxAutomaticAttempts) {
      this.store.resolveSchedule(schedule.id, 'failed')
      this.transition(
        job.id,
        'NEEDS_REVIEW',
        'Maximum automatic attempts reached before scheduled continuation.'
      )
      return
    }
    this.store.resolveSchedule(schedule.id, 'completed')
    this.store.incrementAutomaticAttempts(job.id)
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
    this.store.updateAttempt(attemptId, { status: 'failed', stopReason: appError.message }, true)
    const current = this.store.getJob(jobId)
    if (current.state === 'STARTING') {
      this.transition(
        jobId,
        appError.code === 'AUTHENTICATION_REQUIRED' ? 'NEEDS_REVIEW' : 'FAILED',
        appError.message,
        attemptId
      )
    }
    await this.finishRuntime(jobId)
  }

  private async finishRuntime(jobId: string): Promise<void> {
    const runtime = this.runtimes.get(jobId)
    if (!runtime) return
    this.runtimes.delete(jobId)
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
