<script setup lang="ts">
import { onMounted, ref } from 'vue'
import PageHeader from '../components/PageHeader.vue'
import EmptyState from '../components/EmptyState.vue'
import { useOrchestratorStore } from '../stores/orchestrator'
import type { JobEvent } from '@shared/types/domain'

const store = useOrchestratorStore()
const events = ref<JobEvent[]>([])

async function load(): Promise<void> {
  const details = await Promise.all(
    store.jobs.slice(0, 20).map((job) => window.orchestrator.getJobDetail(job.id))
  )
  events.value = details
    .flatMap((detail) => detail.events)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, 500)
}
onMounted(load)
</script>

<template>
  <div>
    <PageHeader
      title="Activity"
      description="A human-readable audit of recent provider and application decisions."
      ><button class="button" type="button" @click="load">Refresh</button></PageHeader
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
  </div>
</template>
