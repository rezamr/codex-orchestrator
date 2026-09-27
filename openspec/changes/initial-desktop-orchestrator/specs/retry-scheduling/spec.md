# Delta for Retry and Scheduling

## Purpose

Define durable, bounded, explainable scheduling for transient failures and provider usage-limit waits across application restarts.

## ADDED Requirements

### Requirement: Persisted schedules

The system SHALL persist future retry/resume actions so their intent survives application restarts.

#### Scenario: Application restarts before resume time

- **WHEN** the application restarts while a job has a pending resume schedule
- **THEN** the scheduler reloads and reconciles that schedule from durable storage

### Requirement: Bounded retries

The system MUST apply bounded retry/resume policies and MUST NOT create an infinite automatic continuation loop.

#### Scenario: Maximum automatic attempts reached

- **WHEN** a job reaches its configured maximum automatic resume or retry count
- **THEN** automatic retries stop
- **AND** the job enters a state requiring user review

### Requirement: Limit wait classification

The system SHALL represent provider usage/rate-limit waiting as a distinct state and SHALL retain the source/confidence of any computed retry time.

#### Scenario: Structured retry time is available

- **WHEN** the provider supplies a structured supported retry/reset time
- **THEN** the scheduler uses that time according to policy
- **AND** records that the time came from structured provider data

#### Scenario: Exact usage reset time is unavailable

- **WHEN** a Codex usage-limit condition is confirmed
- **AND** no reliable provider reset timestamp can be obtained after supported rate-limit refresh or merge handling
- **THEN** the system MUST NOT invent or automatically estimate a resume time
- **AND** MUST NOT create an automatic resume schedule
- **AND** SHALL keep the job safely waiting for the usage reset
- **AND** SHALL ask the user to select a future local date and time
- **AND** SHALL persist the resulting resume schedule with source `user`

#### Scenario: Transient provider failure has no explicit retry time

- **WHEN** a retryable transport, network, or temporary provider failure occurs
- **AND** no explicit provider retry time is available
- **THEN** the system MAY use its bounded configured retry/backoff policy
- **AND** MUST keep this transient retry policy separate from usage-limit reset scheduling

### Requirement: Safe continuation

The system SHALL inspect current job/session state before executing a scheduled continuation.

#### Scenario: Scheduled resume becomes obsolete

- **WHEN** a resume timer becomes due but the job has since been cancelled or completed
- **THEN** no continuation is sent
- **AND** the obsolete schedule is resolved without provider work
