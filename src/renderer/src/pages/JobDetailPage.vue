<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import type { CodexThreadDetail } from '@shared/types/domain'
import StatusPill from '../components/StatusPill.vue'
import { useOrchestratorStore } from '../stores/orchestrator'

const store = useOrchestratorStore()
const inputAnswer = ref('')
const detail = computed(() => store.selectedJob)
const savedConversation = ref<CodexThreadDetail | null>(null)
const conversationLoading = ref(false)
const conversationError = ref<string | null>(null)
const manualResumeAt = ref('')
const busy = computed(() =>
  /active writer|owned by another active Codex client/i.test(detail.value?.job.stateReason ?? '')
)
const audit = computed(
  () => detail.value?.events.filter((event) => event.type !== 'activity') ?? []
)
const rawActivity = computed(
  () => detail.value?.events.filter((event) => event.type === 'activity') ?? []
)
const pendingResume = computed(
  () =>
    detail.value?.schedules.find(
      (schedule) => schedule.kind === 'resume' && schedule.status === 'pending'
    ) ?? null
)
const waitingForLimit = computed(() => detail.value?.job.state === 'WAITING_FOR_LIMIT')

function toLocalDateTimeInput(iso: string | null): string {
  if (!iso) return ''
  const date = new Date(iso)
  if (!Number.isFinite(date.getTime())) return ''
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000)
  return local.toISOString().slice(0, 16)
}
const savedMessages = computed(() => {
  const liveIds = new Set(detail.value?.conversation.messages.map((message) => message.id) ?? [])
  return (savedConversation.value?.turns ?? []).flatMap((turn) =>
    turn.items
      .filter((item) => item.text && !liveIds.has(`${turn.id}:${item.id}`))
      .map((item) => ({
        ...item,
        key: `${turn.id}:${item.id}`,
        status: turn.status
      }))
  )
})

async function loadConversation(): Promise<void> {
  const jobId = detail.value?.job.id
  if (!jobId || conversationLoading.value) return
  conversationLoading.value = true
  conversationError.value = null
  try {
    const result = await window.orchestrator.readJobConversation(jobId)
    if (detail.value?.job.id === jobId) savedConversation.value = result
  } catch (error) {
    if (detail.value?.job.id === jobId)
      conversationError.value =
        error instanceof Error
          ? error.message.replace(/^Error invoking remote method '[^']+': /, '')
          : String(error)
  } finally {
    conversationLoading.value = false
    if (
      detail.value?.job.id !== jobId &&
      detail.value?.sessions.length &&
      !detail.value.conversation.messages.length
    )
      void loadConversation()
  }
}

watch(
  () => detail.value?.job.id,
  () => {
    savedConversation.value = null
    conversationError.value = null
    manualResumeAt.value = toLocalDateTimeInput(detail.value?.job.nextActionAt ?? null)
    if (detail.value?.sessions.length && !detail.value.conversation.messages.length)
      void loadConversation()
  },
  { immediate: true }
)

watch(
  () => detail.value?.job.nextActionAt,
  (value) => {
    manualResumeAt.value = toLocalDateTimeInput(value ?? null)
  }
)

async function scheduleManualResume(): Promise<void> {
  const jobId = detail.value?.job.id
  if (!jobId || !manualResumeAt.value) return
  const selected = new Date(manualResumeAt.value)
  if (!Number.isFinite(selected.getTime())) return
  await store.scheduleJobResume(jobId, selected.toISOString())
}

const actions = computed(() => {
  const state = detail.value?.job.state
  if (!state) return []
  const result: Array<[string, string, string]> = []
  if (state === 'DRAFT') result.push(['start', 'Start', 'primary'])
  if (
    [
      'QUEUED',
      'STARTING',
      'RUNNING',
      'WAITING_FOR_APPROVAL',
      'WAITING_FOR_INPUT',
      'WAITING_FOR_LIMIT',
      'WAITING_FOR_RETRY'
    ].includes(state)
  )
    result.push(['pause', 'Pause', ''])
  if (['STARTING', 'RUNNING'].includes(state)) result.push(['interrupt', 'Interrupt', ''])
  if (state === 'PAUSED') result.push(['resume', 'Resume', 'primary'])
  if (['WAITING_FOR_LIMIT', 'WAITING_FOR_RETRY'].includes(state))
    result.push(['resume', 'Resume now', 'primary'])
  if (
    ['VERIFICATION_FAILED', 'NEEDS_REVIEW'].includes(state) &&
    detail.value?.attempts[0]?.status === 'completed'
  )
    result.push(['verify', 'Rerun checks only', 'primary'])
  if (['FAILED', 'VERIFICATION_FAILED', 'NEEDS_REVIEW'].includes(state))
    result.push(['retry', busy.value ? 'Retry when available' : 'Retry Codex work', ''])
  if (!['COMPLETED', 'FAILED', 'CANCELLED', 'VERIFYING'].includes(state))
    result.push(['cancel', 'Cancel', 'danger-text'])
  if (['COMPLETED', 'FAILED', 'CANCELLED', 'VERIFICATION_FAILED'].includes(state))
    result.push(['archive', 'Archive', ''])
  return result
})

