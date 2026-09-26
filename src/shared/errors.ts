// Durable attempt marker: do not infer pre-turn rejection from uncertain transport failures.
export const PROVIDER_BUSY_STOP_REASON = 'PROVIDER_BUSY: resume rejected before turn submission.'

export type ErrorCode =
  | 'PROVIDER_BUSY'
  | 'CONFIGURATION'
  | 'AUTHENTICATION_REQUIRED'
  | 'PROVIDER_UNAVAILABLE'
  | 'PROTOCOL_ERROR'
  | 'NETWORK'
  | 'USAGE_LIMIT'
  | 'PROCESS_CRASH'
  | 'APPROVAL_REQUIRED'
  | 'INPUT_REQUIRED'
  | 'VERIFICATION_FAILED'
  | 'POWER_UNSUPPORTED'
  | 'PERSISTENCE'
  | 'INVALID_TRANSITION'
  | 'VALIDATION'
  | 'CANCELLED'
  | 'CONCURRENCY_LIMIT'

export class AppError extends Error {
  constructor(
    public readonly code: ErrorCode,
    message: string,
    public readonly safeDetails?: Record<string, unknown>,
    options?: ErrorOptions
  ) {
    super(message, options)
    this.name = 'AppError'
  }
}
