import { describe, expect, it } from 'vitest'
import { AGENT_PROFILES, applyRoutingPolicy } from '@main/domain/agent-profiles'
import type { ControllerDecision } from '@main/domain/delegation-contracts'

const noRisk = {
  authentication: 'no',
  workspaceScope: 'no',
  query: 'no',
  security: 'no',
  database: 'no',
  deployment: 'no',
  architecture: 'no'
} as const

function development(
  overrides: Partial<Extract<ControllerDecision, { action: 'delegate' }>['child']> = {}
): Extract<ControllerDecision, { action: 'delegate' }> {
  return {
    action: 'delegate',
    summary: 'Route development.',
    child: {
      profile: 'LUNA_DEV',
      taskClass: 'development',
      complexity: 'low',
      bounded: true,
      rootCauseProven: true,
      expectedFiles: 2,
      multiModule: false,
      risk: noRisk,
      instruction: 'Apply the bounded fix.',
      ...overrides
    }
  }
}

describe('first-class agent profiles and routing policy', () => {
  it('defines the four immutable profiles with explicit model and effort', () => {
    expect(AGENT_PROFILES).toMatchObject({
      ASTRA_CONTROLLER: { model: 'gpt-6-astra', effort: 'high', sourceWrite: false },
      LUNA_QA: { model: 'gpt-5.6-luna', effort: 'max', sourceWrite: false },
      LUNA_DEV: { model: 'gpt-5.6-luna', effort: 'max', sourceWrite: true },
      SOL_DEV: { model: 'gpt-5.6-sol', effort: 'high', sourceWrite: true }
    })
  })

  it('accepts Luna only for fully proven bounded low-risk development', () => {
    const result = applyRoutingPolicy(development(), { lunaDevelopmentFailed: false })
    expect(result).toMatchObject({ selectedProfile: { id: 'LUNA_DEV' }, policyMatch: 'accepted' })
  })

  it.each([
    ['authentication', { risk: { ...noRisk, authentication: 'yes' as const } }],
    ['unknown query impact', { risk: { ...noRisk, query: 'unknown' as const } }],
    ['high complexity', { complexity: 'high' as const }],
    ['more than three files', { expectedFiles: 4 }],
    ['multiple modules', { multiModule: true }],
    ['unproven cause', { rootCauseProven: false }]
  ])('routes %s development to Sol', (_label, overrides) => {
    const result = applyRoutingPolicy(development(overrides), { lunaDevelopmentFailed: false })
    expect(result).toMatchObject({ selectedProfile: { id: 'SOL_DEV' }, escalatedTo: 'SOL_DEV' })
  })

  it('routes the next development attempt to Sol after Luna failed', () => {
    const result = applyRoutingPolicy(development(), { lunaDevelopmentFailed: true })
    expect(result.selectedProfile.id).toBe('SOL_DEV')
    expect(result.whySelected).toContain('prior LUNA_DEV attempt failed')
  })

  it('rejects developer self-certification by correcting runtime QA to LUNA_QA', () => {
    const decision = development({ profile: 'LUNA_DEV', taskClass: 'runtime_qa' })
    const result = applyRoutingPolicy(decision, { lunaDevelopmentFailed: false })
    expect(result).toMatchObject({
      selectedProfile: { id: 'LUNA_QA', mayCertify: true, sourceWrite: false },
      policyMatch: 'corrected',
      escalatedTo: 'LUNA_QA'
    })
  })
})
