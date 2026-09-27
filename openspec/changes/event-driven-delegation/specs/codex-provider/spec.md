# Delta for Codex Provider

## Purpose

Extend provider routing using capabilities verified in the current app-server protocol.

## ADDED Requirements

### Requirement: Per-turn routing and structured output

The Codex provider SHALL pass validated optional model, reasoning effort, and JSON output schema fields through `turn/start` and SHALL keep those protocol details behind the provider adapter.

#### Scenario: Controller turn starts

- **WHEN** orchestration supplies a controller model, effort, and decision schema
- **THEN** the adapter sends those fields on the supported `turn/start` request
- **AND** no UI automation or undocumented protocol method is used

### Requirement: Terminal notifications drive orchestration

The provider SHALL normalize the supported terminal turn notification into one application event and MUST NOT poll the model for child status.

#### Scenario: Delegated child finishes

- **WHEN** app-server emits `turn/completed`
- **THEN** the adapter emits one normalized completion event
- **AND** the orchestration engine evaluates the persisted child relationship from that event
