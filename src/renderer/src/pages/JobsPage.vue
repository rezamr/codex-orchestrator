<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import PageHeader from '../components/PageHeader.vue'
import StatusPill from '../components/StatusPill.vue'
import EmptyState from '../components/EmptyState.vue'
import { useOrchestratorStore } from '../stores/orchestrator'
import type {
  PowerAction,
  ProviderMode,
  VerificationCheckConfig,
  VerificationKind
} from '@shared/types/domain'

const store = useOrchestratorStore()
const emit = defineEmits<{ job: [id: string]; projects: []; navigate: [page: string] }>()
const creating = ref(false)
const advanced = ref(false)
const projectId = ref('')
const objective = ref('')
const provider = ref<ProviderMode>('codex')
onMounted(async () => {
  if (!store.settings) await store.loadSettings()
  provider.value = store.settings?.providerMode ?? 'codex'
  if (store.continuationTarget) {
    beginContinuation(store.continuationTarget)
    store.continuationTarget = null
  }
})
const powerAction = ref<PowerAction>('none')
const maxAttempts = ref(3)
const selectedChecks = ref<VerificationKind[]>([])
const customCommand = ref('')
const customArgs = ref('')
const continuingThreadId = ref<string | null>(null)
const continuationThread = computed(() =>
  store.codexThreads?.threads.find((thread) => thread.id === continuingThreadId.value)
)
const eligibleThreads = computed(() =>
  (store.codexThreads?.threads ?? []).filter(
    (thread) =>
      !thread.archived &&
      thread.cwd &&
      !thread.managedJobId &&
      !['active', 'running'].includes(thread.status ?? '')
  )
)
const threadQuery = ref('')
const visibleThreads = computed(() =>
  (store.codexThreads?.threads ?? [])
    .filter(
      (thread) =>
        !thread.archived &&
        (!threadQuery.value ||
          `${thread.name ?? ''} ${thread.preview ?? ''} ${thread.cwd ?? ''}`
            .toLowerCase()
            .includes(threadQuery.value.toLowerCase()))
    )
    .slice(0, 100)
)

const checks = computed<VerificationCheckConfig[]>(() => {
  const known: Record<Exclude<VerificationKind, 'custom'>, [string, string, string[]]> = {
    test: ['Run tests', 'npm', ['test']],
    typecheck: ['Typecheck', 'npm', ['run', 'typecheck']],
    lint: ['Lint', 'npm', ['run', 'lint']],
    build: ['Production build', 'npm', ['run', 'build']],
    'git-status': ['Git status', 'git', ['status', '--short']]
  }
  const result: VerificationCheckConfig[] = selectedChecks.value
    .filter((kind): kind is Exclude<VerificationKind, 'custom'> => kind !== 'custom')
    .map((kind) => ({
      id: kind,
      kind,
      label: known[kind][0],
      command: known[kind][1],
      args: known[kind][2],
      required: true,
      timeoutMs: 15 * 60_000
    }))
  if (selectedChecks.value.includes('custom') && customCommand.value.trim()) {
    result.push({
      id: 'custom',
      kind: 'custom' as const,
      label: 'Custom check',
      command: customCommand.value.trim(),
      args: customArgs.value.trim() ? customArgs.value.trim().split(/\s+/) : [],
      required: true,
      timeoutMs: 15 * 60_000
    })
  }
  return result
})

async function submit(): Promise<void> {
  if (continuingThreadId.value) {
    const created = await store.continueCodexThread({
      threadId: continuingThreadId.value,
      objective: objective.value,
      retryPolicy: {
        maxAutomaticAttempts: maxAttempts.value,
        baseDelaySeconds: 60,
        maxDelaySeconds: 3_600
      },
      verification: checks.value,
      powerPolicy: {
        action: powerAction.value,
        countdownSeconds: 60,
        preventSleepWhileActive: true
      }
    })
    if (created) {
      creating.value = false
      continuingThreadId.value = null
      emit('job', created.id)
    }
    return
  }
  const created = await store.createJob({
    projectId: projectId.value,
    objective: objective.value,
    provider: provider.value,
    profile: 'default',
    retryPolicy: {
      maxAutomaticAttempts: maxAttempts.value,
      baseDelaySeconds: 60,
      maxDelaySeconds: 3_600
    },
    verification: checks.value,
    powerPolicy: {
      action: powerAction.value,
      countdownSeconds: 60,
      preventSleepWhileActive: true
    },
    startImmediately: true
  })
  if (created) {
    creating.value = false
    emit('job', created.id)
  }
}

