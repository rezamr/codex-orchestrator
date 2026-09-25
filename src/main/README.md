# Main Process

This directory will contain the privileged Electron application core.

Planned boundaries:

- `domain/` — provider-neutral states, entities, events, policies.
- `application/` — orchestration use cases and services.
- `infrastructure/database/` — SQLite and migrations.
- `infrastructure/providers/codex/` — Codex app-server adapter.
- `infrastructure/platform/` — OS-specific power/notification/process adapters.
- `infrastructure/logging/` — structured redacted logging.
- `ipc/` — validated handlers exposing narrow application capabilities.

Renderer code must never import from this directory.
