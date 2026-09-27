# Delta for Operator UI

## Purpose

Define a clear, professional, accessible desktop control surface that makes unattended automation understandable without decorative visual noise.

## ADDED Requirements

### Requirement: Job conversation and audit are distinct

Job detail SHALL display coherent escaped conversation text separately from lifecycle decisions, commands, approvals, and verification. Verbose legacy provider activity SHALL remain accessible in a collapsed section without rewriting or heuristically merging old records.

#### Scenario: Legacy job contains token-sized activity rows

- **WHEN** the operator opens that job
- **THEN** the main timeline shows operational decisions, old raw rows are available on expansion, and saved conversation output can be fetched read-only

#### Scenario: Conversation is busy or output is incomplete

- **WHEN** a writer conflict or interrupted/truncated output is present
- **THEN** the UI explains the limitation and offers safe explicit actions without implying successful completion or automatic ownership transfer

### Requirement: Operational navigation

The system SHALL provide clear navigation for Dashboard, Projects, Jobs, History/Sessions, Activity, Automations, and Settings or equivalent grouped destinations.

#### Scenario: User opens the dashboard

- **WHEN** the application opens with existing jobs
- **THEN** the dashboard surfaces running, waiting, failed, needs-attention, and upcoming scheduled work without requiring log inspection

### Requirement: Actionable job detail

The system SHALL show a job's objective, lifecycle state, project, provider/session context, attempts, next action, timeline, approvals/input, verification, and completion policy where applicable.

#### Scenario: Job is waiting for a usage reset

- **WHEN** a job enters the limit-wait state
- **THEN** the job view explains why it is waiting, the known/estimated next retry information, and available user actions

### Requirement: Restrained visual design

The system SHALL use a restrained professional design system and MUST NOT use decorative rainbow palettes, gratuitous gradients, or excessive animation as the primary interface style.

#### Scenario: Multiple statuses are visible

- **WHEN** running, waiting, failure, and completion statuses appear together
- **THEN** they use consistent semantic styling and text/icon labels without turning the interface into a multicolor decorative dashboard

### Requirement: Accessible status and controls

The system SHALL make primary workflows keyboard-operable and SHALL communicate important state using text or icons in addition to color.

#### Scenario: User cannot distinguish status colors

- **WHEN** the user views a job state
- **THEN** the state remains understandable from its label/icon without relying on color alone

### Requirement: Progressive advanced settings

The system SHALL keep common job creation simple while exposing retry, verification, provider, and power options through progressive disclosure.

#### Scenario: User creates a basic job

- **WHEN** the user accepts safe defaults
- **THEN** the job can be created without configuring advanced automation settings
- **AND** no disruptive power action is enabled by default

### Requirement: Read-only Codex account and history views

The system SHALL present current Codex account/usage status and existing local Codex threads in the desktop UI separately from orchestrator-owned jobs.

#### Scenario: User opens Codex history

- **WHEN** the provider is available and the user opens History/Sessions
- **THEN** the view lists current active and archived Codex threads, including their available title, preview, source, and timestamps
- **AND** selecting a thread loads its available conversation turns without resuming it

#### Scenario: Codex account data is unavailable

- **WHEN** the provider is not installed, signed out, or cannot read history
- **THEN** the UI shows the specific connection/history state and a safe next step
- **AND** the user can still inspect orchestrator-owned job history

### Requirement: Connected work appears where it is useful

The system SHALL load available Codex account and thread data in the background and surface discovered workspaces in Projects, existing conversations in Jobs and History, and recent conversation metadata in Dashboard and Activity. Each view SHALL distinguish provider-owned records from durable Orchestrator records.

#### Scenario: First launch has Codex history but no Orchestrator database records

- **WHEN** Codex returns stored threads with working directories
- **THEN** Projects shows the discovered workspaces and a one-click registration action for valid local folders
- **AND** Jobs shows the existing conversations and a way to inspect or continue eligible ones
- **AND** Dashboard and Activity show truthful provider summaries instead of claiming that no Codex work exists

#### Scenario: Provider history cannot be refreshed

- **WHEN** the Codex app-server is unavailable
- **THEN** each connected view presents the refresh error without hiding Orchestrator-owned jobs or projects

### Requirement: Explicit conversation destination for new work

The system SHALL distinguish new conversation creation from continuation of an existing Codex thread and show the destination before starting work.

#### Scenario: User chooses an existing conversation as the target

- **WHEN** the user continues a conversation from History or the job form
- **THEN** the form shows the exact destination title, thread id, and workspace before submission
- **AND** the new-conversation option explicitly says it will not continue an existing chat

### Requirement: Open the corresponding ChatGPT desktop conversation

The system SHALL provide a narrow action to open a known local Codex thread in ChatGPT desktop using the officially documented `codex://threads/<thread-id>` link. This action MUST NOT send a prompt, start a turn, or accept an arbitrary renderer-supplied URL.

#### Scenario: User opens a managed conversation in ChatGPT

- **WHEN** the user chooses Open in ChatGPT for a known Codex thread
- **THEN** main validates the thread id and opens only that thread's canonical deep link
- **AND** a failed desktop launch is visible and does not mutate the job

### Requirement: Useful default provider for new work

The system SHALL default a newly created user job to the Codex provider while keeping simulation an explicit choice.

#### Scenario: User opens the new job form after connecting to Codex

- **WHEN** the user begins a new job
- **THEN** Codex app-server is selected by default
- **AND** a simulated run requires the user to select it deliberately

### Requirement: Automation scope is explicit

The Automations view SHALL identify its persisted Orchestrator schedules as such and SHALL NOT imply that an empty local schedule list enumerates Codex desktop scheduled tasks when the supported app-server has no automation listing method.

#### Scenario: No Orchestrator schedule exists

- **WHEN** the user opens Automations
- **THEN** the view explains that there is no Orchestrator-owned schedule
- **AND** it does not claim that Codex has no scheduled tasks

### Requirement: Job detail is status-first

The system SHALL prioritize operational job status over full conversation text on the Job detail screen.

#### Scenario: User checks current progress

- **WHEN** a user opens a managed job
- **THEN** the current stage, latest meaningful update, next action, and verification state are visible near the top of the page
- **AND** the user does not need to scroll through the Codex conversation to determine what the job is doing

#### Scenario: User does not need transcript content

- **WHEN** the Job detail screen is opened
- **THEN** full conversation history is collapsed by default
- **AND** saved conversation history is not loaded until the user explicitly opens or requests it
- **AND** older activity is available through progressive disclosure rather than expanding the primary page indefinitely

### Requirement: Manual resume uses local time

The system SHALL interpret user-entered manual resume date/time values using the local system timezone and SHALL persist the resulting absolute timestamp.

#### Scenario: User schedules a manual resume

- **WHEN** the user enters a future date and time in the manual resume control
- **THEN** the interface identifies the value as local time
- **AND** the stored schedule represents the same absolute instant independent of display timezone