function beginContinuation(threadId: string): void {
  continuingThreadId.value = threadId
  creating.value = true
  objective.value = ''
}

function toggleNewJob(): void {
  continuingThreadId.value = null
  objective.value = ''
  creating.value = !creating.value
}

async function inspect(threadId: string): Promise<void> {
  await store.selectCodexThread(threadId)
  emit('navigate', 'history')
}

function toggleCheck(kind: VerificationKind): void {
  selectedChecks.value = selectedChecks.value.includes(kind)
    ? selectedChecks.value.filter((entry) => entry !== kind)
    : [...selectedChecks.value, kind]
}

function checkLabel(kind: VerificationKind): string {
  if (kind === 'git-status') return 'Git status'
  return `${kind.charAt(0).toUpperCase()}${kind.slice(1)}`
}
</script>

<template>
  <div>
    <PageHeader title="Jobs" description="Create and control durable Codex objectives.">
      <button
        class="button primary"
        type="button"
        :disabled="!creating && store.projects.length === 0"
        @click="toggleNewJob"
      >
        {{ creating ? 'Close' : 'New job' }}
      </button>
    </PageHeader>

    <form v-if="creating" class="panel form-panel" @submit.prevent="submit">
      <div class="section-heading">
        <div>
          <h2>{{ continuingThreadId ? 'Continue Codex conversation' : 'New job' }}</h2>
          <p>
            {{
              continuingThreadId
                ? 'Your new instruction starts a turn in the existing Codex conversation after the job is persisted.'
                : 'Starts a new conversation. It does not inherit another chat, even if you enter “please continue”. Select an existing conversation below to keep its history.'
            }}
          </p>
        </div>
      </div>
      <label>
        <span>Conversation destination</span>
        <select v-model="continuingThreadId">
          <option :value="null">New conversation — no existing chat history</option>
          <option v-for="thread in eligibleThreads" :key="thread.id" :value="thread.id">
            {{ thread.name || thread.preview || thread.id }} · {{ thread.cwd }}
          </option>
        </select>
      </label>
      <div v-if="continuationThread" class="command-preview" role="status">
        <strong
          >Continuing:
          {{
            continuationThread.name || continuationThread.preview || 'Untitled conversation'
          }}</strong
        >
        <code>{{ continuationThread.id }}</code>
        <span>{{ continuationThread.cwd }}</span>
        <small>Your instruction will be appended to this exact saved conversation.</small>
      </div>
      <div class="form-grid two">
        <label v-if="!continuingThreadId"
          ><span>Project</span
          ><select v-model="projectId" required>
            <option value="" disabled>Select a project</option>
            <option v-for="project in store.projects" :key="project.id" :value="project.id">
              {{ project.name }}
            </option>
          </select></label
        >
        <label v-if="!continuingThreadId"
          ><span>Provider</span
          ><select v-model="provider">
            <option value="fake">Simulated provider</option>
            <option value="codex">Codex app-server</option>
          </select></label
        >
        <label class="wide"
          ><span>Objective</span
          ><textarea
            v-model="objective"
            required
            rows="5"
            maxlength="100000"
            placeholder="Describe the complete outcome Codex should achieve."
          ></textarea>
        </label>
      </div>

      <button
        class="disclosure"
        type="button"
        :aria-expanded="advanced"
        @click="advanced = !advanced"
      >
        <span aria-hidden="true">{{ advanced ? '−' : '+' }}</span> Advanced retry, verification, and
        completion settings
      </button>
      <div v-if="advanced" class="advanced-panel">
        <div class="form-grid two">
          <label
            ><span>Maximum automatic resumes</span
            ><input v-model.number="maxAttempts" type="number" min="0" max="20"
          /></label>
          <label
            ><span>After verified completion</span
            ><select v-model="powerAction">
              <option value="none">Do nothing</option>
              <option value="lock">Lock</option>
              <option value="sleep">Sleep</option>
              <option value="hibernate">Hibernate</option>
              <option value="shutdown">Shut down</option>
              <option value="restart">Restart</option></select
            ><small
              >Power actions are simulated in development and require a cancellable
              countdown.</small
            ></label
          >
        </div>
        <fieldset>
          <legend>Required verification</legend>
          <div class="check-grid">
            <label
              v-for="kind in [
                'test',
                'typecheck',
                'lint',
                'build',
                'git-status',
                'custom'
              ] as VerificationKind[]"
              :key="kind"
              class="check-option"
            >
              <input
                type="checkbox"
                :checked="selectedChecks.includes(kind)"
                @change="toggleCheck(kind)"
              />
              <span>{{ checkLabel(kind) }}</span>
            </label>
          </div>
          <div v-if="selectedChecks.includes('custom')" class="form-grid two custom-command">
            <label
              ><span>Executable</span><input v-model="customCommand" placeholder="e.g. npm"
            /></label>
            <label
              ><span>Arguments</span><input v-model="customArgs" placeholder="e.g. run verify"
            /></label>
          </div>
          <div v-if="checks.length" class="command-preview">
            <strong>Visible commands</strong
            ><code v-for="check in checks" :key="check.id"
              >{{ check.command }} {{ check.args.join(' ') }}</code
            >
          </div>
        </fieldset>
      </div>
      <div class="form-actions">
        <button class="button primary" type="submit" :disabled="store.loading">
          {{ continuingThreadId ? 'Continue this conversation' : 'Create and start job' }}
        </button>
      </div>
    </form>

    <section v-if="!continuingThreadId || store.jobs.length" class="panel">
      <EmptyState
        v-if="store.projects.length === 0"
        title="Add a project first"
        description="Jobs always run inside an explicitly registered project root."
        action="Go to Projects"
        @action="emit('projects')"
      />
      <EmptyState
        v-else-if="store.jobs.length === 0"
        title="No jobs yet"
        description="Create an objective to begin durable, observable work."
        action="Create a job"
        @action="creating = true"
      />
      <div v-else class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Objective</th>
              <th>Project</th>
              <th>Status</th>
              <th>Provider</th>
              <th>Updated</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="job in store.jobs"
              :key="job.id"
              tabindex="0"
              @click="emit('job', job.id)"
              @keydown.enter="emit('job', job.id)"
            >
              <td class="objective-cell">{{ job.objective }}</td>
              <td>{{ job.projectName }}</td>
              <td><StatusPill :state="job.state" /></td>
              <td>{{ job.provider }}</td>
              <td>{{ new Date(job.updatedAt).toLocaleString() }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>

    <section class="panel" style="margin-top: 18px">
      <div class="section-heading">
        <div>
          <h2>Existing Codex conversations</h2>
          <p>
            Browse saved Codex work here. Continuing one creates a durable Orchestrator job and
            sends only the instruction you confirm.
          </p>
        </div>
      </div>
      <label class="thread-search"
        ><span class="sr-only">Search Codex conversations</span
        ><input v-model="threadQuery" type="search" placeholder="Search conversations or workspace"
      /></label>
      <p v-if="store.codexLoading" class="provider-data-note">Loading Codex conversations…</p>
      <EmptyState
        v-else-if="!visibleThreads.length"
        title="No active Codex conversations found"
        description="Check the Codex connection or open History for archived conversations."
      />
      <div v-else class="data-list conversation-list">
        <article
          v-for="thread in visibleThreads"
          :key="thread.id"
          class="data-row static conversation-row"
        >
          <div class="row-main">
            <strong>{{ thread.name || thread.preview || 'Untitled conversation' }}</strong
            ><span
              >{{ thread.cwd ?? 'Workspace unavailable' }} ·
              {{ thread.sourceKind ?? 'Source unavailable' }} ·
              {{
                thread.status === 'notLoaded' ? 'Stored' : (thread.status ?? 'Status unavailable')
              }}</span
            >
          </div>
          <span class="row-meta">{{
            thread.updatedAt
              ? new Date(thread.updatedAt * 1000).toLocaleString()
              : 'Date unavailable'
          }}</span>
          <div class="conversation-actions">
            <button class="button" type="button" @click="inspect(thread.id)">Inspect</button>
            <button
              v-if="thread.managedJobId"
              class="button"
              type="button"
              @click="emit('job', thread.managedJobId)"
            >
              Open job
            </button>
            <button
              v-else
              class="button primary"
              type="button"
              :disabled="!thread.cwd || thread.status === 'active' || thread.status === 'running'"
              @click="beginContinuation(thread.id)"
            >
              Continue
            </button>
          </div>
        </article>
      </div>
      <p class="provider-data-note">
        Showing up to 100 recent active conversations. Open History for the full index and
        transcripts.
      </p>
    </section>
  </div>
</template>

<style scoped>
.conversation-list {
  margin-bottom: 0;
}
.conversation-row {
  grid-template-columns: minmax(0, 1fr) auto auto;
}
.conversation-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  justify-content: flex-end;
}
@media (max-width: 1000px) {
  .conversation-row {
    grid-template-columns: minmax(0, 1fr) auto;
  }
  .conversation-row .row-meta {
    grid-column: 1;
    text-align: left;
  }
  .conversation-actions {
    grid-column: 2;
    grid-row: 1 / span 2;
  }
}
</style>
