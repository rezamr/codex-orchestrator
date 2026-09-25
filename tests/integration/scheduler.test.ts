import { describe, expect, it } from 'vitest'
import { DurableScheduler, type Clock } from '@main/application/scheduler'
import { OrchestrationStore } from '@main/infrastructure/database/store'

class FakeClock implements Clock {
  private callback: (() => void) | null = null

  constructor(private current: Date) {}

  now(): Date {
    return new Date(this.current)
  }

  setTimeout(callback: () => void): NodeJS.Timeout {
    this.callback = callback
    return 1 as unknown as NodeJS.Timeout
  }

  clearTimeout(): void {
    this.callback = null
  }

  advance(milliseconds: number): void {
    this.current = new Date(this.current.getTime() + milliseconds)
    const callback = this.callback
    this.callback = null
    callback?.()
  }
}

describe('durable scheduler', () => {
  it('derives timers from persisted schedules and executes an overdue item after clock advance', async () => {
    const store = new OrchestrationStore(':memory:')
    const project = store.createProject('Scheduler', process.cwd())
    const job = store.createJob({
      projectId: project.id,
      objective: 'scheduled work',
      provider: 'fake',
      retryPolicy: { maxAutomaticAttempts: 2, baseDelaySeconds: 5, maxDelaySeconds: 10 },
      verification: [],
      powerPolicy: { action: 'none', countdownSeconds: 60, preventSleepWhileActive: true },
      startImmediately: false
    })
    const clock = new FakeClock(new Date('2026-01-01T00:00:00.000Z'))
    const schedule = store.createSchedule(
      job.id,
      'retry',
      '2026-01-01T00:00:10.000Z',
      'fallback',
      'low',
      {}
    )
    const executed: string[] = []
    const scheduler = new DurableScheduler(
      store,
      async (entry) => {
        executed.push(entry.id)
        store.resolveSchedule(entry.id, 'completed')
      },
      clock
    )

    scheduler.start()
    await scheduler.reconcile()
    expect(executed).toEqual([])
    clock.advance(10_000)
    await scheduler.reconcile()
    expect(executed).toEqual([schedule.id])
    await scheduler.stop()
    store.close()
  })
})
