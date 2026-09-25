import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import type {
  AppSettings,
  ApprovalDecision,
  CodexConnectionSnapshot,
  CodexThreadDetail,
  CodexThreadIndex,
  ContinueCodexThreadInput,
  CreateJobInput,
  DashboardSnapshot,
  DiagnosticSnapshot,
  Job,
  JobDetail,
  Project,
  ProviderStatus
} from '@shared/types/domain'

export const useOrchestratorStore = defineStore('orchestrator', () => {
  const snapshot = ref<DashboardSnapshot | null>(null)
  const selectedJob = ref<JobDetail | null>(null)
  const settings = ref<AppSettings | null>(null)
  const codexConnection = ref<CodexConnectionSnapshot | null>(null)
  const codexThreads = ref<CodexThreadIndex | null>(null)
  const selectedCodexThread = ref<CodexThreadDetail | null>(null)
  const diagnostics = ref<DiagnosticSnapshot | null>(null)
  const loading = ref(false)
  const error = ref<string | null>(null)
  const notice = ref<string | null>(null)
  const codexLoading = ref(false)
  const codexError = ref<string | null>(null)

  const jobs = computed(() => snapshot.value?.jobs ?? [])
  const projects = computed(() => snapshot.value?.projects ?? [])
  const provider = computed(() => snapshot.value?.provider ?? null)

  function messageFrom(errorValue: unknown): string {
    if (errorValue instanceof Error)
      return errorValue.message.replace(/^Error invoking remote method '[^']+': /, '')
    return String(errorValue)
  }

  async function run<T>(operation: () => Promise<T>, success?: string): Promise<T | null> {
    loading.value = true
    error.value = null
    try {
      const result = await operation()
      if (success) {
        notice.value = success
        window.setTimeout(() => (notice.value = null), 3_000)
      }
      return result
    } catch (caught) {
      error.value = messageFrom(caught)
      return null
    } finally {
      loading.value = false
    }
  }

  async function refresh(): Promise<void> {
    const result = await run(() => window.orchestrator.getSnapshot())
    if (result)
      snapshot.value =
        codexConnection.value?.provider.mode === result.provider.mode
          ? { ...result, provider: codexConnection.value.provider }
          : result
    if (selectedJob.value) await selectJob(selectedJob.value.job.id)
  }

  async function selectJob(jobId: string): Promise<void> {
    const result = await run(() => window.orchestrator.getJobDetail(jobId))
    if (result) selectedJob.value = result
  }

  async function createProject(name: string, path: string): Promise<Project | null> {
    const result = await run(
      () => window.orchestrator.createProject({ name, path }),
      'Project added.'
    )
    await refresh()
    return result
  }

  async function removeProject(id: string): Promise<void> {
    await run(() => window.orchestrator.removeProject(id), 'Project removed from the app.')
    await refresh()
  }

  async function createJob(input: CreateJobInput): Promise<Job | null> {
    const result = await run(() => window.orchestrator.createJob(input), 'Job created.')
    await refresh()
    if (result) await selectJob(result.id)
    return result
  }

  async function jobAction(jobId: string, action: string): Promise<void> {
    await run(() => window.orchestrator.jobAction(jobId, action), `Job action “${action}” applied.`)
    await refresh()
  }

  async function respondToApproval(
    approvalId: string,
    decision: ApprovalDecision,
    input?: Record<string, string>
  ): Promise<void> {
    await run(
      () => window.orchestrator.respondToApproval(approvalId, decision, input),
      'Response sent to Codex.'
    )
    await refresh()
  }

  async function loadSettings(): Promise<void> {
    const result = await run(() => window.orchestrator.getSettings())
    if (result) settings.value = result
  }

  async function saveSettings(patch: Partial<AppSettings>): Promise<void> {
    const result = await run(() => window.orchestrator.updateSettings(patch), 'Settings saved.')
    if (result) settings.value = result
    await refresh()
    if (result && patch.providerMode) {
      codexConnection.value = null
      codexThreads.value = null
      selectedCodexThread.value = null
      await refreshCodexWorkspace()
    }
  }

  async function probeProvider(): Promise<ProviderStatus | null> {
    return run(() => window.orchestrator.probeProvider(), 'Connection check completed.')
  }

  async function checkCodexConnection(): Promise<void> {
    await refreshCodexWorkspace()
  }

  async function refreshCodexWorkspace(): Promise<void> {
    if (codexLoading.value) return
    codexLoading.value = true
    codexError.value = null
    try {
      const result = await window.orchestrator.loadCodexWorkspace()
      codexConnection.value = { provider: result.provider, account: result.account }
      codexThreads.value = result.threads
      if (snapshot.value) snapshot.value = { ...snapshot.value, provider: result.provider }
    } catch (caught) {
      codexError.value = messageFrom(caught)
    } finally {
      codexLoading.value = false
    }
  }

  async function loadCodexThreads(): Promise<void> {
    await refreshCodexWorkspace()
  }

  async function continueCodexThread(input: ContinueCodexThreadInput): Promise<Job | null> {
    const result = await run(
      () => window.orchestrator.continueCodexThread(input),
      'Codex conversation added as a job.'
    )
    if (result) {
      await refresh()
      await refreshCodexWorkspace()
      await selectJob(result.id)
    }
    return result
  }

  async function selectCodexThread(threadId: string): Promise<void> {
    const result = await run(() => window.orchestrator.readCodexThread(threadId))
    if (result) selectedCodexThread.value = result
  }

  async function loadDiagnostics(): Promise<void> {
    const result = await run(() => window.orchestrator.getDiagnostics())
    if (result) diagnostics.value = result
  }

  function clearSelectedJob(): void {
    selectedJob.value = null
  }

  const unsubscribe = window.orchestrator.onStateChanged(() => void refresh())
  window.addEventListener('beforeunload', unsubscribe, { once: true })

  return {
    snapshot,
    selectedJob,
    settings,
    diagnostics,
    codexConnection,
    codexThreads,
    selectedCodexThread,
    jobs,
    projects,
    provider,
    loading,
    error,
    notice,
    codexLoading,
    codexError,
    refresh,
    selectJob,
    clearSelectedJob,
    createProject,
    removeProject,
    createJob,
    jobAction,
    respondToApproval,
    loadSettings,
    saveSettings,
    probeProvider,
    checkCodexConnection,
    refreshCodexWorkspace,
    continueCodexThread,
    loadCodexThreads,
    selectCodexThread,
    loadDiagnostics
  }
})
