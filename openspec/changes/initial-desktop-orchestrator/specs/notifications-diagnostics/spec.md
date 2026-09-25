# Delta for Notifications and Diagnostics

## Purpose

Define meaningful operator notifications and redacted diagnostics so important unattended transitions are visible and supportable without exposing secrets.

## ADDED Requirements

### Requirement: Meaningful lifecycle notifications

The system SHALL support configurable notifications for lifecycle events that reasonably require attention or confirm important unattended outcomes.

#### Scenario: Approval is required

- **WHEN** a running job enters a waiting-for-approval state
- **THEN** the application can notify the user according to notification settings

### Requirement: Structured application logs

The system SHALL produce structured logs with timestamp, severity, subsystem, relevant job/session identifiers, and sanitized message metadata.

#### Scenario: Provider process crashes

- **WHEN** the provider process exits unexpectedly
- **THEN** the application records a structured provider-process event with safe diagnostic context

### Requirement: Redacted diagnostic export

The system SHALL allow a user to export diagnostic information with a redaction pass that excludes recognized secrets by default.

#### Scenario: User exports diagnostics

- **WHEN** the user creates a diagnostic bundle
- **THEN** authentication tokens, cookies, authorization headers, and other recognized secret fields are not included in clear text
