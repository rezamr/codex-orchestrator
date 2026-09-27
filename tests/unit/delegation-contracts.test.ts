import { describe, expect, it } from 'vitest'
import {
  boundResultPacket,
  parseControllerDecision,
  parseDelegatedChildResult
} from '@main/domain/delegation-contracts'

describe('delegation contracts', () => {
  it('accepts one typed routing decision and rejects extra fields', () => {
    expect(
      parseControllerDecision(
        JSON.stringify({
          action: 'delegate',
          summary: 'Run QA.',
          child: {
            profile: 'LUNA_QA',
            taskClass: 'runtime_qa',
            complexity: 'low',
            bounded: true,
            rootCauseProven: true,
            expectedFiles: 0,
            multiModule: false,
            risk: {
              authentication: 'no',
              workspaceScope: 'no',
              query: 'no',
              security: 'no',
              database: 'no',
              deployment: 'no',
              architecture: 'no'
            },
            instruction: 'Verify the candidate.'
          }
        })
      )
    ).toMatchObject({ action: 'delegate' })
    expect(() =>
      parseControllerDecision(JSON.stringify({ action: 'complete', summary: 'Done.', poll: true }))
    ).toThrow()
  })

  it('validates and bounds the persisted result packet', () => {
    const parsed = parseDelegatedChildResult(
      JSON.stringify({
        status: 'completed',
        summary: 'QA passed.',
        evidence: ['Tests passed.'],
        nextAction: null
      })
    )
    expect(parsed.status).toBe('completed')
    expect(
      boundResultPacket({
        status: 'failed',
        summary: 'x'.repeat(5_000),
        evidence: Array.from({ length: 20 }, () => 'y'.repeat(3_000)),
        nextAction: null
      })
    ).toMatchObject({ summary: expect.stringMatching(/^x{4000}$/) })
  })
})
