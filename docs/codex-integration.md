# Codex Integration

## Decision

The primary local integration is **Codex app-server**, behind a provider abstraction.

The project must not automate the Codex graphical interface.

OpenAI describes app-server as the integration layer for products that need to keep conversations open, stream events, interrupt work, expose tools, and handle approvals. The app-server uses its own protocol; it is not an MCP server.

Because this integration surface may evolve, all raw protocol handling stays inside the Codex provider adapter.

## Responsibilities of the Codex provider

- automatically discover and version-check the installed Codex CLI,
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
- read account, usage/rate-limit, and saved-thread data through read-only methods,
- shut down cleanly.

## Authentication

The application should prefer authentication supported by the installed Codex environment.

Rules:

- do not copy or persist ChatGPT/OpenAI credentials into SQLite,
- do not print tokens in logs,
- do not invent an unofficial authentication flow,
- expose authentication state and remediation instructions to the user,
- keep API-key-based providers separate from local-account-based operation if API mode is added later.

Connection checks call `account/read` with `refreshToken: false`. The UI receives only a safe auth mode, plan/status, rate-limit windows, and token-activity summaries; account email and credentials are omitted. The integration does not call login/logout, billing, reset-credit, or usage-limit mutation methods.

## Automatic CLI discovery

The user does not browse for an executable. On Windows the main process checks the per-user Codex CLI installation location under the `LOCALAPPDATA` environment value and then candidates from `where.exe codex.exe`; on macOS/Linux it resolves `codex` with `which`. Candidate names must be the Codex CLI executable (`codex.exe` on Windows, `codex` elsewhere), so a GUI executable such as `ChatGPT.exe` is never accepted. Each candidate is probed with `--version`, and discovery continues when a stale/unlaunchable candidate fails. A SQLite migration removes the obsolete stored manual override from earlier builds. Protected Windows app packages are not inspected.

## Process supervision

The provider supervises the process for the lifetime of the operation and tracks:

- executable path,
- spawned PID for the current app instance,
- stdout/stderr transport as required by the protocol,
- bounded JSON-RPC request timeout,
- protocol-ready state,
- exit code/signal,
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

At connection time, detect and display:

- Codex found/not found,
- executable path discovered by the application,
- version,
- app-server launch success,
- authentication/connection readiness,
- supported lifecycle operations that can be proven.

Avoid hard-coding assumptions where capability probing is possible.

The Settings action performs a temporary connection check and closes the app-server afterward. Its status means that the local CLI/app-server was available for the check, not that Orchestrator keeps a background Codex connection open between jobs.

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

## Implemented protocol profile

The provider uses the documented newline-delimited JSON app-server transport over stdio. It sends `initialize` followed by `initialized`, reads account state, and uses `thread/start`, `thread/resume`, `turn/start`, and `turn/interrupt`. It also reads `account/rateLimits/read`, `account/usage/read`, paginated `thread/list`, and on-demand `thread/read` without resuming a stored thread. Thread listing requests `useStateDbOnly: true` to avoid app-server scan-and-repair behavior. Server-initiated command, file-change, and user-input approval requests are persisted and answered through their original request IDs.

The adapter starts Codex with `app-server --stdio`, `approvalPolicy: on-request`, and the provider-owned `workspace-write` sandbox. It never reads or stores ChatGPT/OpenAI authentication material. A missing or signed-out Codex installation becomes an explicit provider/error or authentication-required state.

Starting with `0.1.0-alpha.1`, account and thread summaries load in the background at app startup and on refresh. The provider projects `cwd`, `projectId`, `source`, model, archived state, and status into bounded shared types; `notLoaded` is displayed as **Stored**. Workspaces are grouped from thread `cwd` values, because the supported app-server interface does not provide a standalone project index. The Automations view is restricted to Orchestrator-owned schedules; no undocumented Codex desktop automation index is read.

Browsing remains read-only. Continuing an existing conversation requires a separate user instruction and checks the current thread index, archival/activity status, a real canonical working directory, and local session ownership. Orchestrator persists the job and session link together, then calls `thread/resume` and `turn/start` using the new instruction. Later attempts use the standard continuation prompt. External Codex clients can change a thread between these checks; that cross-process race is a known alpha limitation, not a guarantee of exclusive ownership outside Orchestrator.

Compatibility verified in automated tests:

- deterministic JSONL child-process fixture covering handshake, start, resume, interrupt, approval response, account/usage reads, thread pagination, and no-resume transcript reads;
- automatic CLI discovery and `--version` probe against the installed Codex CLI on 2026-09-25;
- opt-in live read-only app-server check on 2026-09-25, covering account/usage, thread listing, and selected-thread read without starting or resuming a turn.

Not yet claimed: a completed real-account turn. That remains an explicit controlled release test because it consumes account usage and may require interactive authentication/approval.

## Desktop continuity contract (alpha.2)

Official OpenAI documentation distinguishes `thread/start` (new history) from `thread/resume` (reopen the recorded thread id) and `turn/start` (append user input and generate). Text such as “please continue” is not a protocol-level session selector. The job form now makes this choice explicit and History can hand its selected thread directly to the continuation form. The destination title, id, and workspace are shown before submission.

**Open in ChatGPT** validates an existing local thread through a metadata-only `thread/read` and opens `codex://threads/<thread-id>`, documented by OpenAI for ChatGPT desktop. This is a narrow main-process operation, not a general renderer URL launcher, UI automation, or automatic prompt submission. A missing desktop protocol handler is reported as an error. Automated tests intercept the operating-system launcher; actual desktop navigation remains a manual smoke check.

App-server is a local Codex integration, not a general API for ChatGPT web conversations. No automatic cross-client live refresh or external-client exclusivity is claimed. A turn finishing also does not prove that the original engineering objective was fulfilled: operator review and configured verification still matter, and a model may report a genuine external blocker.

The official event contract identifies `item/completed` as authoritative. Agent-message deltas are therefore not persisted as individual word/token audit rows; completed messages are displayed once, bounded to 2,000 characters. The on-demand History transcript remains available for fuller context.

## Official references checked for alpha.2

- [OpenAI: Codex as a platform](https://developers.openai.com/blog/codex-as-a-platform)
- [OpenAI: App-server protocol, start/resume/read, and item lifecycle](https://learn.chatgpt.com/docs/app-server)
- [OpenAI: ChatGPT desktop thread deep links](https://learn.chatgpt.com/docs/reference/commands#deep-links)
- [OpenAI: Desktop and CLI developer commands](https://learn.chatgpt.com/docs/developer-commands)

## Earlier integration references

- https://developers.openai.com/blog/codex-as-a-platform
- https://developers.openai.com/docs/mcp-server
- https://developers.openai.com/cookbook/examples/codex/using_goals_in_codex
