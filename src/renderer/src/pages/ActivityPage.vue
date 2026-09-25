<script setup lang="ts">
import { onMounted, ref } from 'vue'
import PageHeader from '../components/PageHeader.vue'
import EmptyState from '../components/EmptyState.vue'
import { useOrchestratorStore } from '../stores/orchestrator'
import type { JobEvent } from '@shared/types/domain'

const store = useOrchestratorStore()
const events = ref<JobEvent[]>([])
const emit = defineEmits<{ navigate: [page: string] }>()

async function inspectThread(threadId: string): Promise<void> {
  await store.selectCodexThread(threadId)
  emit('navigate', 'history')
}

async function load(): Promise<void> {
  const details = await Promise.all(
    store.jobs.slice(0, 20).map((job) => window.orchestrator.getJobDetail(job.id))
  )
  events.value = details
    .flatMap((detail) => detail.events)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, 500)
}
async function refreshAll(): Promise<void> {
  await Promise.all([load(), store.refreshCodexWorkspace()])
}
onMounted(load)
</script>

<template>
  <div>
    <PageHeader
      title="Activity"
      description="A human-readable audit of recent provider and application decisions."
      ><button class="button" type="button" @click="refreshAll">Refresh</button></PageHeader
    >
    <section class="panel">
      <EmptyState
        v-if="events.length === 0"
        title="No activity recorded"
        description="Lifecycle, provider, retry, verification, and power events will appear here."
      />
      <ol v-else class="activity-feed">
        <li v-for="event in events" :key="event.id">
          <span class="level-label" :class="event.level">{{ event.level }}</span>
          <div>
            <strong>{{ event.type }}</strong>
            <p>{{ event.message }}</p>
          </div>
          <time>{{ new Date(event.createdAt).toLocaleString() }}</time>
        </li>
      </ol>
    </section>
    <section class="panel" style="margin-top: 18px">
      <div class="section-heading">
        <div>
          <h2>Recent Codex conversations</h2>
          <p>Updates reported by Codex. These are not Orchestrator job audit events.</p>
        </div>
      </div>
      <p v-if="store.codexLoading" class="provider-data-note">Loading Codex history…</p>
      <EmptyState
        v-else-if="!store.codexThreads?.threads.length"
        title="No Codex activity found"
        description="Connect to Codex to see recently updated conversations."
      />
      <ol v-else class="activity-feed">
        <li v-for="thread in store.codexThreads.threads.slice(0, 50)" :key="thread.id">
          <span class="level-label info">Codex</span>
          <div>
            <button class="button subtle" type="button" @click="inspectThread(thread.id)">
              {{ thread.name || thread.preview || 'Untitled conversation' }}
            </button>
            <p>
              {{ thread.cwd ?? 'Workspace unavailable' }} ·
              {{ thread.sourceKind ?? 'Source unavailable' }} ·
              {{ thread.archived ? 'Archived' : 'Active' }}
            </p>
          </div>
          <time>{{
            thread.updatedAt
              ? new Date(thread.updatedAt * 1000).toLocaleString()
              : 'Date unavailable'
          }}</time>
        </li>
      </ol>
    </section>
  </div>
</template>
