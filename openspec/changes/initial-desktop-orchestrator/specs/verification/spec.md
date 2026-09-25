# Delta for Verification

## Purpose

Define evidence-based completion so unattended workflows cannot treat a natural-language completion claim as sufficient when verification is configured.

## ADDED Requirements

### Requirement: Candidate completion verification

The system SHALL treat provider-reported completion as candidate completion and SHALL run all configured required verification checks before verified success.

#### Scenario: Provider says done but tests fail

- **WHEN** the provider reports completion and a required test check exits unsuccessfully
- **THEN** the job is not marked verified successful
- **AND** the failed verification evidence is visible to the user

### Requirement: Verification evidence

The system SHALL persist the outcome and bounded evidence for each verification check.

#### Scenario: Verification command finishes

- **WHEN** a verification command completes
- **THEN** the system stores its check identity, timing, exit result, pass/fail result, and bounded/redacted output evidence

### Requirement: Visible verification configuration

The system MUST make executable verification commands or checks visible to the user rather than executing hidden arbitrary commands.

#### Scenario: Custom verification is configured

- **WHEN** a user configures a custom verification command
- **THEN** the command and working-directory context are shown in the job configuration before use

### Requirement: Power actions depend on verification

The system MUST prevent configured disruptive post-completion power actions when required verification has failed or has not completed.

#### Scenario: Shutdown policy exists but verification failed

- **WHEN** a job has shutdown configured and a required verification check fails
- **THEN** shutdown is not eligible
