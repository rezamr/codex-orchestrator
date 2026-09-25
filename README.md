# Codex Orchestrator

Codex Orchestrator is an open-source, desktop-first control plane for durable, long-running Codex engineering work. It does not replace Codex: it manages the work around it—queues, sessions, interruptions, approvals, verification, recovery, and optional post-completion computer actions.

> **Status: `0.1.0-alpha.0`.** This is an early alpha for developers and testers. Core automated checks and a read-only live Codex app-server check pass. Real sleep/hibernate/restart/shutdown actions have not been manually tested and remain disabled by default.

Codex Orchestrator is an independent community project and is not an official OpenAI product. It is licensed under MIT; see [LICENSE](LICENSE).

## Why it exists

Engineering work can outlast a single Codex session or a person’s time at the computer. A task may encounter a usage limit, wait for approval, need a safe continuation after a restart, or require tests before it can be called complete. Codex Orchestrator provides a durable operational view for that work without screen scraping or simulated mouse and keyboard input.

It does not bypass Codex or OpenAI authentication, safety controls, billing, or usage limits. When a supported provider limit pauses work, the application waits according to provider state and the configured bounded retry policy; it resumes only when allowed and safe.

## What is implemented

- Electron desktop shell with a Vue 3 + TypeScript interface and a restrained, keyboard-accessible UI.
- Project registration and job creation, queueing, lifecycle controls, concurrency protection, and per-project exclusivity.
- Codex integration through a provider abstraction, with Codex app-server as the primary provider. The app automatically finds and version-checks the Codex CLI; users do not select the ChatGPT desktop executable. On Windows it checks the per-user Codex CLI installation location and then `PATH`; on macOS/Linux it resolves `codex` from `PATH`.
- Read-only account mode, plan, usage-limit, token-activity, and local thread history views using supported app-server methods. Active and archived threads are paginated; selecting a conversation reads its turns without resuming it. The thread index is bounded at 20,000 entries and the UI indicates if the bound is reached. Transcript contents are not copied into Orchestrator’s SQLite database.
- Provider start, resume, interrupt, approval handling, normalized activity, and usage-limit wait/continuation. Cancel acts on the orchestration job; it does not alter Codex account settings or limits.
- Durable SQLite state with numbered migrations for projects, jobs, attempts, session references, schedules, events, approvals, verification evidence, and settings.
- Crash/restart recovery, bounded retries and resumes, duplicate-work protection, and user-visible review states when recovery is uncertain.
- Configurable verification using test, typecheck, lint, build, custom, and Git-status checks. Completion is not treated as verified when required checks fail.
- Desktop notifications, structured/redacted logs, activity and history views, and redacted diagnostic export.
- Persisted retry/resume schedules and guarded post-completion power countdowns. The Automations screen currently shows these schedules; it is not a general-purpose cron/task authoring system.
- A fake provider and simulated power adapter for development, integration tests, and Electron E2E tests.
- Windows NSIS installer and portable targets, plus electron-builder configurations for macOS and Linux packaging.

## Typical workflow

1. Add a project folder and create a job with an objective.
2. Choose the Codex app-server or deterministic simulated provider.
3. Configure optional verification, bounded retry behavior, and any post-completion action. Power actions default to none.
4. Start the job and monitor its state and activity.
5. Respond to approval or input requests when needed.
6. If Codex reports a usage limit, let Orchestrator wait for provider-supported state and retry policy; the application does not evade the limit.
7. After continuation, run configured verification and inspect its retained evidence.
8. If a guarded post-completion power action was explicitly configured, review and cancel its visible countdown if needed.

The History & sessions screen separates local Codex conversations from Orchestrator jobs. Account/usage details are refreshed in Settings, and the local Codex thread index is read when history opens or is manually refreshed.

## Architecture

```text
Electron / Vue renderer
          │ narrow typed IPC
          ▼
Preload bridge ── validated schemas
          │
          ▼
Orchestration core ── SQLite + migrations
    │        │         ├─ persisted scheduler / recovery
    │        │         ├─ verification / approvals
    │        │         └─ notifications / diagnostics
    │
    ├── provider abstraction ── Codex app-server
    └── platform adapters ───── power / sleep prevention
```

