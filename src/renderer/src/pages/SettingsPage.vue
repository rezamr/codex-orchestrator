<script setup lang="ts">
import { onMounted } from 'vue'
import PageHeader from '../components/PageHeader.vue'
import { useOrchestratorStore } from '../stores/orchestrator'

const store = useOrchestratorStore()

onMounted(async () => {
  await store.loadSettings()
  await store.loadDiagnostics()
})

async function checkConnection(): Promise<void> {
  await store.checkCodexConnection()
}

function formatNumber(value: number | null): string {
  return value === null ? 'Unavailable' : new Intl.NumberFormat().format(value)
}

function formatReset(value: number | null): string {
  return value === null ? 'Reset time unavailable' : new Date(value * 1_000).toLocaleString()
}

async function exportDiagnostics(): Promise<void> {
  const name = await window.orchestrator.exportDiagnostics()
  if (name) store.notice = `Exported ${name}`
}
</script>

<template>
  <div>
    <PageHeader
      title="Settings"
      description="Configure Codex discovery, concurrency, notifications, and safety policy."
    />
    <section v-if="store.settings" class="settings-layout">
      <div class="panel settings-section">
        <div class="section-heading">
          <div>
            <h2>Codex connection</h2>
            <p>Authentication stays owned by the installed Codex environment.</p>
          </div>
        </div>
        <div class="form-grid two">
          <label
            ><span>Default provider</span
            ><select
              :value="store.settings.providerMode"
              @change="
                store.saveSettings({
                  providerMode: ($event.target as HTMLSelectElement).value as 'codex' | 'fake'
                })
              "
            >
              <option value="fake">Simulated provider</option>
              <option value="codex">Codex app-server</option>
            </select></label
          >
        </div>
        <div class="toolbar">
          <button
            class="button primary"
            type="button"
            :disabled="store.loading"
            @click="checkConnection"
          >
            Connect and refresh Codex data
          </button>
          <span class="probe-result">Codex CLI location is detected automatically.</span>
        </div>
        <div v-if="store.codexConnection" class="provider-connection-result" aria-live="polite">
          <dl class="diagnostic-grid">
            <div>
              <dt>Connection</dt>
              <dd>
                {{ store.codexConnection.provider.state }} —
                {{ store.codexConnection.provider.message }}
              </dd>
            </div>
            <div>
              <dt>Authentication</dt>
              <dd>
                {{
                  store.codexConnection.provider.authenticated === true
                    ? 'Available'
                    : store.codexConnection.provider.authenticated === false
                      ? 'Sign-in required'
                      : 'Unknown'
                }}
              </dd>
            </div>
            <div>
              <dt>Codex version</dt>
              <dd>{{ store.codexConnection.provider.version ?? 'Unavailable' }}</dd>
            </div>
            <div class="wide">
              <dt>Detected Codex CLI</dt>
              <dd>
                <code>{{ store.codexConnection.provider.executablePath ?? 'Not detected' }}</code>
              </dd>
            </div>
            <div>
              <dt>Account plan</dt>
              <dd>{{ store.codexConnection.account.planType ?? 'Unavailable' }}</dd>
            </div>
            <div>
              <dt>Codex account mode</dt>
              <dd>{{ store.codexConnection.account.authMode ?? 'Unavailable' }}</dd>
            </div>
            <div>
              <dt>Usage lifetime tokens</dt>
              <dd>
                {{
                  formatNumber(store.codexConnection.account.usage?.summary?.lifetimeTokens ?? null)
                }}
              </dd>
            </div>
            <div>
              <dt>Peak daily tokens</dt>
              <dd>
                {{
                  formatNumber(
                    store.codexConnection.account.usage?.summary?.peakDailyTokens ?? null
                  )
                }}
              </dd>
            </div>
            <div>
              <dt>Longest turn</dt>
              <dd>
                {{
                  formatNumber(
                    store.codexConnection.account.usage?.summary?.longestRunningTurnSec ?? null
                  )
                }}
                seconds
              </dd>
            </div>
            <div>
              <dt>Current streak</dt>
              <dd>
                {{
                  formatNumber(
                    store.codexConnection.account.usage?.summary?.currentStreakDays ?? null
                  )
                }}
                days
              </dd>
            </div>
            <div>
              <dt>Longest streak</dt>
              <dd>
                {{
                  formatNumber(
                    store.codexConnection.account.usage?.summary?.longestStreakDays ?? null
                  )
                }}
                days
              </dd>
            </div>
          </dl>
          <div v-if="store.codexConnection.account.rateLimits?.length" class="limit-list">
            <h3>Usage limits</h3>
            <div
              v-for="limit in store.codexConnection.account.rateLimits"
              :key="limit.id"
              class="limit-row"
            >
              <strong>{{ limit.name ?? limit.id }}</strong>
              <span
                v-if="
                  limit.primary?.usedPercent !== null && limit.primary?.usedPercent !== undefined
                "
              >
                Primary: {{ limit.primary.usedPercent }}% used
              </span>
              <span v-if="limit.primary">{{ formatReset(limit.primary.resetsAt) }}</span>
              <span
                v-if="
                  limit.secondary?.usedPercent !== null &&
                  limit.secondary?.usedPercent !== undefined
                "
              >
                Secondary: {{ limit.secondary.usedPercent }}% used
              </span>
              <span v-if="limit.reachedType">Limit state: {{ limit.reachedType }}</span>
            </div>
          </div>
          <div v-if="store.codexConnection.account.usage?.dailyBuckets?.length" class="daily-usage">
            <h3>Daily token activity</h3>
            <div class="daily-usage-list">
              <div
                v-for="bucket in store.codexConnection.account.usage.dailyBuckets"
                :key="bucket.startDate"
              >
                <time>{{ bucket.startDate }}</time>
                <span>{{ formatNumber(bucket.tokens) }} tokens</span>
              </div>
            </div>
          </div>
          <p v-else class="provider-data-note">
            Usage limits may be unavailable until Codex is signed in with a supported ChatGPT
            account.
          </p>
          <p class="provider-data-note">
            Read-only account and usage data was refreshed
            {{ new Date(store.codexConnection.account.fetchedAt).toLocaleString() }}. Authentication
            remains managed by Codex.
          </p>
        </div>
      </div>
      <div class="panel settings-section">
        <h2>Orchestration</h2>
        <div class="form-grid two">
          <label
            ><span>Maximum concurrent jobs</span
            ><input
              :value="store.settings.maxConcurrentJobs"
              type="number"
              min="1"
              max="16"
              @change="
                store.saveSettings({
                  maxConcurrentJobs: Number(($event.target as HTMLInputElement).value)
                })
              " /></label
          ><label class="toggle-row"
            ><input
              :checked="store.settings.perProjectExclusive"
              type="checkbox"
              @change="
                store.saveSettings({
                  perProjectExclusive: ($event.target as HTMLInputElement).checked
                })
              "
            /><span
              ><strong>One active job per project</strong
              ><small>Prevents overlapping changes in the same working tree.</small></span
            ></label
          ><label class="toggle-row"
            ><input
              :checked="store.settings.notificationsEnabled"
              type="checkbox"
              @change="
                store.saveSettings({
                  notificationsEnabled: ($event.target as HTMLInputElement).checked
                })
              "
            /><span
              ><strong>Desktop notifications</strong
              ><small>Notify for approvals, waits, failure, and completion.</small></span
            ></label
          >
        </div>
      </div>
      <div class="panel settings-section">
        <h2>Power safety</h2>
        <div class="form-grid two">
          <label class="toggle-row"
            ><input
              :checked="store.settings.preventPowerActions"
              type="checkbox"
              @change="
                store.saveSettings({
                  preventPowerActions: ($event.target as HTMLInputElement).checked
                })
              "
            /><span
              ><strong>Prevent all power actions</strong
              ><small>Global override blocks countdown execution.</small></span
            ></label
          ><label class="toggle-row"
            ><input
              :checked="store.settings.realPowerActionsEnabled"
              type="checkbox"
              @change="
                store.saveSettings({
                  realPowerActionsEnabled: ($event.target as HTMLInputElement).checked
                })
              "
            /><span
              ><strong>Allow real power actions in packaged builds</strong
              ><small
                >Development and automated tests always simulate. Each job still requires an
                explicit action and cancellable countdown.</small
              ></span
            ></label
          >
          <div class="policy-box">
            <strong>Development is simulated</strong>
            <p>
              Unpackaged and test runs record power requests without changing the host. Reliable
              automatic wake is not advertised. This pre-alpha exposes real actions on Windows only.
            </p>
          </div>
        </div>
      </div>
      <div class="panel settings-section">
        <div class="section-heading">
          <div>
            <h2>Diagnostics</h2>
            <p>Exports are redacted and exclude credentials by default.</p>
          </div>
        </div>
        <dl v-if="store.diagnostics" class="diagnostic-grid">
          <div>
            <dt>App version</dt>
            <dd>{{ store.diagnostics.appVersion }}</dd>
          </div>
          <div>
            <dt>Platform</dt>
            <dd>{{ store.diagnostics.platform }}</dd>
          </div>
          <div>
            <dt>Database schema</dt>
            <dd>{{ store.diagnostics.databaseSchemaVersion }}</dd>
          </div>
          <div>
            <dt>Recent events</dt>
            <dd>{{ store.diagnostics.recentEvents.length }}</dd>
          </div>
        </dl>
        <button class="button" type="button" @click="exportDiagnostics">
          Export redacted diagnostics…
        </button>
      </div>
    </section>
  </div>
