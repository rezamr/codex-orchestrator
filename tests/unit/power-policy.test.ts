import { describe, expect, it } from 'vitest'
import { evaluatePowerEligibility } from '@main/domain/power-policy'
import type { AppSettings, Job } from '@shared/types/domain'

const settings: AppSettings = {
  providerMode: 'fake',
  maxConcurrentJobs: 2,
  perProjectExclusive: true,
  notificationsEnabled: true,
  preventPowerActions: false,
  realPowerActionsEnabled: false,
  eventRetentionDays: 90,
  logLevel: 'info'
}

const job = {
  id: 'job',
  projectId: 'project',
  objective: 'test',
  state: 'COMPLETED',
  provider: 'fake',
  profile: 'default',
  retryPolicy: { maxAutomaticAttempts: 3, baseDelaySeconds: 60, maxDelaySeconds: 3600 },
  verification: [],
  powerPolicy: { action: 'shutdown', countdownSeconds: 60, preventSleepWhileActive: true },
  automaticAttempts: 0,
  archived: false,
  note: '',
  createdAt: '',
  updatedAt: '',
  startedAt: '',
  completedAt: '',
  nextActionAt: null,
  stateReason: null
} satisfies Job

const capabilities = {
  actions: { none: true, lock: true, sleep: true, hibernate: true, shutdown: true, restart: true },
  canInhibitSleep: true,
  canScheduleWake: false,
  simulated: true
}

describe('power eligibility', () => {
  it('allows a simulated action only when all completion guards pass', () => {
    expect(
      evaluatePowerEligibility({
        job,
        requiredVerificationPassed: true,
        hasPendingApprovalOrInput: false,
        protectedSiblingCount: 0,
        settings,
        capabilities
      })
    ).toEqual({ eligible: true, reasons: [] })
  })

  it('blocks actions while another protected job is active', () => {
    const result = evaluatePowerEligibility({
      job,
      requiredVerificationPassed: true,
      hasPendingApprovalOrInput: false,
      protectedSiblingCount: 1,
      settings,
      capabilities
    })
    expect(result.eligible).toBe(false)
    expect(result.reasons).toContain('Another protected job is active.')
  })

  it('requires explicit runtime settings for a real adapter', () => {
    const result = evaluatePowerEligibility({
      job,
      requiredVerificationPassed: true,
      hasPendingApprovalOrInput: false,
      protectedSiblingCount: 0,
      settings,
      capabilities: { ...capabilities, simulated: false }
    })
    expect(result.eligible).toBe(false)
    expect(result.reasons).toContain('Real power actions are not enabled in Settings.')
  })
})
