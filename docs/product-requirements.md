# Product Requirements

## Product

**Codex Orchestrator** is a local-first desktop control plane for durable Codex engineering work.

The product exists to let a user start a task, observe it, safely leave it unattended, recover from expected interruptions, verify the result, and optionally perform a configured system action after successful completion.

## Current alpha status

The current `0.1.0-alpha.1` implementation includes the desktop project/job workflow, fake and Codex app-server providers, automatic Codex CLI discovery, read-only account/usage/history views across the main screens, discovered workspaces, explicit same-session continuation, durable jobs/schedules/recovery, verification, approvals, notifications, diagnostics, and simulated/guarded platform power adapters. Real Codex checks have been read-only; no usage-consuming turn or controlled real power-action test is claimed.

The requirements below also record product intent. Reusable profiles, project-specific defaults, arbitrary user-authored scheduled jobs, third-party/MCP integrations, reliable wake scheduling, and non-Windows disruptive power actions are not implemented in this alpha unless explicitly stated otherwise.

## Goals

1. Provide a first-class desktop GUI; normal use must not require a terminal.
2. Manage projects, jobs, sessions, retries, approvals, schedules, verification, and history.
3. Continue work across transient provider failures and usage-limit waits when safe and supported.
4. Make state observable: the user must know what the system is doing and why.
5. Preserve work across application restarts wherever the underlying provider supports continuation.
6. Verify completion with evidence rather than trusting a natural-language completion statement alone.
7. Support safe post-completion actions such as sleep, hibernate, restart, and shutdown.
8. Keep core orchestration provider-agnostic enough to survive changes in Codex integration surfaces.
9. Default to local storage and least privilege.
10. Be suitable for public use, contribution, and forking.
11. Discover the supported Codex CLI automatically and expose current account/usage state and local conversation history through read-only app-server calls.

## Non-goals for the initial release

- Replacing Codex itself.
- Building a general-purpose remote desktop or mouse/keyboard automation tool.
- Reading or modifying Codex's private GUI package data, bypassing its supported app-server interface, or taking ownership of its authentication.
- Circumventing provider usage limits, access controls, billing, or authentication.
- Automatically purchasing credits or changing account plans.
- Executing destructive power actions without explicit user configuration and safety checks.
- Guaranteeing wake-from-hibernate on hardware/OS combinations that do not reliably support it.
- Acting as a cloud multi-tenant service.

## Primary user journeys

### Start a job

The user selects a project folder, enters an objective, chooses the provider, configures optional verification, bounded retry behavior, and a completion power policy, then starts the job. A reusable profile picker is not part of the current UI.

The application persists the job before starting external work.

### Observe a job

The dashboard shows:

- current lifecycle state,
- project and objective,
- provider/session identity where available,
- elapsed time,
- normalized activity timeline,
- pending approvals or input,
- retry or resume schedule,
- verification status,
- completion action.

### Usage-limit wait and resume

When the provider indicates work cannot continue due to a usage/budget limit:

- the job moves to a dedicated waiting state,
- the reason is retained,
- a reset/retry time is recorded if reliably available,
- otherwise a bounded fallback retry policy is used,
- the user can cancel, pause, edit policy, or request a manual retry,
- automatic continuation resumes the same durable objective/session where supported.

The product must not claim to bypass a limit; it waits until the provider permits continued work.

### Crash/restart recovery

On application start:

- unfinished durable jobs are loaded,
- impossible/transient states are reconciled,
- stale local child-process assumptions are discarded,
- resumable jobs are recovered conservatively,
- uncertain jobs are surfaced for review rather than silently duplicated.

### Verification

Before a job is considered successfully complete, configured checks run and their output/exit status is recorded.

A job may finish as:

- completed + verified,
- completed + verification failed,
- failed,
- cancelled,
- needs human review.

### Post-completion power action

If configured, a disruptive power action is eligible only after successful verification and safety guards. A visible countdown allows cancellation. Execution and cancellation are audited.

