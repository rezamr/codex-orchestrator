import { join, normalize, sep } from 'node:path'
import { pathToFileURL } from 'node:url'
import {
  app,
  BrowserWindow,
  net,
  Notification,
  powerSaveBlocker,
  protocol,
  session,
  shell
} from 'electron'
import { Orchestrator } from './application/orchestrator'
import { OrchestrationStore } from './infrastructure/database/store'
import { StructuredLogger } from './infrastructure/logging/logger'
import { FakePowerAdapter, NativePowerAdapter } from './infrastructure/platform/power-adapter'
import { registerIpcHandlers } from './ipc/handlers'
import { isTrustedRendererUrl } from './security/trusted-renderer'
import { IPC_CHANNELS } from '../shared/contracts/ipc'

protocol.registerSchemesAsPrivileged([
  {
    scheme: 'app',
    privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: false }
  }
])

let mainWindow: BrowserWindow | null = null
let orchestrator: Orchestrator | null = null
let store: OrchestrationStore | null = null
let disposeIpc: (() => void) | null = null

function isAllowedExternalUrl(url: string): boolean {
  try {
    const parsed = new URL(url)
    return (
      parsed.protocol === 'https:' &&
      [
        'github.com',
        'developers.openai.com',
        'learn.chatgpt.com',
        'openspec.dev',
        'openai.com'
      ].includes(parsed.hostname)
    )
  } catch {
    return false
  }
}

function createWindow(): BrowserWindow {
  const window = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1050,
    minHeight: 680,
    show: false,
    backgroundColor: '#f4f5f7',
    title: 'Codex Orchestrator',
    webPreferences: {
      preload: join(__dirname, '../preload/index.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      allowRunningInsecureContent: false,
      webviewTag: false,
      navigateOnDragDrop: false
    }
  })

  window.webContents.setWindowOpenHandler(({ url }) => {
    if (isAllowedExternalUrl(url)) void shell.openExternal(url)
    return { action: 'deny' }
  })
  window.webContents.on('will-navigate', (event, url) => {
    const developmentUrl = process.env.ELECTRON_RENDERER_URL
    if (isTrustedRendererUrl(url, developmentUrl)) return
    event.preventDefault()
    if (isAllowedExternalUrl(url)) void shell.openExternal(url)
  })
  window.once('ready-to-show', () => window.show())

  if (process.env.ELECTRON_RENDERER_URL) void window.loadURL(process.env.ELECTRON_RENDERER_URL)
  else void window.loadURL('app://-/index.html')
  return window
}

async function setupApplication(): Promise<void> {
  session.defaultSession.setPermissionRequestHandler((_webContents, _permission, callback) =>
    callback(false)
  )
  session.defaultSession.setPermissionCheckHandler(() => false)

  if (!process.env.ELECTRON_RENDERER_URL) {
    const rendererRoot = normalize(join(__dirname, '../renderer'))
    protocol.handle('app', (request) => {
      const requestedPath =
        decodeURIComponent(new URL(request.url).pathname).replace(/^\/+/, '') || 'index.html'
      const resolved = normalize(join(rendererRoot, requestedPath))
      if (resolved !== rendererRoot && !resolved.startsWith(`${rendererRoot}${sep}`)) {
        return new Response('Not found', { status: 404 })
      }
      return net.fetch(pathToFileURL(resolved).toString())
    })
  }

  const dataDirectory = process.env.CODEX_ORCHESTRATOR_DATA_DIR ?? app.getPath('userData')
  store = new OrchestrationStore(join(dataDirectory, 'orchestrator.db'))
  const logger = new StructuredLogger(join(dataDirectory, 'logs', 'application.jsonl'))
  const realPowerRuntime = app.isPackaged
  const power = realPowerRuntime
    ? new NativePowerAdapter(
        process.platform,
        {
          start: () => powerSaveBlocker.start('prevent-app-suspension'),
          stop: (id) => powerSaveBlocker.stop(id)
        },
        true
      )
    : new FakePowerAdapter()
  orchestrator = new Orchestrator(store, power, logger, (title, body) => {
    if (store?.getSettings().notificationsEnabled && Notification.isSupported()) {
      new Notification({ title, body, silent: false }).show()
    }
  })
  disposeIpc = registerIpcHandlers(orchestrator)
  orchestrator.subscribe((event) => mainWindow?.webContents.send(IPC_CHANNELS.stateChanged, event))
  await orchestrator.initialize()
  mainWindow = createWindow()
}

app.whenReady().then(async () => {
  await setupApplication()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) mainWindow = createWindow()
  })
})

app.on('before-quit', (event) => {
  if (!orchestrator) return
  event.preventDefault()
  const current = orchestrator
  orchestrator = null
  void current.shutdown().finally(() => {
    disposeIpc?.()
    store?.close()
    app.exit(0)
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
