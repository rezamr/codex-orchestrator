# Architecture

## Architectural style

Codex Orchestrator uses a layered desktop architecture with a privileged Electron main process, an unprivileged Vue renderer, a typed preload bridge, a local durable state store, and provider adapters.

The orchestration engine is the product core. Vue is a presentation client of that core; Codex is one provider behind an adapter.

In `0.1.0-alpha.1`, the renderer loads a bounded Codex account/thread projection at startup independently of the durable SQLite snapshot. Dashboard, Projects, Jobs, Activity, History, and Settings share that projection. Provider conversation summaries and transcripts are read-through data; only an explicit **Continue** operation creates a local job, project registration, and provider-session reference. The session link is inserted transactionally with its job and is unique per provider/external ID. Provider-specific JSON-RPC never crosses into the renderer.

The boxes below are logical responsibilities, not separate processes or services. In this alpha, most orchestration behavior is implemented by the main-process `Orchestrator` and its application/infrastructure adapters.

## High-level view

```text
+--------------------------------------------------------+
| Renderer: Vue 3                                       |
| dashboards, forms, timelines, settings, dialogs       |
+---------------------------+----------------------------+
                            |
                        typed IPC
                            |
+---------------------------v----------------------------+
| Electron Main / Application Services                  |
|                                                       |
| Task Manager      Queue Manager      Session Manager  |
| Scheduler         Retry Manager      Approval Manager |
| Verification      Recovery           Notifications    |
| Power Manager     Project Manager    Diagnostics      |
+---------------------------+----------------------------+
                            |
                    domain interfaces
              +-------------+-------------+
              |                           |
+-------------v-------------+ +-----------v-----------+
| Provider adapters         | | Platform adapters      |
| Codex app-server          | | Windows/macOS/Linux    |
| future adapters           | | power/notification/fs  |
+-------------+-------------+ +-----------+-----------+
              |                           |
              +-------------+-------------+
                            |
+---------------------------v----------------------------+
| Infrastructure                                         |
| SQLite repositories, process supervision, logging      |
+--------------------------------------------------------+
```

## Process boundary

### Renderer

The renderer may:

- render state,
- request allowed application operations through the preload bridge,
- subscribe to sanitized state/event updates.

The renderer must not:

- spawn processes,
- access filesystem APIs directly,
- execute shell commands,
- access SQLite directly,
- invoke OS power commands,
- hold provider credentials.

### Preload

The preload layer exposes a small, typed API. It is an anti-corruption boundary, not a general RPC tunnel. Avoid generic methods such as `execute(command, args)`.

### Main process

The main process owns:

- process supervision,
- state machines,
- persistence,
- provider connection,
- scheduling,
- OS integration,
- verification execution,
- notifications,
- logging.

## Domain model

Core entities:

- **Project** — user-selected workspace and defaults.
- **Job** — durable orchestration objective.
- **Attempt** — one execution/resume attempt for a job.
- **ProviderSession** — opaque provider continuation identity.
- **Event** — normalized append-only timeline item.
- **Schedule** — persisted future action.
- **Approval** — pending or resolved human decision.
- **VerificationRun** — evidence from completion checks.
- **CompletionPolicy** — rules required for successful completion.
- **PowerPolicy** — optional post-completion system action.

## Job state machine

Recommended normalized states:

```text
DRAFT
  -> QUEUED
  -> STARTING
  -> RUNNING
       -> WAITING_FOR_APPROVAL
       -> WAITING_FOR_INPUT
       -> WAITING_FOR_LIMIT
       -> WAITING_FOR_RETRY
       -> PAUSED
       -> VERIFYING
       -> FAILED
       -> CANCELLED
  VERIFYING
       -> COMPLETED
       -> VERIFICATION_FAILED
       -> NEEDS_REVIEW
```

`STARTING`, `RUNNING`, `VERIFYING`, and waiting states must have explicit legal transitions. Invalid transitions should fail closed and emit diagnostics.

A process exit is an event, not a completion state.

## Attempts

Each provider start/resume operation creates an Attempt so the history can answer:

- what was sent,
- when it began,
- which provider session it used,
- why it stopped,
- whether it was retried,
- which events belong to it.

The job remains the durable objective across attempts.

## Provider abstraction

The orchestration engine consumes a provider-neutral interface conceptually similar to:

```ts
interface AgentProvider {
  probe(): Promise<ProviderStatus>
  connect(): Promise<void>
  disconnect(): Promise<void>
  readAccountSnapshot(): Promise<CodexAccountSnapshot>
  listThreads(): Promise<CodexThreadIndex>
  readThread(threadId: string): Promise<CodexThreadDetail>
  start(request: StartRequest): Promise<SessionRef>
  resume(request: ResumeRequest): Promise<SessionRef>
  interrupt(session: SessionRef): Promise<void>
  respondToApproval(request: ApprovalResponse): Promise<void>
  subscribe(listener: ProviderEventListener): Unsubscribe
}
```