Codex-specific JSON-RPC stays behind the provider boundary. The renderer cannot spawn processes, access SQLite, or invoke operating-system power operations directly. MCP may support future tools and integrations, but it is not the lifecycle control channel for starting, resuming, or monitoring Codex.

## Codex connection and local data

Install/sign in to Codex through its supported environment. Orchestrator detects the `codex` CLI and starts its documented app-server interface; it does not run `ChatGPT.exe`, inspect the protected Windows app package, or ask for a path. If the CLI cannot be found or launched, Settings reports an actionable status.

Connection checks use `account/read` without forcing token refresh and read available rate-limit and usage summaries. History uses paginated `thread/list` calls with state-database-only reads, then `thread/read` when a user opens a stored thread. Transcript display is bounded to 1,000 turns and 2 MB of projected text; the UI indicates when it is truncated. Email, tokens, cookies, and raw provider payloads are not exposed to the renderer or stored in Orchestrator’s database. The CLI/app-server remains responsible for authentication.

## Installation and development

### End users

Windows packaging is configured for an NSIS installer and a portable executable. Both are unsigned in this alpha; use artifacts only if you trust their source. macOS and Linux packaging targets exist but are not covered by the current Windows CI or platform power-action validation. See [release process](docs/release-process.md).

### Developers

Prerequisites: Node.js `^22.13.0` or `>=24`, npm, and Git. A local Codex installation is needed only to use or manually test the real provider; deterministic tests do not depend on a personal Codex account.

```bash
npm ci
npm run openspec:init  # when setting up OpenSpec Codex skills
npm run dev
```

Useful validation and packaging commands:

```bash
npm run openspec:validate
npm run typecheck
npm run lint
npm test
npm run test:e2e
npm run build
npm run package       # unpacked local package under release/
npm run package:win   # Windows NSIS installer and portable executable under release/
```

Normal user operation is GUI-first. OpenSpec and build commands are for maintainers, not required for running the installed desktop app. See [Development Guide](docs/development.md) and [Manual Testing](docs/manual-testing.md).

## Current validation and limitations

Validation on 2026-09-25: strict validation of the active OpenSpec change, TypeScript typecheck, lint, 37 unit/integration tests, 5 Electron E2E scenarios, production build, Windows NSIS/portable packaging, and a live read-only app-server compatibility test pass. One additional opt-in live test is skipped in the default suite. Migration tests cover schema upgrades and removal of the obsolete manual executable setting. `npm audit` against the official npm registry reported zero known vulnerabilities at that time; audit results are time-sensitive.

The active OpenSpec change has **84 of 85 tasks complete**. The one intentionally unfinished task is **13.6, controlled manual testing of real power actions on a sacrificial test machine**. No real sleep, hibernate, restart, or shutdown action was executed during development or automated testing. In packaged Windows builds, disruptive actions require the Settings opt-in, an explicit job policy, successful completion/verification, safety checks, and a cancellable countdown. They remain unverified on a controlled machine. macOS/Linux disruptive power actions and automatic wake scheduling are unsupported.

Other alpha limitations include unsigned artifacts, Windows-only CI, no database downgrade support, and no controlled usage-consuming real Codex turn test. Live Codex validation is read-only; the automated real-provider suite is opt-in and must not be treated as a test of an actual paid turn.

## Project map

```text
src/main/         Electron main process, orchestration, providers, persistence, OS adapters
src/preload/      Narrow typed bridge
src/renderer/     Vue interface and state store
src/shared/       Domain types, IPC contracts, validation schemas
tests/            Unit, integration, fixture, and Electron E2E tests
openspec/         Product specifications, active change, and archived changes
docs/             Architecture, security, integration, power, release, and testing guidance
```

## Contributing

Read [AGENTS.md](AGENTS.md), [CONTRIBUTING.md](CONTRIBUTING.md), [SECURITY.md](SECURITY.md), and the active OpenSpec change before substantial work. Keep changes aligned with the specification, add deterministic tests, and never run real power actions in automated checks.
