# Security Model

## Trust boundaries

Codex Orchestrator crosses several trust boundaries:

1. Vue renderer -> preload bridge
2. preload -> Electron main
3. Electron main -> filesystem/processes
4. main -> Codex app-server
5. main -> verification commands
6. main -> OS power APIs
7. application -> optional future external integrations

The renderer is not trusted with privileged capabilities.

## Assets to protect

- source repositories and working trees,
- user prompts/objectives,
- provider/session metadata,
- authentication state and tokens,
- local filesystem,
- command execution capability,
- system power controls,
- application database and logs.

## Threats

### Renderer compromise

A renderer XSS or compromised remote resource could attempt privileged IPC calls.

Mitigations:
- context isolation,
- no Node integration,
- narrow preload API,
- strict CSP,
- no privileged remote content,
- validate IPC payloads in main,
- avoid generic shell/filesystem IPC.

### Command injection

Project paths, verification commands, or provider arguments could be used to alter spawned command behavior.

Mitigations:
- prefer argument arrays over shell strings,
- use `shell: false` where possible,
- validate executable and working-directory boundaries,
- clearly separate user-approved custom shell commands,
- never concatenate untrusted input into privileged commands.

### Path traversal / wrong project

Mitigations:
- canonicalize paths,
- retain project root identity,
- ensure internal file operations remain within intended roots unless explicitly authorized,
- surface symlink/reparse-point edge cases where they matter.

### Secret leakage

Mitigations:
- structured redaction,
- never log environment wholesale,
- never persist access tokens in SQLite,
- diagnostic export has a redaction pass,
- logs use allowlisted fields for sensitive provider events.

### Unsafe power action

Mitigations:
- explicit opt-in,
- completion/verification guards,
- sibling-job guard,
- cancellable countdown,
- second guard check immediately before action,
- dry-run adapter for development/tests,
- audit log.

### Duplicate unattended work

A crash/restart could accidentally start another agent session.

Mitigations:
- durable attempt/session records,
- recovery reconciliation,
- idempotency tokens where provider supports them,
- visible NEEDS_REVIEW state when certainty is insufficient.

### Malicious repository content

A selected repository may contain scripts/instructions that cause agent or verification behavior.

Mitigations:
- display verification commands,
- do not auto-run arbitrary project scripts outside configured policies,
- preserve Codex sandbox/approval controls,
- treat repository instructions as project content, not application privilege grants.

## Electron defaults

Required:
- `contextIsolation: true`
- `nodeIntegration: false`
- sandbox renderer where compatible
- deny unexpected navigation/new windows
- open external links through controlled handler
- no `eval` or dynamic remote code
- CSP suitable for packaged application

## Database

The database is not a secret store.

Sensitive columns should be minimized. Schema must support migrations. Corruption/errors must fail visibly rather than resetting history silently.

## Logging

Use structured logs with:
- timestamp,
- severity,
- subsystem,
- job/session identifiers,
- sanitized message,
- optional safe metadata.

Do not log:
- access tokens,
- cookies,
- authorization headers,
- full environment snapshots,
- private source contents by default.

## Updates and dependencies

Before shipping auto-update:
- define signing/trust strategy,
- validate update source,
- prevent downgrade/rollback attacks where practical.

Dependencies with Electron main-process privilege should be reviewed carefully and kept minimal.

## Security review checklist

Before a release:
- IPC surface reviewed,
- external navigation reviewed,
- spawn/shell usage reviewed,
- power actions reviewed,
- secrets/log redaction tested,
- dependency audit reviewed,
- database migrations tested,
- recovery paths tested,
- packaging security settings reviewed.
