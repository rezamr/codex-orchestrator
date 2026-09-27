# Design: Event-driven delegated orchestration

## Context

The current engine owns one provider runtime per active job. A completed provider turn immediately enters verification. It has no durable relationship between a controller turn and a delegated child turn, so a prompt-driven controller can remain active and spend tokens polling a child.

Codex CLI `0.155.0-alpha.16` was checked through its generated app-server JSON Schema. The schema exposes a `turn/completed` notification, `thread/resume`, and `turn/start` with optional `model`, `effort`, and `outputSchema`. The implementation uses those supported fields behind the provider adapter. It does not assume a server-side parent suspension primitive.

## Lifecycle

```text
controller RUNNING
  -> provider turn/completed
  -> validate structured routing decision
  -> transaction: persist dispatch + child job + parent WAITING_FOR_CHILD
  -> disconnect parent provider runtime
  -> queue child

child terminal event
  -> validate/redact/bound result
  -> persist result packet once
  -> parent WAITING_FOR_CHILD -> STARTING
  -> thread/resume + one turn/start with bounded packet
```

`WAITING_FOR_CHILD` is durable and protected for workspace/power policy, but it is not an active provider slot. The parent has no runtime entry in this state. No timer, provider read, status prompt, or inference is scheduled for the parent.

## Structured contracts

Controller turns receive a JSON output schema with three actions:

- `delegate`: one child role, instruction, model, and effort;
- `complete`: a final summary indicating that configured verification may run;
- `blocked`: a bounded reason requiring operator review.

Delegation decisions classify the task, complexity, expected file count, and risk flags. The controller requests a first-class profile rather than arbitrary provider settings. The application validates the request against policy and owns the final route. `LUNA_DEV` is accepted only for bounded, proven, low-complexity work affecting no more than three files with every sensitive-impact flag false. Unknown or sensitive impact, medium/high complexity, ambiguity, multi-module work, or a prior Luna development failure routes to `SOL_DEV`. Runtime QA routes to `LUNA_QA`.

The immutable profile registry is:

- `ASTRA_CONTROLLER`: `gpt-6-astra`, `high`, controller, no source writes;
- `LUNA_QA`: `gpt-5.6-luna`, `max`, runtime QA, no source writes;
- `LUNA_DEV`: `gpt-5.6-luna`, `max`, junior development, source writes allowed;
- `SOL_DEV`: `gpt-5.6-sol`, `high`, senior development, source writes allowed.

Requested model and effort are always recorded. Resolved model and effort remain `UNVERIFIED` unless trusted provider telemetry proves them.

Delegated children receive a JSON output schema with `completed` or `blocked`, a summary, bounded evidence, and an optional next action. Provider output is still validated locally because transport success does not establish semantic validity.

Only supported model and reasoning-effort values accepted by the local domain schema are dispatched. Requested values are persisted. Resolved values stay null/`UNVERIFIED` unless the provider supplies trustworthy execution metadata; configured thread metadata is not represented as per-turn telemetry.

## Persistence and idempotency

Migration 4 adds job kind, requested model, and requested effort columns plus a `delegations` table. A delegation links the parent job/attempt to one child job and stores its lifecycle, structured decision, bounded result packet, and timestamps.

The dispatch transaction creates the child, inserts the delegation, and changes the parent to `WAITING_FOR_CHILD` before the child can start. A unique parent-attempt constraint prevents duplicate dispatch from duplicate completion notifications. A unique child-job constraint prevents one child from settling multiple parents.

Settlement is compare-and-set from `running` to a terminal result state. Parent resumption changes the delegation to `parent_resuming` before provider work starts. Completion of the resumed parent attempt marks it `resumed`; restart recovery can safely retry a persisted `child_completed` result but will not create a second child.

## Concurrency

Only one delegation may be active for a parent. A waiting parent reserves its project against unrelated queued jobs. Its own delegated child is allowed to run in that reserved project. The existing global provider concurrency limit counts the running child, not the inactive parent.

