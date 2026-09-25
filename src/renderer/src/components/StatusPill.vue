<script setup lang="ts">
import type { JobState } from '@shared/types/domain'

defineProps<{ state: JobState | string }>()

const labels: Record<string, string> = {
  DRAFT: 'Draft',
  QUEUED: 'Queued',
  STARTING: 'Starting',
  RUNNING: 'Running',
  WAITING_FOR_APPROVAL: 'Approval required',
  WAITING_FOR_INPUT: 'Input required',
  WAITING_FOR_LIMIT: 'Waiting for usage reset',
  WAITING_FOR_RETRY: 'Scheduled retry',
  PAUSED: 'Paused',
  VERIFYING: 'Verifying',
  COMPLETED: 'Completed',
  VERIFICATION_FAILED: 'Verification failed',
  NEEDS_REVIEW: 'Needs review',
  FAILED: 'Failed',
  CANCELLED: 'Cancelled'
}

function category(state: string): string {
  if (['COMPLETED'].includes(state)) return 'success'
  if (['FAILED', 'VERIFICATION_FAILED'].includes(state)) return 'danger'
  if (['WAITING_FOR_APPROVAL', 'WAITING_FOR_INPUT', 'NEEDS_REVIEW'].includes(state))
    return 'attention'
  if (['RUNNING', 'STARTING', 'VERIFYING'].includes(state)) return 'active'
  return 'neutral'
}
</script>

<template>
  <span class="status-pill" :class="`status-${category(state)}`">
    <span class="status-dot" aria-hidden="true"></span>
    {{ labels[state] ?? state }}
  </span>
</template>
