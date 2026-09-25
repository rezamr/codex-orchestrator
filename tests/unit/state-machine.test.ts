import { describe, expect, it } from 'vitest'
import { assertTransition, canTransition, legalTransitions } from '@main/domain/state-machine'
import { JOB_STATES } from '@shared/types/domain'

describe('job state machine', () => {
  it('defines a transition set for every normalized state', () => {
    expect(Object.keys(legalTransitions).sort()).toEqual([...JOB_STATES].sort())
  })

  it('allows the expected durable lifecycle', () => {
    const path = ['DRAFT', 'QUEUED', 'STARTING', 'RUNNING', 'VERIFYING', 'COMPLETED'] as const
    for (let index = 0; index < path.length - 1; index += 1) {
      expect(canTransition(path[index]!, path[index + 1]!)).toBe(true)
    }
  })

  it('rejects an impossible success transition', () => {
    expect(() => assertTransition('DRAFT', 'COMPLETED')).toThrow(/cannot transition/i)
  })

  it('allows waiting work to resume through a new start', () => {
    expect(canTransition('WAITING_FOR_LIMIT', 'STARTING')).toBe(true)
    expect(canTransition('WAITING_FOR_RETRY', 'STARTING')).toBe(true)
  })
})
