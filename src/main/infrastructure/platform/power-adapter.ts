import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { AppError } from '@shared/errors'
import type { PowerAction } from '@shared/types/domain'
import type { PowerCapabilities } from '@main/domain/power-policy'

const execFileAsync = promisify(execFile)

export interface PowerResult {
  action: PowerAction
  simulated: boolean
  message: string
  executedAt: string
}

export interface PowerAdapter {
  capabilities(): Promise<PowerCapabilities>
  inhibitSleep(reason: string): Promise<string>
  releaseInhibitor(handle: string): Promise<void>
  execute(action: PowerAction): Promise<PowerResult>
}

export class FakePowerAdapter implements PowerAdapter {
  readonly actions: PowerResult[] = []
  readonly inhibitors = new Map<string, string>()

  async capabilities(): Promise<PowerCapabilities> {
    return {
      actions: {
        none: true,
        lock: true,
        sleep: true,
        hibernate: true,
        shutdown: true,
        restart: true
      },
      canInhibitSleep: true,
      canScheduleWake: false,
      simulated: true
    }
  }

  async inhibitSleep(reason: string): Promise<string> {
    const handle = `fake-inhibitor-${this.inhibitors.size + 1}`
    this.inhibitors.set(handle, reason)
    return handle
  }

  async releaseInhibitor(handle: string): Promise<void> {
    this.inhibitors.delete(handle)
  }

  async execute(action: PowerAction): Promise<PowerResult> {
    const result = {
      action,
      simulated: true,
      message: `Simulated ${action}; host power state was not changed.`,
      executedAt: new Date().toISOString()
    }
    this.actions.push(result)
    return result
  }
}

export interface SleepBlocker {
  start(): number
  stop(id: number): void
}

export class NativePowerAdapter implements PowerAdapter {
  private readonly inhibitors = new Map<string, number>()

  constructor(
    private readonly platform: NodeJS.Platform,
    private readonly blocker: SleepBlocker,
    private readonly realActionsEnabled: boolean
  ) {}

  async capabilities(): Promise<PowerCapabilities> {
    const windows = this.platform === 'win32'
    return {
      actions: {
        none: true,
        lock: windows,
        sleep: windows,
        hibernate: windows,
        shutdown: windows,
        restart: windows
      },
      canInhibitSleep: true,
      canScheduleWake: false,
      simulated: false
    }
  }

  async inhibitSleep(_reason: string): Promise<string> {
    const handle = `${Date.now()}-${Math.random().toString(16).slice(2)}`
    this.inhibitors.set(handle, this.blocker.start())
    return handle
  }

  async releaseInhibitor(handle: string): Promise<void> {
    const id = this.inhibitors.get(handle)
    if (id !== undefined) this.blocker.stop(id)
    this.inhibitors.delete(handle)
  }

  async execute(action: PowerAction): Promise<PowerResult> {
    if (!this.realActionsEnabled) {
      throw new AppError('POWER_UNSUPPORTED', 'Real power actions are disabled for this runtime.')
    }
    if (action === 'none') {
      return {
        action,
        simulated: false,
        message: 'No power action requested.',
        executedAt: new Date().toISOString()
      }
    }
    const invocation = this.commandFor(action)
    if (!invocation)
      throw new AppError('POWER_UNSUPPORTED', `${action} is unsupported on this platform.`)
    await execFileAsync(invocation.command, invocation.args, {
      windowsHide: true,
      timeout: 15_000
    })
    return {
      action,
      simulated: false,
      message: `${action} was requested from the operating system.`,
      executedAt: new Date().toISOString()
    }
  }

  private commandFor(action: PowerAction): { command: string; args: string[] } | null {
    if (this.platform === 'win32') {
      const commands: Partial<Record<PowerAction, { command: string; args: string[] }>> = {
        lock: { command: 'rundll32.exe', args: ['user32.dll,LockWorkStation'] },
        sleep: {
          command: 'rundll32.exe',
          args: ['powrprof.dll,SetSuspendState', '0,1,0']
        },
        hibernate: { command: 'shutdown.exe', args: ['/h'] },
        shutdown: { command: 'shutdown.exe', args: ['/s', '/t', '0'] },
        restart: { command: 'shutdown.exe', args: ['/r', '/t', '0'] }
      }
      return commands[action] ?? null
    }
    return null
  }
}
