# Security Policy

## Supported versions

Until the first stable release, only the latest code on the default branch is actively maintained.

## Reporting a vulnerability

Please avoid publishing exploitable security details in a public issue. Use GitHub's private vulnerability reporting feature when available for this repository. If private reporting is unavailable, open a minimal public issue asking the maintainer for a private contact channel without including exploit details.

## Security model

Codex Orchestrator is a privileged desktop application. It may:
- access user-selected project directories,
- launch and communicate with local Codex processes,
- execute configured verification commands,
- retain task/session metadata,
- request OS notifications,
- optionally request sleep, hibernate, restart, or shutdown.

Because of this privilege boundary:

- Renderer content must be treated as untrusted.
- Node integration must remain disabled in renderer windows.
- Context isolation must remain enabled.
- Privileged actions must use an explicit, narrow preload API.
- IPC inputs must be validated.
- Shell command construction must avoid unsafe string concatenation.
- Secrets must never be persisted in plaintext application logs.
- Power actions must be explicit, guarded, cancellable, and auditable.
- Remote content must never receive privileged Electron capabilities.

See `docs/security-model.md` for the detailed threat model.

## Dependency security

Dependencies should be kept minimal. Security-impacting dependency upgrades must be tested rather than blindly auto-merged.

## Disclosure

We aim to acknowledge valid reports promptly, investigate impact, prepare a fix, and publish an appropriate advisory after remediation.
