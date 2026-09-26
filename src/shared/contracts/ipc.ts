import type {
  AppSettings,
  ApprovalDecision,
  CreateJobInput,
  CreateProjectInput,
  DashboardSnapshot,
  DiagnosticSnapshot,
  CodexConnectionSnapshot,
  CodexThreadDetail,
  CodexThreadIndex,
  CodexWorkspaceSnapshot,
  ContinueCodexThreadInput,
  Job,
  JobDetail,
  JobEvent,
  Project,
  ProviderStatus
} from '../types/domain'

export const IPC_CHANNELS = {
  snapshot: 'orchestrator:snapshot',
  projectsList: 'projects:list',
  projectsCreate: 'projects:create',
  projectsRemove: 'projects:remove',
  projectsSelectDirectory: 'projects:select-directory',
  jobsList: 'jobs:list',
  jobsCreate: 'jobs:create',
  jobsDetail: 'jobs:detail',
  jobsAction: 'jobs:action',
  approvalsRespond: 'approvals:respond',
  powerCancel: 'power:cancel',
  settingsGet: 'settings:get',
  settingsUpdate: 'settings:update',
  providerProbe: 'provider:probe',
  codexConnection: 'codex:connection',
  codexThreads: 'codex:threads',
  codexThreadRead: 'codex:thread-read',
  codexWorkspace: 'codex:workspace',
  codexThreadContinue: 'codex:thread-continue',
  codexThreadOpen: 'codex:thread-open',
  diagnosticsSnapshot: 'diagnostics:snapshot',
  diagnosticsExport: 'diagnostics:export',
  externalOpen: 'external:open',
  stateChanged: 'orchestrator:state-changed'
} as const

export interface OrchestratorApi {
  getSnapshot(): Promise<DashboardSnapshot>
  listProjects(): Promise<Project[]>
  createProject(input: CreateProjectInput): Promise<Project>
  removeProject(projectId: string): Promise<void>
  selectDirectory(defaultPath?: string): Promise<string | null>
  listJobs(includeArchived?: boolean): Promise<Job[]>
  createJob(input: CreateJobInput): Promise<Job>
  getJobDetail(jobId: string): Promise<JobDetail>
  jobAction(jobId: string, action: string): Promise<Job>
  respondToApproval(
    approvalId: string,
    decision: ApprovalDecision,
    input?: Record<string, string>
  ): Promise<void>
  cancelPowerCountdown(scheduleId: string): Promise<void>
  getSettings(): Promise<AppSettings>
  updateSettings(settings: Partial<AppSettings>): Promise<AppSettings>
  probeProvider(): Promise<ProviderStatus>
  checkCodexConnection(): Promise<CodexConnectionSnapshot>
  listCodexThreads(): Promise<CodexThreadIndex>
  readCodexThread(threadId: string): Promise<CodexThreadDetail>
  loadCodexWorkspace(): Promise<CodexWorkspaceSnapshot>
  continueCodexThread(input: ContinueCodexThreadInput): Promise<Job>
  openCodexThread(threadId: string): Promise<void>
  getDiagnostics(): Promise<DiagnosticSnapshot>
  exportDiagnostics(): Promise<string | null>
  openExternal(url: string): Promise<void>
  onStateChanged(listener: (event: JobEvent | null) => void): () => void
}
