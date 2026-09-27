# Delta for Operator UI

## Purpose

Expose controller routing and delegated waiting states without hiding token-consuming work.

## ADDED Requirements

### Requirement: Explicit controller job creation

The job form SHALL require an explicit controller-mode choice and SHALL present model and reasoning-effort routing fields with accessible labels.

#### Scenario: User creates a controller job

- **WHEN** the user selects controller mode and submits valid routing settings
- **THEN** the durable job records controller kind, model, and effort before it is queued

### Requirement: Parent and child relationship display

Job detail SHALL display the linked parent or child, requested routing, current delegation status, and terminal result summary where available.

#### Scenario: Parent is waiting without inference

- **WHEN** a controller is in `WAITING_FOR_CHILD`
- **THEN** the detail view states that the controller is inactive while the linked child runs
- **AND** the linked job can be opened with keyboard navigation