## Functional requirements

### Projects

- Add/remove projects without deleting project files.
- Normalize and validate paths.
- Store per-project defaults.
- Detect missing or moved project paths.
- Never silently operate outside the selected project root unless explicitly allowed.

### Jobs

- Create, queue, start, pause, resume, interrupt, cancel, retry, and archive jobs.
- Retain original objective separately from generated continuation prompts.
- Support one or more active jobs subject to configurable concurrency.
- Keep retry counts and policies bounded.
- Allow user notes/tags without changing provider prompts.

### Sessions

- Associate jobs with provider sessions/threads where available.
- Resume durable sessions rather than starting duplicate work.
- Treat provider identifiers as opaque values.
- Keep a normalized event history independent of provider-specific payloads.
- Make the local Codex thread index available as a read-only view; read selected thread turns on demand without resuming the thread or persisting its transcript in Orchestrator's database.

### Codex discovery and account data

- Discover and version-check the supported Codex CLI without requiring users to browse for a GUI executable.
- Read available account/plan, rate-limit, and token-activity summaries without forcing token refresh or changing account state.
- Paginate active and archived local Codex thread history through app-server, using state-database-only listing to avoid optional scan-and-repair side effects.
- Omit email and credential material. Bound returned index/transcript payloads and indicate when a safety bound truncates results.

### Approvals and user input

- Surface provider approval requests immediately.
- Never auto-approve high-impact actions unless an explicit policy safely allows that category.
- Persist pending approval metadata without persisting sensitive transient content unnecessarily.
- Pause unattended continuation when human input is truly required.

### Scheduling and retry

- Use persisted schedules rather than in-memory timers alone.
- Recompute overdue schedules after restart.
- Store the source and confidence of a retry time: provider-structured, parsed/estimated, user-specified, or fallback.
- Apply jitter/backoff where appropriate.
- Prevent tight retry loops.

### Verification

Configurable checks may include:

- test command,
- typecheck,
- lint,
- build,
- custom command,
- git status/diff inspection,
- provider-reported task completion,
- absence of pending approvals/errors.

Verification commands must be explicit and visible to the user.

### Notifications

Notify on meaningful transitions such as:

- needs approval/input,
- rate-limit wait,
- resumed,
- verification failed,
- completed,
- failed,
- power-action countdown.

Notification behavior must be configurable.

### Logs and diagnostics

- Structured application logs.
- Human-readable job timeline.
- Log levels.
- Redaction of secrets.
- Exportable diagnostic bundle that excludes secrets by default.

## Non-functional requirements

### Reliability

- Durable jobs survive application restart.
- State transitions are explicit and testable.
- External side effects occur only after required state has been persisted.
- Duplicate resume/start operations are prevented.

### Security

- Electron renderer has no direct Node access.
- Context isolation is enabled.
- IPC is narrow and validated.
- Remote content is unprivileged.
- Credentials are not stored in the project database.

### Accessibility

- Keyboard-operable primary workflows.
- Accessible names and focus states.
- Status is communicated by text/icon as well as color.
- Reasonable contrast at normal display scaling.

### Performance

The UI should remain responsive while provider events and logs stream. Large histories should use bounded rendering/pagination/virtualization where necessary.

### Portability

Architecture must isolate OS-specific behavior. Initial implementation should prioritize Windows reliability while preserving macOS/Linux interfaces and explicit unsupported states.

## Definition of done for v0.1

The first usable release is complete when a user can:

1. install and open the desktop app,
2. register a project,
3. automatically detect the local Codex CLI and inspect current read-only account/history data,
4. start a Codex job from the GUI,
5. watch normalized progress,
6. restart the app without losing durable job state,
7. handle at least pause/cancel/approval/failure/wait states correctly,
8. resume a provider session where supported,
9. run configured verification,
10. optionally execute a guarded, cancellable post-completion power action,
11. inspect logs/history,
12. complete the workflow without opening a command prompt for normal operation.
