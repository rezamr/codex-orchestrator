# Delta for Operator UI

## Purpose

Define a clear, professional, accessible desktop control surface that makes unattended automation understandable without decorative visual noise.

## ADDED Requirements

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
