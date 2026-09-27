import { randomUUID } from 'node:crypto'
import { existsSync, mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import Database from 'better-sqlite3'
import { assertTransition } from '@main/domain/state-machine'
import { AppError } from '@shared/errors'
import type {
  AppSettings,
  Approval,
  Attempt,
  CreateJobInput,
  Delegation,
  DelegationResultPacket,
  Job,
  JobDetail,
  JobEvent,
  JobState,
  Project,
  ProviderSession,
  Schedule,
  VerificationCheckResult,
  VerificationRun
} from '@shared/types/domain'
import type { ControllerDecision } from '@main/domain/delegation-contracts'
import type { RoutingPolicyResult } from '@main/domain/agent-profiles'
import { currentSchemaVersion, migrate } from './migrations'

const defaultSettings: AppSettings = {
  providerMode: 'codex',
  maxConcurrentJobs: 2,
  perProjectExclusive: true,
  notificationsEnabled: true,
  preventPowerActions: false,
  realPowerActionsEnabled: false,
  eventRetentionDays: 90,
  logLevel: 'info'
}

function parseJson<T>(value: unknown, fallback: T): T {
  if (typeof value !== 'string') return fallback
  try {
    return JSON.parse(value) as T
  } catch {
    return fallback
  }
}

function bool(value: unknown): boolean {
  return Number(value) === 1
}

function mapProject(row: Record<string, unknown>): Project {
  const path = String(row.path)
  return {
    id: String(row.id),
    name: String(row.name),
    path,
    exists: existsSync(path),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at)
  }
}

function mapJob(row: Record<string, unknown>): Job {
  return {
    id: String(row.id),
    projectId: String(row.project_id),
    projectName: row.project_name ? String(row.project_name) : undefined,
    objective: String(row.objective),
    state: String(row.state) as JobState,
    provider: String(row.provider) as Job['provider'],
    profile: String(row.profile),
    kind: String(row.job_kind ?? 'standard') as Job['kind'],
    requestedModel: row.requested_model ? String(row.requested_model) : null,
    requestedEffort: row.requested_effort
      ? (String(row.requested_effort) as Job['requestedEffort'])
      : null,
    retryPolicy: parseJson(String(row.retry_policy_json), {
      maxAutomaticAttempts: 3,
      baseDelaySeconds: 60,
      maxDelaySeconds: 3_600
    }),
    verification: parseJson(String(row.verification_json), []),
    powerPolicy: parseJson(String(row.power_policy_json), {
      action: 'none',
      countdownSeconds: 60,
      preventSleepWhileActive: true
    }),
    automaticAttempts: Number(row.automatic_attempts),
    archived: bool(row.archived),
    note: String(row.note ?? ''),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
    startedAt: row.started_at ? String(row.started_at) : null,
    completedAt: row.completed_at ? String(row.completed_at) : null,
    nextActionAt: row.next_action_at ? String(row.next_action_at) : null,
    stateReason: row.state_reason ? String(row.state_reason) : null
  }
}

function mapDelegation(row: Record<string, unknown>): Delegation {
  return {
    id: String(row.id),
    orchestrationId: String(row.orchestration_id ?? row.parent_job_id),
    parentJobId: String(row.parent_job_id),
    parentAttemptId: String(row.parent_attempt_id),
    childJobId: String(row.child_job_id),
    childAttemptId: row.child_attempt_id ? String(row.child_attempt_id) : null,
    sequence: Number(row.sequence),
    status: String(row.status) as Delegation['status'],
    requestedRole: String(row.requested_role),
    agentProfile: String(row.agent_profile ?? 'LUNA_QA') as Delegation['agentProfile'],
    taskClass: String(row.task_class ?? 'runtime_qa') as Delegation['taskClass'],
    complexity: String(row.complexity ?? 'unknown') as Delegation['complexity'],
    riskFlags: parseJson(String(row.risk_flags_json ?? '{}'), {}),
    requestedModel: String(row.requested_model),
    requestedEffort: String(row.requested_effort) as Delegation['requestedEffort'],
    resolvedModel: row.resolved_model ? String(row.resolved_model) : null,
    resolvedEffort: row.resolved_effort
      ? (String(row.resolved_effort) as Delegation['resolvedEffort'])
      : null,
    decision: parseJson(String(row.decision_json), {}),
    result: row.result_json
      ? parseJson<DelegationResultPacket | null>(String(row.result_json), null)
      : null,
    triggerEvent: String(row.trigger_event ?? 'controller.turn_completed'),
    triggerAt: String(row.trigger_at ?? row.created_at),
    dispatchRequestedAt: String(row.dispatch_requested_at ?? row.created_at),
    whySelected: String(row.why_selected ?? ''),
    whyNotOtherDeveloper: String(row.why_not_other_developer ?? ''),
    policyMatch: String(row.policy_match ?? 'accepted') as Delegation['policyMatch'],
    waitStrategy: String(row.wait_strategy ?? 'provider-terminal-event'),
    escalatedTo: row.escalated_to ? String(row.escalated_to) : null,
    escalationReason: row.escalation_reason ? String(row.escalation_reason) : null,
    sourceWrite: bool(row.source_write),
    parentModelTurnsWhileChildActive: Number(row.parent_model_turns_while_child_active ?? 0),
    parentProviderStartsWhileChildActive: Number(
      row.parent_provider_starts_while_child_active ?? 0
    ),
    parentProviderResumesWhileChildActive: Number(
      row.parent_provider_resumes_while_child_active ?? 0
    ),
    parentCommandsWhileChildActive: Number(row.parent_commands_while_child_active ?? 0),
    parentStatusPollsWhileChildActive: Number(row.parent_status_polls_while_child_active ?? 0),
    unsolicitedChildStatusRequests: Number(row.unsolicited_child_status_requests ?? 0),
    passiveWaitDurationMs: Number(row.passive_wait_duration_ms ?? 0),
    controllerTurnCount: Number(row.controller_turn_count ?? 1),
    childTurnCount: Number(row.child_turn_count ?? 0),
    controllerAttemptCount: Number(row.controller_attempt_count ?? 1),
    childAttemptCount: Number(row.child_attempt_count ?? 0),
    controllerActiveDurationMs: Number(row.controller_active_duration_ms ?? 0),
    childActiveDurationMs: Number(row.child_active_duration_ms ?? 0),
    createdAt: String(row.created_at),
    childStartedAt: row.child_started_at ? String(row.child_started_at) : null,
    childFinishedAt: row.child_finished_at ? String(row.child_finished_at) : null,
    parentResumedAt: row.parent_resumed_at ? String(row.parent_resumed_at) : null
  }
}

