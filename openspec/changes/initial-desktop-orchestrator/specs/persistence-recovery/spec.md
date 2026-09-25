# Delta for Persistence and Recovery

## Purpose

Define local durable state and conservative restart recovery so active work is not forgotten, duplicated, or silently reset after application/process failure.

## ADDED Requirements

### Requirement: Durable orchestration state
The system SHALL persist projects, jobs, attempts, provider-session references, schedules, events, approvals, verification results, and settings in a local durable store with schema migrations.

#### Scenario: Application exits unexpectedly
- **WHEN** the application process exits after a job state transition was committed
- **THEN** that committed state is available when the application starts again

### Requirement: Schema migrations
The system MUST use explicit migrations for persisted schema changes and MUST NOT resolve migration errors by silently deleting the user's database.

#### Scenario: Existing database requires migration
- **WHEN** a newer application opens an older supported database schema
- **THEN** required migrations run transactionally or fail visibly without silently discarding user history

### Requirement: Conservative startup reconciliation
The system SHALL reconcile unfinished jobs on startup and MUST avoid blindly launching duplicate provider work.

#### Scenario: Previous app died during running state
- **WHEN** startup finds a job persisted as running but the previous local process context is no longer trustworthy
- **THEN** the system reconciles provider/session capability before resuming
- **AND** uses a visible needs-review state when safe automatic recovery cannot be established

### Requirement: Database is not a credential store
The system MUST NOT use its orchestration database to store provider authentication secrets.

#### Scenario: Provider session metadata is persisted
- **WHEN** the system persists a provider session reference
- **THEN** only the opaque continuation metadata required by the provider is stored
- **AND** access tokens or account cookies are excluded
