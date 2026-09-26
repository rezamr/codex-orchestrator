# Development Guide

## Prerequisites

- Node.js compatible with `package.json#engines`
- npm
- Git
- Codex installed only when you want to run the opt-in live read-only integration check
- OpenSpec CLI, invoked through the repository npm scripts or npx

## Specification first

Before implementing substantial behavior:

```bash
npm run openspec:init
npm run openspec:list
```

Read the active change under `openspec/changes/`.

Codex uses OpenSpec skills generated into `.agents/skills/`.

## Implemented stack

- Electron
- Vue 3
- TypeScript
- electron-vite
- Pinia renderer state
- SQLite through `better-sqlite3`
- Zod validation at IPC boundaries
- Vitest unit/integration tests
- Playwright Electron E2E tests

## Development commands

The repository provides these scripts:

```bash
npm run dev
npm run build
npm run typecheck
npm run lint
npm test
npm run test:unit
npm run test:integration
npm run test:e2e
npm run test:all
npm run package
npm run format
```

`npm run package` produces an unsigned unpacked artifact. It does not launch the application or execute a power action.

## Development safety

Real system power actions must be disabled by default in development and tests.

Use a fake/simulated platform adapter unless a developer explicitly opts into a manual platform test.

Do not use a production OpenAI/Codex account test as the only way to validate orchestration logic. Provider adapters need deterministic fixtures/fakes.

## Database changes

Every schema change requires:

- numbered migration,
- forward migration test,
- representative upgrade test,
- documented compatibility impact if downgrade is not supported.

Do not “fix” migration problems by deleting the user's database.

## Testing layers

### Unit

State transitions, retry policy, policy evaluation, event mapping, validation.

### Integration

SQLite repositories, scheduler with fake time, provider process protocol fixture, IPC handler validation.

### E2E

Critical GUI flows:

- launch,
- create project,
- create job,
- simulated provider activity,
- wait/resume,
- approval,
- verification,
- completion countdown cancellation.

### Manual platform tests

The default tests use provider fixtures and simulated power; they must not invoke real machine power commands or a usage-consuming Codex turn. A separate opt-in read-only Codex compatibility test is available for maintainers with an installed CLI:

Electron E2E runs set `CODEX_ORCHESTRATOR_E2E_FAKE_PROVIDER=1` in an unpackaged test process. This selects the fake provider and forces every provider factory request to a fake, even if a UI test accidentally chooses Codex. This safeguard is not active in packaged builds. E2E also uses `FakePowerAdapter` and a temporary data directory.

```powershell
$env:CODEX_ORCHESTRATOR_LIVE_CODEX_TEST = '1'
npm exec -- vitest run tests/integration/codex-live-readonly.test.ts
```

It reads account/usage summaries and local conversation history without forcing token refresh, resuming a thread, or starting a turn. It must not run in ordinary CI and its output must never include returned account or conversation content. Real usage-consuming Codex turns and real power actions require the controlled procedures in `manual-testing.md`; power tests require a sacrificial Windows machine with no unsaved work.

Follow the full [controlled manual test checklist](manual-testing.md).

## Safe runtime modes

- `npm run dev`, Vitest, and Playwright always construct `FakePowerAdapter`.
- An unpackaged Electron run cannot execute native power commands.
- A packaged Windows build still requires the global Settings opt-in and an explicit per-job action; the default action is `none`.
- Do not add environment-variable shortcuts that weaken provider authentication, approvals, billing, usage limits, or power guards.

## Windows verification

Configured npm/npx checks require an installed Node.js/npm on the desktop process's PATH; restart Orchestrator after installation or PATH changes. The main process resolves npm's CLI script and launches it with native Node, never by executing `npm.cmd` directly or constructing an untrusted shell string. For pnpm/yarn or custom batch wrappers, configure the native executable and CLI script as separate arguments. Launch failures are persisted as failed checks; **Rerun checks only** does not consume Codex usage or repeat provider work.

Cancellation is unavailable during active verification: workspace protection remains held until checks finish or hit their configured timeout. Closing/crashing the application is not a verification-cancellation mechanism; interrupted verification requires review after restart before checks can be rerun.

## Desktop thread navigation

The application opens an existing thread using OpenAI's documented ChatGPT desktop deep link. Automated tests validate the IPC and intercept `shell.openExternal`; they do not launch or automate ChatGPT. Confirm actual navigation manually without sending a prompt. Do not expand the dedicated thread-id contract into a general `codex://` launcher.

## Logging

Use structured logging and redaction from day one. Do not add temporary logs that print full provider payloads or process environments.

## Pull request readiness

Run:

- typecheck,
- lint,
- tests,
- build,
- relevant E2E,
- OpenSpec verification,
- docs/changelog review.
