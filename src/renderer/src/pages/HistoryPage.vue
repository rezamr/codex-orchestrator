<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import PageHeader from '../components/PageHeader.vue'
import StatusPill from '../components/StatusPill.vue'
import EmptyState from '../components/EmptyState.vue'
import { useOrchestratorStore } from '../stores/orchestrator'

const store = useOrchestratorStore()
const emit = defineEmits<{ job: [id: string] }>()
const query = ref('')
const showArchived = ref(true)
const visibleCount = ref(100)
const history = computed(() =>
  store.jobs.filter((job) =>
    ['COMPLETED', 'FAILED', 'CANCELLED', 'VERIFICATION_FAILED', 'NEEDS_REVIEW'].includes(job.state)
  )
)
const filteredThreads = computed(() => {
  const search = query.value.trim().toLocaleLowerCase()
  return (store.codexThreads?.threads ?? []).filter((thread) => {
    if (!showArchived.value && thread.archived) return false
    return (
      !search || `${thread.name ?? ''} ${thread.preview ?? ''}`.toLocaleLowerCase().includes(search)
    )
  })
})
const visibleThreads = computed(() => filteredThreads.value.slice(0, visibleCount.value))

onMounted(() => {
  if (!store.codexThreads) void store.loadCodexThreads()
})

function formatDate(timestamp: number | null): string {
  return timestamp === null ? 'Date unavailable' : new Date(timestamp * 1_000).toLocaleString()
}

async function refreshCodexHistory(): Promise<void> {
  visibleCount.value = 100
  await store.loadCodexThreads()
}
</script>

<template>
  <div>
    <PageHeader
      title="History & sessions"
      description="Browse Codex’s saved conversations alongside jobs managed by Orchestrator."
    />

    <section class="panel codex-history-panel">
      <div class="section-heading history-heading">
        <div>
          <h2>Codex conversations</h2>
          <p>
            Read-only view of active and archived local Codex threads. Transcripts are loaded on
            demand and are not copied into Orchestrator’s database.
          </p>
        </div>
        <button class="button" type="button" :disabled="store.loading" @click="refreshCodexHistory">
          Refresh history
        </button>
      </div>

      <template v-if="store.codexThreads">
        <div class="thread-filters">
          <label class="thread-search">
            <span class="sr-only">Search Codex conversations</span>
            <input v-model="query" type="search" placeholder="Search titles and previews" />
          </label>
          <label class="thread-archive-toggle">
            <input v-model="showArchived" type="checkbox" />
            Include archived
          </label>
          <span class="thread-count">{{ filteredThreads.length }} conversations</span>
        </div>

        <p v-if="store.codexThreads.truncated" class="provider-data-note">
          The local history index is larger than the safe retrieval limit. Refreshing shows the
          newest 20,000 threads.
        </p>

        <div v-if="visibleThreads.length" class="thread-browser">
          <div class="thread-list" aria-label="Codex conversations">
            <button
              v-for="thread in visibleThreads"
              :key="thread.id"
              class="thread-entry"
              :class="{ selected: store.selectedCodexThread?.summary.id === thread.id }"
              type="button"
              @click="store.selectCodexThread(thread.id)"
            >
              <span class="thread-entry-title">{{
                thread.name || thread.preview || 'Untitled Codex conversation'
              }}</span>
              <span class="thread-entry-preview">{{
                thread.preview || 'No preview available'
              }}</span>
              <span class="thread-entry-meta">
                {{ thread.archived ? 'Archived' : 'Active' }} ·
                {{ thread.status ?? 'Status unknown' }} ·
                {{ thread.sourceKind ?? 'Unknown source' }} ·
                {{ thread.modelProvider ?? 'Provider unknown' }} ·
                {{ thread.pinned ? 'Pinned' : 'Unpinned' }} · {{ formatDate(thread.updatedAt) }}
              </span>
            </button>
          </div>

          <article
            v-if="store.selectedCodexThread"
            class="thread-transcript"
            aria-label="Codex conversation transcript"
          >
            <header>
              <h3>{{ store.selectedCodexThread.summary.name || 'Codex conversation' }}</h3>
              <span>{{ store.selectedCodexThread.summary.archived ? 'Archived' : 'Active' }}</span>
            </header>
            <p v-if="store.selectedCodexThread.truncated" class="provider-data-note">
              This transcript is too large to display in full. The original Codex history was not
              changed.
            </p>
            <div v-if="store.selectedCodexThread.turns.length === 0" class="transcript-empty">
              No text-based turn content is available for this conversation.
            </div>
            <section
              v-for="turn in store.selectedCodexThread.turns"
              :key="turn.id"
              class="transcript-turn"
            >
              <div v-for="item in turn.items" :key="item.id" class="transcript-item">
                <strong>{{ item.label }}</strong>
                <pre>{{ item.text }}</pre>
              </div>
            </section>
          </article>
        </div>
        <EmptyState
          v-else
          title="No Codex conversations found"
          description="Check the selected provider and connection in Settings, then refresh this history."
        />
        <div v-if="visibleThreads.length < filteredThreads.length" class="thread-load-more">
          <button class="button" type="button" @click="visibleCount += 100">Show 100 more</button>
        </div>
        <p class="provider-data-note">
          Last refreshed {{ new Date(store.codexThreads.fetchedAt).toLocaleString() }}.
        </p>
      </template>
      <EmptyState
        v-else
        title="Codex history has not been loaded"
        description="Orchestrator discovers Codex automatically and reads history through the supported app-server interface."
      />
    </section>

    <section class="panel job-history-panel">
      <div class="section-heading">
        <div>
          <h2>Orchestrator jobs</h2>
          <p>Finished jobs, recovery outcomes, attempts, and verification records.</p>
        </div>
      </div>
      <EmptyState
        v-if="history.length === 0"
        title="No completed jobs yet"
        description="Finished and review-required jobs will appear here."
      />
      <div v-else class="data-list">
        <button
          v-for="job in history"
          :key="job.id"
          class="data-row"
          type="button"
          @click="emit('job', job.id)"
        >
          <div class="row-main">
            <strong>{{ job.projectName }}</strong>
            <span>{{ job.objective }}</span>
          </div>
          <StatusPill :state="job.state" />
          <span class="row-meta">{{
            formatDate(
              job.completedAt
                ? Date.parse(job.completedAt) / 1_000
                : Date.parse(job.updatedAt) / 1_000
            )
          }}</span>
          <span aria-hidden="true">›</span>
        </button>
      </div>
    </section>
  </div>
