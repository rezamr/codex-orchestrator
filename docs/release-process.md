# Release Process

## Versioning

Use Semantic Versioning once releases begin.

Before 1.0, minor versions may contain breaking changes, but they still require explicit migration notes.

## Release checklist

1. Active OpenSpec change is verified and archived as appropriate.
2. Required tests pass on supported platforms.
3. Package/install smoke tests pass.
4. Database migration path is tested.
5. Codex compatibility matrix is updated.
6. Security checklist is reviewed.
7. Real power actions receive explicit manual verification on supported platforms.
8. `CHANGELOG.md` is updated.
9. Version metadata is updated.
10. Release notes include limitations and migration notes.
11. Artifacts are signed when signing infrastructure exists.
12. Git tag and GitHub release are created.

Use [manual-testing.md](manual-testing.md) for the real-provider and real-power gates; do not substitute automated development runs for those controlled checks.

## Release channels

Current:

- `0.1.0-alpha.2` for developer/early-adopter testing (not yet a GitHub release),

Planned next:

- beta when migration and recovery are dependable,
- stable after compatibility and packaging mature.

## Compatibility notes

Each release should identify:

- supported operating systems,
- tested Codex versions/integration surface,
- known provider limitations,
- known power-management limitations,
- database schema/migration version.

Current `0.1.0-alpha.2` baseline:

- primary automated runner: Windows;
- Electron `44.4.5`, Vue `3.5.43`, SQLite schema version 3;
- Codex app-server protocol tested with deterministic fixtures; automatic CLI discovery, version probing, and a live read-only account/usage/thread-history check passed against the installed Codex CLI on 2026-09-25;
- background connected views and explicit same-session continuation are exercised with fake-provider integration and Electron E2E tests; no controlled real-account turn was completed;
- during the first alpha.1 E2E attempt, the new Codex default caused one test to start a real turn unintentionally before it timed out. The test process closed, but usage impact is unknown. The E2E harness now forces the fake provider for every provider factory request, and the complete suite was rerun successfully;
- a user-reported real turn exposed the Windows verification launch defect, now covered by regression tests; this does not close the controlled real-Codex gate, and controlled manual validation of real Windows power actions is still required;
- explicit History/form thread targeting, completed-message audit entries, checks-only verification retry/recovery, and canonical ChatGPT desktop links are covered by deterministic tests; actual desktop navigation requires the manual smoke check;
- macOS/Linux disruptive power actions and wake scheduling unsupported;
- Windows NSIS installer and portable targets configured; macOS DMG/Linux AppImage targets are configured but not validated by current CI;
- packaged artifacts are unsigned.

The initial OpenSpec change remains active while controlled real power-action testing is incomplete. Do not archive it or claim that the power gate passed until task 13.6 is documented from a sacrificial-machine run.

## Rollback

A release must not promise downgrade safety unless its database/data-format compatibility has been tested. Prefer backup/export before irreversible migrations.
