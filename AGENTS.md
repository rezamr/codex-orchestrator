# Agent Instructions

These instructions apply to all coding agents working in this repository.

## Source of truth

1. Read `README.md`.
2. Read `openspec/config.yaml`.
3. Read the active change under `openspec/changes/`.
4. Read relevant files under `docs/`.
5. Implement only behavior that is consistent with the active OpenSpec proposal, specs, design, and tasks.

If implementation reveals that a specification is incomplete or contradictory, update the OpenSpec artifacts first. Do not silently invent product behavior.

## OpenSpec

This project uses the OpenSpec spec-driven workflow. Codex is a skills-only integration and OpenSpec-managed skills belong under `.agents/skills/`.

Before implementation, initialize or refresh OpenSpec for Codex if required:

```bash
npm run openspec:init
```

Preferred workflow for substantial changes:

```text
proposal -> specs/design -> tasks -> implementation -> verification -> archive
```

Do not archive a change while required tests, verification checks, or documentation updates are incomplete.

## Product constraints

- Desktop application: Electron + Vue 3 + TypeScript.
- Main-process capabilities must not be exposed directly to renderer code.
- Use context isolation and a narrow typed preload bridge.
- Treat renderer-originated data as untrusted.
- Keep orchestration logic UI-independent.
- Place Codex-specific logic behind a provider interface.
- Primary local provider: Codex app-server.
- Discover and version-check the supported Codex CLI automatically. Never ask users to select or launch the ChatGPT GUI executable, and never inspect protected Windows app packages.
- Keep account/usage/history reads read-only. Do not persist account email, authentication material, or Codex transcripts in Orchestrator's SQLite database; request state-database-only thread listings to avoid scan-and-repair side effects.
- Never control Codex by scraping its UI or simulating mouse/keyboard input.
- Persist durable task state in SQLite behind a repository/service abstraction.
- Design migrations before relying on persisted schema.
- Keep power management behind a capability-aware platform abstraction.
- Never perform shutdown, restart, sleep, or hibernate merely because a process exited.
- Destructive or disruptive power actions require explicit user configuration, policy checks, a visible cancellable countdown, and an audit record.
- During development and automated tests, power actions MUST default to dry-run/simulated behavior.

## Completion rules

A task is not complete merely because the model says it is complete.

Where configured, completion requires machine-verifiable evidence such as:

- successful test command(s),
- expected build/typecheck/lint results,
- absence of unresolved approval requests,
- absence of active sibling jobs that would be interrupted,
- provider/session state consistent with completion,
- any user-defined verification commands.

Verification results must be retained with the job history.

## Reliability

- Model all long-running work as explicit state machines.
- Make state transitions idempotent where practical.
- Persist before executing irreversible or externally visible actions.
- Recover safely after application crash or machine restart.
- Use bounded retries and backoff.
- Never create an infinite automatic-resume loop.
- Distinguish rate limits, authentication failures, network failures, provider crashes, user pauses, approval waits, and task failures.

## Security

- No secrets in source, logs, fixtures, screenshots, or issue templates.
- Never write ChatGPT/OpenAI credentials into the project database.
- Prefer existing supported Codex authentication.
- Redact tokens and sensitive environment variables from logs.
- Validate project paths and IPC payloads.
- Disable Node integration in renderer windows.
- No remote content may gain privileged Electron access.
- External URLs must open through a controlled allowlist/handler.

## UI/UX

The interface must be calm, professional, and information-dense without becoming visually noisy.

Avoid:

- rainbow palettes,
- excessive gradients,
- oversized decorative cards,
- unnecessary animation,
- fake terminal aesthetics as the primary UI,
- using color as the only status signal.

Prefer:

- neutral surfaces,
- one restrained accent,
- semantic status colors only where needed,
- strong typography and spacing,
- clear hierarchy,
- keyboard accessibility,
- WCAG-aware contrast,
- compact tables/timelines for operational data,
- confirmation dialogs only for consequential actions.

## Engineering quality

Before declaring work complete:

1. Typecheck.
2. Lint.
3. Run relevant unit/integration tests.
4. Build/package when the change affects packaging.
5. Update documentation and CHANGELOG when user-visible behavior changes.
6. Verify no generated secrets or machine-specific paths were committed.
7. Update OpenSpec tasks and verification evidence.

An opt-in live Codex compatibility test may use the already-installed CLI and local account only for read-only app-server methods. It must never consume reset credits or start a real Codex turn. Do not enable it in ordinary CI.

Prefer small modules, typed contracts, dependency inversion, deterministic tests, and explicit error handling over clever abstractions.
