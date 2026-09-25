# Codex Integration

## Decision

The primary local integration is **Codex app-server**, behind a provider abstraction.

The project must not automate the Codex graphical interface.

OpenAI describes app-server as the integration layer for products that need to keep conversations open, stream events, interrupt work, expose tools, and handle approvals. The app-server uses its own protocol; it is not an MCP server.

Because this integration surface may evolve, all raw protocol handling stays inside the Codex provider adapter.

## Responsibilities of the Codex provider

- discover configured/installed Codex executable,
- report version and capabilities,
- start and supervise the local app-server process,
- perform protocol initialization/handshake,
- start a new thread/session,
- resume an existing thread/session,
- start turns,
- receive and normalize streaming events,
- interrupt work,
- surface approval requests,
- respond to approvals,
- classify errors,
- expose health/reconnect state,
- shut down cleanly.

## Authentication

The application should prefer authentication supported by the installed Codex environment.

Rules:
- do not copy or persist ChatGPT/OpenAI credentials into SQLite,
- do not print tokens in logs,
- do not invent an unofficial authentication flow,
- expose authentication state and remediation instructions to the user,
- keep API-key-based providers separate from local-account-based operation if API mode is added later.

## Process supervision

The provider process manager must track:
- executable path,
- spawned PID for the current app instance,
- stdout/stderr transport as required by the protocol,
- startup timeout,
- protocol-ready state,
- exit code/signal,
- restart count,
- last failure.

A child process exit must be classified. It does not automatically mean a task completed or failed permanently.

## Protocol isolation

Raw protocol messages must not flow directly into Vue stores.

Use:
```text
app-server message
  -> protocol decoder
  -> provider event mapper
  -> normalized domain event
  -> orchestration state transition
  -> persisted event/state
  -> sanitized UI projection
```

## Capability probing

At connection time, detect and persist/display:
- Codex found/not found,
- executable path selected by user or discovered,
- version,
- app-server launch success,
- authentication/connection readiness,
- supported lifecycle operations that can be proven.

Avoid hard-coding assumptions where capability probing is possible.

## Session continuity

The job stores an opaque provider session/thread reference when available.

On resume:
1. validate that the job is in a resumable state,
2. load original objective and last known provider/session state,
3. reconnect provider if necessary,
4. resume the existing provider session where supported,
5. send a bounded continuation turn,
6. record a new Attempt.

Do not silently create a fresh session when the user expects continuity unless the UI clearly explains the fallback and the policy permits it.

## Continuation prompt

A continuation turn should be concise and state-oriented, for example:

```text
Continue the existing objective from the current repository and session state.
Inspect work already completed before making changes.
Do not repeat completed work.
Resolve remaining requirements from the active OpenSpec change.
Run the required verification before claiming completion.
If blocked by a decision that requires the user, stop and request input.
```

The original objective remains immutable job metadata. Continuation text is not a replacement for it.

## Usage/rate-limit handling

Do not assume every limit has a machine-readable reset timestamp.

Classify evidence in descending confidence:
1. structured provider retry/reset metadata,
2. documented protocol error fields,
3. conservative parsing of a human-readable provider message,
4. user-configured retry time,
5. bounded fallback retry schedule.

Store:
- detected category,
- source,
- raw redacted evidence,
- computed retry time,
- confidence,
- retry count.

Never represent waiting as “bypassing” a provider limit.

## Goals

If the connected Codex version exposes durable Goals and their use improves reliability, the provider may use them as a capability. The orchestration engine must not require Goals to exist.

The application remains responsible for external lifecycle decisions such as pause, bounded auto-resume, verification policy, and system power actions.

## MCP

MCP is an optional tool/integration layer for Codex, not the control channel used to wake or resume Codex itself.

Future MCP integration may expose third-party tools, project services, or internal integrations. It must remain separate from the app-server provider lifecycle.

## Compatibility strategy

- Record tested Codex versions in release notes.
- Fail clearly when app-server is unavailable.
- Keep provider protocol fixtures for regression tests.
- Prefer feature/capability checks to version-only branching.
- Keep an escape hatch for a future official SDK/provider without rewriting domain logic.

## References

- https://developers.openai.com/blog/codex-as-a-platform
- https://developers.openai.com/docs/mcp-server
- https://developers.openai.com/cookbook/examples/codex/using_goals_in_codex
