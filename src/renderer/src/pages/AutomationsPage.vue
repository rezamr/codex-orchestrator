<script setup lang="ts">
import PageHeader from '../components/PageHeader.vue'
import EmptyState from '../components/EmptyState.vue'
import { useOrchestratorStore } from '../stores/orchestrator'

const store = useOrchestratorStore()
async function cancel(id: string): Promise<void> {
  await window.orchestrator.cancelPowerCountdown(id)
  await store.refresh()
}
</script>

<template>
  <div>
    <PageHeader
      title="Automations"
      description="Persisted retries, resumes, and guarded post-completion power actions."
    />
    <section class="safety-note">
      <strong>Safety first</strong
      ><span
        >Disruptive actions require verified success, no protected sibling work, platform support,
        and a final eligibility check. Development uses simulation.</span
      >
    </section>
    <section class="panel">
      <div class="section-heading">
        <div>
          <h2>Upcoming actions</h2>
          <p>These schedules survive application restart.</p>
        </div>
      </div>
      <EmptyState
        v-if="!store.snapshot?.upcomingSchedules.length"
        title="No automation scheduled"
        description="Retry, resume, and power countdown schedules will appear here."
      />
      <div v-else class="data-list">
        <article
          v-for="schedule in store.snapshot.upcomingSchedules"
          :key="schedule.id"
          class="data-row static"
        >
          <div class="row-main">
            <strong>{{ schedule.kind }}</strong
            ><span>{{
              String(
                schedule.payload.evidence ??
                  schedule.payload.reason ??
                  schedule.payload.action ??
                  'Scheduled action'
              )
            }}</span>
          </div>
          <span class="source-tag">{{ schedule.source }} · {{ schedule.confidence }}</span
          ><span class="row-meta">{{ new Date(schedule.dueAt).toLocaleString() }}</span
          ><button
            v-if="schedule.kind === 'power'"
            class="button danger-text"
            type="button"
            @click="cancel(schedule.id)"
          >
            Cancel
          </button>
        </article>
      </div>
    </section>
  </div>
</template>
