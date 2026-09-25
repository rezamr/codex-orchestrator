# Delta for Codex Provider

## Purpose

Define programmatic Codex integration and stable provider behavior without coupling orchestration or UI code to raw app-server protocol details.

## ADDED Requirements

### Requirement: Programmatic Codex control
The system SHALL integrate with Codex through a supported programmatic provider interface and MUST NOT depend on Codex UI scraping or simulated mouse/keyboard input.

#### Scenario: Codex work is started
- **WHEN** the orchestration engine starts a Codex job
- **THEN** the Codex provider starts or connects to the local supported Codex integration
- **AND** no UI automation is required

### Requirement: Provider lifecycle operations
The Codex provider SHALL expose the lifecycle operations and events required to start or resume work, receive progress, interrupt work, and handle approvals where supported.

#### Scenario: Existing session is resumable
- **WHEN** a waiting job has a valid provider session reference and resume is supported
- **THEN** the provider resumes that existing session rather than silently creating unrelated duplicate work

### Requirement: Provider event normalization
The system SHALL translate provider-specific messages into stable normalized application events before they reach orchestration state or renderer state.

#### Scenario: Provider emits a rate-limit condition
- **WHEN** the provider reports that work cannot continue because of a usage or rate limit
- **THEN** the adapter emits a normalized limit event with the available redacted retry evidence

### Requirement: Authentication remains provider-owned
The system MUST NOT persist ChatGPT/OpenAI authentication secrets in the orchestration database.

#### Scenario: Authentication is unavailable
- **WHEN** Codex reports authentication is required or expired
- **THEN** the job enters an actionable non-success state
- **AND** the UI explains that authentication must be restored through supported Codex authentication
