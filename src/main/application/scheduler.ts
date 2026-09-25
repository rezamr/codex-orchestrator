import type { OrchestrationStore } from '@main/infrastructure/database/store'
import type { Schedule } from '@shared/types/domain'

export interface Clock {
  now(): Date
  setTimeout(callback: () => void, delayMs: number): NodeJS.Timeout
  clearTimeout(timer: NodeJS.Timeout): void
}

export const systemClock: Clock = {
  now: () => new Date(),
  setTimeout: (callback, delayMs) => setTimeout(callback, delayMs),
  clearTimeout: (timer) => clearTimeout(timer)
}

export class DurableScheduler {
  private timer: NodeJS.Timeout | null = null
  private running = false
  private current: Promise<void> = Promise.resolve()

  constructor(
    private readonly store: OrchestrationStore,
    private readonly execute: (schedule: Schedule) => Promise<void>,
    private readonly clock: Clock = systemClock
  ) {}

  start(): void {
    this.running = true
    this.changed()
  }

  async stop(): Promise<void> {
    this.running = false
    if (this.timer) this.clock.clearTimeout(this.timer)
    this.timer = null
    await this.current
  }

  async reconcile(): Promise<void> {
    this.current = this.current.then(() => this.reconcileNow())
    await this.current
  }

  private async reconcileNow(): Promise<void> {
    if (!this.running) return
    if (this.timer) this.clock.clearTimeout(this.timer)
    this.timer = null
    const now = this.clock.now()
    const due = this.store.listDueSchedules(now.toISOString())
    for (const schedule of due) await this.execute(schedule)
    this.armNext()
  }

  changed(): void {
    if (this.running) void this.reconcile()
  }

  private armNext(): void {
    const next = this.store.listPendingSchedules()[0]
    if (!next || !this.running) return
    const delay = Math.max(
      0,
      Math.min(2_147_000_000, new Date(next.dueAt).getTime() - this.clock.now().getTime())
    )
    this.timer = this.clock.setTimeout(() => void this.reconcile(), delay)
  }
}
