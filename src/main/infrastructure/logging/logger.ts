import { appendFile, mkdir } from 'node:fs/promises'
import { dirname } from 'node:path'
import { redact } from './redaction'

export type LogLevel = 'debug' | 'info' | 'warning' | 'error'

export interface LogEntry {
  timestamp: string
  level: LogLevel
  subsystem: string
  message: string
  jobId?: string
  sessionId?: string
  metadata?: Record<string, unknown>
}

export class StructuredLogger {
  constructor(private readonly logPath: string | null = null) {}

  async write(entry: Omit<LogEntry, 'timestamp'>): Promise<LogEntry> {
    const safeEntry = redact({ ...entry, timestamp: new Date().toISOString() }) as LogEntry
    if (this.logPath) {
      await mkdir(dirname(this.logPath), { recursive: true })
      await appendFile(this.logPath, `${JSON.stringify(safeEntry)}\n`, 'utf8')
    }
    return safeEntry
  }
}
