# ADR 0003: SQLite for durable local orchestration state

- Status: Accepted
- Date: 2026-09-24

## Context

Jobs, schedules, attempts, events, verification evidence, and settings must survive application restarts without requiring a server.

## Decision

Use SQLite through a repository layer and explicit migrations.

## Consequences

- Local-first operation with transactional updates.
- Scheduler and recovery can use durable queries.
- Schema migration discipline is required.
- Migration 3 removes the obsolete manually configured Codex executable path; provider discovery is automatic.
- SQLite is not a credential store.