This change dispatches one child per controller decision. Parallel fan-out is intentionally excluded, which also preserves the one-source-writer invariant.

Source-writing profiles acquire a durable per-project writer lease as part of dispatch. A second source writer fails closed. A development profile cannot certify its own output; QA is dispatched as a separate `LUNA_QA` child only after the writer has reached a stable terminal result.

## Failure modes

- Invalid controller JSON/schema: parent enters `NEEDS_REVIEW`; no child is created.
- Child reports blocked: packet is persisted and parent resumes once to choose the next action.
- Child provider fails after bounded retries or needs authentication/review: a failed packet is persisted and parent resumes once.
- Child verification fails: a failed packet with verification status resumes the parent.
- Parent resume is rejected as provider-busy: existing `NEEDS_REVIEW` behavior applies; no new parent thread is created.
- Application exits during child work: normal active-job reconciliation marks uncertain child work for review while the parent remains asleep; it does not create a duplicate child or infer completion.
- Application exits after settlement but before resume: startup finds the terminal packet and schedules one parent resume.
- Application exits after parent resume started: existing active-turn reconciliation requires review rather than issuing a duplicate turn.

## Security boundaries

- Renderer input remains validated by Zod and cannot provide arbitrary app-server methods.
- Model/effort/output-schema fields cross only the typed provider interface.
- Full controller and child transcripts remain out of SQLite. Persisted decision/result JSON is redacted and length bounded.
- Provider credentials and raw app-server payloads are not stored.
- Child instructions inherit the selected project root and normal approval/sandbox policy.

## Recovery

Startup first applies existing conservative active-job reconciliation. It then inspects active delegations:

- terminal child plus waiting parent: ensure a result packet exists and resume once;
- uncertain child moved to `NEEDS_REVIEW`: keep the parent in `WAITING_FOR_CHILD`, retain the delegation, and require review without starting a duplicate child;
- missing/inconsistent parent or child: mark the parent `NEEDS_REVIEW` and record an integrity event;
- `parent_resuming` with no trustworthy active runtime after restart: require review to avoid duplicate inference.

There is no periodic reconciliation loop. Recovery runs at startup; live progress is driven by provider events.

## Dormancy evidence

Each delegation persists controller and child attempt identifiers, routing classification, policy outcome, lifecycle timestamps, requested and resolved model/effort, terminal result, escalation, and the counters below:

- parent model turns while child active;
- parent provider starts and resumes while child active;
- parent commands while child active;
- parent status polls while child active;
- unsolicited child status requests;
- passive wait duration;
- controller/child turn counts, attempt counts, and active duration.

The application starts parent work through one guarded boundary. If a child remains active, parent start/resume fails closed before a provider is created. Child approval, input, authentication, or rate-limit waits do not wake the parent.

## Test strategy

- State-machine tests for `WAITING_FOR_CHILD` transitions and inactive/protected classification.
- Migration/repository tests for schema 4, transactional dispatch, uniqueness, bounded packets, and reopen behavior.
- Provider tests proving model, effort, and output schema are sent on `turn/start` and completion remains notification-driven.
- Orchestrator integration tests proving the parent runtime is disconnected and no parent calls occur while the child is active, then exactly one resume occurs on completion, blocked, failed, and restart paths.
- Deterministic tests for a simulated long child interval, child rate-limit waiting, Luna/Sol routing, failure escalation, writer exclusivity, independent certification, crash recovery without duplicate children, unverified resolved routing metadata, and malformed child results.
- Renderer/E2E coverage for creating a controller job and inspecting waiting/routing state.
- Existing typecheck, lint, format, unit/integration, E2E, build, and packaging checks.

## Documentation sources

- Installed app-server schema generated with `codex app-server generate-json-schema` from Codex CLI `0.155.0-alpha.16`.
- OpenAI Codex Goals cookbook: continuation is event-driven and occurs only at idle safe boundaries.
- OpenAI agent events documentation: terminal turn events determine turn outcome; idle state alone does not establish success.