Exact interfaces may evolve during implementation, but domain code must not depend on raw app-server messages.

### Read-only Codex account and history

The Codex adapter owns automatic CLI discovery, app-server JSON-RPC, and normalization of account, usage, rate-limit, and thread data. Settings can request a read-only account snapshot; History lists active and archived thread summaries using `useStateDbOnly: true` and loads a selected thread with `thread/read(includeTurns: true)`. The thread index is bounded at 20,000 records and the transcript projection is bounded for renderer transport. Both surfaces report unavailable/truncated data rather than hiding failures. Account email and authentication material are excluded. Transcripts are returned to the current renderer view on demand and are not stored in SQLite.

The old user-entered executable override is removed by migration 3. The renderer cannot set a CLI path; the main process searches the supported per-user Codex CLI install and then `PATH` (Windows), or resolves `codex` on `PATH` (macOS/Linux). It validates executable naming before probing, uses `--version` to reject stale/unlaunchable candidates, and never launches the ChatGPT GUI executable or enumerates protected Windows app packages.

## Event normalization

Provider-specific events are translated into stable application events such as:

- session.started,
- turn.started,
- activity,
- command.started,
- command.completed,
- approval.requested,
- approval.resolved,
- provider.rate_limited,
- provider.authentication_required,
- provider.disconnected,
- turn.completed,
- turn.failed.

Raw payloads may be retained selectively for diagnostics but should not become UI contracts.

## Persistence

SQLite is the durable state store.

Requirements:

- schema migrations,
- transactions for state + schedule changes,
- UTC timestamps internally,
- indexes for active jobs and due schedules,
- append-only event history where practical,
- retention/cleanup settings for large logs,
- no provider credentials.

The application must be able to reconstruct the current normalized job state from durable records even when the previous process disappeared.

## Scheduling

Timers are derived from persisted schedules.

At startup:

1. load due/pending schedules,
2. discard or reconcile obsolete entries,
3. execute overdue actions only after checking current job state,
4. compute the next timer.

The timer is never the source of truth.

## Recovery

Recovery treats all previously running child processes as unknown until proven otherwise.

Rules:

- do not blindly start a second provider session,
- reconnect/resume only when provider capability and persisted state support it,
- convert uncertain cases to a visible review state,
- record recovery decisions as events.

## Verification pipeline

Verification runs after a provider signals a candidate completion or when the user manually requests verification.

A policy may require several checks. Store:

- command,
- working directory,
- start/end time,
- exit status,
- bounded stdout/stderr or artifact reference,
- pass/fail,
- reason skipped.

Power actions depend on final verification outcome, not only provider text.

Windows npm/npx checks resolve native `node.exe` plus the associated npm JavaScript CLI entry point and keep `shell: false`; unsupported batch wrappers fail visibly. Resolution, asynchronous errors, and synchronous spawn failures all produce bounded failed evidence. Unexpected verification infrastructure failures transition to `NEEDS_REVIEW`. After a completed provider attempt, verification-only retry creates a new check run without a new provider attempt or turn. Concurrent verification is rejected and interrupted runs are marked failed during recovery.

Conversation targeting is explicit in the job form and can originate from History. The typed desktop-open IPC accepts only a validated thread id, confirms saved metadata without resuming, and opens the canonical OpenAI-documented ChatGPT deep link. It never receives an arbitrary URL or prompt.

## Platform abstraction

OS-specific modules expose capability queries and safe operations. Unsupported capabilities are explicit.

Examples:

- prevent sleep,
- release sleep block,
- sleep,
- hibernate,
- shutdown,
- restart,
- schedule/cancel wake where support is proven,
- notifications.

## Concurrency

Concurrency is policy-driven:

- global max active jobs,
- optional per-project exclusivity,
- no disruptive power action while another protected job is active,
- serialize provider operations that require a single local process/session boundary.

## Error taxonomy

Do not collapse all errors into “failed.”

Minimum categories:

- configuration,
- authentication,
- provider unavailable,
- protocol error,
- network,
- usage/rate limit,
- process crash,
- approval/input required,
- verification failure,
- OS capability denied/unsupported,
- database/persistence,
- cancelled by user.

## Testing architecture

Prioritize deterministic tests of:

- state transition tables,
- scheduler/restart behavior with fake clocks,
- retry/backoff,
- event normalization,
- provider process supervision,
- IPC validation,
- database migrations,
- verification policies,
- power-action guards.

Use adapters/fakes so tests do not need real shutdown or real Codex usage by default.
