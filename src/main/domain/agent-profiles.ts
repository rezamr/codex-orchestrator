import type { ReasoningEffort } from '@shared/types/domain'
import type { ControllerDecision } from './delegation-contracts'

export const AGENT_PROFILE_IDS = ['ASTRA_CONTROLLER', 'LUNA_QA', 'LUNA_DEV', 'SOL_DEV'] as const

export type AgentProfileId = (typeof AGENT_PROFILE_IDS)[number]
export type AgentTaskClass = 'controller' | 'runtime_qa' | 'development'
export type TaskComplexity = 'low' | 'medium' | 'high' | 'unknown'
export type ImpactClassification = 'no' | 'yes' | 'unknown'

export interface AgentProfile {
  id: AgentProfileId
  model: string
  effort: ReasoningEffort
  role: string
  taskClass: AgentTaskClass
  sourceWrite: boolean
  mayCertify: boolean
}

export const AGENT_PROFILES: Readonly<Record<AgentProfileId, AgentProfile>> = Object.freeze({
  ASTRA_CONTROLLER: Object.freeze({
    id: 'ASTRA_CONTROLLER',
    model: 'gpt-6-astra',
    effort: 'high',
    role: 'controller',
    taskClass: 'controller',
    sourceWrite: false,
    mayCertify: false
  }),
  LUNA_QA: Object.freeze({
    id: 'LUNA_QA',
    model: 'gpt-5.6-luna',
    effort: 'max',
    role: 'runtime QA',
    taskClass: 'runtime_qa',
    sourceWrite: false,
    mayCertify: true
  }),
  LUNA_DEV: Object.freeze({
    id: 'LUNA_DEV',
    model: 'gpt-5.6-luna',
    effort: 'max',
    role: 'junior developer',
    taskClass: 'development',
    sourceWrite: true,
    mayCertify: false
  }),
  SOL_DEV: Object.freeze({
    id: 'SOL_DEV',
    model: 'gpt-5.6-sol',
    effort: 'high',
    role: 'senior developer',
    taskClass: 'development',
    sourceWrite: true,
    mayCertify: false
  })
})

export interface RoutingPolicyResult {
  requestedProfile: AgentProfileId
  selectedProfile: AgentProfile
  policyMatch: 'accepted' | 'escalated' | 'corrected'
  whySelected: string
  whyNotOtherDeveloper: string
  escalatedTo: AgentProfileId | null
}

export interface RoutingHistory {
  lunaDevelopmentFailed: boolean
}

export function applyRoutingPolicy(
  decision: Extract<ControllerDecision, { action: 'delegate' }>,
  history: RoutingHistory
): RoutingPolicyResult {
  const requested = decision.child.profile
  if (decision.child.taskClass === 'runtime_qa') {
    return {
      requestedProfile: requested,
      selectedProfile: AGENT_PROFILES.LUNA_QA,
      policyMatch: requested === 'LUNA_QA' ? 'accepted' : 'corrected',
      whySelected: 'Runtime QA requires the independent, non-writing LUNA_QA profile.',
      whyNotOtherDeveloper: 'Development profiles may not certify their own source changes.',
      escalatedTo: requested === 'LUNA_QA' ? null : 'LUNA_QA'
    }
  }

  const impacts = Object.values(decision.child.risk)
  const lunaEligible =
    decision.child.complexity === 'low' &&
    decision.child.bounded &&
    decision.child.rootCauseProven &&
    decision.child.expectedFiles <= 3 &&
    !decision.child.multiModule &&
    impacts.every((impact) => impact === 'no') &&
    !history.lunaDevelopmentFailed

  if (requested === 'LUNA_DEV' && lunaEligible) {
    return {
      requestedProfile: requested,
      selectedProfile: AGENT_PROFILES.LUNA_DEV,
      policyMatch: 'accepted',
      whySelected:
        'The change is bounded, proven, low-complexity, low-risk, and affects at most three files.',
      whyNotOtherDeveloper: 'SOL_DEV is unnecessary for a policy-compliant low-risk change.',
      escalatedTo: null
    }
  }

  const reasons: string[] = []
  if (history.lunaDevelopmentFailed) reasons.push('a prior LUNA_DEV attempt failed')
  if (decision.child.complexity !== 'low')
    reasons.push(`complexity is ${decision.child.complexity}`)
  if (!decision.child.bounded) reasons.push('scope is not bounded')
  if (!decision.child.rootCauseProven) reasons.push('root cause is not proven')
  if (decision.child.expectedFiles > 3) reasons.push('more than three files are expected')
  if (decision.child.multiModule) reasons.push('multiple modules are affected')
  const sensitive = Object.entries(decision.child.risk)
    .filter(([, value]) => value !== 'no')
    .map(([name, value]) => `${name}=${value}`)
  if (sensitive.length) reasons.push(`sensitive impact is not disproven (${sensitive.join(', ')})`)
  if (requested === 'LUNA_QA')
    reasons.push('a QA profile cannot perform source-writing development')

  return {
    requestedProfile: requested,
    selectedProfile: AGENT_PROFILES.SOL_DEV,
    policyMatch: requested === 'SOL_DEV' ? 'accepted' : 'escalated',
    whySelected: reasons.length
      ? `SOL_DEV is required because ${reasons.join('; ')}.`
      : 'SOL_DEV was explicitly selected for development work.',
    whyNotOtherDeveloper:
      'LUNA_DEV is allowed only when every low-risk routing condition is proven.',
    escalatedTo: requested === 'SOL_DEV' ? null : 'SOL_DEV'
  }
}
