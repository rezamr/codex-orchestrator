import { randomUUID } from 'node:crypto'
import { execFile } from 'node:child_process'
import type { OrchestrationStore } from '@main/infrastructure/database/store'
import { redactString } from '@main/infrastructure/logging/redaction'
import type { VerificationCheckConfig, VerificationCheckResult } from '@shared/types/domain'

const MAX_EVIDENCE_CHARACTERS = 20_000

function executableForPlatform(command: string): string {
  if (process.platform !== 'win32') return command
  if (['npm', 'npx', 'pnpm', 'yarn'].includes(command.toLowerCase())) return `${command}.cmd`
  return command
}

export class VerificationEngine {
  constructor(private readonly store: OrchestrationStore) {}

  async run(jobId: string, cwd: string, checks: VerificationCheckConfig[]): Promise<boolean> {
    const run = this.store.startVerificationRun(jobId)
    let passed = true
    for (const check of checks) {
      const result = await this.executeCheck(run.id, cwd, check)
      this.store.addVerificationCheck(result)
      if (check.required && !result.passed) passed = false
    }
    this.store.completeVerificationRun(run.id, passed ? 'passed' : 'failed')
    return passed
  }

  private executeCheck(
    runId: string,
    cwd: string,
    check: VerificationCheckConfig
  ): Promise<VerificationCheckResult> {
    const startedAt = new Date().toISOString()
    return new Promise((resolve) => {
      let output = ''
      let settled = false
      const child = execFile(
        executableForPlatform(check.command),
        check.args,
        {
          cwd,
          shell: false,
          windowsHide: true,
          timeout: check.timeoutMs,
          maxBuffer: MAX_EVIDENCE_CHARACTERS * 4,
          env: { ...process.env, CI: process.env.CI ?? '1' }
        },
        (error, stdout, stderr) => {
          if (settled) return
          settled = true
          output = redactString(`${stdout ?? ''}${stderr ?? ''}`).slice(-MAX_EVIDENCE_CHARACTERS)
          const exitCode = typeof error?.code === 'number' ? error.code : error ? null : 0
          resolve({
            id: randomUUID(),
            runId,
            configId: check.id,
            label: check.label,
            command: [check.command, ...check.args].join(' '),
            startedAt,
            endedAt: new Date().toISOString(),
            exitCode,
            passed: !error,
            output,
            error: error ? redactString(error.message).slice(0, 2_000) : null
          })
        }
      )
      child.once('error', (error) => {
        if (settled) return
        settled = true
        resolve({
          id: randomUUID(),
          runId,
          configId: check.id,
          label: check.label,
          command: [check.command, ...check.args].join(' '),
          startedAt,
          endedAt: new Date().toISOString(),
          exitCode: null,
          passed: false,
          output,
          error: redactString(error.message).slice(0, 2_000)
        })
      })
    })
  }
}
