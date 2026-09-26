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

- `0.1.0-alpha.3` for developer/early-adopter testing (not yet a GitHub release),

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

Current `0.1.0-alpha.3` baseline:

- primary automated runner: Windows;
- Electron `44.4.5`, Vue `3.5.43`, SQLite schema version 3;
- Codex app-server protocol tested with deterministic fixtures; automatic CLI discovery, version probing, and a live read-only account/usage/thread-history check passed against the installed Codex CLI on 2026-09-25;
- background connected views and explicit same-session continuation are exercised with fake-provider integration and Electron E2E tests; no controlled real-account turn was completed;
- during the first alpha.1 E2E attempt, the new Codex default caused one test to start a real turn unintentionally before it timed out. The test process closed, but usage impact is unknown. The E2E harness now forces the fake provider for every provider factory request, and the complete suite was rerun successfully;
- a user-reported real turn exposed the Windows verification launch defect, now covered by regression tests; this does not close the controlled real-Codex gate, and controlled manual validation of real Windows power actions is still required;
- explicit History/form targeting, coherent ephemeral conversation output, saved read-only retrieval, external-writer review/manual retry, legacy diagnostic sanitization, checks-only retry/recovery, and canonical ChatGPT desktop links are covered by deterministic tests; actual desktop navigation requires the manual smoke check;
- macOS/Linux disruptive power actions and wake scheduling unsupported;
- Windows NSIS installer and portable targets configured; macOS DMG/Linux AppImage targets are configured but not validated by current CI;
- packaged artifacts are unsigned.

The initial OpenSpec change remains active while controlled real power-action testing is incomplete. Do not archive it or claim that the power gate passed until task 13.6 is documented from a sacrificial-machine run.

## Alpha.3 correction evidence (2026-09-26)

- Strict OpenSpec, TypeScript, lint, formatting, 65 unit/integration tests including migrations, 12 fake-provider/fake-power Electron E2E scenarios, production build, and Windows packaging passed.
- The installed-Codex read-only check passed without resume/turn submission. No real power action was executed. npm audit against the public npm registry reported zero vulnerabilities; the locally configured mirror did not implement the audit endpoint.
- Installer and portable ProductVersion are `0.1.0-alpha.3`; packaged `package.json` matches that version, and its main bundle matches the final production build. Authenticode status is NotSigned. Automated GUI screenshots for coherent output and busy review were inspected.
- No SQLite migration or data reset is introduced. Installer execution and upgrade against a user's real database are not claimed; follow the manual checklist.
- Artifact SHA-256 (locally built, not yet a GitHub release):
  - NSIS installer: `2e40a952b371153b143f3b7cd256baca38e9481259f6985321a30746c9d42e0f`.
  - Portable executable: `6b3f47f7cdedc7c6f8be58d5471b59f2f80a05fe3a3650e44cf00b5c6c0fd104`.

## Rollback

A release must not promise downgrade safety unless its database/data-format compatibility has been tested. Prefer backup/export before irreversible migrations.
