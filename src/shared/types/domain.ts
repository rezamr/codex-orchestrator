export const JOB_STATES = [
  'DRAFT',
  'QUEUED',
  'STARTING',
  'RUNNING',
  'WAITING_FOR_APPROVAL',
  'WAITING_FOR_INPUT',
  'WAITING_FOR_CHILD',
  'WAITING_FOR_LIMIT',
  'WAITING_FOR_RETRY',
  'PAUSED',
  'VERIFYING',
  'COMPLETED',
  'VERIFICATION_FAILED',
  'NEEDS_REVIEW',
  'FAILED',
  'CANCELLED'
] as const

export type JobState = (typeof JOB_STATES)[number]
export type JobKind = 'standard' | 'controller' | 'delegated-child'
export type ReasoningEffort = 'low' | 'medium' | 'high' | 'xhigh' | 'max' | 'ultra'
export type PowerAction = 'none' | 'lock' | 'sleep' | 'hibernate' | 'shutdown' | 'restart'
export type ProviderMode = 'codex' | 'fake'
export type ApprovalDecision = 'accept' | 'acceptForSession' | 'decline' | 'cancel'
export type VerificationKind = 'test' | 'typecheck' | 'lint' | 'build' | 'custom' | 'git-status'

export interface Project {
  id: string
  name: string
  path: string
  exists: boolean
  createdAt: string
  updatedAt: string
}

export interface VerificationCheckConfig {
  id: string
  kind: VerificationKind
  label: string
  command: string
  args: string[]
  required: boolean
  timeoutMs: number
}

export interface RetryPolicy {
  maxAutomaticAttempts: number
  baseDelaySeconds: number
  maxDelaySeconds: number
}

export interface PowerPolicy {
  action: PowerAction
  countdownSeconds: number
  preventSleepWhileActive: boolean
}

export interface Job {
  id: string
  projectId: string
  projectName?: string
  objective: string
  state: JobState
  provider: ProviderMode
  profile: string
  kind: JobKind
  requestedModel: string | null
  requestedEffort: ReasoningEffort | null
  retryPolicy: RetryPolicy
  verification: VerificationCheckConfig[]
  powerPolicy: PowerPolicy
  automaticAttempts: number
  archived: boolean
  note: string
  createdAt: string
  updatedAt: string
  startedAt: string | null
  completedAt: string | null
  nextActionAt: string | null
  stateReason: string | null
}

export type DelegationStatus =
  | 'child_queued'
  | 'child_running'
  | 'child_completed'
  | 'child_blocked'
  | 'child_failed'
  | 'parent_resuming'
  | 'resumed'
  | 'cancelled'

export interface DelegationResultPacket {
  status: 'completed' | 'blocked' | 'failed'
  summary: string
  evidence: string[]
  nextAction: string | null
}

export interface Delegation {
  id: string
  orchestrationId: string
  parentJobId: string
  parentAttemptId: string
  childJobId: string
  childAttemptId: string | null
  sequence: number
  status: DelegationStatus
  requestedRole: string
  agentProfile: 'LUNA_QA' | 'LUNA_DEV' | 'SOL_DEV'
  taskClass: 'runtime_qa' | 'development'
  complexity: 'low' | 'medium' | 'high' | 'unknown'
  riskFlags: Record<string, 'no' | 'yes' | 'unknown'>
  requestedModel: string
  requestedEffort: ReasoningEffort
  resolvedModel: string | null
  resolvedEffort: ReasoningEffort | null
  decision: Record<string, unknown>
  result: DelegationResultPacket | null
  triggerEvent: string
  triggerAt: string
  dispatchRequestedAt: string
  whySelected: string
  whyNotOtherDeveloper: string
  policyMatch: 'accepted' | 'escalated' | 'corrected'
  waitStrategy: string
  escalatedTo: string | null
  escalationReason: string | null
  sourceWrite: boolean
  parentModelTurnsWhileChildActive: number
  parentProviderStartsWhileChildActive: number
  parentProviderResumesWhileChildActive: number
  parentCommandsWhileChildActive: number
  parentStatusPollsWhileChildActive: number
  unsolicitedChildStatusRequests: number
  passiveWaitDurationMs: number
  controllerTurnCount: number
  childTurnCount: number
  controllerAttemptCount: number
  childAttemptCount: number
  controllerActiveDurationMs: number
  childActiveDurationMs: number
  createdAt: string
  childStartedAt: string | null
  childFinishedAt: string | null
  parentResumedAt: string | null
}

export interface Attempt {
  id: string
  jobId: string
  number: number
  kind: 'start' | 'resume' | 'retry'
  status: 'starting' | 'running' | 'stopped' | 'completed' | 'failed' | 'interrupted'
  providerSessionId: string | null
  providerTurnId: string | null
  startedAt: string
  endedAt: string | null
  stopReason: string | null
}

export interface ProviderSession {
  id: string
  jobId: string
  provider: ProviderMode
  externalId: string
  resumable: boolean
  createdAt: string
  updatedAt: string
}

export interface JobEvent {
  id: string
  jobId: string | null
  attemptId: string | null
  type: string
  level: 'debug' | 'info' | 'warning' | 'error'
  message: string
  metadata: Record<string, unknown>
  createdAt: string
}

export interface Schedule {
  id: string
  jobId: string
  kind: 'retry' | 'resume' | 'power'
  dueAt: string
  status: 'pending' | 'running' | 'completed' | 'cancelled' | 'obsolete' | 'failed'
  source: 'provider-structured' | 'provider-parsed' | 'user' | 'fallback'
  confidence: 'high' | 'medium' | 'low'
  payload: Record<string, unknown>
  createdAt: string
  resolvedAt: string | null
}

