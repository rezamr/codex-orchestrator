<script setup lang="ts">
import { ref } from 'vue'
import PageHeader from '../components/PageHeader.vue'
import EmptyState from '../components/EmptyState.vue'
import { useOrchestratorStore } from '../stores/orchestrator'

const store = useOrchestratorStore()
const adding = ref(false)
const name = ref('')
const path = ref('')

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
        v-if="store.projects.length === 0"
        title="No projects registered"
        description="Add a local folder before creating your first job."
        action="Add project"
        @action="adding = true"
      />
      <div v-else class="project-list">
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
  </div>
</template>
