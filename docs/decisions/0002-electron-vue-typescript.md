# ADR 0002: Electron + Vue 3 + TypeScript desktop stack

- Status: Accepted
- Date: 2026-09-24

## Context

The application needs a rich cross-platform desktop GUI plus local process, filesystem, database, notification, and OS integration.

## Decision

Use Electron for the desktop host, Vue 3 for the renderer, and TypeScript across main/preload/renderer/shared contracts.

## Consequences

- One language/toolchain across application layers.
- Strong fit for existing web UI skills.
- Electron security boundaries must be enforced deliberately.
- OS-specific privileged behavior remains in main-process adapters.