function mapAttempt(row: Record<string, unknown>): Attempt {
  return {
    id: String(row.id),
    jobId: String(row.job_id),
    number: Number(row.attempt_number),
    kind: String(row.kind) as Attempt['kind'],
    status: String(row.status) as Attempt['status'],
    providerSessionId: row.provider_session_id ? String(row.provider_session_id) : null,
    providerTurnId: row.provider_turn_id ? String(row.provider_turn_id) : null,
    startedAt: String(row.started_at),
    endedAt: row.ended_at ? String(row.ended_at) : null,
    stopReason: row.stop_reason ? String(row.stop_reason) : null
  }
}

function mapSession(row: Record<string, unknown>): ProviderSession {
  return {
    id: String(row.id),
    jobId: String(row.job_id),
    provider: String(row.provider) as ProviderSession['provider'],
    externalId: String(row.external_id),
    resumable: bool(row.resumable),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at)
  }
}

function mapEvent(row: Record<string, unknown>): JobEvent {
  return {
    id: String(row.id),
    jobId: row.job_id ? String(row.job_id) : null,
    attemptId: row.attempt_id ? String(row.attempt_id) : null,
    type: String(row.type),
    level: String(row.level) as JobEvent['level'],
    message: String(row.message),
    metadata: parseJson(String(row.metadata_json), {}),
    createdAt: String(row.created_at)
  }
}

function mapSchedule(row: Record<string, unknown>): Schedule {
  return {
    id: String(row.id),
    jobId: String(row.job_id),
    kind: String(row.kind) as Schedule['kind'],
    dueAt: String(row.due_at),
    status: String(row.status) as Schedule['status'],
    source: String(row.source) as Schedule['source'],
    confidence: String(row.confidence) as Schedule['confidence'],
    payload: parseJson(String(row.payload_json), {}),
    createdAt: String(row.created_at),
    resolvedAt: row.resolved_at ? String(row.resolved_at) : null
  }
}

function mapApproval(row: Record<string, unknown>): Approval {
  return {
    id: String(row.id),
    jobId: String(row.job_id),
    attemptId: row.attempt_id ? String(row.attempt_id) : null,
    providerRequestId: String(row.provider_request_id),
    kind: String(row.kind) as Approval['kind'],
    title: String(row.title),
    detail: String(row.detail),
    status: String(row.status) as Approval['status'],
    createdAt: String(row.created_at),
    resolvedAt: row.resolved_at ? String(row.resolved_at) : null
  }
}

export class OrchestrationStore {
  readonly database: Database.Database

