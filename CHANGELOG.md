# Changelog

All notable user-facing changes are recorded here. The project follows Semantic Versioning after its first stable release.

## [0.1.0-alpha.2] - 2026-09-25

### Fixed

- Fix Windows `spawn EINVAL` during npm verification: resolve native Node and npm's CLI instead of executing a `.cmd` file with `execFile`. Resolution and synchronous launch errors now persist failed evidence and leave Verifying safely.
- Add **Rerun checks only** for completed provider attempts, without repeating a Codex turn. Recover interrupted verification runs as failed evidence and reject duplicate runs.
- Reject cancellation during active checks so workspace/concurrency protection is not released prematurely; the interface explains the bounded wait.
- Replace token-by-token audit noise with authoritative completed agent messages.

### Changed

- Make new versus existing conversation targeting explicit, display the exact destination, and allow continuation directly from History. A new job saying “please continue” does not inherit another conversation's history.
- Add **Open in ChatGPT** using the official OpenAI desktop thread deep link through a narrow, validated IPC operation. This opens the saved conversation but does not send a prompt or automate the UI.
- Bump installer and portable application version to `0.1.0-alpha.2`; database schema remains version 3 with no data reset or new migration.
- Add regression coverage for native npm launch, synchronous launch errors, checks-only retry/recovery, literal process arguments, continuation targeting, and desktop-link security.
- Validation: strict OpenSpec, typecheck, lint, formatting, 55 unit/integration tests, 9 fake-provider/fake-power Electron E2E scenarios, production build, and Windows NSIS/portable packaging passed. The separate opt-in installed-Codex read-only test also passed; npm audit reported zero vulnerabilities. Installer execution and real desktop navigation remain manual checks.

### Limitations

- Desktop-link tests intercept OS launch; actual ChatGPT navigation remains a manual smoke check. Cross-client live refresh and exclusive ownership are not guaranteed.
- A reported real turn exposed the Windows verification bug; it is not evidence that the complete controlled real-Codex release checklist passed. Real power-action validation remains outstanding and artifacts remain unsigned.

## [0.1.0-alpha.1] - 2026-09-25

### Changed

- Load Codex account and conversation summaries at startup and refresh them across Dashboard, Projects, Jobs, Activity, History, and Settings instead of confining the data to Settings and History.
- Discover Codex workspaces from conversation working folders, with explicit validated registration; show existing conversations in Jobs and accurate source/model/workspace metadata in History.
- Add an explicit **Continue** flow that attaches an eligible existing conversation to a durable job using its original session ID. Browsing remains read-only; duplicate, archived, active, and missing-workspace guards apply.
- Default newly created jobs to Codex app-server; retain the deterministic simulated provider for development and testing. Clarify that Automations lists only Orchestrator-managed schedules because Codex desktop automation listing is not exposed by the supported app-server API.
- Add populated-view and same-session continuation coverage to integration and Electron E2E tests. The E2E runtime forces fake provider and power adapters, even if a test selects Codex accidentally.
- Correct an initial alpha.1 E2E safety regression: the changed default briefly let one test initiate a real Codex turn. That run timed out and the test app closed; usage impact is unknown. The harness now forces the fake provider for all E2E provider requests.
- Bump installer and portable app version to `0.1.0-alpha.1` for in-place upgrade identification.

### Limitations

- Live Codex validation remains read-only; a usage-consuming continuation has not been manually tested. External Codex clients can change a conversation after a read, so concurrent activity outside Orchestrator cannot be ruled out by its local session lock alone.
- Real power actions still require controlled manual validation; unsigned artifacts remain for early testers only.

## [0.1.0-alpha.0] - 2026-09-25

### Added

- Electron desktop application with a Vue 3 + TypeScript interface for projects, durable jobs, activity, history, schedules, settings, and diagnostics.
- Codex app-server provider with automatic Codex CLI discovery and version checking; users no longer browse for or launch the ChatGPT desktop executable.
- Read-only account mode, plan, usage/rate-limit summaries, and paginated active/archived Codex thread history. A selected thread is read without resuming it, and transcript content is not copied into the orchestration database.
- Provider abstraction, deterministic fake provider, explicit job/attempt/session lifecycle, approval and input waits, bounded retries, persisted schedules, and crash/restart recovery.
- Verification checks and retained evidence, structured/redacted logs, desktop notifications, and redacted diagnostic export.
- Guarded, cancellable post-completion power-action countdowns and sleep prevention behind platform adapters; development and tests use simulated power behavior.
- SQLite migrations, Windows CI, Electron E2E tests, Windows NSIS and portable packaging targets, and OpenSpec specs/tasks.

### Security

- Removed user-selected executable paths and added a migration that clears the obsolete stored `ChatGPT.exe` override.
- Renderer privileges remain limited to a narrow validated IPC bridge. Credentials stay with Codex; account email, tokens, cookies, and raw provider payloads are not exposed or stored by Orchestrator.
- Codex history list calls use state-database-only reads; viewing a transcript does not resume or mutate a conversation.
- Automated tests never execute real machine sleep, hibernate, restart, or shutdown actions.

### Reliability

- Durable lifecycle records, bounded retry/resume policy, same-session continuation where supported, duplicate-work protection, and conservative recovery states.
- Provider history pagination and transcript payloads have explicit bounds; the UI signals when the history index reaches its configured bound.
- Current verified checks include strict OpenSpec validation, TypeScript typecheck, lint, unit/integration tests, Electron E2E tests, migration tests, production build, and an opt-in read-only live app-server compatibility test.

### Packaging

- Electron-builder configuration for Windows NSIS installer and portable executable, plus macOS DMG and Linux AppImage targets. Windows is the current CI platform. Artifacts are unsigned in this alpha.

### Known limitations

- The current OpenSpec change remains open for controlled manual power-action testing on a sacrificial machine (task 13.6). No real power action has been executed in development or automated tests.
- Windows native sleep/hibernate/shutdown/restart actions are implemented but not manually validated; disruptive actions are disabled by default. macOS/Linux disruptive actions and automatic wake scheduling are unsupported.
- No controlled usage-consuming Codex engineering turn has been tested. Live Codex checks are read-only and do not bypass provider limits or authentication.
- Current CI runs on Windows; package targets for macOS/Linux are not represented as validated platforms. Packages are unsigned and database downgrade is unsupported.

## Release policy

Every release must document user-visible changes, migration notes, known limitations, and security-impacting behavior. Do not mark the real power-action gate complete until the controlled manual checklist is performed.
