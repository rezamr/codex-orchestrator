# Tests

Planned test layers:

- `unit/` — state machines, policies, retry logic, normalization, redaction.
- `integration/` — SQLite, scheduler/fake clock, provider protocol fixtures, IPC validation.
- `e2e/` — critical Electron workflows using fake provider and fake power adapter.
- `fixtures/` — deterministic redacted provider/protocol samples.

Automated tests MUST NOT invoke real sleep, hibernate, restart, or shutdown.
