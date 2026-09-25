/// <reference types="vite/client" />

import type { OrchestratorApi } from '@shared/contracts/ipc'

declare global {
  interface Window {
    orchestrator: OrchestratorApi
  }
}

export {}
