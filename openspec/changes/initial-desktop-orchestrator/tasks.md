# Tasks

## 1. Repository and toolchain

- [x] 1.1 Initialize OpenSpec Codex skills under `.agents/skills/` and validate this change strictly.
- [x] 1.2 Add maintained Electron, Vue 3, TypeScript, electron-vite, test, lint, formatting, schema-validation, and SQLite dependencies.
- [x] 1.3 Create functional development/build/typecheck/lint/test scripts and lockfile.
- [x] 1.4 Establish source/test directory structure and import boundaries.
- [x] 1.5 Add CI that runs safe non-destructive validation on supported runner(s).

## 2. Secure desktop shell

- [x] 2.1 Create Electron main/preload/renderer entry points.
- [x] 2.2 Enforce context isolation, disabled renderer Node integration, navigation/window restrictions, and CSP.
- [x] 2.3 Define typed preload API and shared IPC request/response/event contracts.
- [x] 2.4 Validate IPC payloads in main and test rejected invalid requests.
- [x] 2.5 Implement controlled external-link opening.

## 3. Persistence

- [x] 3.1 Select maintained SQLite driver compatible with Electron packaging.
- [x] 3.2 Create migration framework and initial schema for projects, jobs, attempts, sessions, events, schedules, approvals, verification, and settings.
- [x] 3.3 Implement repository interfaces and transactional state updates.
- [x] 3.4 Add migration and repository integration tests.
- [x] 3.5 Add retention/cleanup policy for large event/log histories without deleting active evidence.

## 4. Domain and orchestration lifecycle

- [x] 4.1 Implement normalized job states and legal transition table.
- [x] 4.2 Implement project registry and path validation.
- [x] 4.3 Implement job creation, queueing, start, pause, resume, interrupt, cancel, retry, and archive behaviors.
- [x] 4.4 Implement attempt tracking and provider-session association.
- [x] 4.5 Implement configurable global/per-project concurrency and duplicate-start guards.
- [x] 4.6 Add exhaustive transition/policy tests.

## 5. Codex provider

- [x] 5.1 Implement automatic Codex CLI discovery and version/capability probe; reject unsupported GUI launchers and verify fallback behavior with provider integration tests.
- [x] 5.2 Implement app-server child-process supervision and health lifecycle.
- [x] 5.3 Implement protocol transport/handshake according to current official documentation.
- [x] 5.4 Implement start/resume/interrupt and approval-response operations.
- [x] 5.5 Normalize provider events/errors into stable domain events.
- [x] 5.6 Implement authentication-required/disconnected/reconnect UX state without storing credentials.
- [x] 5.7 Create deterministic protocol fixtures/fake provider and integration tests.
- [x] 5.8 Document tested Codex compatibility.
- [x] 5.9 Remove manual executable selection and ignore stale `ChatGPT.exe` settings; verify automatic CLI discovery/fallback and actionable errors with integration tests.
- [x] 5.10 Read account/auth mode, plan, usage-limit, and token-activity summaries through supported read-only app-server calls; verify secrets are omitted and no mutating account endpoint is used.
- [x] 5.11 Synchronize every page of active and archived supported Codex thread sources up to the documented safe bound; verify cursor handling and provider failure isolation.
- [x] 5.12 Read and render a selected thread's bounded transcript view without resuming or mutating it; indicate truncation and verify transcript data is not persisted in the orchestrator database.
- [x] 5.13 Add fake app-server integration/E2E scenarios for invalid GUI executable fallback, account/limit/history display, and document supported discovery/history behavior.

## 6. Retry, limits, and scheduler

- [x] 6.1 Implement persisted schedule repository and scheduler with fake-clock tests.
- [x] 6.2 Implement bounded retry/backoff policy.
- [x] 6.3 Implement usage/rate-limit classification with confidence/source tracking.
- [x] 6.4 Prefer structured retry/reset metadata and add conservative fallback policy.
- [x] 6.5 Implement automatic continuation using the same provider session where supported.
- [x] 6.6 Prevent tight loops and enforce maximum automatic resume attempts.
- [x] 6.7 Reconcile overdue schedules safely after application restart.

## 7. Recovery

- [x] 7.1 Implement startup reconciliation for unfinished jobs.
- [x] 7.2 Prevent duplicate provider work after crash/restart.
- [x] 7.3 Add NEEDS_REVIEW outcomes for ambiguous recovery states.
- [x] 7.4 Add restart/crash recovery integration and E2E tests.

## 8. Approvals and input

- [x] 8.1 Persist/surface pending approval state safely.
- [x] 8.2 Implement approval UI and provider response path.
- [x] 8.3 Implement waiting-for-user-input state and resume path.
- [x] 8.4 Ensure unattended automation stops when a human decision is required.

## 9. Verification

