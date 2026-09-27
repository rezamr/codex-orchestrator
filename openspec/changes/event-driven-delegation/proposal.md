# Change: Event-driven delegated orchestration

## Goals

- End a controller model turn completely before delegated child work starts.
- Move child waiting, completion detection, and parent resumption into the desktop application's durable orchestration layer.
- Guarantee that a parent in `WAITING_FOR_CHILD` has no provider runtime, active model inference, tool calls, polling prompts, or status-request turns.
- Persist dispatches and bounded child-result packets so completion and restart recovery are deterministic and auditable.
- Preserve explicit model and reasoning-effort routing through the provider adapter using supported Codex app-server fields.
- Enforce first-class controller, QA, junior-development, and senior-development profiles with application-owned routing policy.
- Enforce one source writer per project and require an independent QA child to certify a writer's result.
- Persist dispatch audit and usage-observability counters that prove the parent remained dormant.

## Non-goals

- Replacing Codex app-server with UI automation or an undocumented transport.
- Running several source-writing children concurrently in one project.
- Persisting complete child transcripts, reasoning traces, credentials, cookies, or provider authentication data.
- Treating a model completion event alone as proof that engineering verification passed.
- Adding remote/cloud multi-tenant orchestration in this change.

## Capabilities

- **event-driven-delegation** — structured controller decisions, durable parent/child dispatch records, a non-running `WAITING_FOR_CHILD` state, event-triggered child settlement, bounded result packets, and one-shot parent resumption.
- **codex-provider** — supported per-turn model, effort, and JSON output-schema overrides behind the provider interface.
- **persistence-recovery** — transactional delegation persistence and conservative restart reconciliation without polling or duplicate work.
- **operator-ui** — explicit controller-job creation and visible parent/child status and routing metadata.

## Risks

- A malformed or missing structured controller/child result could strand a workflow. The system fails closed to `NEEDS_REVIEW` and records the validation error without guessing a routing action.
- The application may stop after child completion but before parent resume. The persisted result packet is idempotently discovered on restart and resumed at most once.
- An external Codex client may acquire the parent thread before resumption. Existing provider-busy handling remains authoritative and requires review.
- Child output can contain sensitive project text. Only a redacted, length-bounded structured packet is stored; full transcript behavior remains unchanged.
- Controller loops could create unbounded usage. A persisted maximum delegation count stops further dispatch and requires review.

## Impact

- Adds one job state and explicit job kinds/routing fields.
- Adds a SQLite migration for durable delegation records and job routing metadata.
- Adds durable policy, attempt, audit, and zero-parent-activity evidence to each delegation.
- Extends the provider-neutral start/resume contract with optional model, effort, and output schema.
- Updates orchestration, recovery, renderer forms/detail views, fake-provider fixtures, tests, architecture documentation, and release notes.
- Uses only capabilities verified in the installed Codex CLI app-server schema: `turn/completed`, `thread/resume`, and `turn/start` fields `model`, `effort`, and `outputSchema`.
