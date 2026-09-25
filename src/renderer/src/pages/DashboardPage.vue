<script setup lang="ts">
import { computed } from 'vue'
import PageHeader from '../components/PageHeader.vue'
import StatusPill from '../components/StatusPill.vue'
import EmptyState from '../components/EmptyState.vue'
import { useOrchestratorStore } from '../stores/orchestrator'

const store = useOrchestratorStore()
const emit = defineEmits<{ navigate: [page: string]; job: [id: string] }>()

const active = computed(() =>
  store.jobs.filter((job) => ['STARTING', 'RUNNING', 'VERIFYING'].includes(job.state))
)
const attention = computed(() =>
  store.jobs.filter((job) =>
    [
      'WAITING_FOR_APPROVAL',
      'WAITING_FOR_INPUT',
      'NEEDS_REVIEW',
      'FAILED',
      'VERIFICATION_FAILED'
    ].includes(job.state)
  )
)
const waiting = computed(() =>
  store.jobs.filter((job) =>
    ['QUEUED', 'WAITING_FOR_LIMIT', 'WAITING_FOR_RETRY', 'PAUSED'].includes(job.state)
  )
)
const recentThreads = computed(() => (store.codexThreads?.threads ?? []).slice(0, 6))
const workspaceCount = computed(
  () =>
    new Set((store.codexThreads?.threads ?? []).map((thread) => thread.cwd).filter(Boolean)).size
)
const primaryLimit = computed(() => store.codexConnection?.account.rateLimits?.[0]?.primary ?? null)

async function inspectThread(threadId: string): Promise<void> {
  await store.selectCodexThread(threadId)
  emit('navigate', 'history')
}
</script>

<template>
  <div>
    <PageHeader
      title="Dashboard"
      description="See what is running, waiting, and asking for attention."
    >
      <button class="button primary" type="button" @click="emit('navigate', 'jobs')">
        New job
      </button>
    </PageHeader>

    <section class="connection-strip" aria-label="Codex connection">
      <div>
        <span class="eyebrow">Provider</span>
        <strong>{{
          store.provider?.mode === 'fake' ? 'Simulated provider' : 'Codex app-server'
        }}</strong>
        <span>{{ store.provider?.message ?? 'Checking connection…' }}</span>
      </div>
      <span class="connection-state" :class="store.provider?.state">{{
        store.provider?.state ?? 'checking'
      }}</span>
    </section>

    <div class="summary-grid" aria-label="Job summary">
      <article>
        <span>Active</span><strong>{{ active.length }}</strong
        ><small>running or verifying</small>
      </article>
      <article>
        <span>Needs attention</span><strong>{{ attention.length }}</strong
        ><small>approval, review, or failure</small>
      </article>
      <article>
        <span>Waiting</span><strong>{{ waiting.length }}</strong
        ><small>queued, paused, or scheduled</small>
      </article>
      <article>
        <span>Upcoming</span><strong>{{ store.snapshot?.upcomingSchedules.length ?? 0 }}</strong
        ><small>persisted actions</small>
      </article>
    </div>

    <section class="panel" style="margin-top: 18px">
      <div class="section-heading">
        <div>
          <h2>Connected Codex workspace</h2>
          <p>
            Read from Codex app-server; existing conversations are not automatically turned into
            jobs.
          </p>
        </div>
      </div>
      <p v-if="store.codexLoading" class="provider-data-note">
        Loading Codex account and conversations…
      </p>
      <template v-else-if="store.codexThreads">
        <p>
          {{ store.codexThreads.threads.length }} conversations across {{ workspaceCount }}
          {{ workspaceCount === 1 ? 'workspace' : 'workspaces' }} ·
          {{ store.codexConnection?.account.planType ?? 'Plan unavailable' }} account
        </p>
        <p v-if="primaryLimit?.usedPercent !== null && primaryLimit?.usedPercent !== undefined">
          Codex usage window: {{ primaryLimit.usedPercent }}% used<span
            v-if="primaryLimit.resetsAt"
          >
            · resets {{ new Date(primaryLimit.resetsAt * 1000).toLocaleString() }}</span
          >
        </p>
        <p
          v-if="
            store.codexConnection?.account.usage?.summary?.lifetimeTokens !== null &&
            store.codexConnection?.account.usage?.summary?.lifetimeTokens !== undefined
          "
        >
          Recorded lifetime usage:
          {{
            new Intl.NumberFormat().format(
              store.codexConnection.account.usage.summary.lifetimeTokens
            )
          }}
          tokens
        </p>
        <div class="data-list">
          <button
            v-for="thread in recentThreads"
            :key="thread.id"
            class="data-row"
            type="button"
            @click="inspectThread(thread.id)"
          >
            <div class="row-main">
              <strong>{{ thread.name || thread.preview || 'Untitled conversation' }}</strong
              ><span>{{ thread.cwd ?? 'Workspace unavailable' }}</span>
            </div>
            <span class="row-meta"
              >{{ thread.archived ? 'Archived' : 'Active' }} ·
              {{
                thread.status === 'notLoaded' ? 'Stored' : (thread.status ?? 'Status unavailable')
              }}</span
            ><span aria-hidden="true">›</span>
          </button>
        </div>
        <button class="button" type="button" @click="emit('navigate', 'jobs')">
          Manage conversations
        </button>
      </template>
      <p v-else>Codex data has not loaded yet. Check the connection or refresh.</p>
    </section>

    <section class="panel">
      <div class="section-heading">
        <div>
          <h2>Action required</h2>
          <p>Jobs that cannot continue unattended.</p>
        </div>
      </div>
      <EmptyState
        v-if="attention.length === 0"
        title="Nothing needs attention"
        description="Approvals, failures, and recovery decisions will appear here."
      />
      <div v-else class="data-list">
        <button
          v-for="job in attention"
          :key="job.id"
          class="data-row"
          type="button"
          @click="emit('job', job.id)"
        >
          <div class="row-main">
            <strong>{{ job.projectName }}</strong
            ><span>{{ job.objective }}</span>
          </div>
          <StatusPill :state="job.state" />
          <span class="row-meta">{{ job.stateReason }}</span>
          <span aria-hidden="true">›</span>
        </button>
      </div>
    </section>

    <section class="panel">
      <div class="section-heading">
        <div>
          <h2>Current work</h2>
          <p>Active and scheduled objectives.</p>
        </div>
      </div>
      <EmptyState
        v-if="active.length + waiting.length === 0"
        title="No current work"
        description="Create a job to start an objective with durable tracking."
        action="Create a job"
        @action="emit('navigate', 'jobs')"
      />
      <div v-else class="data-list">
        <button
          v-for="job in [...active, ...waiting].slice(0, 8)"
          :key="job.id"
          class="data-row"
          type="button"
          @click="emit('job', job.id)"
        >
          <div class="row-main">
            <strong>{{ job.projectName }}</strong
            ><span>{{ job.objective }}</span>
          </div>
          <StatusPill :state="job.state" />
          <span class="row-meta">{{
            job.nextActionAt ? new Date(job.nextActionAt).toLocaleString() : 'No schedule'
          }}</span>
          <span aria-hidden="true">›</span>
        </button>
      </div>
    </section>
  </div>
</template>
