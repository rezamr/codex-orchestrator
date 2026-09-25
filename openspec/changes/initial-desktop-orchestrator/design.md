# Design: Initial Desktop Orchestrator

## Context

The product is a privileged local desktop application wrapped around long-running Codex work. It must coordinate UI, local process supervision, durable scheduling, provider sessions, verification commands, and optional OS power actions while remaining recoverable after crashes/restarts.

## Goals

- Strong process/security boundaries.
- Durable state machine rather than ad-hoc callbacks.
- Provider-neutral orchestration core.
- Reliable discovery of the supported local Codex CLI and read-only visibility into existing Codex data.
- Safe unattended operation with bounded automation.
- Clear operator UX.
- Deterministic automated tests for orchestration logic.
- Cross-platform interfaces with platform-specific capability detection.

## Non-goals

- General plugin SDK in v0.1.
- Cloud synchronization.
- Remote control from mobile/web.
- Multiple agent providers beyond the interfaces needed to keep that future path open.
- Reading private ChatGPT desktop package storage, copying provider credentials, or taking write actions on historical Codex threads.

## Major decisions

### Electron boundary

Vue renderer is unprivileged. All privileged actions live in main. Preload exposes a narrow typed API. Renderer messages are validated in main.

### Provider boundary

Codex app-server is supervised by a Codex provider adapter. Raw protocol messages never become Vue contracts. They are normalized into stable provider/domain events.

### Executable discovery and connection

Normal users do not choose an executable path. On Windows, search the per-user Codex CLI installation location and then the process environment; on macOS/Linux, resolve the `codex` command from the environment. Reject GUI launchers such as `ChatGPT.exe` before starting a process, verify each candidate with the supported `codex --version` probe, and continue after a stale/unlaunchable candidate. A database migration deletes the obsolete manual executable override from older builds. Report the resolved CLI path and an actionable failure reason. Never enumerate or read the protected `WindowsApps` package as a workaround.

The provider starts only `codex app-server --stdio`, performs `initialize`/`initialized`, and uses the installed Codex environment's existing supported authentication. It does not create a separate token flow.

### Read-only Codex data sync

On an explicit connection check and when the Codex History view is opened, query `account/read` without forcing token refresh, `account/rateLimits/read`, and `account/usage/read`. Retain only safe account/auth mode and plan status plus returned usage/limit summaries; omit account email and credentials. Do not call reset-credit consumption, login/logout, or other mutating endpoints.

Load pages of `thread/list` for active and archived threads and supported source kinds with `useStateDbOnly: true`, avoiding the server's optional local log scan-and-repair. Bound index retrieval to 20,000 threads and report when the bound is reached. The history index is a read-through view of app-server state and remains distinct from orchestrator jobs. Fetch a selected thread's turns with `thread/read(includeTurns: true)` only when the user opens it, then bound renderer projection to 1,000 turns and 2 MB of text, with an explicit truncated indicator. Reading history must not resume/load a thread, start a turn, or mutate/archive/delete provider data. Transcript content stays in the current view/session and is not duplicated into the orchestration database by default.

History synchronization is best-effort and isolated from normal job control: an unavailable provider or unsupported account endpoint must leave orchestrator-owned jobs usable and surface which Codex data could not be refreshed.

### Durable domain

A Job is the durable objective. Each start/resume creates an Attempt. Provider session/thread identifiers are opaque and associated with the Job. Events form an append-oriented operational history.

### State machine

The orchestration layer defines legal transitions among draft/queued/starting/running/waiting/paused/verifying/terminal states. Process exits, provider messages, timers, and user actions are inputs to the state machine rather than direct state assignments.

### Scheduling

Schedules are persisted. In-memory timers are derived from due schedules. On startup, overdue schedules are reconciled against current state before execution.

### Usage-limit recovery

Prefer structured retry/reset metadata when available. Otherwise classify documented error data, then conservative parsed evidence, then user/fallback bounded policy. Never claim to bypass a provider limit.

### Verification

Provider completion is a candidate completion. Configured checks determine verified success. Store check commands/configuration and result evidence with bounded output.

### Power management

Platform adapters expose capabilities and operations. Real actions require explicit user policy, verified success, no protected sibling work, platform support, cancellable countdown, final guard re-check, and audit. Automated tests use a fake adapter.

### Persistence

SQLite with numbered migrations, repositories, transactions for state/schedule updates, UTC timestamps, and indexes for active/due queries. Credentials are excluded.

### UI

Operational desktop UI: Dashboard, Projects, Jobs, History/Sessions, Activity, Automations, Settings. Use shared design tokens and components. Avoid visual noise.

History/Sessions distinguishes local Codex threads from orchestrator jobs. It shows a synchronized thread index and fetches a selected thread's turns on demand. Settings connection diagnostics show the discovered CLI, authentication/plan state, and read-only limit/usage summaries without exposing account credentials.

## Suggested module boundaries

```text
src/main/
  domain/          entities, states, policies, normalized events
  application/     orchestration use cases/services
  infrastructure/
    database/
    providers/codex/
    platform/
    logging/
  ipc/

src/preload/
src/renderer/
src/shared/contracts/
src/shared/schemas/
src/shared/types/
```

Exact folder names may be adjusted if the dependency directions remain clear.

## Data model sketch

Minimum tables or equivalent durable structures:

- projects
- jobs
- job_attempts
- provider_sessions
- job_events
- schedules
- approvals
- verification_runs
- verification_checks
- settings / profiles
- migrations

Use foreign keys where practical and transactions for multi-record lifecycle changes.

## Failure handling

Distinguish:

- provider unavailable,
- authentication required,
- protocol failure,
- provider process crash,
- usage/rate limit,
- network/transient failure,
- approval required,
- user input required,
- verification failure,
- database failure,
- unsupported/denied power action,
- user cancellation.

Do not convert unknown states into success.

## Recovery algorithm

On app start:

1. migrate/open database;
2. load unfinished jobs and due schedules;
3. initialize platform/provider capability state;
4. mark old local child-process assumptions stale;
5. reconcile each unfinished job;
6. resume automatically only when state + policy + provider capability make duplication risk acceptably low;
7. otherwise enter NEEDS_REVIEW with an explanation;
8. arm next persisted schedules.

## Security

- context isolation on;
- Node integration off;
- strict CSP;
- deny uncontrolled navigation/window creation;
- typed validated IPC;
- no generic renderer shell API;
- process spawning uses executable + argument arrays;
- secrets redacted;
- no provider credentials in SQLite;
- remote content never receives privileged bridge.

## Testing

### Unit

State transitions, policy evaluation, retries, schedule computation, event normalization, redaction.

### Integration

SQLite migrations/repositories, scheduler with fake clock, Codex protocol fixtures/process supervisor, executable discovery and invalid-GUI-path fallback, account/usage/limit reads, paginated active/archived thread history, transcript reads without resume, IPC validation.

### E2E

App launch, project/job creation, fake provider streaming, wait/resume, approval, verification, countdown cancel, restart recovery, and current Codex history viewing through a deterministic app-server fixture.

### Manual

Real Codex connectivity and each real OS power operation on supported systems.

## Packaging

Create development and production builds. Packaging must preserve app-server discovery configuration and native SQLite compatibility. Add signed installers later when signing infrastructure is available.

## Open questions resolved during implementation

Where the exact app-server protocol shape or maintained package versions have changed since this spec was written, consult current official documentation and adapt only inside the relevant infrastructure/provider layer. Do not weaken behavioral requirements to match an implementation shortcut.
