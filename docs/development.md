# Development Guide

## Prerequisites

- Node.js compatible with `package.json#engines`
- npm
- Git
- Codex installed for real-provider integration testing
- OpenSpec CLI, invoked through the repository npm scripts or npx

## Specification first

Before implementing substantial behavior:

```bash
npm run openspec:init
npm run openspec:list
```

Read the active change under `openspec/changes/`.

Codex uses OpenSpec skills generated into `.agents/skills/`.

## Intended stack

- Electron
- Vue 3
- TypeScript
- electron-vite
- Pinia or an equally small renderer state layer if justified
- SQLite through a maintained local driver
- schema validation for IPC/persisted configuration
- Vitest for unit/integration tests
- Playwright or an appropriate Electron E2E harness for critical desktop flows

Exact package choices/versions should be selected during implementation based on current maintained releases and compatibility.

## Development commands

The repository reserves these scripts:

```bash
npm run dev
npm run build
npm run typecheck
npm run lint
npm test
npm run format
```

The implementation change must make these scripts functional.

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

Real power actions and real Codex connectivity belong to explicit manual checklists, not ordinary automated CI.

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
