<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import DashboardPage from './pages/DashboardPage.vue'
import ProjectsPage from './pages/ProjectsPage.vue'
import JobsPage from './pages/JobsPage.vue'
import JobDetailPage from './pages/JobDetailPage.vue'
import HistoryPage from './pages/HistoryPage.vue'
import ActivityPage from './pages/ActivityPage.vue'
import AutomationsPage from './pages/AutomationsPage.vue'
import SettingsPage from './pages/SettingsPage.vue'
import { useOrchestratorStore } from './stores/orchestrator'

const store = useOrchestratorStore()
const page = ref('dashboard')

const navigation = [
  { id: 'dashboard', label: 'Dashboard', icon: '⌂' },
  { id: 'projects', label: 'Projects', icon: '▱' },
  { id: 'jobs', label: 'Jobs', icon: '≡' },
  { id: 'history', label: 'History & sessions', icon: '↺' },
  { id: 'activity', label: 'Activity', icon: '☷' },
  { id: 'automations', label: 'Automations', icon: '◷' },
  { id: 'settings', label: 'Settings', icon: '⚙' }
]

const currentComponent = computed(() => {
  if (store.selectedJob) return JobDetailPage
  return {
    dashboard: DashboardPage,
    projects: ProjectsPage,
    jobs: JobsPage,
    history: HistoryPage,
    activity: ActivityPage,
    automations: AutomationsPage,
    settings: SettingsPage
  }[page.value]
})

function navigate(destination: string): void {
  store.clearSelectedJob()
  page.value = destination
}

async function openJob(id: string): Promise<void> {
  await store.selectJob(id)
}

async function cancelCountdown(id: string): Promise<void> {
  await window.orchestrator.cancelPowerCountdown(id)
  await store.refresh()
}

onMounted(store.refresh)
</script>

<template>
  <div class="app-shell">
    <aside class="sidebar">
      <div class="brand">
        <div class="brand-mark" aria-hidden="true">CO</div>
        <div><strong>Codex Orchestrator</strong><span>Local control plane</span></div>
      </div>
      <nav aria-label="Primary navigation">
        <button
          v-for="item in navigation"
          :key="item.id"
          type="button"
          :class="{ active: page === item.id && !store.selectedJob }"
          @click="navigate(item.id)"
        >
          <span class="nav-icon" aria-hidden="true">{{ item.icon }}</span
          >{{ item.label }}
        </button>
      </nav>
      <div class="sidebar-status">
        <span class="status-dot" :class="store.provider?.state" aria-hidden="true"></span>
        <div>
          <strong>{{ store.provider?.mode === 'codex' ? 'Codex' : 'Simulation' }}</strong
          ><span>{{ store.provider?.state ?? 'Checking…' }}</span>
        </div>
      </div>
      <p class="independent-note">Independent community project</p>
    </aside>

    <div class="workspace">
      <header class="topbar">
        <div class="workspace-title">
          <span>Workspace</span
          ><strong>{{
            store.selectedJob
              ? store.selectedJob.project.name
              : navigation.find((item) => item.id === page)?.label
          }}</strong>
        </div>
        <div class="topbar-actions">
          <span v-if="store.loading" class="working-indicator">Working…</span
          ><button
            class="icon-button"
            type="button"
            title="Refresh"
            aria-label="Refresh application state"
            @click="store.refresh"
          >
            ↻
          </button>
        </div>
      </header>

      <div
        v-for="countdown in store.snapshot?.activePowerCountdowns ?? []"
        :key="countdown.scheduleId"
        class="power-banner"
        role="alert"
      >
        <div>
          <strong>{{ countdown.action }} is scheduled</strong
          ><span
            >Triggered by a verified job at {{ new Date(countdown.dueAt).toLocaleTimeString() }}.
            Eligibility will be checked again.</span
          >
        </div>
        <button class="button danger" type="button" @click="cancelCountdown(countdown.scheduleId)">
          Cancel action
        </button>
      </div>

      <main class="content">
        <div v-if="store.error" class="alert error" role="alert">
          <strong>Action could not be completed</strong><span>{{ store.error }}</span
          ><button type="button" aria-label="Dismiss error" @click="store.error = null">×</button>
        </div>
        <div v-if="store.notice" class="toast" role="status">{{ store.notice }}</div>
        <component
          :is="currentComponent"
          v-if="store.snapshot"
          @navigate="navigate"
          @projects="navigate('projects')"
          @job="openJob"
        />
        <div v-else class="launch-state">
          <div class="spinner" aria-hidden="true"></div>
          <strong>Opening Codex Orchestrator</strong
          ><span>Loading durable state and reconciling schedules…</span>
        </div>
      </main>
    </div>
  </div>
</template>