- [x] 9.1 Implement completion policy model.
- [x] 9.2 Implement explicit test/typecheck/lint/build/custom verification checks.
- [x] 9.3 Execute verification through safe main-process process APIs with visible configuration.
- [x] 9.4 Persist bounded verification evidence and results.
- [x] 9.5 Block successful terminal completion/power action when required verification fails.
- [x] 9.6 Add verification policy tests.

## 10. Power management

- [x] 10.1 Implement platform-neutral PowerAdapter and fake adapter.
- [x] 10.2 Implement capability reporting and prevent-sleep lifecycle.
- [x] 10.3 Implement supported Windows sleep/hibernate/shutdown/restart adapter behavior first.
- [x] 10.4 Add guarded eligibility engine and sibling-job protection.
- [x] 10.5 Implement persisted visible cancellable countdown with final re-check.
- [x] 10.6 Ensure real power actions cannot run in automated tests.
- [x] 10.7 Research/document macOS/Linux adapters and implement only verified behavior.
- [x] 10.8 Treat wake timers as separate capability and never claim unsupported guarantees.

## 11. Operator UI

- [x] 11.1 Build application shell/navigation and shared design tokens/components.
- [x] 11.2 Build Dashboard with connection and actionable job summaries.
- [x] 11.3 Build Projects management.
- [x] 11.4 Build New Job flow with progressive advanced settings.
- [x] 11.5 Build Job Detail with timeline, approvals, schedule, verification, and completion policy.
- [x] 11.6 Build History/Sessions and Activity views.
- [x] 11.7 Build Automations/power-policy UI.
- [x] 11.8 Build Settings including Codex connection diagnostics.
- [x] 11.9 Add empty/error/loading states and keyboard/accessibility behavior.
- [x] 11.10 Keep visual design restrained; no rainbow palette, gratuitous gradients, or excessive animation.

## 12. Notifications, logs, and diagnostics

- [x] 12.1 Implement structured redacted application logging.
- [x] 12.2 Implement meaningful OS notifications with user settings.
- [x] 12.3 Implement diagnostic view and redacted export bundle.
- [x] 12.4 Test token/environment/source-content redaction boundaries.

## 13. Quality and release readiness

- [x] 13.1 Add E2E coverage for critical fake-provider workflows.
- [x] 13.2 Run and pass typecheck, lint, unit/integration tests, E2E, and production build.
- [x] 13.3 Run strict OpenSpec validation and reconcile implementation against every scenario.
- [x] 13.4 Complete security checklist and Electron hardening review.
- [x] 13.5 Perform explicit manual real-Codex initialize/auth/account-read smoke test without starting a usage-consuming turn.
- [ ] 13.6 Perform explicit manual power-action tests only on a controlled test machine.
  - Blocked in this environment: no controlled sacrificial test machine is available, and development/test runs are required to use `FakePowerAdapter`. No real power command was executed.
- [x] 13.7 Update README, architecture/development docs, compatibility notes, and CHANGELOG.
- [x] 13.8 Produce installable `0.1.0-alpha.0` artifact and document known limitations.

## 14. Connected workspace correction and alpha update

- [x] 14.1 Project real Codex `cwd`, project, source, model, and runtime metadata through the provider contract with fixture and read-only compatibility coverage.
- [x] 14.2 Load account and thread data in the background at startup and refresh it across all connected views without blocking local durable state.
- [x] 14.3 Show discovered Codex workspaces in Projects with a validated one-click registration action and clear provider ownership.
- [x] 14.4 Show existing Codex conversations in Jobs, Dashboard, and Activity with accurate status/source labels and links to their history.
- [x] 14.5 Allow an explicit user continuation of an eligible existing thread as one durable job on the same session, with duplicate, archived, path, and active-work guards.
- [x] 14.6 Default new jobs to Codex, make the Automations scope truthful, and add deterministic end-to-end coverage for populated connected views and continuation.
- [x] 14.7 Bump to `0.1.0-alpha.1`, update public documentation and changelog, validate/package the Windows installer and portable executable, and audit the repository before publication.

## 15. Real-workflow correction from official OpenAI documentation

- [x] 15.1 Make new versus existing conversation targeting explicit, including a direct History continuation workflow and visible destination identity.
- [x] 15.2 Add a narrow validated Open in ChatGPT desktop action using the officially documented thread deep link, with security tests.
- [x] 15.3 Replace token-per-event timeline noise with authoritative completed message entries and test normalization.
- [x] 15.4 Fix safe Windows npm verification launch and persist synchronous launch failures; test failure states, active-check cancellation guards, and verification-only retry without a provider turn.
- [x] 15.5 Update documentation and CHANGELOG, bump to alpha.2, pass quality gates, and produce updated Windows artifacts. Do not claim controlled real-power validation.
