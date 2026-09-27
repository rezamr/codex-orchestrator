import { z } from 'zod'
import { redactString } from '@main/infrastructure/logging/redaction'
import type { DelegationResultPacket, ReasoningEffort } from '@shared/types/domain'

export const MAX_DELEGATIONS_PER_PARENT = 20
export const MAX_ROUTING_TEXT = 16_000
export const MAX_RESULT_EVIDENCE = 8

const effortValues = ['low', 'medium', 'high', 'xhigh', 'max', 'ultra'] as const
const agentProfileValues = ['LUNA_QA', 'LUNA_DEV', 'SOL_DEV'] as const
const taskClassValues = ['runtime_qa', 'development'] as const
const complexityValues = ['low', 'medium', 'high', 'unknown'] as const
const impactValues = ['no', 'yes', 'unknown'] as const

const riskSchema = z
  .object({
    authentication: z.enum(impactValues),
    workspaceScope: z.enum(impactValues),
    query: z.enum(impactValues),
    security: z.enum(impactValues),
    database: z.enum(impactValues),
    deployment: z.enum(impactValues),
    architecture: z.enum(impactValues)
  })
  .strict()

const childRouteSchema = z
  .object({
    profile: z.enum(agentProfileValues),
    taskClass: z.enum(taskClassValues),
    complexity: z.enum(complexityValues),
    bounded: z.boolean(),
    rootCauseProven: z.boolean(),
    expectedFiles: z.number().int().min(0).max(10_000),
    multiModule: z.boolean(),
    risk: riskSchema,
    instruction: z.string().trim().min(1).max(MAX_ROUTING_TEXT)
  })
  .strict()

export const controllerDecisionSchema = z.discriminatedUnion('action', [
  z
    .object({
      action: z.literal('delegate'),
      summary: z.string().trim().min(1).max(4_000),
      child: childRouteSchema
    })
    .strict(),
  z
    .object({
      action: z.literal('complete'),
      summary: z.string().trim().min(1).max(4_000)
    })
    .strict(),
  z
    .object({
      action: z.literal('blocked'),
      summary: z.string().trim().min(1).max(4_000)
    })
    .strict()
])

export type ControllerDecision = z.infer<typeof controllerDecisionSchema>

export const delegatedChildResultSchema = z
  .object({
    status: z.enum(['completed', 'blocked']),
    summary: z.string().trim().min(1).max(4_000),
    evidence: z.array(z.string().trim().min(1).max(2_000)).max(MAX_RESULT_EVIDENCE),
    nextAction: z.string().trim().min(1).max(2_000).nullable()
  })
  .strict()

export const controllerDecisionOutputSchema: Record<string, unknown> = {
  $id: 'codex-orchestrator-controller-decision-v1',
  description:
    'One controller action. Delegate exactly one child, declare verified-ready completion, or report a genuine blocker.',
  anyOf: [
    {
      type: 'object',
      additionalProperties: false,
      required: ['action', 'summary', 'child'],
      properties: {
        action: {
          const: 'delegate',
          description: 'Dispatch one child and end this controller turn.'
        },
        summary: { type: 'string', description: 'Short reason for this routing decision.' },
        child: {
          type: 'object',
          additionalProperties: false,
          required: [
            'profile',
            'taskClass',
            'complexity',
            'bounded',
            'rootCauseProven',
            'expectedFiles',
            'multiModule',
            'risk',
            'instruction'
          ],
          properties: {
            profile: { type: 'string', enum: agentProfileValues },
            taskClass: { type: 'string', enum: taskClassValues },
            complexity: { type: 'string', enum: complexityValues },
            bounded: { type: 'boolean' },
            rootCauseProven: { type: 'boolean' },
            expectedFiles: { type: 'integer', minimum: 0 },
            multiModule: { type: 'boolean' },
            risk: {
              type: 'object',
              additionalProperties: false,
              required: [
                'authentication',
                'workspaceScope',
                'query',
                'security',
                'database',
                'deployment',
                'architecture'
              ],
              properties: Object.fromEntries(
                [
                  'authentication',
                  'workspaceScope',
                  'query',
                  'security',
                  'database',
                  'deployment',
                  'architecture'
                ].map((name) => [name, { type: 'string', enum: impactValues }])
              )
            },
            instruction: { type: 'string', description: 'Self-contained bounded child objective.' }
          }
        }
      }
    },
    ...(['complete', 'blocked'] as const).map((action) => ({
      type: 'object',
      additionalProperties: false,
      required: ['action', 'summary'],
      properties: { action: { const: action }, summary: { type: 'string' } }
    }))
  ]
}

export const delegatedChildOutputSchema: Record<string, unknown> = {
  $id: 'codex-orchestrator-child-result-v1',
  type: 'object',
  additionalProperties: false,
  required: ['status', 'summary', 'evidence', 'nextAction'],
  properties: {
    status: { type: 'string', enum: ['completed', 'blocked'] },
    summary: { type: 'string' },
    evidence: { type: 'array', maxItems: MAX_RESULT_EVIDENCE, items: { type: 'string' } },
    nextAction: { type: ['string', 'null'] }
  }
}

export function parseControllerDecision(text: string): ControllerDecision {
  return controllerDecisionSchema.parse(JSON.parse(text))
}

export function parseDelegatedChildResult(text: string): DelegationResultPacket {
  const parsed = delegatedChildResultSchema.parse(JSON.parse(text))
  return boundResultPacket(parsed)
}

export function failedResultPacket(
  summary: string,
  nextAction: string | null = null
): DelegationResultPacket {
  return boundResultPacket({ status: 'failed', summary, evidence: [], nextAction })
}

export function boundResultPacket(packet: DelegationResultPacket): DelegationResultPacket {
  return {
    status: packet.status,
    summary: redactString(packet.summary).slice(0, 4_000),
    evidence: packet.evidence
      .slice(0, MAX_RESULT_EVIDENCE)
      .map((entry) => redactString(entry).slice(0, 2_000)),
    nextAction: packet.nextAction ? redactString(packet.nextAction).slice(0, 2_000) : null
  }
}

export function parentResultPrompt(packet: DelegationResultPacket): string {
  const json = JSON.stringify(boundResultPacket(packet))
  return `A delegated child reached a terminal state. Use this bounded result packet to choose exactly one next routing action. Do not poll or ask the child for status.\n\nCHILD_RESULT=${json}`
}

export function controllerRoutingPrompt(objective: string): string {
  return `Act only as the orchestration controller for the objective below. Return exactly one structured routing decision matching the supplied output schema. Dispatch at most one child in this turn. Classify task class, complexity, boundedness, root-cause certainty, expected file count, module breadth, and every risk flag. Request LUNA_DEV only when every low-risk fact is proven; the application owns the final route. Do not poll a child, ask for status, or keep working after a delegate decision; the external orchestrator will end this turn and resume you only after a terminal child event. Choose complete only when the objective is ready for configured verification, and blocked only for a genuine operator decision.\n\nOBJECTIVE:\n${objective}`
}

export function isReasoningEffort(value: string): value is ReasoningEffort {
  return effortValues.includes(value as ReasoningEffort)
}