export interface Approval {
  id: string
  jobId: string
  attemptId: string | null
  providerRequestId: string
  kind: 'command' | 'file-change' | 'user-input'
  title: string
  detail: string
  status: 'pending' | 'accepted' | 'declined' | 'cancelled'
  createdAt: string
  resolvedAt: string | null
}

export interface VerificationCheckResult {
  id: string
  runId: string
  configId: string
  label: string
  command: string
  startedAt: string
  endedAt: string
  exitCode: number | null
  passed: boolean
  output: string
  error: string | null
}

export interface VerificationRun {
  id: string
  jobId: string
  status: 'running' | 'passed' | 'failed' | 'cancelled'
  startedAt: string
  endedAt: string | null
  checks: VerificationCheckResult[]
}

export interface ProviderStatus {
  mode: ProviderMode
  state: 'disconnected' | 'connecting' | 'available' | 'ready' | 'authentication-required' | 'error'
  executablePath: string | null
  version: string | null
  authenticated: boolean | null
  message: string
  capabilities: string[]
}

export interface CodexRateLimitWindow {
  usedPercent: number | null
  windowDurationMins: number | null
  resetsAt: number | null
}

export interface CodexRateLimitBucket {
  id: string
  name: string | null
  primary: CodexRateLimitWindow | null
  secondary: CodexRateLimitWindow | null
  reachedType: string | null
}

export interface CodexUsageSummary {
  lifetimeTokens: number | null
  peakDailyTokens: number | null
  longestRunningTurnSec: number | null
  currentStreakDays: number | null
  longestStreakDays: number | null
}

export interface CodexDailyUsageBucket {
  startDate: string
  tokens: number
}

export interface CodexAccountSnapshot {
  authMode: 'chatgpt' | 'apiKey' | 'amazonBedrock' | 'none' | 'simulated' | null
  planType: string | null
  rateLimits: CodexRateLimitBucket[] | null
  usage: {
    summary: CodexUsageSummary | null
    dailyBuckets: CodexDailyUsageBucket[] | null
  } | null
  fetchedAt: string
}

export interface CodexConnectionSnapshot {
  provider: ProviderStatus
  account: CodexAccountSnapshot
}

export interface CodexWorkspaceSnapshot extends CodexConnectionSnapshot {
  threads: CodexThreadIndex
}

export interface CodexThreadSummary {
  id: string
  name: string | null
  preview: string | null
  createdAt: number | null
  updatedAt: number | null
  archived: boolean
  pinned: boolean
  sourceKind: string | null
  modelProvider: string | null
  model: string | null
  cwd: string | null
  projectId: string | null
  managedJobId: string | null
  status: string | null
}

export interface CodexThreadIndex {
  threads: CodexThreadSummary[]
  fetchedAt: string
  truncated: boolean
}

export interface CodexThreadItem {
  id: string
  type: string
  label: string
  text: string
}

export interface CodexThreadTurn {
  id: string
  status: string | null
  items: CodexThreadItem[]
}

export interface CodexThreadDetail {
  summary: CodexThreadSummary
  turns: CodexThreadTurn[]
  truncated: boolean
}

export interface AppSettings {
  providerMode: ProviderMode
  maxConcurrentJobs: number
  perProjectExclusive: boolean
  notificationsEnabled: boolean
  preventPowerActions: boolean
  realPowerActionsEnabled: boolean
  eventRetentionDays: number
  logLevel: 'debug' | 'info' | 'warning' | 'error'
}

export interface PowerCountdown {
  scheduleId: string
  jobId: string
  action: PowerAction
  dueAt: string
  cancelled: boolean
}

export interface JobDetail {
  conversation: JobConversation
  job: Job
  project: Project
  attempts: Attempt[]
  sessions: ProviderSession[]
  events: JobEvent[]
  schedules: Schedule[]
  approvals: Approval[]
  verificationRuns: VerificationRun[]
  delegations: Delegation[]
  powerCountdown: PowerCountdown | null
}

export interface ConversationMessage {
  id: string
  turnId: string
  text: string
  status: 'streaming' | 'completed' | 'interrupted'
  truncated: boolean
}

export interface JobConversation {
  messages: ConversationMessage[]
  truncated: boolean
}

export interface DashboardSnapshot {
  jobs: Job[]
  projects: Project[]
  provider: ProviderStatus
  pendingApprovals: Approval[]
  upcomingSchedules: Schedule[]
  activePowerCountdowns: PowerCountdown[]
}

export interface DiagnosticSnapshot {
  generatedAt: string
  appVersion: string
  platform: string
  databaseSchemaVersion: number
  provider: ProviderStatus
  counts: Record<string, number>
  recentEvents: JobEvent[]
}

export interface CreateJobInput {
  projectId: string
  objective: string
  provider: ProviderMode
  profile?: string
  kind?: JobKind
  requestedModel?: string
  requestedEffort?: ReasoningEffort
  retryPolicy: RetryPolicy
  verification: VerificationCheckConfig[]
  powerPolicy: PowerPolicy
  note?: string
  startImmediately: boolean
}

export interface ContinueCodexThreadInput {
  threadId: string
  objective: string
  retryPolicy: RetryPolicy
  verification: VerificationCheckConfig[]
  powerPolicy: PowerPolicy
}

export interface CreateProjectInput {
  name: string
  path: string
}

export interface LimitEvidence {
  retryAt: string | null
  source: 'provider-structured' | 'provider-parsed' | 'unknown'
  confidence: Schedule['confidence']
  redactedEvidence: string
}
