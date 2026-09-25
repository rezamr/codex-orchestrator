# ADR 0001: Use Codex app-server as the primary local provider

- Status: Accepted
- Date: 2026-09-24

## Context

The product needs to start/resume Codex work, keep conversations open, stream lifecycle events, interrupt work, and surface approvals. UI automation would be fragile and inaccessible to reliable state management.

## Decision

Use Codex app-server as the primary local provider, isolated behind a provider interface.

Do not use the removed Codex MCP-server role as the application control plane. MCP may still be used for external tools.

## Consequences

- The application can use a documented programmatic lifecycle rather than screen scraping.
- Raw app-server protocol changes are contained within one adapter.
- Compatibility testing is required because the integration surface may evolve.
- The core must remain capable of adopting an official SDK/other provider later.
