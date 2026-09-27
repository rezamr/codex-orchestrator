# Delta for Persistence and Recovery

## Purpose

Define crash-safe parent/child dispatch and one-shot resumption.

## ADDED Requirements

### Requirement: Atomic delegation dispatch

The system MUST atomically persist the controller decision, child job, delegation relationship, and parent waiting state before starting the child.

#### Scenario: Process stops during dispatch

- **WHEN** the database transaction cannot complete
- **THEN** no partial child dispatch is visible
- **AND** the parent does not enter an unlinked waiting state

### Requirement: Idempotent child settlement

The system SHALL persist one terminal result per delegation and MUST reject duplicate settlement or duplicate child creation.

#### Scenario: Completion notification is delivered twice

- **WHEN** the same child completion is handled more than once
- **THEN** one result packet remains stored
- **AND** at most one parent resume is scheduled

### Requirement: Delegation restart reconciliation

The system SHALL reconcile persisted delegations once at startup without periodic provider or model polling.

#### Scenario: Application stopped after child settlement

- **WHEN** startup finds a waiting parent with a persisted terminal child result that has not begun parent resume
- **THEN** the system starts one parent resume from that packet

#### Scenario: Application stopped during child execution

- **WHEN** the previous child runtime cannot be proven active or completed
- **THEN** the child is reconciled conservatively
- **AND** the child enters review and the parent remains `WAITING_FOR_CHILD`
- **AND** no replacement child or parent provider turn starts