</template>

<style scoped>
.codex-history-panel,
.job-history-panel {
  margin-bottom: 18px;
}

.history-heading {
  align-items: flex-start;
}

.history-heading p {
  max-width: 820px;
  margin: 4px 0 0;
}

.thread-filters {
  display: flex;
  align-items: center;
  gap: 12px;
  margin: 14px 0;
}

.thread-search {
  flex: 1;
}

.thread-archive-toggle {
  display: flex;
  align-items: center;
  gap: 6px;
  white-space: nowrap;
}

.thread-count,
.thread-entry-meta,
.provider-data-note {
  color: var(--muted);
  font-size: 11px;
}

.thread-browser {
  display: grid;
  grid-template-columns: minmax(260px, 0.8fr) minmax(0, 1.5fr);
  min-height: 230px;
  max-height: 70vh;
  border: 1px solid var(--border);
  border-radius: 5px;
  overflow: hidden;
}

.thread-list {
  overflow: auto;
  border-right: 1px solid var(--border);
}

.thread-entry {
  display: block;
  width: 100%;
  padding: 11px 12px;
  border: 0;
  border-bottom: 1px solid var(--border);
  background: var(--surface);
  text-align: left;
  cursor: pointer;
}

.thread-entry:hover,
.thread-entry.selected {
  background: var(--surface-subtle);
}

.thread-entry.selected {
  box-shadow: inset 3px 0 var(--accent);
}

.thread-entry-title,
.thread-entry-preview,
.thread-entry-meta {
  display: block;
}

.thread-entry-title {
  overflow: hidden;
  font-weight: 650;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.thread-entry-preview {
  overflow: hidden;
  margin-top: 2px;
  color: var(--muted);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.thread-transcript {
  overflow: auto;
  padding: 14px;
  background: var(--surface-subtle);
}

.thread-transcript header {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  border-bottom: 1px solid var(--border);
}

.thread-transcript header span {
  color: var(--muted);
  font-size: 11px;
}

.transcript-turn {
  padding: 10px 0;
  border-bottom: 1px solid var(--border);
}

.transcript-item + .transcript-item {
  margin-top: 12px;
}

.transcript-item pre {
  max-height: 320px;
  margin: 4px 0 0;
  overflow: auto;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}

.transcript-empty {
  padding: 24px 0;
  color: var(--muted);
}

.thread-load-more {
  padding-top: 12px;
  text-align: center;
}

@media (max-width: 1000px) {
  .thread-browser {
    grid-template-columns: minmax(200px, 0.9fr) minmax(0, 1.2fr);
  }
}

@media (max-width: 760px) {
  .thread-filters,
  .history-heading {
    align-items: stretch;
    flex-direction: column;
  }

  .thread-browser {
    grid-template-columns: minmax(0, 1fr);
    max-height: none;
  }

  .thread-list {
    max-height: 260px;
    border-right: 0;
    border-bottom: 1px solid var(--border);
  }

  .thread-transcript {
    max-height: 50vh;
  }
}
</style>
