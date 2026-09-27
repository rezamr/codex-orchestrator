import { contextBridge, ipcRenderer } from 'electron'
import { IPC_CHANNELS, type OrchestratorApi } from '@shared/contracts/ipc'

const api: OrchestratorApi = {
  getSnapshot: () => ipcRenderer.invoke(IPC_CHANNELS.snapshot),
  listProjects: () => ipcRenderer.invoke(IPC_CHANNELS.projectsList),
  createProject: (input) => ipcRenderer.invoke(IPC_CHANNELS.projectsCreate, input),
  removeProject: (projectId) => ipcRenderer.invoke(IPC_CHANNELS.projectsRemove, projectId),
  selectDirectory: (defaultPath) =>
    ipcRenderer.invoke(IPC_CHANNELS.projectsSelectDirectory, { defaultPath }),
  listJobs: (includeArchived) => ipcRenderer.invoke(IPC_CHANNELS.jobsList, includeArchived),
  createJob: (input) => ipcRenderer.invoke(IPC_CHANNELS.jobsCreate, input),
  getJobDetail: (jobId) => ipcRenderer.invoke(IPC_CHANNELS.jobsDetail, jobId),
  readJobConversation: (jobId) => ipcRenderer.invoke(IPC_CHANNELS.jobsConversation, jobId),
  jobAction: (jobId, action) => ipcRenderer.invoke(IPC_CHANNELS.jobsAction, { jobId, action }),
  scheduleJobResume: (jobId, resumeAt) =>
    ipcRenderer.invoke(IPC_CHANNELS.jobsScheduleResume, { jobId, resumeAt }),
  respondToApproval: (approvalId, decision, input) =>
    ipcRenderer.invoke(IPC_CHANNELS.approvalsRespond, { approvalId, decision, input }),
  cancelPowerCountdown: (scheduleId) => ipcRenderer.invoke(IPC_CHANNELS.powerCancel, scheduleId),
  getSettings: () => ipcRenderer.invoke(IPC_CHANNELS.settingsGet),
  updateSettings: (settings) => ipcRenderer.invoke(IPC_CHANNELS.settingsUpdate, settings),
  probeProvider: () => ipcRenderer.invoke(IPC_CHANNELS.providerProbe),
  checkCodexConnection: () => ipcRenderer.invoke(IPC_CHANNELS.codexConnection),
  listCodexThreads: () => ipcRenderer.invoke(IPC_CHANNELS.codexThreads),
  readCodexThread: (threadId) => ipcRenderer.invoke(IPC_CHANNELS.codexThreadRead, threadId),
  loadCodexWorkspace: () => ipcRenderer.invoke(IPC_CHANNELS.codexWorkspace),
  continueCodexThread: (input) => ipcRenderer.invoke(IPC_CHANNELS.codexThreadContinue, input),
  openCodexThread: (threadId) => ipcRenderer.invoke(IPC_CHANNELS.codexThreadOpen, threadId),
  getDiagnostics: () => ipcRenderer.invoke(IPC_CHANNELS.diagnosticsSnapshot),
  exportDiagnostics: () => ipcRenderer.invoke(IPC_CHANNELS.diagnosticsExport),
  openExternal: (url) => ipcRenderer.invoke(IPC_CHANNELS.externalOpen, { url }),
  onConversationChanged: (listener) => {
    const wrapped = (_event: Electron.IpcRendererEvent, jobId: unknown): void => {
      if (typeof jobId === 'string') listener(jobId)
    }
    ipcRenderer.on(IPC_CHANNELS.conversationChanged, wrapped)
    return () => ipcRenderer.removeListener(IPC_CHANNELS.conversationChanged, wrapped)
  },
  onStateChanged: (listener) => {
    const wrapped = (_event: Electron.IpcRendererEvent, value: unknown): void =>
      listener(value as never)
    ipcRenderer.on(IPC_CHANNELS.stateChanged, wrapped)
    return () => ipcRenderer.removeListener(IPC_CHANNELS.stateChanged, wrapped)
  }
}

contextBridge.exposeInMainWorld('orchestrator', api)
