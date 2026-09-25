# Tasks

## 1. Repository and toolchain

- [ ] 1.1 Initialize OpenSpec Codex skills under `.agents/skills/` and validate this change strictly.
- [ ] 1.2 Add maintained Electron, Vue 3, TypeScript, electron-vite, test, lint, formatting, schema-validation, and SQLite dependencies.
- [ ] 1.3 Create functional development/build/typecheck/lint/test scripts and lockfile.
- [ ] 1.4 Establish source/test directory structure and import boundaries.
- [ ] 1.5 Add CI that runs safe non-destructive validation on supported runner(s).

## 2. Secure desktop shell

- [ ] 2.1 Create Electron main/preload/renderer entry points.
- [ ] 2.2 Enforce context isolation, disabled renderer Node integration, navigation/window restrictions, and CSP.
- [ ] 2.3 Define typed preload API and shared IPC request/response/event contracts.
- [ ] 2.4 Validate IPC payloads in main and test rejected invalid requests.
- [ ] 2.5 Implement controlled external-link opening.

## 3. Persistence

- [ ] 3.1 Select maintained SQLite driver compatible with Electron packaging.
- [ ] 3.2 Create migration framework and initial schema for projects, jobs, attempts, sessions, events, schedules, approvals, verification, and settings.
- [ ] 3.3 Implement repository interfaces and transactional state updates.
- [ ] 3.4 Add migration and repository integration tests.
- [ ] 3.5 Add retention/cleanup policy for large event/log histories without deleting active evidence.

## 4. Domain and orchestration lifecycle

- [ ] 4.1 Implement normalized job states and legal transition table.
- [ ] 4.2 Implement project registry and path validation.
- [ ] 4.3 Implement job creation, queueing, start, pause, resume, interrupt, cancel, retry, and archive behaviors.
- [ ] 4.4 Implement attempt tracking and provider-session association.
- [ ] 4.5 Implement configurable global/per-project concurrency and duplicate-start guards.
- [ ] 4.6 Add exhaustive transition/policy tests.

## 5. Codex provider

- [ ] 5.1 Implement Codex executable discovery/manual selection and version/capability probe.
- [ ] 5.2 Implement app-server child-process supervision and health lifecycle.
- [ ] 5.3 Implement protocol transport/handshake according to current official documentation.
- [ ] 5.4 Implement start/resume/interrupt and approval-response operations.
- [ ] 5.5 Normalize provider events/errors into stable domain events.
- [ ] 5.6 Implement authentication-required/disconnected/reconnect UX state without storing credentials.
- [ ] 5.7 Create deterministic protocol fixtures/fake provider and integration tests.
- [ ] 5.8 Document tested Codex compatibility.

## 6. Retry, limits, and scheduler

- [ ] 6.1 Implement persisted schedule repository and scheduler with fake-clock tests.
- [ ] 6.2 Implement bounded retry/backoff policy.
- [ ] 6.3 Implement usage/rate-limit classification with confidence/source tracking.
- [ ] 6.4 Prefer structured retry/reset metadata and add conservative fallback policy.
- [ ] 6.5 Implement automatic continuation using the same provider session where supported.
- [ ] 6.6 Prevent tight loops and enforce maximum automatic resume attempts.
- [ ] 6.7 Reconcile overdue schedules safely after application restart.

## 7. Recovery

- [ ] 7.1 Implement startup reconciliation for unfinished jobs.
- [ ] 7.2 Prevent duplicate provider work after crash/restart.
- [ ] 7.3 Add NEEDS_REVIEW outcomes for ambiguous recovery states.
- [ ] 7.4 Add restart/crash recovery integration and E2E tests.

## 8. Approvals and input

- [ ] 8.1 Persist/surface pending approval state safely.
- [ ] 8.2 Implement approval UI and provider response path.
- [ ] 8.3 Implement waiting-for-user-input state and resume path.
- [ ] 8.4 Ensure unattended automation stops when a human decision is required.

## 9. Verification

- [ ] 9.1 Implement completion policy model.
- [ ] 9.2 Implement explicit test/typecheck/lint/build/custom verification checks.
- [ ] 9.3 Execute verification through safe main-process process APIs with visible configuration.
- [ ] 9.4 Persist bounded verification evidence and results.
- [ ] 9.5 Block successful terminal completion/power action when required verification fails.
- [ ] 9.6 Add verification policy tests.

## 10. Power management

- [ ] 10.1 Implement platform-neutral PowerAdapter and fake adapter.
- [ ] 10.2 Implement capability reporting and prevent-sleep lifecycle.
- [ ] 10.3 Implement supported Windows sleep/hibernate/shutdown/restart adapter behavior first.
- [ ] 10.4 Add guarded eligibility engine and sibling-job protection.
- [ ] 10.5 Implement persisted visible cancellable countdown with final re-check.
- [ ] 10.6 Ensure real power actions cannot run in automated tests.
- [ ] 10.7 Research/document macOS/Linux adapters and implement only verified behavior.
- [ ] 10.8 Treat wake timers as separate capability and never claim unsupported guarantees.

## 11. Operator UI

- [ ] 11.1 Build application shell/navigation and shared design tokens/components.
- [ ] 11.2 Build Dashboard with connection and actionable job summaries.
- [ ] 11.3 Build Projects management.
- [ ] 11.4 Build New Job flow with progressive advanced settings.
- [ ] 11.5 Build Job Detail with timeline, approvals, schedule, verification, and completion policy.
- [ ] 11.6 Build History/Sessions and Activity views.
- [ ] 11.7 Build Automations/power-policy UI.
- [ ] 11.8 Build Settings including Codex connection diagnostics.
- [ ] 11.9 Add empty/error/loading states and keyboard/accessibility behavior.
- [ ] 11.10 Keep visual design restrained; no rainbow palette, gratuitous gradients, or excessive animation.

## 12. Notifications, logs, and diagnostics

- [ ] 12.1 Implement structured redacted application logging.
- [ ] 12.2 Implement meaningful OS notifications with user settings.
- [ ] 12.3 Implement diagnostic view and redacted export bundle.
- [ ] 12.4 Test token/environment/source-content redaction boundaries.

## 13. Quality and release readiness

- [ ] 13.1 Add E2E coverage for critical fake-provider workflows.
- [ ] 13.2 Run and pass typecheck, lint, unit/integration tests, E2E, and production build.
- [ ] 13.3 Run strict OpenSpec validation and reconcile implementation against every scenario.
- [ ] 13.4 Complete security checklist and Electron hardening review.
- [ ] 13.5 Perform explicit manual real-Codex smoke test.
- [ ] 13.6 Perform explicit manual power-action tests only on a controlled test machine.
- [ ] 13.7 Update README, architecture/development docs, compatibility notes, and CHANGELOG.
- [ ] 13.8 Produce installable pre-alpha artifact and document known limitations.
