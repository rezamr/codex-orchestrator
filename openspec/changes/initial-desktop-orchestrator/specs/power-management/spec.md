# Delta for Power Management

## Purpose

Define capability-aware and user-controlled sleep prevention plus safe post-completion sleep, hibernate, restart, and shutdown behavior.

## ADDED Requirements

### Requirement: Explicit opt-in power policy
The system MUST require explicit user configuration before a job can trigger sleep, hibernate, restart, or shutdown.

#### Scenario: No power action is configured
- **WHEN** a job completes successfully without an explicit power action
- **THEN** the application leaves system power state unchanged

### Requirement: Guarded eligibility
The system MUST verify configured completion, verification, sibling-job, application override, and platform capability guards before a disruptive power action becomes eligible.

#### Scenario: Another protected job is active
- **WHEN** one job completes with shutdown configured while another protected job is still active
- **THEN** shutdown is not executed
- **AND** the UI explains the blocking guard

### Requirement: Cancellable countdown
The system SHALL show a visible cancellable countdown before executing an eligible disruptive power action and SHALL re-check guards immediately before execution.

#### Scenario: User cancels countdown
- **WHEN** the user cancels the active shutdown/hibernate/restart/sleep countdown
- **THEN** the power action does not execute
- **AND** cancellation is recorded

### Requirement: Simulated development behavior
The system MUST use simulated power actions by default in development and automated test environments.

#### Scenario: Automated test reaches power eligibility
- **WHEN** a test workflow reaches a configured shutdown action
- **THEN** the fake power adapter records the requested action
- **AND** the host machine is not shut down

### Requirement: Honest wake capability
The system MUST NOT promise automatic wake from sleep or hibernate unless the current platform adapter can establish a supported wake mechanism.

#### Scenario: Wake scheduling is unsupported
- **WHEN** the current system cannot reliably schedule wake
- **THEN** “sleep until resume” is unavailable or clearly marked unsupported