</template>

<style scoped>
.provider-connection-result {
  margin-top: 16px;
  padding-top: 14px;
  border-top: 1px solid var(--border);
}

.provider-connection-result .wide {
  grid-column: 1 / -1;
}

.provider-connection-result code {
  overflow-wrap: anywhere;
  font-size: 11px;
  font-weight: 400;
}

.limit-list {
  margin-top: 14px;
}

.limit-row {
  display: grid;
  grid-template-columns: minmax(120px, 1fr) auto minmax(180px, auto);
  gap: 12px;
  padding: 9px 0;
  border-top: 1px solid var(--border);
}

.limit-row span,
.provider-data-note {
  color: var(--muted);
  font-size: 11px;
}

.daily-usage {
  margin-top: 14px;
}

.daily-usage h3 {
  margin-bottom: 7px;
}

.daily-usage-list {
  max-height: 190px;
  overflow: auto;
  border: 1px solid var(--border);
  border-radius: 5px;
}

.daily-usage-list div {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  padding: 6px 9px;
  border-top: 1px solid var(--border);
}

.daily-usage-list div:first-child {
  border-top: 0;
}

.daily-usage-list time {
  color: var(--muted);
}

.provider-data-note {
  margin: 12px 0 0;
}

@media (max-width: 760px) {
  .limit-row {
    grid-template-columns: 1fr;
    gap: 2px;
  }
}
</style>
