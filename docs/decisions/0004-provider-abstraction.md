# ADR 0004: Provider-neutral orchestration core

- Status: Accepted
- Date: 2026-09-24

## Context

Codex integration surfaces can evolve. Coupling task state directly to raw provider protocol messages would make the application brittle.

## Decision

Define provider-neutral lifecycle/event contracts and implement Codex app-server as an adapter.

The provider contract includes normalized read-only account, usage, and thread-history projections as well as lifecycle operations. Raw app-server JSON-RPC remains adapter-only; conversation content is not an orchestration persistence entity.

## Consequences

- Domain state and UI contracts stay stable across provider changes.
- Raw provider payloads require normalization.
- Additional providers can be considered later without rewriting orchestration.
- The abstraction must remain pragmatic and must not hide capabilities the UI genuinely needs.
- Local Codex-specific UI capabilities are exposed as bounded shared domain types rather than raw protocol payloads.
- The `0.1.0-alpha.1` connected-workspace projection is shared across pages but remains read-through. Only an explicit continuation creates durable job/session ownership; standalone Codex project and desktop-automation indexes are not inferred from undocumented APIs.
