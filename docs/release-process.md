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

## Release channels

Planned:
- pre-alpha/nightly for developer testing,
- alpha for early adopters,
- beta when migration and recovery are dependable,
- stable after compatibility and packaging mature.

## Compatibility notes

Each release should identify:
- supported operating systems,
- tested Codex versions/integration surface,
- known provider limitations,
- known power-management limitations,
- database schema/migration version.

## Rollback

A release must not promise downgrade safety unless its database/data-format compatibility has been tested. Prefer backup/export before irreversible migrations.
