# Tests

Implemented test layers:

- `unit/` — state machines, policies, retry logic, normalization, redaction.
- `integration/` — SQLite, scheduler/fake clock, provider protocol fixtures, IPC validation.
- `e2e/` — critical Electron workflows using fake provider and fake power adapter.
- `fixtures/` — deterministic redacted app-server child process.

Run `npm test` for unit/integration coverage and `npm run test:e2e` for the built Electron application. E2E covers GUI job creation, approvals, limit continuation with session reuse, cancellable simulated power, and restart persistence.

Automated tests MUST NOT invoke real sleep, hibernate, restart, or shutdown.
