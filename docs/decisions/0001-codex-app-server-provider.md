# ADR 0001: Use Codex app-server as the primary local provider

- Status: Accepted
- Date: 2026-09-24

## Context

The product needs to start/resume Codex work, keep conversations open, stream lifecycle events, interrupt work, and surface approvals. UI automation would be fragile and inaccessible to reliable state management.

## Decision

Use Codex app-server as the primary local provider, isolated behind a provider interface.

Do not use the removed Codex MCP-server role as the application control plane. MCP may still be used for external tools.

Discover and version-check the supported Codex CLI automatically; the UI must not ask users to select the ChatGPT desktop executable. Use app-server for read-only account/usage summaries and thread history as well as the existing job lifecycle. Thread listing must avoid optional local scan-and-repair, and selected transcript reads must not resume or mutate a thread.

## Consequences

- The application can use a documented programmatic lifecycle rather than screen scraping.
- Raw app-server protocol changes are contained within one adapter.
- Compatibility testing is required because the integration surface may evolve.
- Account and history projections are bounded, omit credentials/email, and are not stored in Orchestrator's database.
- The core must remain capable of adopting an official SDK/other provider later.