async function cancelCountdown(scheduleId: string): Promise<void> {
  await window.orchestrator.cancelPowerCountdown(scheduleId)
  await store.refresh()
}
</script>

<template>
  <div v-if="detail">
    <header class="detail-header">
      <button class="back-button" type="button" @click="store.clearSelectedJob()">
        ‹ Back to jobs
      </button>
      <div class="detail-title">
        <div>
          <span class="eyebrow">{{ detail.project.name }}</span>
          <h1>{{ detail.job.objective }}</h1>
        </div>
        <StatusPill :state="detail.job.state" />
      </div>
      <p class="detail-reason">{{ detail.job.stateReason }}</p>
      <p v-if="busy" class="alert warning">
        Another Codex client still owns this conversation. Stop or finish its work in that client
        and wait for it to release the conversation before retrying. Or create a new job with “New
        conversation” for independent work. Orchestrator will not remove locks or retry
        automatically.
      </p>
      <p v-if="detail.job.state === 'VERIFYING'" class="provider-data-note">
        Checks retain workspace protection until they finish or reach their configured timeout.
        Cancellation is unavailable while they run.
      </p>
      <section v-if="waitingForLimit" class="limit-resume-panel" aria-label="Usage reset scheduling">
        <div>
          <strong>{{ pendingResume ? 'Resume scheduled' : 'Manual resume time required' }}</strong>
          <p v-if="pendingResume">
            {{ new Date(pendingResume.dueAt).toLocaleString() }}
            · {{ pendingResume.source === 'user' ? 'User specified' : 'Codex reset time' }}
          </p>
          <p v-else>
            Codex did not provide a reliable reset time. Choose a future local date and time.
          </p>
        </div>
        <label class="resume-time-field">
          <span>Resume date and time</span>
          <input v-model="manualResumeAt" type="datetime-local" />
        </label>
        <button
          class="button"
          type="button"
          :disabled="!manualResumeAt"
          @click="scheduleManualResume"
        >
          {{ pendingResume ? 'Change resume time' : 'Schedule resume' }}
        </button>
      </section>
      <div class="toolbar">
        <button
          v-if="detail.job.provider === 'codex' && detail.sessions[0]"
          class="button"
          type="button"
          @click="store.openCodexThread(detail.sessions[0].externalId)"
        >
          Open in ChatGPT
        </button>
        <button
          v-for="action in actions"
          :key="action[0]"
          class="button"
          :class="action[2]"
          type="button"
          @click="store.jobAction(detail.job.id, action[0])"
        >
          {{ action[1] }}
        </button>
      </div>
    </header>

    <div class="detail-layout">
      <main>
        <section
          v-if="detail.approvals.some((entry) => entry.status === 'pending')"
          class="panel attention-panel"
        >
          <h2>Human decision required</h2>
          <article
            v-for="approval in detail.approvals.filter((entry) => entry.status === 'pending')"
            :key="approval.id"
            class="approval-card"
          >
            <strong>{{ approval.title }}</strong>
            <pre>{{ approval.detail }}</pre>
            <label v-if="approval.kind === 'user-input'"
              ><span>Response</span><textarea v-model="inputAnswer" rows="3"></textarea>
            </label>
            <div class="toolbar">
              <button
                class="button primary"
                type="button"
                @click="
                  store.respondToApproval(
                    approval.id,
                    'accept',
                    approval.kind === 'user-input' ? { answer: inputAnswer } : undefined
                  )
                "
              >
                {{ approval.kind === 'user-input' ? 'Send response' : 'Approve once' }}</button
              ><button
                v-if="approval.kind !== 'user-input'"
                class="button"
                type="button"
                @click="store.respondToApproval(approval.id, 'acceptForSession')"
              >
                Approve for session</button
              ><button
                class="button danger-text"
                type="button"
                @click="store.respondToApproval(approval.id, 'decline')"
              >
                Decline
              </button>
            </div>
          </article>
        </section>

        <section class="panel conversation-panel" aria-label="Conversation output">
          <div class="section-heading">
            <div>
              <h2>Conversation output</h2>
              <p>One message per response. Text is not stored in Orchestrator's database.</p>
            </div>
            <button
              class="button"
              type="button"
              :disabled="conversationLoading || !detail.sessions.length"
              @click="loadConversation()"
            >
              {{ conversationLoading ? 'Loading conversation…' : 'Load saved conversation' }}
            </button>
          </div>
          <p v-if="conversationError" class="alert error">{{ conversationError }}</p>
          <p
            v-if="savedConversation?.truncated || detail.conversation.truncated"
            class="alert warning"
          >
            This view reached its safe size limit. The original Codex conversation was not changed.
          </p>
          <p
            v-if="!savedMessages.length && !detail.conversation.messages.length"
            class="inline-empty"
          >
            No response loaded yet. Live messages appear here; use Load saved conversation for
            earlier output.
          </p>
          <article v-for="message in savedMessages" :key="message.key" class="conversation-message">
            <strong>{{ message.label }}</strong>
            <span v-if="message.status !== 'completed'" class="provider-data-note">
              — {{ message.status ?? 'Status unavailable' }}</span
            >
            <div class="conversation-text" dir="auto">{{ message.text }}</div>
          </article>
          <article
            v-for="message in detail.conversation.messages"
            :key="message.id"
            class="conversation-message live-message"
          >
            <strong>Codex</strong><span class="provider-data-note"> — {{ message.status }}</span>
            <p v-if="message.truncated" class="alert warning">Message exceeds the display limit.</p>
            <div class="conversation-text" dir="auto">
              {{ message.text || 'Waiting for message text…' }}
            </div>
          </article>
        </section>

        <section class="panel">
          <div class="section-heading">
            <div>
              <h2>Activity timeline</h2>
              <p>Provider activity and orchestration decisions.</p>
            </div>
          </div>
          <ol class="timeline">
            <li v-for="event in audit" :key="event.id" :class="event.level">
              <span class="timeline-marker" aria-hidden="true"></span>
              <div>
                <div class="timeline-title">
                  <strong>{{ event.type.replaceAll('.', ' · ') }}</strong
                  ><time>{{ new Date(event.createdAt).toLocaleString() }}</time>
                </div>
                <p>{{ event.message }}</p>
              </div>
            </li>
          </ol>
          <details v-if="rawActivity.length" class="raw-provider-activity">
            <summary>
              Raw provider activity ({{ rawActivity.length }} entries, including legacy fragments)
            </summary>
            <ol class="timeline">
              <li v-for="event in rawActivity" :key="event.id" :class="event.level">
                <span class="timeline-marker" aria-hidden="true"></span>
                <div>
                  <time>{{ new Date(event.createdAt).toLocaleString() }}</time>
                  <p>{{ event.message }}</p>
                </div>
              </li>
            </ol>
          </details>
        </section>

        <section class="panel">
          <div class="section-heading">
            <div>
              <h2>Verification</h2>
              <p>Machine-verifiable completion evidence.</p>
            </div>
          </div>
          <div v-if="detail.verificationRuns.length === 0" class="inline-empty">
            No verification run has started.
          </div>
          <article v-for="run in detail.verificationRuns" :key="run.id" class="verification-run">
            <div class="run-heading">
              <strong>{{ run.status }}</strong
              ><time>{{ new Date(run.startedAt).toLocaleString() }}</time>
            </div>
            <details v-for="check in run.checks" :key="check.id">
              <summary>
                <span>{{ check.passed ? '✓' : '×' }} {{ check.label }}</span
                ><code>{{ check.command }}</code>
              </summary>
              <pre>{{ check.output || 'No output' }}</pre>
              <p v-if="check.error" class="alert error">{{ check.error }}</p>
            </details>
          </article>
        </section>
      </main>

      <aside>
        <section class="panel facts">
          <h2>Job context</h2>
          <dl>
            <div>
              <dt>Project</dt>
              <dd>{{ detail.project.name }}</dd>
            </div>
            <div>
              <dt>Provider</dt>
              <dd>{{ detail.job.provider }}</dd>
            </div>
            <div>
              <dt>Session</dt>
              <dd>{{ detail.sessions[0]?.externalId ?? 'Not assigned' }}</dd>
            </div>
            <div>
              <dt>Attempts</dt>
              <dd>{{ detail.attempts.length }}</dd>
            </div>
            <div>
              <dt>Created</dt>
              <dd>{{ new Date(detail.job.createdAt).toLocaleString() }}</dd>
            </div>
            <div>
              <dt>Next action</dt>
              <dd>
                {{
                  detail.job.nextActionAt
                    ? new Date(detail.job.nextActionAt).toLocaleString()
                    : 'None'
                }}
              </dd>
            </div>
          </dl>
        </section>
        <section class="panel facts">
          <h2>Completion policy</h2>
          <dl>
            <div>
              <dt>Checks</dt>
              <dd>{{ detail.job.verification.length || 'None configured' }}</dd>
            </div>
            <div>
              <dt>Power action</dt>
              <dd>{{ detail.job.powerPolicy.action }}</dd>
            </div>
            <div>
              <dt>Auto resumes</dt>
              <dd>
                {{ detail.job.automaticAttempts }} /
                {{ detail.job.retryPolicy.maxAutomaticAttempts }}
              </dd>
            </div>
          </dl>
          <button
            v-if="detail.powerCountdown"
            class="button danger"
            type="button"
            @click="cancelCountdown(detail.powerCountdown.scheduleId)"
          >
            Cancel {{ detail.powerCountdown.action }} countdown
          </button>
        </section>
      </aside>
    </div>
  </div>
</template>
