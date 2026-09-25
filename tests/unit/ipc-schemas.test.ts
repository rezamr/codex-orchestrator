import { describe, expect, it } from 'vitest'
import { createJobSchema, createProjectSchema, updateSettingsSchema } from '@shared/schemas/ipc'

describe('privileged IPC schemas', () => {
  it('rejects malformed project and job payloads before main-process work', () => {
    expect(createProjectSchema.safeParse({ name: '', path: '' }).success).toBe(false)
    expect(createJobSchema.safeParse({ projectId: 'not-a-uuid' }).success).toBe(false)
  })

  it('rejects unknown settings keys', () => {
    expect(updateSettingsSchema.safeParse({ arbitraryShellCommand: 'rm -rf /' }).success).toBe(
      false
    )
  })
})
