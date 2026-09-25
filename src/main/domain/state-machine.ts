import { AppError } from '@shared/errors'
import type { JobState } from '@shared/types/domain'

const transitions: Readonly<Record<JobState, ReadonlySet<JobState>>> = {
  DRAFT: new Set(['QUEUED', 'CANCELLED']),
  QUEUED: new Set(['STARTING', 'PAUSED', 'CANCELLED']),
  STARTING: new Set([
    'RUNNING',
    'WAITING_FOR_APPROVAL',
    'WAITING_FOR_INPUT',
    'WAITING_FOR_LIMIT',
    'WAITING_FOR_RETRY',
    'FAILED',
    'NEEDS_REVIEW',
    'CANCELLED'
  ]),
  RUNNING: new Set([
    'WAITING_FOR_APPROVAL',
    'WAITING_FOR_INPUT',
    'WAITING_FOR_LIMIT',
    'WAITING_FOR_RETRY',
    'PAUSED',
    'VERIFYING',
    'FAILED',
    'NEEDS_REVIEW',
    'CANCELLED'
  ]),
  WAITING_FOR_APPROVAL: new Set(['RUNNING', 'PAUSED', 'FAILED', 'NEEDS_REVIEW', 'CANCELLED']),
  WAITING_FOR_INPUT: new Set(['RUNNING', 'PAUSED', 'FAILED', 'NEEDS_REVIEW', 'CANCELLED']),
  WAITING_FOR_LIMIT: new Set(['STARTING', 'PAUSED', 'NEEDS_REVIEW', 'FAILED', 'CANCELLED']),
  WAITING_FOR_RETRY: new Set(['STARTING', 'PAUSED', 'NEEDS_REVIEW', 'FAILED', 'CANCELLED']),
  PAUSED: new Set(['QUEUED', 'STARTING', 'CANCELLED']),
  VERIFYING: new Set(['COMPLETED', 'VERIFICATION_FAILED', 'NEEDS_REVIEW', 'FAILED', 'CANCELLED']),
  COMPLETED: new Set(),
  VERIFICATION_FAILED: new Set(['VERIFYING', 'QUEUED', 'STARTING', 'NEEDS_REVIEW', 'CANCELLED']),
  NEEDS_REVIEW: new Set(['QUEUED', 'STARTING', 'VERIFYING', 'FAILED', 'CANCELLED']),
  FAILED: new Set(['QUEUED', 'STARTING', 'CANCELLED']),
  CANCELLED: new Set()
}

export function canTransition(from: JobState, to: JobState): boolean {
  return from === to || transitions[from].has(to)
}

export function assertTransition(from: JobState, to: JobState): void {
  if (!canTransition(from, to)) {
    throw new AppError('INVALID_TRANSITION', `Job cannot transition from ${from} to ${to}`, {
      from,
      to
    })
  }
}

export function isActiveState(state: JobState): boolean {
  return ['STARTING', 'RUNNING', 'VERIFYING'].includes(state)
}

export function isProtectedState(state: JobState): boolean {
  return ['STARTING', 'RUNNING', 'WAITING_FOR_APPROVAL', 'WAITING_FOR_INPUT', 'VERIFYING'].includes(
    state
  )
}

export function isTerminalState(state: JobState): boolean {
  return ['COMPLETED', 'FAILED', 'CANCELLED'].includes(state)
}

export function resumableState(state: JobState): boolean {
  return [
    'PAUSED',
    'WAITING_FOR_LIMIT',
    'WAITING_FOR_RETRY',
    'NEEDS_REVIEW',
    'FAILED',
    'VERIFICATION_FAILED'
  ].includes(state)
}

export const legalTransitions = transitions
