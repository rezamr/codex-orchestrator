<script setup lang="ts">
import { computed, ref } from 'vue'
import StatusPill from '../components/StatusPill.vue'
import { useOrchestratorStore } from '../stores/orchestrator'

const store = useOrchestratorStore()
const inputAnswer = ref('')
const detail = computed(() => store.selectedJob)

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
  if (['PAUSED', 'WAITING_FOR_LIMIT', 'WAITING_FOR_RETRY'].includes(state))
    result.push(['resume', 'Resume', 'primary'])
  if (
    ['VERIFICATION_FAILED', 'NEEDS_REVIEW'].includes(state) &&
    detail.value?.attempts[0]?.status === 'completed'
  )
    result.push(['verify', 'Rerun checks only', 'primary'])
  if (['FAILED', 'VERIFICATION_FAILED', 'NEEDS_REVIEW'].includes(state))
    result.push(['retry', 'Retry Codex work', ''])
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
      <p v-if="detail.job.state === 'VERIFYING'" class="provider-data-note">
        Checks retain workspace protection until they finish or reach their configured timeout.
        Cancellation is unavailable while they run.
      </p>
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

        <section class="panel">
          <div class="section-heading">
            <div>
              <h2>Activity timeline</h2>
              <p>Provider activity and orchestration decisions.</p>
            </div>
          </div>
          <ol class="timeline">
            <li v-for="event in detail.events" :key="event.id" :class="event.level">
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
