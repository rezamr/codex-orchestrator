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
  jobAction: (jobId, action) => ipcRenderer.invoke(IPC_CHANNELS.jobsAction, { jobId, action }),
  respondToApproval: (approvalId, decision, input) =>
    ipcRenderer.invoke(IPC_CHANNELS.approvalsRespond, { approvalId, decision, input }),
  cancelPowerCountdown: (scheduleId) => ipcRenderer.invoke(IPC_CHANNELS.powerCancel, scheduleId),
  getSettings: () => ipcRenderer.invoke(IPC_CHANNELS.settingsGet),
  updateSettings: (settings) => ipcRenderer.invoke(IPC_CHANNELS.settingsUpdate, settings),
  probeProvider: () => ipcRenderer.invoke(IPC_CHANNELS.providerProbe),
  checkCodexConnection: () => ipcRenderer.invoke(IPC_CHANNELS.codexConnection),
  listCodexThreads: () => ipcRenderer.invoke(IPC_CHANNELS.codexThreads),
  readCodexThread: (threadId) => ipcRenderer.invoke(IPC_CHANNELS.codexThreadRead, threadId),
  getDiagnostics: () => ipcRenderer.invoke(IPC_CHANNELS.diagnosticsSnapshot),
  exportDiagnostics: () => ipcRenderer.invoke(IPC_CHANNELS.diagnosticsExport),
  openExternal: (url) => ipcRenderer.invoke(IPC_CHANNELS.externalOpen, { url }),
  onStateChanged: (listener) => {
    const wrapped = (_event: Electron.IpcRendererEvent, value: unknown): void =>
      listener(value as never)
    ipcRenderer.on(IPC_CHANNELS.stateChanged, wrapped)
    return () => ipcRenderer.removeListener(IPC_CHANNELS.stateChanged, wrapped)
  }
}

contextBridge.exposeInMainWorld('orchestrator', api)
