# Codex Master Implementation Prompt

Use this prompt in Codex from the repository root after reviewing the repository documentation.

---

You are responsible for implementing **Codex Orchestrator** completely and professionally from the specification already present in this repository.

This is not a prototype exercise and not a one-file demo. Treat it as a public open-source desktop product that other developers will inspect, use, fork, and contribute to.

## Mandatory workflow

1. Read `AGENTS.md`, `README.md`, all relevant files under `docs/`, and the entire active OpenSpec change:
   `openspec/changes/initial-desktop-orchestrator/`.
2. Use OpenSpec as the source of truth. Do not bypass, replace, or casually reinterpret the existing proposal, delta specs, design, or tasks.
3. Ensure OpenSpec is initialized for Codex. If the generated Codex skills are missing, run:
   `npm run openspec:init`
   and follow the current OpenSpec/Codex workflow. Codex uses the `.agents/skills/` OpenSpec skills.
4. Before substantive implementation, run strict validation:
   `npx -y @fission-ai/openspec@latest validate initial-desktop-orchestrator --strict --no-interactive`
   Fix specification-structure problems before writing around them.
5. Apply the active change systematically. Use `$openspec-apply-change` when available. Otherwise follow the same OpenSpec artifacts and task order manually; do not invent a parallel plan.
6. Keep `tasks.md` accurate as work progresses.
7. If implementation reveals a real requirement/design conflict, update the OpenSpec artifacts first, keep them coherent, validate again, and then continue.
8. Do not archive the change until every required scenario and quality gate is verified.

## Product to build

Build a polished cross-platform desktop application using:

- Electron
- Vue 3
- TypeScript
- electron-vite or an equally appropriate maintained Electron/Vite integration
- SQLite with explicit migrations
- a maintained schema-validation library for IPC/config boundaries
- a serious automated testing stack suitable for Electron

Select current stable, actively maintained package versions that are mutually compatible. Verify current official documentation instead of guessing APIs that may have changed.

The primary agent integration is **Codex app-server**, isolated behind a provider-neutral interface. Use the current official OpenAI Codex documentation for the actual protocol and lifecycle. Do not automate the Codex GUI. Do not use mouse/keyboard simulation or screen scraping as the integration.

Do not persist OpenAI/ChatGPT credentials in the application database. Prefer supported existing Codex authentication.

## Required architecture

Maintain strict separation among:

- Vue renderer
- typed preload bridge
- Electron main process
- provider-neutral orchestration domain/application layer
- Codex provider adapter
- SQLite persistence
- scheduler/recovery
- verification engine
- OS/platform adapters
- power management
- notifications/logging/diagnostics

Do not expose generic shell, filesystem, process, database, or power APIs to the renderer.

The renderer must use context isolation and must not have direct Node.js integration.

Treat IPC payloads as untrusted and validate them in main.

Raw Codex app-server messages must be normalized before becoming domain state or renderer state.

## Durable orchestration

Implement the job lifecycle as an explicit tested state machine.

A durable Job is not the same thing as an execution Attempt. A job can span several attempts because of resume, limit waits, transient errors, or restarts.

Persist all important lifecycle state before externally visible/irreversible actions.

Implement:
- projects,
- jobs,
- queue,
- attempts,
- provider sessions,
- events/timeline,
- schedules,
- approvals,
- verification runs,
- settings/profiles needed by the specified UI,
- concurrency and duplicate-start protection.

Use UTC internally for durable timestamps and format in the UI for the user's locale.

## Codex connection

Implement:
- executable discovery and manual path selection,
- version/capability probing,
- app-server process supervision,
- protocol initialization using current official documentation,
- start/resume/interrupt,
- streaming event handling,
- approval requests and responses,
- health/disconnect/reconnect handling,
- stable normalized event mapping,
- deterministic fake/fixture provider for tests.

Do not tightly couple the rest of the program to app-server JSON-RPC details.

If app-server behavior/version has changed from the documentation written in this repo, adapt the provider implementation to the current official interface while preserving the product requirements.

## Limit and retry behavior

Do not try to bypass provider limits.

When a usage/rate limit prevents work:
- enter the dedicated waiting state,
- record the evidence,
- prefer structured reset/retry metadata if officially exposed,
- otherwise use conservative documented/parsed evidence,
- otherwise use a bounded configured fallback,
- persist the schedule,
- resume the same provider session/objective where supported,
- create a new Attempt for each resume,
- never loop forever.

Maximum automatic retries/resumes must be enforced.

A scheduled action must re-check current state before doing anything.

## Crash/restart recovery

On application restart:
- migrate/open the database,
- load unfinished jobs and due schedules,
- do not assume old child processes still exist,
- reconcile provider/session state conservatively,
- avoid duplicate work,
- automatically recover only where safe,
- otherwise enter a clear Needs Review state with an explanation.