  constructor(path: string) {
    if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true })
    this.database = new Database(path)
    this.database.pragma('foreign_keys = ON')
    this.database.pragma('busy_timeout = 5000')
    if (path !== ':memory:') this.database.pragma('journal_mode = WAL')
    migrate(this.database)
  }

  close(): void {
    this.database.close()
  }

  schemaVersion(): number {
    return currentSchemaVersion(this.database)
  }

  createProject(name: string, path: string): Project {
    const now = new Date().toISOString()
    const project = { id: randomUUID(), name, path, createdAt: now, updatedAt: now }
    try {
      this.database
        .prepare(
          'INSERT INTO projects(id, name, path, created_at, updated_at) VALUES (?, ?, ?, ?, ?)'
        )
        .run(project.id, name, path, now, now)
    } catch (error) {
      throw new AppError('PERSISTENCE', 'A project with this path already exists.', undefined, {
        cause: error
      })
    }
    return { ...project, exists: existsSync(path) }
  }

  listProjects(): Project[] {
    return this.database
      .prepare('SELECT * FROM projects WHERE archived = 0 ORDER BY name COLLATE NOCASE')
      .all()
      .map((row) => mapProject(row as Record<string, unknown>))
  }

  getProject(id: string): Project {
    const row = this.database.prepare('SELECT * FROM projects WHERE id = ?').get(id)
    if (!row) throw new AppError('VALIDATION', 'Project was not found.')
    return mapProject(row as Record<string, unknown>)
  }

  removeProject(id: string): void {
    const now = new Date().toISOString()
    const result = this.database
      .prepare('UPDATE projects SET archived = 1, updated_at = ? WHERE id = ?')
      .run(now, id)
    if (!result.changes) throw new AppError('VALIDATION', 'Project was not found.')
  }

  createJob(input: CreateJobInput): Job {
    this.getProject(input.projectId)
    const now = new Date().toISOString()
    const id = randomUUID()
    const initialState: JobState = input.startImmediately ? 'QUEUED' : 'DRAFT'
    const create = this.database.transaction(() => {
      this.database
        .prepare(
          `INSERT INTO jobs(
            id, project_id, objective, state, provider, profile, retry_policy_json,
            verification_json, power_policy_json, note, created_at, updated_at,
            job_kind, requested_model, requested_effort
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .run(
          id,
          input.projectId,
          input.objective,
          initialState,
          input.provider,
          input.profile ?? 'default',
          JSON.stringify(input.retryPolicy),
          JSON.stringify(input.verification),
          JSON.stringify(input.powerPolicy),
          input.note ?? '',
          now,
          now,
          input.kind ?? 'standard',
          input.requestedModel ?? null,
          input.requestedEffort ?? null
        )
      this.insertEvent(id, null, 'job.created', 'info', 'Job created and persisted.', {
        initialState
      })
    })
    create()
    return this.getJob(id)
  }

  getJob(id: string): Job {
    const row = this.database
      .prepare(
        'SELECT jobs.*, projects.name AS project_name FROM jobs JOIN projects ON projects.id = jobs.project_id WHERE jobs.id = ?'
      )
      .get(id)
    if (!row) throw new AppError('VALIDATION', 'Job was not found.')
    return mapJob(row as Record<string, unknown>)
  }

  listJobs(includeArchived = false): Job[] {
    return this.database
      .prepare(
        `SELECT jobs.*, projects.name AS project_name
         FROM jobs JOIN projects ON projects.id = jobs.project_id
         WHERE (? = 1 OR jobs.archived = 0)
         ORDER BY jobs.updated_at DESC`
      )
      .all(includeArchived ? 1 : 0)
      .map((row) => mapJob(row as Record<string, unknown>))
  }

  transitionJob(
    id: string,
    nextState: JobState,
    reason: string,
    options: { attemptId?: string | null; nextActionAt?: string | null } = {}
  ): Job {
    const transition = this.database.transaction(() => {
      const job = this.getJob(id)
      assertTransition(job.state, nextState)
      const now = new Date().toISOString()
      const startedAt = nextState === 'STARTING' && !job.startedAt ? now : job.startedAt
      const completedAt = ['COMPLETED', 'FAILED', 'CANCELLED'].includes(nextState) ? now : null
      this.database
        .prepare(
          `UPDATE jobs SET state = ?, state_reason = ?, updated_at = ?, started_at = ?,
           completed_at = ?, next_action_at = ? WHERE id = ?`
        )
        .run(nextState, reason, now, startedAt, completedAt, options.nextActionAt ?? null, id)
      this.insertEvent(id, options.attemptId ?? null, 'job.state_changed', 'info', reason, {
        from: job.state,
        to: nextState
      })
    })
    transition()
    return this.getJob(id)
  }

  archiveJob(id: string): Job {
    this.database
      .prepare('UPDATE jobs SET archived = 1, updated_at = ? WHERE id = ?')
      .run(new Date().toISOString(), id)
    return this.getJob(id)
  }

  incrementAutomaticAttempts(id: string): number {
    this.database
      .prepare(
        'UPDATE jobs SET automatic_attempts = automatic_attempts + 1, updated_at = ? WHERE id = ?'
      )
      .run(new Date().toISOString(), id)
    return this.getJob(id).automaticAttempts
  }

  createAttempt(jobId: string, kind: Attempt['kind']): Attempt {
    const row = this.database
      .prepare(
        'SELECT COALESCE(MAX(attempt_number), 0) + 1 AS number FROM job_attempts WHERE job_id = ?'
      )
      .get(jobId) as { number: number }
    const attempt: Attempt = {
      id: randomUUID(),
      jobId,
      number: Number(row.number),
      kind,
      status: 'starting',
      providerSessionId: null,
      providerTurnId: null,
      startedAt: new Date().toISOString(),
      endedAt: null,
      stopReason: null
    }
    this.database
      .prepare(
        `INSERT INTO job_attempts(
          id, job_id, attempt_number, kind, status, started_at
        ) VALUES (?, ?, ?, ?, ?, ?)`
      )
      .run(attempt.id, jobId, attempt.number, kind, attempt.status, attempt.startedAt)
    return attempt
  }

  updateAttempt(
    attemptId: string,
    values: Partial<
      Pick<Attempt, 'status' | 'providerSessionId' | 'providerTurnId' | 'stopReason'>
    >,
    end = false
  ): void {
    const current = this.database.prepare('SELECT * FROM job_attempts WHERE id = ?').get(attemptId)
    if (!current) throw new AppError('PERSISTENCE', 'Attempt was not found.')
    const attempt = mapAttempt(current as Record<string, unknown>)
    this.database
      .prepare(
        `UPDATE job_attempts SET status = ?, provider_session_id = ?, provider_turn_id = ?,
         stop_reason = ?, ended_at = ? WHERE id = ?`
      )
      .run(
        values.status ?? attempt.status,
        values.providerSessionId ?? attempt.providerSessionId,
        values.providerTurnId ?? attempt.providerTurnId,
        values.stopReason ?? attempt.stopReason,
        end ? new Date().toISOString() : attempt.endedAt,
        attemptId
      )
  }

  getLatestAttempt(jobId: string): Attempt | null {
    const row = this.database
      .prepare('SELECT * FROM job_attempts WHERE job_id = ? ORDER BY attempt_number DESC LIMIT 1')
      .get(jobId)
    return row ? mapAttempt(row as Record<string, unknown>) : null
  }

  saveSession(jobId: string, provider: Job['provider'], externalId: string): ProviderSession {
    const now = new Date().toISOString()
    const existing = this.database
      .prepare('SELECT * FROM provider_sessions WHERE provider = ? AND external_id = ?')
      .get(provider, externalId)
    if (existing) {
      if (String((existing as Record<string, unknown>).job_id) !== jobId) {
        throw new AppError(
          'CONCURRENCY_LIMIT',
          'This provider session is already managed by another job.'
        )
      }
      this.database
        .prepare(
          'UPDATE provider_sessions SET updated_at = ? WHERE provider = ? AND external_id = ?'
        )
        .run(now, provider, externalId)
      return mapSession({ ...(existing as Record<string, unknown>), updated_at: now })
    }
    const session: ProviderSession = {
      id: randomUUID(),
      jobId,
      provider,
      externalId,
      resumable: true,
      createdAt: now,
      updatedAt: now
    }
    this.database
      .prepare(
        `INSERT INTO provider_sessions(id, job_id, provider, external_id, resumable, created_at, updated_at)
         VALUES (?, ?, ?, ?, 1, ?, ?)`
      )
      .run(session.id, jobId, provider, externalId, now, now)
    return session
  }

  latestSession(jobId: string): ProviderSession | null {
    const row = this.database
      .prepare('SELECT * FROM provider_sessions WHERE job_id = ? ORDER BY updated_at DESC LIMIT 1')
      .get(jobId)
    return row ? mapSession(row as Record<string, unknown>) : null
  }

  jobIdForSession(provider: Job['provider'], externalId: string): string | null {
    const row = this.database
      .prepare('SELECT job_id FROM provider_sessions WHERE provider = ? AND external_id = ?')
      .get(provider, externalId) as { job_id: string } | undefined
    return row?.job_id ?? null
  }

  sessionJobIds(provider: Job['provider']): Map<string, string> {
    const rows = this.database
      .prepare('SELECT external_id, job_id FROM provider_sessions WHERE provider = ?')
      .all(provider) as Array<{ external_id: string; job_id: string }>
    return new Map(rows.map((row) => [row.external_id, row.job_id]))
  }

  createJobForSession(input: CreateJobInput, externalId: string): Job {
    if (this.jobIdForSession(input.provider, externalId)) {
      throw new AppError('CONCURRENCY_LIMIT', 'This provider session is already managed by a job.')
    }
    return this.database.transaction(() => {
      const job = this.createJob(input)
      this.saveSession(job.id, input.provider, externalId)
      this.insertEvent(
        job.id,
        null,
        'session.adopted',
        'info',
        'Existing provider session linked to job.',
        { sessionId: externalId }
      )
      return job
    })()
  }

  createDelegation(
    parentJobId: string,
    parentAttemptId: string,
    decision: Extract<ControllerDecision, { action: 'delegate' }>,
    routing: RoutingPolicyResult
  ): { delegation: Delegation; child: Job } {
    return this.database.transaction(() => {
      const parent = this.getJob(parentJobId)
      if (parent.kind !== 'controller' || parent.state !== 'RUNNING') {
        throw new AppError('INVALID_TRANSITION', 'Only a running controller can dispatch a child.')
      }
      const sequenceRow = this.database
        .prepare(
          'SELECT COALESCE(MAX(sequence), 0) + 1 AS sequence FROM delegations WHERE parent_job_id = ?'
        )
        .get(parentJobId) as { sequence: number }
      const sequence = Number(sequenceRow.sequence)
      const activeWriter = this.database
        .prepare(
          `SELECT d.id FROM delegations d
           JOIN jobs j ON j.id = d.child_job_id
           WHERE j.project_id = ? AND d.source_write = 1
             AND d.status IN ('child_queued', 'child_running')
           LIMIT 1`
        )
        .get(parent.projectId)
      if (activeWriter) {
        if (routing.selectedProfile.sourceWrite) {
          throw new AppError(
            'CONCURRENCY_LIMIT',
            'MAX_CODE_WRITERS=1: this project already has an active source-writing child.'
          )
        }
        throw new AppError(
          'CONCURRENCY_LIMIT',
          'QA cannot start until the active source writer reaches a stable terminal result.'
        )
      }
      const child = this.createJob({
        projectId: parent.projectId,
        objective: decision.child.instruction,
        provider: parent.provider,
        profile: routing.selectedProfile.id,
        kind: 'delegated-child',
        requestedModel: routing.selectedProfile.model,
        requestedEffort: routing.selectedProfile.effort,
        retryPolicy: parent.retryPolicy,
        verification: [],
        powerPolicy: { action: 'none', countdownSeconds: 60, preventSleepWhileActive: true },
        note: `Delegated by controller ${parentJobId}.`,
        startImmediately: true
      })
      const now = new Date().toISOString()
      const id = randomUUID()
      const orchestrationId = parentJobId
      const parentAttempt = this.getLatestAttempt(parentJobId)
      const controllerDuration = parentAttempt
        ? Math.max(0, Date.now() - Date.parse(parentAttempt.startedAt))
        : 0
      this.database
        .prepare(
          `INSERT INTO delegations(
            id, parent_job_id, parent_attempt_id, child_job_id, sequence, status,
            requested_role, requested_model, requested_effort, decision_json, created_at,
            orchestration_id, agent_profile, task_class, complexity, risk_flags_json,
            trigger_at, dispatch_requested_at, why_selected, why_not_other_developer,
            policy_match, escalated_to, escalation_reason, source_write,
            controller_active_duration_ms
          ) VALUES (?, ?, ?, ?, ?, 'child_queued', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .run(
          id,
          parentJobId,
          parentAttemptId,
          child.id,
          sequence,
          routing.selectedProfile.role,
          routing.selectedProfile.model,
          routing.selectedProfile.effort,
          JSON.stringify(decision),
          now,
          orchestrationId,
          routing.selectedProfile.id,
          decision.child.taskClass,
          decision.child.complexity,
          JSON.stringify(decision.child.risk),
          now,
          now,
          routing.whySelected,
          routing.whyNotOtherDeveloper,
          routing.policyMatch,
          routing.escalatedTo,
          routing.escalatedTo ? routing.whySelected : null,
          routing.selectedProfile.sourceWrite ? 1 : 0,
          controllerDuration
        )
      this.transitionJob(
        parentJobId,
        'WAITING_FOR_CHILD',
        `Controller suspended while delegated child ${sequence} runs.`,
        { attemptId: parentAttemptId }
      )
      this.insertEvent(
        parentJobId,
        parentAttemptId,
        'delegation.dispatched',
        'info',
        'Delegated child persisted and queued.',
        {
          delegationId: id,
          childJobId: child.id,
          sequence,
          orchestrationId,
          role: routing.selectedProfile.role,
          profile: routing.selectedProfile.id,
          requestedModel: routing.selectedProfile.model,
          requestedEffort: routing.selectedProfile.effort,
          policyMatch: routing.policyMatch,
          escalatedTo: routing.escalatedTo,
          waitStrategy: 'provider-terminal-event'
        }
      )
      return { delegation: this.getDelegation(id), child }
    })()
  }

  getDelegation(id: string): Delegation {
    const row = this.database.prepare('SELECT * FROM delegations WHERE id = ?').get(id)
    if (!row) throw new AppError('PERSISTENCE', 'Delegation was not found.')
    return mapDelegation(row as Record<string, unknown>)
  }

  getDelegationsForJob(jobId: string): Delegation[] {
    return this.database
      .prepare(
        'SELECT * FROM delegations WHERE parent_job_id = ? OR child_job_id = ? ORDER BY created_at DESC'
      )
      .all(jobId, jobId)
      .map((row) => mapDelegation(row as Record<string, unknown>))
  }

  getDelegationForChild(childJobId: string): Delegation | null {
    const row = this.database
      .prepare('SELECT * FROM delegations WHERE child_job_id = ?')
      .get(childJobId)
    return row ? mapDelegation(row as Record<string, unknown>) : null
  }

  getLatestDelegationForParent(parentJobId: string): Delegation | null {
    const row = this.database
      .prepare('SELECT * FROM delegations WHERE parent_job_id = ? ORDER BY sequence DESC LIMIT 1')
      .get(parentJobId)
    return row ? mapDelegation(row as Record<string, unknown>) : null
  }

  listOpenDelegations(): Delegation[] {
    return this.database
      .prepare(
        "SELECT * FROM delegations WHERE status NOT IN ('resumed', 'cancelled') ORDER BY created_at"
      )
      .all()
      .map((row) => mapDelegation(row as Record<string, unknown>))
  }

  delegationCount(parentJobId: string): number {
    const row = this.database
      .prepare('SELECT COUNT(*) AS count FROM delegations WHERE parent_job_id = ?')
      .get(parentJobId) as { count: number }
    return Number(row.count)
  }

  lunaDevelopmentFailed(parentJobId: string): boolean {
    const row = this.database
      .prepare(
        `SELECT 1 FROM delegations
         WHERE parent_job_id = ? AND agent_profile = 'LUNA_DEV'
           AND json_extract(result_json, '$.status') = 'failed'
         LIMIT 1`
      )
      .get(parentJobId)
    return Boolean(row)
  }

  markDelegatedChildRunning(childJobId: string, childAttemptId: string): void {
    this.database
      .prepare(
        `UPDATE delegations
         SET status = 'child_running', child_started_at = COALESCE(child_started_at, ?),
             child_attempt_id = ?, child_turn_count = child_turn_count + 1,
             child_attempt_count = child_attempt_count + 1
         WHERE child_job_id = ? AND status IN ('child_queued', 'child_running')`
      )
      .run(new Date().toISOString(), childAttemptId, childJobId)
  }

  settleDelegation(
    childJobId: string,
    status: 'child_completed' | 'child_blocked' | 'child_failed',
    result: DelegationResultPacket
  ): Delegation | null {
    const now = new Date().toISOString()
    const current = this.getDelegationForChild(childJobId)
    const waitDuration = current ? Math.max(0, Date.now() - Date.parse(current.createdAt)) : 0
    const childDuration = current?.childStartedAt
      ? Math.max(0, Date.now() - Date.parse(current.childStartedAt))
      : 0
    const updated = this.database
      .prepare(
        `UPDATE delegations SET status = ?, result_json = ?, child_finished_at = ?,
         passive_wait_duration_ms = ?, child_active_duration_ms = ?
         WHERE child_job_id = ? AND status IN ('child_queued', 'child_running')`
      )
      .run(status, JSON.stringify(result), now, waitDuration, childDuration, childJobId)
    if (!updated.changes) return null
    return this.getDelegationForChild(childJobId)
  }

  markParentResuming(parentJobId: string): Delegation | null {
    const latest = this.getLatestDelegationForParent(parentJobId)
    if (
      !latest ||
      !['child_completed', 'child_blocked', 'child_failed', 'parent_resuming'].includes(
        latest.status
      )
    )
      return null
    if (latest.status !== 'parent_resuming') {
      this.database
        .prepare(
          `UPDATE delegations SET status = 'parent_resuming',
           controller_attempt_count = controller_attempt_count + 1
           WHERE id = ?`
        )
        .run(latest.id)
    }
    return this.getDelegation(latest.id)
  }

  markParentResumed(parentJobId: string): void {
    const latest = this.getLatestDelegationForParent(parentJobId)
    if (!latest || latest.status !== 'parent_resuming') return
    this.database
      .prepare(
        "UPDATE delegations SET status = 'resumed', parent_resumed_at = ? WHERE id = ? AND status = 'parent_resuming'"
      )
      .run(new Date().toISOString(), latest.id)
  }

  markParentControllerTurnStarted(parentJobId: string): void {
    const latest = this.getLatestDelegationForParent(parentJobId)
    if (!latest || latest.status !== 'parent_resuming') return
    this.database
      .prepare(
        `UPDATE delegations SET controller_turn_count = controller_turn_count + 1
         WHERE id = ? AND status = 'parent_resuming'`
      )
      .run(latest.id)
  }

  recordControllerTurnFinished(parentJobId: string, attemptId: string): void {
    const delegation = this.getLatestDelegationForParent(parentJobId)
    if (!delegation) return
    const attempt = this.getLatestAttempt(parentJobId)
    if (!attempt || attempt.id !== attemptId) return
    const duration = Math.max(0, Date.now() - Date.parse(attempt.startedAt))
    this.database
      .prepare(
        `UPDATE delegations
         SET controller_active_duration_ms = controller_active_duration_ms + ?
         WHERE id = ?`
      )
      .run(duration, delegation.id)
  }

  cancelDelegation(parentJobId: string): void {
    this.database
      .prepare(
        "UPDATE delegations SET status = 'cancelled' WHERE parent_job_id = ? AND status NOT IN ('resumed', 'cancelled')"
      )
      .run(parentJobId)
  }

  appendEvent(
    jobId: string | null,
    attemptId: string | null,
    type: string,
    level: JobEvent['level'],
    message: string,
    metadata: Record<string, unknown> = {}
  ): JobEvent {
    return this.insertEvent(jobId, attemptId, type, level, message, metadata)
  }

  private insertEvent(
    jobId: string | null,
    attemptId: string | null,
    type: string,
    level: JobEvent['level'],
    message: string,
    metadata: Record<string, unknown>
  ): JobEvent {
    const event: JobEvent = {
      id: randomUUID(),
      jobId,
      attemptId,
      type,
      level,
      message,
      metadata,
      createdAt: new Date().toISOString()
    }
    this.database
      .prepare(
        `INSERT INTO job_events(id, job_id, attempt_id, type, level, message, metadata_json, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        event.id,
        event.jobId,
        event.attemptId,
        event.type,
        event.level,
        event.message,
        JSON.stringify(event.metadata),
        event.createdAt
      )
    return event
  }

  listEvents(jobId?: string, limit = 500): JobEvent[] {
    const rows = jobId
      ? this.database
          .prepare('SELECT * FROM job_events WHERE job_id = ? ORDER BY created_at DESC LIMIT ?')
          .all(jobId, limit)
      : this.database
          .prepare('SELECT * FROM job_events ORDER BY created_at DESC LIMIT ?')
          .all(limit)
    return rows.map((row) => mapEvent(row as Record<string, unknown>))
  }

  createSchedule(
    jobId: string,
    kind: Schedule['kind'],
    dueAt: string,
    source: Schedule['source'],
    confidence: Schedule['confidence'],
    payload: Record<string, unknown> = {}
  ): Schedule {
    const schedule: Schedule = {
      id: randomUUID(),
      jobId,
      kind,
      dueAt,
      status: 'pending',
      source,
      confidence,
      payload,
      createdAt: new Date().toISOString(),
      resolvedAt: null
    }
    const create = this.database.transaction(() => {
      this.database
        .prepare(
          `INSERT INTO schedules(
            id, job_id, kind, due_at, status, source, confidence, payload_json, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .run(
          schedule.id,
          jobId,
          kind,
          dueAt,
          schedule.status,
          source,
          confidence,
          JSON.stringify(payload),
          schedule.createdAt
        )
      this.database
        .prepare('UPDATE jobs SET next_action_at = ?, updated_at = ? WHERE id = ?')
        .run(dueAt, new Date().toISOString(), jobId)
    })
    create()
    return schedule
  }

  listPendingSchedules(): Schedule[] {
    return this.database
      .prepare("SELECT * FROM schedules WHERE status = 'pending' ORDER BY due_at")
      .all()
      .map((row) => mapSchedule(row as Record<string, unknown>))
  }

  listDueSchedules(now: string): Schedule[] {
    return this.database
      .prepare("SELECT * FROM schedules WHERE status = 'pending' AND due_at <= ? ORDER BY due_at")
      .all(now)
      .map((row) => mapSchedule(row as Record<string, unknown>))
  }

  resolveSchedule(id: string, status: Schedule['status']): void {
    const schedule = this.database.prepare('SELECT job_id FROM schedules WHERE id = ?').get(id) as
      { job_id: string } | undefined
    if (!schedule) return
    const resolve = this.database.transaction(() => {
      this.database
        .prepare('UPDATE schedules SET status = ?, resolved_at = ? WHERE id = ?')
        .run(status, new Date().toISOString(), id)
      const next = this.database
        .prepare(
          "SELECT due_at FROM schedules WHERE job_id = ? AND status = 'pending' ORDER BY due_at LIMIT 1"
        )
        .get(schedule.job_id) as { due_at: string } | undefined
      this.database
        .prepare('UPDATE jobs SET next_action_at = ?, updated_at = ? WHERE id = ?')
        .run(next?.due_at ?? null, new Date().toISOString(), schedule.job_id)
    })
    resolve()
  }

  createApproval(
    jobId: string,
    attemptId: string | null,
    providerRequestId: string,
    kind: Approval['kind'],
    title: string,
    detail: string
  ): Approval {
    const approval: Approval = {
      id: randomUUID(),
      jobId,
      attemptId,
      providerRequestId,
      kind,
      title,
      detail,
      status: 'pending',
      createdAt: new Date().toISOString(),
      resolvedAt: null
    }
    this.database
      .prepare(
        `INSERT INTO approvals(
          id, job_id, attempt_id, provider_request_id, kind, title, detail, status, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        approval.id,
        jobId,
        attemptId,
        providerRequestId,
        kind,
        title,
        detail,
        approval.status,
        approval.createdAt
      )
    return approval
  }

  getApproval(id: string): Approval {
    const row = this.database.prepare('SELECT * FROM approvals WHERE id = ?').get(id)
    if (!row) throw new AppError('VALIDATION', 'Approval was not found.')
    return mapApproval(row as Record<string, unknown>)
  }

  resolveApproval(id: string, status: Approval['status']): void {
    this.database
      .prepare('UPDATE approvals SET status = ?, resolved_at = ? WHERE id = ? AND status = ?')
      .run(status, new Date().toISOString(), id, 'pending')
  }

  pendingApprovals(jobId?: string): Approval[] {
    const rows = jobId
      ? this.database
          .prepare(
            "SELECT * FROM approvals WHERE status = 'pending' AND job_id = ? ORDER BY created_at"
          )
          .all(jobId)
      : this.database
          .prepare("SELECT * FROM approvals WHERE status = 'pending' ORDER BY created_at")
          .all()
    return rows.map((row) => mapApproval(row as Record<string, unknown>))
  }

  resolvePendingApprovals(jobId: string, status: Approval['status'] = 'cancelled'): number {
    const result = this.database
      .prepare(
        "UPDATE approvals SET status = ?, resolved_at = ? WHERE job_id = ? AND status = 'pending'"
      )
      .run(status, new Date().toISOString(), jobId)
    return result.changes
  }

  startVerificationRun(jobId: string): VerificationRun {
    const run: VerificationRun = {
      id: randomUUID(),
      jobId,
      status: 'running',
      startedAt: new Date().toISOString(),
      endedAt: null,
      checks: []
    }
    this.database
      .prepare('INSERT INTO verification_runs(id, job_id, status, started_at) VALUES (?, ?, ?, ?)')
      .run(run.id, jobId, run.status, run.startedAt)
    return run
  }

  addVerificationCheck(check: VerificationCheckResult): void {
    this.database
      .prepare(
        `INSERT INTO verification_checks(
          id, run_id, config_id, label, command, started_at, ended_at, exit_code,
          passed, output, error
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        check.id,
        check.runId,
        check.configId,
        check.label,
        check.command,
        check.startedAt,
        check.endedAt,
        check.exitCode,
        check.passed ? 1 : 0,
        check.output,
        check.error
      )
  }

  completeVerificationRun(runId: string, status: VerificationRun['status']): void {
    this.database
      .prepare('UPDATE verification_runs SET status = ?, ended_at = ? WHERE id = ?')
      .run(status, new Date().toISOString(), runId)
  }

  getVerificationRuns(jobId: string): VerificationRun[] {
    const runs = this.database
      .prepare('SELECT * FROM verification_runs WHERE job_id = ? ORDER BY started_at DESC')
      .all(jobId) as Record<string, unknown>[]
    return runs.map((row) => {
      const checks = this.database
        .prepare('SELECT * FROM verification_checks WHERE run_id = ? ORDER BY started_at')
        .all(String(row.id)) as Record<string, unknown>[]
      return {
        id: String(row.id),
        jobId: String(row.job_id),
        status: String(row.status) as VerificationRun['status'],
        startedAt: String(row.started_at),
        endedAt: row.ended_at ? String(row.ended_at) : null,
        checks: checks.map((check) => ({
          id: String(check.id),
          runId: String(check.run_id),
          configId: String(check.config_id),
          label: String(check.label),
          command: String(check.command),
          startedAt: String(check.started_at),
          endedAt: String(check.ended_at),
          exitCode: check.exit_code === null ? null : Number(check.exit_code),
          passed: bool(check.passed),
          output: String(check.output),
          error: check.error ? String(check.error) : null
        }))
      }
    })
  }

  getSettings(): AppSettings {
    const rows = this.database.prepare('SELECT key, value_json FROM settings').all() as Array<{
      key: keyof AppSettings
      value_json: string
    }>
    const settings: AppSettings = { ...defaultSettings }
    for (const row of rows) {
      ;(settings as unknown as Record<string, unknown>)[row.key] = parseJson(row.value_json, null)
    }
    return settings
  }

  updateSettings(patch: Partial<AppSettings>): AppSettings {
    const update = this.database.transaction(() => {
      const statement = this.database.prepare(
        `INSERT INTO settings(key, value_json, updated_at) VALUES (?, ?, ?)
         ON CONFLICT(key) DO UPDATE SET value_json = excluded.value_json, updated_at = excluded.updated_at`
      )
      const now = new Date().toISOString()
      for (const [key, value] of Object.entries(patch))
        statement.run(key, JSON.stringify(value), now)
    })
    update()
    return this.getSettings()
  }

  activeJobCount(projectId?: string): number {
    const states = ['STARTING', 'RUNNING', 'WAITING_FOR_APPROVAL', 'WAITING_FOR_INPUT', 'VERIFYING']
    const placeholders = states.map(() => '?').join(', ')
    const row = projectId
      ? (this.database
          .prepare(
            `SELECT COUNT(*) AS count FROM jobs WHERE project_id = ? AND state IN (${placeholders})`
          )
          .get(projectId, ...states) as { count: number })
      : (this.database
          .prepare(`SELECT COUNT(*) AS count FROM jobs WHERE state IN (${placeholders})`)
          .get(...states) as { count: number })
    return Number(row.count)
  }

  getJobDetail(id: string): Omit<JobDetail, 'conversation'> {
    const job = this.getJob(id)
    const project = this.getProject(job.projectId)
    const attempts = this.database
      .prepare('SELECT * FROM job_attempts WHERE job_id = ? ORDER BY attempt_number DESC')
      .all(id)
      .map((row) => mapAttempt(row as Record<string, unknown>))
    const sessions = this.database
      .prepare('SELECT * FROM provider_sessions WHERE job_id = ? ORDER BY updated_at DESC')
      .all(id)
      .map((row) => mapSession(row as Record<string, unknown>))
    const schedules = this.database
      .prepare('SELECT * FROM schedules WHERE job_id = ? ORDER BY created_at DESC')
      .all(id)
      .map((row) => mapSchedule(row as Record<string, unknown>))
    const approvals = this.database
      .prepare('SELECT * FROM approvals WHERE job_id = ? ORDER BY created_at DESC')
      .all(id)
      .map((row) => mapApproval(row as Record<string, unknown>))
    const power = schedules.find(
      (schedule) => schedule.kind === 'power' && schedule.status === 'pending'
    )
    return {
      job,
      project,
      attempts,
      sessions,
      events: this.listEvents(id),
      schedules,
      approvals,
      verificationRuns: this.getVerificationRuns(id),
      delegations: this.getDelegationsForJob(id),
      powerCountdown: power
        ? {
            scheduleId: power.id,
            jobId: id,
            action: String(power.payload.action) as Job['powerPolicy']['action'],
            dueAt: power.dueAt,
            cancelled: false
          }
        : null
    }
  }

  cleanupEvents(retentionDays: number): number {
    const cutoff = new Date(Date.now() - retentionDays * 86_400_000).toISOString()
    const result = this.database
      .prepare(
        `DELETE FROM job_events
         WHERE created_at < ?
         AND (job_id IS NULL OR job_id IN (
           SELECT id FROM jobs WHERE archived = 1 OR state IN ('COMPLETED', 'FAILED', 'CANCELLED')
         ))`
      )
      .run(cutoff)
    return result.changes
  }

  counts(): Record<string, number> {
    const tables = [
      'projects',
      'jobs',
      'job_attempts',
      'provider_sessions',
      'job_events',
      'schedules',
      'approvals',
      'verification_runs',
      'delegations'
    ]
    return Object.fromEntries(
      tables.map((table) => {
        const row = this.database.prepare(`SELECT COUNT(*) AS count FROM ${table}`).get() as {
          count: number
        }
        return [table, Number(row.count)]
      })
    )
  }
}
