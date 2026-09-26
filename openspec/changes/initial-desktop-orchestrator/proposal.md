# Proposal: Initial Desktop Orchestrator

## Why

Codex Orchestrator needs a complete first implementation that can manage durable Codex work from a graphical desktop application without requiring normal users to operate a terminal. Long-running work must remain observable, recover safely from expected interruptions, verify completion with evidence, and optionally perform carefully guarded system power actions.

## Goals

- Deliver a usable Electron + Vue 3 + TypeScript desktop application.
- Connect programmatically to local Codex through a provider abstraction, with Codex app-server as the primary provider.
- Automatically discover and validate the supported Codex CLI executable; never treat the ChatGPT desktop GUI executable as the app-server binary.
- Read and present connected Codex account state, current usage/limit summaries, and existing local Codex thread history through app-server without taking ownership of authentication.
- Surface discovered Codex workspaces and conversations in Projects, Jobs, Dashboard, and Activity, with an explicit path to continue an existing conversation as a durable job.
- Show the exact continuation destination and open saved conversations in ChatGPT desktop through the documented thread deep link, without sending a prompt or automating the UI.
- Persist projects, jobs, attempts, sessions, schedules, events, settings, approvals, and verification evidence in SQLite.
- Implement explicit lifecycle, retry, usage-limit waiting, resume, crash-recovery, and approval/input states.
- Provide a professional, restrained, accessible desktop UI.
- Verify candidate completion before declaring success.
- Persist process-launch failures as verification evidence and allow verification-only retry without repeating provider work.
- Support safe, opt-in sleep/hibernate/shutdown/restart behavior after verified completion.
- Make normal operation GUI-first with no command prompt requirement.

## Non-goals

- Bypassing Codex/OpenAI usage limits, authentication, access controls, billing, or safety policies.
- Automating the Codex UI through screen scraping, mouse movement, or synthetic keystrokes.
- Building a cloud multi-tenant orchestration service.
- Guaranteeing automatic wake from sleep/hibernate on unsupported hardware or OS configurations.
- Creating an unrestricted generic shell executor in the renderer.

## What Changes

This change introduces the entire initial desktop application foundation: Electron process boundaries, Vue UI, provider integration and discovery, read-only access to existing Codex account/usage/history data, cross-screen workspace and conversation projections, explicit adoption of a stored conversation for new work, orchestration state machines, durable persistence, scheduler/recovery, verification, notifications/diagnostics, and platform power adapters.

## Capabilities

- **desktop-shell** — secure Electron application shell and typed renderer/main boundary.
- **codex-provider** — automatic Codex CLI discovery/validation, app-server process lifecycle, protocol adaptation, session control, approvals, normalized provider events, and read-only account/usage/thread-history access.
- **orchestration-lifecycle** — project/job/attempt/session lifecycle, queueing, pause/resume/cancel, concurrency, and state transitions.
- **retry-scheduling** — bounded retries, usage-limit waits, persisted schedules, and continuation policy.
- **verification** — configurable evidence-based completion checks.
- **persistence-recovery** — SQLite schema/migrations, restart recovery, and durable event/history state.
- **power-management** — capability-aware sleep prevention and guarded post-completion power actions.
- **security-boundaries** — Electron hardening, IPC validation, command/process safety, and log redaction.
- **operator-ui** — professional desktop screens, accessible workflows, status/timeline presentation, current Codex history/account visibility, and settings.
- **notifications-diagnostics** — meaningful notifications, structured logs, diagnostics, and safe export.

## Risks

- Codex app-server protocol/capabilities may evolve; provider isolation and compatibility tests are required.
- Per-user Codex CLI install locations can vary; discovery must validate CLI identity and fail safely instead of launching the ChatGPT desktop GUI executable.
- Existing Codex conversations can contain sensitive prompts and repository data; history access remains read-only and imported transcripts are not copied into the orchestrator database by default.
- OS power behavior differs across platforms; unsupported behavior must fail clearly and safely.
- Unattended retries can create duplicate work if recovery is not idempotent.
- Verification commands can be dangerous if treated as arbitrary hidden shell execution; they must be explicit and controlled.
- A desktop renderer compromise could become severe if Electron privilege boundaries are weak.

## Impact

The repository moves from specification-only foundation to a working desktop application. This change establishes the initial persisted data model and therefore requires explicit migrations from the first schema onward. Existing Codex account summaries, usage/limit data, and thread history are read through the supported local app-server and presented with clear ownership labels across the relevant views. A user can explicitly continue an eligible stored conversation as a durable job on the same provider thread; browsing alone never starts work. Authentication secrets and source app-server files remain provider-owned. It also establishes public UI and provider contracts that future changes should evolve through OpenSpec.
