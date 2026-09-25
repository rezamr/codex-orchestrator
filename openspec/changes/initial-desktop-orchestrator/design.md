# Design: Initial Desktop Orchestrator

## Context

The product is a privileged local desktop application wrapped around long-running Codex work. It must coordinate UI, local process supervision, durable scheduling, provider sessions, verification commands, and optional OS power actions while remaining recoverable after crashes/restarts.

## Goals

- Strong process/security boundaries.
- Durable state machine rather than ad-hoc callbacks.
- Provider-neutral orchestration core.
- Safe unattended operation with bounded automation.
- Clear operator UX.
- Deterministic automated tests for orchestration logic.
- Cross-platform interfaces with platform-specific capability detection.

## Non-goals

- General plugin SDK in v0.1.
- Cloud synchronization.
- Remote control from mobile/web.
- Multiple agent providers beyond the interfaces needed to keep that future path open.

## Major decisions

### Electron boundary

Vue renderer is unprivileged. All privileged actions live in main. Preload exposes a narrow typed API. Renderer messages are validated in main.

### Provider boundary

Codex app-server is supervised by a Codex provider adapter. Raw protocol messages never become Vue contracts. They are normalized into stable provider/domain events.

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
SQLite migrations/repositories, scheduler with fake clock, Codex protocol fixtures/process supervisor, IPC validation.

### E2E
App launch, project/job creation, fake provider streaming, wait/resume, approval, verification, countdown cancel, restart recovery.

### Manual
Real Codex connectivity and each real OS power operation on supported systems.

## Packaging

Create development and production builds. Packaging must preserve app-server discovery configuration and native SQLite compatibility. Add signed installers later when signing infrastructure is available.

## Open questions resolved during implementation

Where the exact app-server protocol shape or maintained package versions have changed since this spec was written, consult current official documentation and adapt only inside the relevant infrastructure/provider layer. Do not weaken behavioral requirements to match an implementation shortcut.
