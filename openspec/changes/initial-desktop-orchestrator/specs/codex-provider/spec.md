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

### Requirement: Discover and validate the Codex CLI executable

The system SHALL automatically discover and validate a supported Codex CLI executable for app-server use and MUST NOT launch a ChatGPT desktop GUI executable as the provider process.

#### Scenario: A saved path points to the ChatGPT desktop application

- **WHEN** a stale or manually saved executable path identifies `ChatGPT.exe` or another unsupported GUI launcher
- **THEN** the provider does not execute that file
- **AND** it continues automatic discovery for a valid Codex CLI executable
- **AND** it reports the resolved executable or a clear actionable error

#### Scenario: Codex CLI is installed in a per-user location

- **WHEN** the supported `codex` command is available from the user's environment or a recognized per-user installation
- **THEN** the application discovers and version-probes that CLI without asking the user to browse protected ChatGPT package folders
- **AND** the provider launches its documented app-server command through that CLI

### Requirement: Read current Codex account and usage state

The system SHALL read available account/authentication, plan, usage-limit, and token-activity summaries through the connected app-server without taking ownership of authentication or changing account state.

#### Scenario: Codex is connected and authenticated

- **WHEN** the user checks the provider connection
- **THEN** the UI reports the safe authentication/plan state and available rate-limit/usage summaries
- **AND** the system does not display or persist account tokens, cookies, authorization values, or account email
- **AND** no login, logout, reset-credit, billing, or usage-limit mutation endpoint is called

### Requirement: Enumerate existing Codex threads

The system SHALL expose the existing local Codex thread index through the supported app-server history APIs, including pagination, archived records, and supported source kinds.

#### Scenario: Existing threads span multiple result pages

- **WHEN** the connected app-server returns a continuation cursor for thread history
- **THEN** the client fetches subsequent pages until the provider reports the end of the result set
- **AND** requests state-database-only results so history browsing does not trigger optional scan-and-repair of local thread logs
- **AND** it presents active and archived Codex threads distinctly from orchestrator-owned jobs

#### Scenario: Local history exceeds the safe retrieval bound

- **WHEN** more than 20,000 stored threads are available
- **THEN** the application stops at its safe retrieval bound and clearly indicates that the returned index is incomplete

#### Scenario: Codex is disconnected during history refresh

- **WHEN** thread history cannot be read from the app-server
- **THEN** the application reports the history refresh failure
- **AND** existing orchestrator jobs remain available and unchanged

### Requirement: Read stored Codex thread history without resuming it

The system SHALL allow a user to inspect a selected stored Codex thread's turns through the app-server without resuming, starting, or mutating that thread. The renderer projection SHALL be bounded and clearly indicate when it is truncated.

#### Scenario: User opens an existing Codex thread

- **WHEN** the user selects a thread from Codex History
- **THEN** the provider reads the stored thread with its available turns
- **AND** no `thread/resume`, `turn/start`, archive, delete, or other mutating provider operation is issued
- **AND** imported transcript content is not copied into the orchestrator database by default

#### Scenario: A stored thread exceeds the safe transcript view bound

- **WHEN** a stored thread contains more than 1,000 turns or more than 2 MB of projected text
- **THEN** the application presents content within the safe view bound and clearly tells the user that the display is truncated
- **AND** the original Codex thread remains unchanged
