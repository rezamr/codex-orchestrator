# ADR 0001: Use Codex app-server as the primary local provider

- Status: Accepted
- Date: 2026-09-24

## Context

The product needs to start/resume Codex work, keep conversations open, stream lifecycle events, interrupt work, and surface approvals. UI automation would be fragile and inaccessible to reliable state management.

## Decision

Use Codex app-server as the primary local provider, isolated behind a provider interface.

Do not use the removed Codex MCP-server role as the application control plane. MCP may still be used for external tools.

Discover and version-check the supported Codex CLI automatically; the UI must not ask users to select the ChatGPT desktop executable. Use app-server for read-only account/usage summaries and thread history as well as the existing job lifecycle. Thread listing must avoid optional local scan-and-repair, and selected transcript reads must not resume or mutate a thread.

The `0.1.0-alpha.1` UI shares bounded app-server account/thread summaries across its main pages. A stored conversation is resumed only after the user explicitly submits a new instruction; the corresponding durable job and unique session link are persisted before `thread/resume` and `turn/start`. The provider reads metadata without turns for the eligibility check. No undocumented desktop project or automation registry is read.

The `0.1.0-alpha.2` UI makes that destination explicit before submission. Navigation back to ChatGPT uses its [documented existing-thread deep link](https://learn.chatgpt.com/docs/reference/commands#deep-links) through a dedicated validated IPC action; it does not start a turn or automate the desktop UI. App-server persistence and desktop navigation are separate contracts, not a promise of immediate cross-client live refresh.

## Consequences

- The application can use a documented programmatic lifecycle rather than screen scraping.
- Raw app-server protocol changes are contained within one adapter.
- Compatibility testing is required because the integration surface may evolve.
- Account and history projections are bounded, omit credentials/email, and are not stored in Orchestrator's database.
- The core must remain capable of adopting an official SDK/other provider later.
