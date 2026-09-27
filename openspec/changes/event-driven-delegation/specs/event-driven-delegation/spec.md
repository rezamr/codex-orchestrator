# Delta for Event-driven Delegation

## Purpose

Define externally owned parent suspension and event-driven child completion so a controller model consumes no tokens while delegated work is running.

## ADDED Requirements

### Requirement: Structured controller boundary

The system SHALL require a controller turn to return one validated structured action that either delegates one child, declares completion, or declares a blocker.

#### Scenario: Controller delegates child work

- **WHEN** a controller turn completes with a valid delegate action
- **THEN** the system persists the routing decision and child identity before child work starts
- **AND** the controller turn is fully ended before the child provider turn starts

### Requirement: External parent suspension

The system MUST place a parent with active delegated work in `WAITING_FOR_CHILD` with no parent provider runtime, inference, tool calls, polling, or status prompts.

#### Scenario: Child remains active

- **WHEN** a delegated child is starting, running, or waiting for its own required approval
- **THEN** the parent remains durably `WAITING_FOR_CHILD`
- **AND** elapsed time does not cause a parent provider request

#### Scenario: Parent start is attempted while child is active

- **WHEN** any path requests a parent provider start or resume while its child is non-terminal
- **THEN** the application rejects the request before constructing or calling a provider
- **AND** the parent remains `WAITING_FOR_CHILD`

#### Scenario: Child waits for a provider limit or human action

- **WHEN** the child enters a rate-limit, approval, input, or authentication wait
- **THEN** the parent remains asleep
- **AND** only a terminal child provider event can make the parent eligible to resume

### Requirement: Event-driven parent resumption

The system SHALL resume a waiting parent once, and only once, after a terminal child event has been persisted as a bounded result packet.

#### Scenario: Child completes successfully

- **WHEN** the child completion event and validated result are persisted
- **THEN** the parent resumes its existing provider thread with one bounded result packet
- **AND** no polling turn is used to discover completion

#### Scenario: Child blocks or fails

- **WHEN** the child reaches a blocked or final failed outcome
- **THEN** that outcome is persisted in a bounded result packet
- **AND** the parent resumes once to choose the next action

### Requirement: Bounded delegated loops

The system MUST enforce one active child per parent and a persisted maximum delegation count.

#### Scenario: Controller exceeds its delegation budget

- **WHEN** a controller requests another child after the configured maximum is reached
- **THEN** no child is created
- **AND** the parent enters `NEEDS_REVIEW` with an auditable reason

### Requirement: Workspace-safe concurrency

The system SHALL reserve a waiting parent's project from unrelated jobs while permitting that parent's own child to run.

#### Scenario: Unrelated job is queued for the same project

- **WHEN** a parent is waiting for its delegated child
- **THEN** the unrelated job remains queued
- **AND** the linked delegated child may use the parent's reserved project

### Requirement: Application-owned agent routing

The system MUST define immutable first-class profiles for `ASTRA_CONTROLLER`, `LUNA_QA`, `LUNA_DEV`, and `SOL_DEV`, with explicit model, reasoning effort, role, task class, and source-write capability.

#### Scenario: Bounded low-risk development

- **WHEN** a controller requests `LUNA_DEV` for a proven, bounded, low-complexity change affecting no more than three files and every sensitive-impact flag is false
- **THEN** the application accepts `LUNA_DEV`

#### Scenario: Sensitive or uncertain development

- **WHEN** development affects or may affect authentication, workspace scope, queries, security, database, deployment, architecture, several modules, or has unknown classification
- **THEN** the application routes the work to `SOL_DEV`
- **AND** records why Luna was not selected

#### Scenario: Luna development failure

- **WHEN** `LUNA_DEV` already failed on the orchestration
- **THEN** the next development dispatch routes to `SOL_DEV`

### Requirement: Single writer and independent certification

The system MUST allow at most one active source-writing child per project and MUST NOT let a development child certify its own patch.

#### Scenario: Second writer requested

- **WHEN** a source writer is active for a project
- **THEN** another source-writing dispatch fails closed

#### Scenario: Writer requests certification

- **WHEN** a development result needs QA
- **THEN** certification runs in a distinct `LUNA_QA` child after the writer is terminal

### Requirement: Dormancy and usage observability

The system SHALL persist dispatch audit metadata and separate controller/child usage counters, including all parent-activity counters during child execution and passive wait duration.

#### Scenario: Operator inspects completed delegation

- **WHEN** the child reaches a terminal state
- **THEN** the audit identifies trigger, profile, task class, policy decision, requested/resolved model and effort, timestamps, result, and escalation
- **AND** parent-turn, provider-call, command, poll, and unsolicited-status counters during child activity are exactly zero

### Requirement: Visible delegation state

The system SHALL expose controller, child, waiting, requested routing, and terminal result status through typed renderer data and text labels.

#### Scenario: Operator inspects a waiting controller

- **WHEN** the parent is waiting for a child
- **THEN** the UI identifies the linked child and requested model/effort
- **AND** status meaning is available without relying only on color
