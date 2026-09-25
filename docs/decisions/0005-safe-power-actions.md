# ADR 0005: Guard all disruptive power actions

- Status: Accepted
- Date: 2026-09-24

## Context

The application may optionally sleep, hibernate, restart, or shut down a machine after unattended work. A false completion signal could otherwise interrupt work or cause data loss.

## Decision

Power actions require explicit opt-in, successful completion policy, configured verification, sibling-job checks, platform capability checks, a visible cancellable countdown, a final eligibility re-check, and audit logging.

Development and automated testing use a simulated adapter by default.

## Consequences

- Slightly more friction for consequential actions.
- Greatly reduced risk of surprise shutdowns.
- Completion semantics must be explicit and testable.
- Platform-specific capabilities and limitations must be surfaced to users.
