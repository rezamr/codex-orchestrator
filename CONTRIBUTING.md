# Contributing

Thanks for helping improve Codex Orchestrator.

## Before opening code

For substantial changes, start with the specification. Read:
- `AGENTS.md`
- `docs/product-requirements.md`
- `docs/architecture.md`
- the active OpenSpec change under `openspec/changes/`

If the requested behavior is new or changes an existing behavior contract, create or update an OpenSpec change before implementation.

## Development principles

- Keep the orchestration core independent from Vue components and from a particular Codex transport.
- Keep privileged OS operations in the Electron main process.
- Prefer typed IPC contracts and schema validation.
- Add tests for state transitions, retries, recovery, verification, and power-action guards.
- Do not weaken security or safety checks to make tests pass.
- Keep changes focused and reviewable.
- Update docs and `CHANGELOG.md` with user-visible changes.

## Pull requests

A pull request should include:
- the problem and intended behavior,
- the related OpenSpec change,
- implementation summary,
- screenshots for UI changes,
- test/verification evidence,
- platform notes when behavior differs by OS,
- migration notes for persisted state,
- any security or power-management implications.

## Commit style

Prefer Conventional Commit-style messages where practical:

```text
feat: add job recovery state machine
fix: prevent duplicate resume scheduling
docs: document app-server provider lifecycle
test: cover shutdown policy guards
refactor: isolate provider event normalization
```

## UI contributions

Follow `docs/ui-ux-guidelines.md`. New UI should be restrained, accessible, and consistent with the existing design system rather than introducing isolated visual styles.

## Security reports

Do not open public issues for exploitable vulnerabilities. Follow `SECURITY.md`.
