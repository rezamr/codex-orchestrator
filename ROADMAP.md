# Roadmap

This roadmap describes direction, not release dates. Completed capabilities refer to the current `0.1.0-alpha.2` implementation; they do not imply that every platform or real-world power action has been manually validated.

## Added in `0.1.0-alpha.2`

- Explicit new/existing conversation targeting and History continuation.
- Official ChatGPT desktop thread deep-link navigation with narrow validated IPC.
- Safe Windows npm verification, failed-launch evidence, and checks-only retry/recovery.
- Readable completed-message audit entries rather than token-per-row noise.

## Implemented in `0.1.0-alpha.0`

- Electron + Vue 3 + TypeScript desktop application with a narrow, validated preload/IPC boundary.
- Local project management, durable jobs, queue/concurrency controls, attempts, session references, activity, settings, and diagnostics.
- Codex app-server provider abstraction, automatic CLI discovery, process/version probing, job lifecycle operations, approvals, and streamed event normalization.
- Read-only Codex account/plan/usage summaries and active/archived thread history, including pagination and on-demand transcript reads without resuming the thread.
- SQLite migrations, persisted schedules, bounded retry/resume policies, restart recovery, duplicate-work guards, and `NEEDS_REVIEW` handling for uncertain cases.
- Verification checks with retained evidence, notifications, redacted logs/diagnostics, and fake-provider/fake-power unit, integration, and Electron E2E coverage.
- Guarded and cancellable post-completion power countdowns plus sleep prevention through platform adapters.
- Windows NSIS and portable packaging targets; macOS DMG and Linux AppImage targets are configured but not validated by the current Windows CI.

## Added in `0.1.0-alpha.1`

- Shared background Codex account/history loading, discovered workspace projection, and existing conversation views across the main pages.
- Explicit eligible-conversation continuation as a durable same-session job, with local duplicate/archived/active/path guards and fake-provider E2E coverage.
- Codex as the default job provider and a truthful Orchestrator-only Automations scope.

## Alpha limitations and remaining validation

- Controlled manual testing of real Windows lock, sleep, hibernate, shutdown, and restart actions remains OpenSpec task 13.6. Do not run these actions in CI or on an ordinary development workstation.
- A usage-consuming real Codex engineering turn has not been tested. Real Codex validation to date uses supported read-only account, usage, and history methods.
- Real disruptive power actions are off by default and unavailable outside packaged Windows builds. macOS/Linux disruptive power support and reliable automatic wake scheduling are not implemented.
- Artifacts are unsigned, Windows is the only current CI platform, and schema downgrade is unsupported.
- Codex history retrieval is intentionally bounded; Orchestrator does not copy transcripts to its database.
- Codex desktop automation and standalone project indexes are not exposed by the supported app-server interface; workspaces are inferred from conversation working folders. External Codex clients can race an Orchestrator continuation check.

## Planned next

- Complete controlled, documented Windows power-action validation before enabling those capabilities for a release.
- Broaden installer, upgrade, accessibility, and platform testing; establish signing and update trust before distributing production builds.
- Improve large-history search and browsing without exceeding safe memory/rendering bounds.
- Evaluate reliable wake scheduling only where operating-system and hardware capability checks can prove support.
- Consider additional provider adapters, optional external integrations (including MCP tools), and reusable job templates after core compatibility and migration behavior mature.
- Define a compatibility policy and stable release criteria after real-world alpha feedback.
