# Roadmap

This roadmap describes direction, not a guarantee of release dates.

## Phase 0 — Specification foundation

- [x] Public repository foundation
- [x] Product requirements
- [x] Architecture and security model
- [x] OpenSpec initial implementation change
- [x] Contribution and release policy
- [ ] OpenSpec-generated Codex skills committed/refreshed by the implementation agent

## Phase 1 — Desktop foundation

- Electron + Vue 3 + TypeScript application shell
- secure preload bridge and typed IPC
- local settings and SQLite persistence
- project registry
- task creation and queue
- activity timeline and diagnostics
- provider abstraction
- Codex app-server discovery, launch, health, and lifecycle

## Phase 2 — Durable orchestration

- persistent task/session state machine
- start, pause, resume, interrupt, cancel
- bounded retry policies
- rate-limit detection and scheduled continuation
- crash/restart recovery
- approval and user-input states
- verification policies and evidence
- notifications

## Phase 3 — System orchestration

- prevent-sleep while configured work is active
- safe post-completion actions
- sleep / hibernate / shutdown / restart capability detection
- cancellable countdown
- sibling-job and verification guards
- wake-timer research and supported-platform implementation where reliable

## Phase 4 — Multi-project productivity

- multiple concurrent/queued projects
- profiles and reusable policies
- job templates
- history search/filter/export
- per-project defaults
- richer Git/repository context
- optional integrations through MCP or provider adapters

## Phase 5 — Distribution and ecosystem

- signed installers
- automatic update strategy
- migration tooling
- localization readiness
- plugin/provider extension points
- documented extension SDK where justified
- stable public releases and compatibility matrix
