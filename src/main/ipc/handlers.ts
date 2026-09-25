import { writeFile } from 'node:fs/promises'
import { basename } from 'node:path'
import { app, dialog, ipcMain, shell, type IpcMainInvokeEvent } from 'electron'
import type { Orchestrator } from '@main/application/orchestrator'
import { isTrustedRendererUrl } from '@main/security/trusted-renderer'
import { AppError } from '@shared/errors'
import { IPC_CHANNELS } from '@shared/contracts/ipc'
import {
  approvalResponseSchema,
  codexThreadIdSchema,
  continueCodexThreadSchema,
  createJobSchema,
  createProjectSchema,
  idSchema,
  lifecycleActionSchema,
  openExternalSchema,
  selectDirectorySchema,
  updateSettingsSchema
} from '@shared/schemas/ipc'

const EXTERNAL_HOSTS = new Set([
  'github.com',
  'developers.openai.com',
  'learn.chatgpt.com',
  'openspec.dev',
  'openai.com'
])

function assertTrustedSender(event: IpcMainInvokeEvent): void {
  const url = event.senderFrame?.url ?? event.sender.getURL()
  const developmentUrl = process.env.ELECTRON_RENDERER_URL
  if (!isTrustedRendererUrl(url, developmentUrl)) {
    throw new AppError('VALIDATION', 'IPC request came from an untrusted renderer.')
  }
}

function handle<T extends unknown[], R>(
  channel: string,
  callback: (event: IpcMainInvokeEvent, ...args: T) => Promise<R> | R
): void {
  ipcMain.handle(channel, async (event, ...args: T) => {
    assertTrustedSender(event)
    return callback(event, ...args)
  })
}

export function registerIpcHandlers(orchestrator: Orchestrator): () => void {
  handle(IPC_CHANNELS.snapshot, () => orchestrator.getSnapshot())
  handle(IPC_CHANNELS.projectsList, () => orchestrator.listProjects())
  handle(IPC_CHANNELS.projectsCreate, (_event, input: unknown) => {
    const parsed = createProjectSchema.parse(input)
    return orchestrator.createProject(parsed.name, parsed.path)
  })
  handle(IPC_CHANNELS.projectsRemove, (_event, projectId: unknown) => {
    orchestrator.removeProject(idSchema.parse(projectId))
  })
  handle(IPC_CHANNELS.projectsSelectDirectory, async (_event, input: unknown) => {
    const parsed = selectDirectorySchema.parse(input ?? {})
    const result = await dialog.showOpenDialog({
      title: 'Select a project folder',
      defaultPath: parsed.defaultPath,
      properties: ['openDirectory', 'createDirectory']
    })
    return result.canceled ? null : (result.filePaths[0] ?? null)
  })
  handle(IPC_CHANNELS.jobsList, (_event, includeArchived: unknown) =>
    orchestrator.listJobs(includeArchived === true)
  )
  handle(IPC_CHANNELS.jobsCreate, (_event, input: unknown) =>
    orchestrator.createJob(createJobSchema.parse(input))
  )
  handle(IPC_CHANNELS.jobsDetail, (_event, jobId: unknown) =>
    orchestrator.getJobDetail(idSchema.parse(jobId))
  )
  handle(IPC_CHANNELS.jobsAction, (_event, input: unknown) => {
    const parsed = lifecycleActionSchema.parse(input)
    return orchestrator.jobAction(parsed.jobId, parsed.action)
  })
  handle(IPC_CHANNELS.approvalsRespond, (_event, input: unknown) => {
    const parsed = approvalResponseSchema.parse(input)
    return orchestrator.respondToApproval(parsed.approvalId, parsed.decision, parsed.input)
  })
  handle(IPC_CHANNELS.powerCancel, (_event, scheduleId: unknown) => {
    orchestrator.cancelPowerCountdown(idSchema.parse(scheduleId))
  })
  handle(IPC_CHANNELS.settingsGet, () => orchestrator.getSettings())
  handle(IPC_CHANNELS.settingsUpdate, (_event, input: unknown) =>
    orchestrator.updateSettings(updateSettingsSchema.parse(input))
  )
  handle(IPC_CHANNELS.providerProbe, () => orchestrator.probeProvider())
  handle(IPC_CHANNELS.codexConnection, () => orchestrator.checkCodexConnection())
  handle(IPC_CHANNELS.codexThreads, () => orchestrator.listCodexThreads())
  handle(IPC_CHANNELS.codexThreadRead, (_event, threadId: unknown) =>
    orchestrator.readCodexThread(codexThreadIdSchema.parse(threadId))
  )
  handle(IPC_CHANNELS.codexWorkspace, () => orchestrator.loadCodexWorkspace())
  handle(IPC_CHANNELS.codexThreadContinue, (_event, input: unknown) =>
    orchestrator.continueCodexThread(continueCodexThreadSchema.parse(input))
  )
  handle(IPC_CHANNELS.diagnosticsSnapshot, () => orchestrator.diagnostics(app.getVersion()))
  handle(IPC_CHANNELS.diagnosticsExport, async () => {
    const diagnostics = await orchestrator.diagnostics(app.getVersion())
    const result = await dialog.showSaveDialog({
      title: 'Export redacted diagnostics',
      defaultPath: `codex-orchestrator-diagnostics-${new Date().toISOString().slice(0, 10)}.json`,
      filters: [{ name: 'JSON', extensions: ['json'] }]
    })
    if (result.canceled || !result.filePath) return null
    await writeFile(result.filePath, `${JSON.stringify(diagnostics, null, 2)}\n`, 'utf8')
    return basename(result.filePath)
  })
  handle(IPC_CHANNELS.externalOpen, async (_event, input: unknown) => {
    const { url } = openExternalSchema.parse(input)
    const parsed = new URL(url)
    if (parsed.protocol !== 'https:' || !EXTERNAL_HOSTS.has(parsed.hostname)) {
      throw new AppError('VALIDATION', 'External URL is not on the application allowlist.')
    }
    await shell.openExternal(parsed.toString())
  })

  return () => {
    for (const channel of Object.values(IPC_CHANNELS)) ipcMain.removeHandler(channel)
  }
}