Write deterministic recovery tests.

## Verification and completion

A provider saying “done” is only candidate completion when verification is configured.

Implement visible configurable checks for relevant:
- tests,
- typecheck,
- lint,
- build,
- custom command,
- git/repository status where useful.

Persist bounded/redacted evidence for verification results.

A required failed check prevents verified success.

A failed or incomplete verification prevents disruptive post-completion power actions.

## Power management

Implement power behavior behind platform adapters.

Support the conceptual operations specified in the repo:
- prevent sleep while protected work is active,
- sleep,
- hibernate,
- shutdown,
- restart,
- capability detection.

Windows reliability is the first priority, but preserve clean macOS/Linux interfaces and explicit unsupported behavior.

Never promise reliable wake from sleep/hibernate unless you can verify a supported platform mechanism.

Power actions require:
- explicit user opt-in,
- successfully completed job,
- required verification passed,
- no pending approval/input,
- no protected sibling job,
- no global prevent-power override,
- platform capability,
- visible cancellable countdown,
- final eligibility re-check,
- audit event.

**CRITICAL:** during development, tests, CI, and normal automated implementation work, use a fake/simulated power adapter. Do not actually sleep, hibernate, restart, or shut down the machine while implementing or testing this project.

## UI/UX quality bar

Build a real desktop product, not a developer-only dashboard.

Required areas:
- Dashboard
- Projects
- New Job
- Job Detail
- History / Sessions
- Activity
- Automations
- Settings / Codex connection diagnostics

Use progressive disclosure for advanced options.

The design must be calm, professional, restrained, and accessible:
- neutral surfaces,
- one restrained accent,
- semantic status colors only,
- strong typography and spacing,
- consistent components,
- meaningful icons,
- keyboard accessibility,
- good contrast,
- reduced-motion awareness.

Do **not** make it “AI colorful.”
No rainbow palette.
No gratuitous gradients.
No neon/gaming aesthetic.
No excessive glassmorphism.
No giant decorative KPI cards.
No fake terminal as the main interface.
No unnecessary animations.
Do not use color as the only status signal.

Operational information should be compact and clear.

Power-action UI must be especially explicit and impossible to confuse.

## Reliability and security

Follow `docs/security-model.md` and all security requirements in OpenSpec.

At minimum:
- contextIsolation enabled,
- renderer Node integration disabled,
- strict navigation/window policy,
- sensible CSP,
- validated narrow IPC,
- safe process spawning,
- log redaction,
- no secret persistence,
- controlled external links,
- explicit database migrations,
- no silent database reset,
- no hidden arbitrary shell execution.

Use typed errors and a useful error taxonomy rather than collapsing everything into a generic failure.

## Testing

Do not rely only on manual testing.

Implement:
- unit tests for state transitions and policy logic,
- scheduler tests with fake time,
- retry/limit tests,
- provider event normalization tests,
- persistence/migration integration tests,
- IPC validation tests,
- verification tests,
- power-policy tests with fake adapter,
- crash/restart recovery tests,
- critical Electron E2E flows with fake provider.

Real Codex connectivity may have a separate explicit smoke-test path. Automated CI must not require consuming a user's Codex allowance.

## Public repository quality

Keep the repository suitable for public contributors:
- clean module boundaries,
- meaningful names,
- no machine-specific absolute paths,
- no secrets,
- no generated junk,
- concise comments only where useful,
- README and docs match actual behavior,
- CHANGELOG reflects user-visible work,
- issue/PR templates remain accurate.

Do not delete or weaken existing documentation merely to fit an implementation shortcut.

## Definition of complete

Do not stop after scaffolding or after the UI appears.

The change is complete only after:
1. all required OpenSpec tasks are completed truthfully;
2. every delta-spec scenario is implemented or explicitly proven unsupported with the spec corrected first;
3. typecheck passes;
4. lint passes;
5. unit/integration tests pass;
6. relevant E2E tests pass;
7. production build succeeds;
8. strict OpenSpec validation passes;
9. the security checklist is reviewed;
10. docs and CHANGELOG are updated;
11. there are no known high-severity defects being hidden;
12. the application can execute the core GUI workflow end-to-end with fake provider/power adapters;
13. a clearly separated real-Codex smoke path is implemented/documented;
14. real power actions remain disabled during automated testing.

When you believe implementation is complete, audit the entire active OpenSpec change against the repository one requirement and scenario at a time. Fix discrepancies. Then provide a concise completion report with commands run, tests passed, remaining platform limitations, and any manual checks that still require a controlled user environment.

Work autonomously through the full active change. Do not stop merely because one subtask finishes. Stop only for a genuine external blocker that cannot be solved from the repository or official documentation, and document the exact blocker and safest next step.
