import type { AppSettings, Job, PowerAction } from '@shared/types/domain'

export interface PowerCapabilities {
  actions: Record<PowerAction, boolean>
  canInhibitSleep: boolean
  canScheduleWake: boolean
  simulated: boolean
}

export interface PowerEligibilityContext {
  job: Job
  requiredVerificationPassed: boolean
  hasPendingApprovalOrInput: boolean
  protectedSiblingCount: number
  settings: AppSettings
  capabilities: PowerCapabilities
}

export interface PowerEligibility {
  eligible: boolean
  reasons: string[]
}

export function evaluatePowerEligibility(context: PowerEligibilityContext): PowerEligibility {
  const reasons: string[] = []
  const action = context.job.powerPolicy.action

  if (action === 'none') reasons.push('No power action is configured.')
  if (context.job.state !== 'COMPLETED') reasons.push('The job is not successfully completed.')
  if (!context.requiredVerificationPassed) reasons.push('Required verification has not passed.')
  if (context.hasPendingApprovalOrInput) reasons.push('Human approval or input is still pending.')
  if (context.protectedSiblingCount > 0) reasons.push('Another protected job is active.')
  if (context.settings.preventPowerActions)
    reasons.push('The global prevent-power override is active.')
  if (!context.capabilities.simulated && !context.settings.realPowerActionsEnabled) {
    reasons.push('Real power actions are not enabled in Settings.')
  }
  if (!context.capabilities.actions[action])
    reasons.push(`${action} is unsupported on this platform.`)

  return { eligible: reasons.length === 0, reasons }
}
