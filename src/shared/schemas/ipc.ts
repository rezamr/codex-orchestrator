import { z } from 'zod'
import { JOB_STATES } from '../types/domain'

export const idSchema = z.string().uuid()
export const jobStateSchema = z.enum(JOB_STATES)
export const powerActionSchema = z.enum([
  'none',
  'lock',
  'sleep',
  'hibernate',
  'shutdown',
  'restart'
])
export const providerModeSchema = z.enum(['codex', 'fake'])

export const retryPolicySchema = z.object({
  maxAutomaticAttempts: z.number().int().min(0).max(20),
  baseDelaySeconds: z.number().int().min(5).max(86_400),
  maxDelaySeconds: z.number().int().min(5).max(604_800)
})

export const powerPolicySchema = z.object({
  action: powerActionSchema,
  countdownSeconds: z.number().int().min(5).max(3_600),
  preventSleepWhileActive: z.boolean()
})

export const verificationCheckSchema = z.object({
  id: z.string().min(1).max(100),
  kind: z.enum(['test', 'typecheck', 'lint', 'build', 'custom', 'git-status']),
  label: z.string().trim().min(1).max(100),
  command: z.string().trim().min(1).max(1_000),
  args: z.array(z.string().max(1_000)).max(100),
  required: z.boolean(),
  timeoutMs: z.number().int().min(1_000).max(3_600_000)
})

export const createProjectSchema = z.object({
  name: z.string().trim().min(1).max(120),
  path: z.string().trim().min(1).max(4_096)
})

export const createJobSchema = z.object({
  projectId: idSchema,
  objective: z.string().trim().min(1).max(100_000),
  provider: providerModeSchema,
  profile: z.string().trim().min(1).max(100).optional(),
  retryPolicy: retryPolicySchema,
  verification: z.array(verificationCheckSchema).max(20),
  powerPolicy: powerPolicySchema,
  note: z.string().max(10_000).optional(),
  startImmediately: z.boolean()
})

export const approvalResponseSchema = z.object({
  approvalId: idSchema,
  decision: z.enum(['accept', 'acceptForSession', 'decline', 'cancel']),
  input: z.record(z.string(), z.string()).optional()
})

export const updateSettingsSchema = z
  .object({
    providerMode: providerModeSchema.optional(),
    maxConcurrentJobs: z.number().int().min(1).max(16).optional(),
    perProjectExclusive: z.boolean().optional(),
    notificationsEnabled: z.boolean().optional(),
    preventPowerActions: z.boolean().optional(),
    realPowerActionsEnabled: z.boolean().optional(),
    eventRetentionDays: z.number().int().min(7).max(3_650).optional(),
    logLevel: z.enum(['debug', 'info', 'warning', 'error']).optional()
  })
  .strict()

export const codexThreadIdSchema = z
  .string()
  .trim()
  .min(1)
  .max(512)
  .regex(/^[A-Za-z0-9._:-]+$/)

export const continueCodexThreadSchema = z
  .object({
    threadId: codexThreadIdSchema,
    objective: z.string().trim().min(1).max(100_000),
    retryPolicy: retryPolicySchema,
    verification: z.array(verificationCheckSchema).max(20),
    powerPolicy: powerPolicySchema
  })
  .strict()

export const openExternalSchema = z.object({
  url: z.string().url().max(4_096)
})

export const lifecycleActionSchema = z.object({
  jobId: idSchema,
  action: z.enum(['start', 'pause', 'resume', 'interrupt', 'cancel', 'retry', 'archive'])
})

export const selectDirectorySchema = z.object({
  defaultPath: z.string().max(4_096).optional()
})
