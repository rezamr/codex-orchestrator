# Tasks

- [x] 1.1 Verify current official OpenAI guidance and installed Codex app-server schema for completion events, resume, per-turn model/effort, and output schemas.
- [x] 1.2 Define goals, non-goals, risks, lifecycle, persistence, security, recovery, and test strategy in OpenSpec.
- [x] 2.1 Add domain types, validation, and state-machine behavior for controller jobs, delegated children, `WAITING_FOR_CHILD`, decisions, and result packets.
- [x] 2.2 Add migration 4 and transactional repositories for routing metadata and delegations.
- [x] 2.3 Extend provider-neutral and Codex adapters with verified model, effort, and output-schema fields.
- [x] 2.4 Implement controller decision parsing, atomic dispatch, parent runtime teardown, child settlement, and one-shot result-driven parent resume.
- [x] 2.5 Implement concurrency reservation and conservative restart reconciliation without polling.
- [x] 2.6 Add explicit controller-job controls and delegation visibility to the accessible renderer UI.
- [x] 3.1 Add unit tests for schemas, bounded packets, and state transitions.
- [x] 3.2 Add migration/repository integration tests, including representative schema-3 upgrade and persistence across reopen.
- [x] 3.3 Add provider tests for exact `turn/start` routing fields and notification-driven completion.
- [x] 3.4 Add orchestration integration tests proving zero parent provider activity while a child runs and exactly one resume for completed, blocked, failed, and restart cases.
- [x] 3.5 Add or update Electron E2E coverage for controller creation, waiting state, and child relationship visibility.
- [x] 4.1 Update README, architecture, Codex integration, product requirements, roadmap, security model, and changelog/release notes.
- [x] 4.2 Perform accessibility and security review of new controls, stored packets, renderer projections, and approval behavior.
- [x] 4.3 Run strict OpenSpec validation, typecheck, lint, format check, unit/integration tests, Electron E2E, production build, and packaging checks.
- [x] 4.4 Run `graphify update .` when the repository Graphify CLI is available; otherwise record the unavailable tool without fabricating graph output.
- [x] 5.1 Add the immutable agent-profile registry and application-owned Luna/Sol routing policy.
- [x] 5.2 Persist orchestration/attempt identifiers, risk classification, policy outcome, escalation, lifecycle audit, dormancy counters, and usage observations.
- [x] 5.3 Enforce fail-closed parent dormancy, one project writer, and independent QA certification.
- [x] 5.4 Keep parents dormant during child rate-limit/human waits and preserve uncertain active children without duplicate restart work.
- [x] 5.5 Add deterministic coverage for the ten mandated routing, dormancy, recovery, and malformed-result scenarios.
- [x] 5.6 Update UI and documentation with profile, audit, observability, and the exact zero-turn guarantee.
- [x] 5.7 Re-run strict OpenSpec, typecheck, lint, format, unit/integration, E2E, build, packaging, and dependency audit.

Graphify note: `graphify-out/graph.json` and the `graphify` executable were unavailable in this repository/workstation, so no graph output was generated or claimed.
