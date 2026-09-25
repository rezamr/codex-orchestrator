<script setup lang="ts">
import { computed, ref } from 'vue'
import PageHeader from '../components/PageHeader.vue'
import EmptyState from '../components/EmptyState.vue'
import { useOrchestratorStore } from '../stores/orchestrator'

const store = useOrchestratorStore()
const adding = ref(false)
const name = ref('')
const path = ref('')
const discovered = computed(() => {
  const paths = new Map<string, { count: number; projectIds: Set<string> }>()
  for (const thread of store.codexThreads?.threads ?? []) {
    if (!thread.cwd) continue
    const entry = paths.get(thread.cwd) ?? { count: 0, projectIds: new Set<string>() }
    entry.count += 1
    if (thread.projectId) entry.projectIds.add(thread.projectId)
    paths.set(thread.cwd, entry)
  }
  return [...paths]
    .map(([folder, entry]) => ({
      folder,
      count: entry.count,
      projectIds: [...entry.projectIds],
      name: folder.split(/[\\/]/).filter(Boolean).at(-1) ?? folder,
      registered: store.projects.some(
        (project) => project.path.toLowerCase() === folder.toLowerCase()
      )
    }))
    .sort((a, b) => b.count - a.count)
})

async function register(folder: string, label: string): Promise<void> {
  await store.createProject(label, folder)
}

async function browse(): Promise<void> {
  const selected = await window.orchestrator.selectDirectory(path.value || undefined)
  if (selected) {
    path.value = selected
    if (!name.value) name.value = selected.split(/[\\/]/).filter(Boolean).at(-1) ?? 'Project'
  }
}

async function submit(): Promise<void> {
  const result = await store.createProject(name.value, path.value)
  if (result) {
    name.value = ''
    path.value = ''
    adding.value = false
  }
}
</script>

<template>
  <div>
    <PageHeader
      title="Projects"
      description="Register local workspaces without changing or copying their files."
    >
      <button class="button primary" type="button" @click="adding = !adding">
        {{ adding ? 'Close' : 'Add project' }}
      </button>
    </PageHeader>

    <form v-if="adding" class="panel form-panel" @submit.prevent="submit">
      <h2>Add a project</h2>
      <div class="form-grid two">
        <label
          ><span>Name</span><input v-model="name" required maxlength="120" autocomplete="off"
        /></label>
        <label class="wide"
          ><span>Folder</span>
          <div class="input-action">
            <input v-model="path" required readonly /><button
              class="button"
              type="button"
              @click="browse"
            >
              Browse…
            </button>
          </div></label
        >
      </div>
      <div class="form-actions">
        <button class="button primary" type="submit" :disabled="store.loading">Add project</button>
      </div>
    </form>

    <section class="panel">
      <EmptyState
        v-if="store.projects.length === 0 && discovered.length === 0"
        title="No projects registered"
        description="Add a local folder before creating your first job."
        action="Add project"
        @action="adding = true"
      />
      <div v-else-if="store.projects.length" class="project-list">
        <article v-for="project in store.projects" :key="project.id" class="project-row">
          <div class="project-mark" aria-hidden="true">▱</div>
          <div>
            <strong>{{ project.name }}</strong
            ><code>{{ project.path }}</code>
          </div>
          <span class="path-state" :class="{ missing: !project.exists }">{{
            project.exists ? 'Available' : 'Missing'
          }}</span>
          <button
            class="button subtle danger-text"
            type="button"
            @click="store.removeProject(project.id)"
          >
            Remove
          </button>
        </article>
      </div>
    </section>

    <section class="panel" style="margin-top: 18px">
      <div class="section-heading">
        <div>
          <h2>Codex workspaces</h2>
          <p>
            Discovered from Codex conversations. Register a folder to run an Orchestrator job there.
          </p>
        </div>
      </div>
      <p v-if="store.codexLoading" class="provider-data-note">Loading Codex workspaces…</p>
      <EmptyState
        v-else-if="!discovered.length"
        title="No Codex workspaces found"
        description="Refresh Codex data after connecting; existing conversations with a working folder appear here."
      />
      <div v-else class="project-list">
        <article v-for="item in discovered" :key="item.folder" class="project-row">
          <div class="project-mark" aria-hidden="true">▱</div>
          <div>
            <strong>{{ item.name }}</strong
            ><code>{{ item.folder }}</code>
            <small v-if="item.projectIds.length"
              >Codex project {{ item.projectIds.join(', ') }}</small
            >
          </div>
          <span class="path-state">{{ item.count }} conversations</span>
          <span v-if="item.registered" class="path-state">Registered</span>
          <button v-else class="button" type="button" @click="register(item.folder, item.name)">
            Register
          </button>
        </article>
      </div>
    </section>
  </div>
</template>
