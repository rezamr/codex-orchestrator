# Delta for Orchestration Lifecycle

## Purpose

Define durable project, job, attempt, queue, session, and state-transition behavior for long-running agent work.

## ADDED Requirements

### Requirement: Explicit job state machine
The system SHALL manage each job through an explicit set of legal lifecycle states and transitions.

#### Scenario: Unexpected transition is requested
- **WHEN** an operation requests a transition that is not legal from the current state
- **THEN** the transition is rejected
- **AND** a diagnostic event records the reason

### Requirement: Job and attempt separation
The system SHALL keep the durable job objective separate from individual start/resume attempts.

#### Scenario: Job resumes after a wait
- **WHEN** a job resumes after a provider limit or transient interruption
- **THEN** a new attempt record is created
- **AND** the job retains its original identity and objective

### Requirement: User lifecycle controls
The system SHALL allow the user to pause, resume, interrupt, cancel, or retry work when those operations are valid for the current job state.

#### Scenario: User cancels queued work
- **WHEN** the user cancels a job that has not started
- **THEN** the job becomes cancelled
- **AND** no provider work is started

### Requirement: Concurrency policy
The system SHALL enforce configured concurrency limits and MUST prevent accidental duplicate starts of the same durable job.

#### Scenario: Same job receives two start triggers
- **WHEN** a second start trigger arrives while the job already has an active starting/running attempt
- **THEN** the duplicate start is rejected or coalesced
