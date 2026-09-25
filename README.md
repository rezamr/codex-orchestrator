# Codex Orchestrator

A desktop-first, open-source orchestration layer for managing long-running Codex work from a clear graphical interface.

> **Status:** pre-alpha / specification-first foundation. This repository is being designed with OpenSpec before implementation.

## Why this project exists

Long-running Codex tasks need a durable control plane around them: task queues, session continuity, rate-limit recovery, approvals, verification, crash recovery, notifications, and safe power actions after work completes.

Codex Orchestrator is designed to provide that control plane without relying on UI scraping or simulated mouse/keyboard input.

## Product direction

- Electron desktop application
- Vue 3 + TypeScript user interface
- Local-first state and settings
- Codex integration through a provider abstraction, with Codex app-server as the primary local provider
- Persistent task/session lifecycle management
- Automatic recovery from transient failures and usage-limit waits
- Evidence-based completion and verification
- Safe sleep / hibernate / shutdown actions after successful completion
- Human-readable activity log and diagnostics
- Multiple projects, jobs, queues, profiles, and policies
- Cross-platform architecture with capability-aware OS integrations
- OpenSpec-driven development

## Architecture at a glance

```text
Electron + Vue Renderer
        |
        | secure IPC
        v
Electron Main / Orchestration Core
        |
        +-- Task & Queue Manager
        +-- Session Manager
        +-- Retry / Limit Manager
        +-- Scheduler
        +-- Verification Engine
        +-- Approval Manager
        +-- Recovery Manager
        +-- Notification Manager
        +-- Power Manager
        +-- SQLite persistence
        |
        v
Provider Interface
        |
        +-- Codex App Server Provider (primary)
        +-- future providers / adapters
```

The application must never depend on scraping the Codex UI. The primary integration is a local Codex process exposed through its documented app-server protocol.

## OpenSpec workflow

This repository uses [OpenSpec](https://openspec.dev/) as the planning source of truth.

For Codex, OpenSpec installs skills under `.agents/skills/`. Typical skill invocations include:

```text
$openspec-propose
$openspec-apply-change
$openspec-verify-change
$openspec-archive-change
```

Initialize or refresh OpenSpec for Codex:

```bash
npm run openspec:init
```

The initial implementation change is documented under:

```text
openspec/changes/initial-desktop-orchestrator/
```

Do not implement behavior that contradicts the active OpenSpec artifacts.

## Repository map

```text
.
├── AGENTS.md
├── CHANGELOG.md
├── CONTRIBUTING.md
├── LICENSE
├── README.md
├── ROADMAP.md
├── SECURITY.md
├── SUPPORT.md
├── docs/
│   ├── architecture.md
│   ├── codex-integration.md
│   ├── development.md
│   ├── power-management.md
│   ├── product-requirements.md
│   ├── release-process.md
│   ├── security-model.md
│   ├── ui-ux-guidelines.md
│   └── decisions/
├── openspec/
│   ├── config.yaml
│   ├── specs/
│   └── changes/
├── src/
│   ├── main/
│   ├── preload/
│   ├── renderer/
│   └── shared/
└── tests/
```

## Non-negotiable principles

1. **No fragile UI automation.** Integrate with Codex through supported programmatic interfaces.
2. **No silent destructive actions.** Shutdown, restart, sleep, and hibernate are opt-in, policy-gated, cancellable, and logged.
3. **Completion requires evidence.** A model saying “done” is not sufficient when verification rules are configured.
4. **Local-first by default.** Sensitive project paths, prompts, and task history remain local unless the user explicitly configures external integrations.
5. **Recoverability over cleverness.** Durable tasks should survive application restarts wherever technically possible.
6. **Provider boundaries stay clean.** The orchestration core must not be tightly coupled to a single Codex transport.
7. **Professional UI.** Neutral, restrained, accessible visual design; no decorative color overload, gimmicks, or unnecessary animation.

## Current status

The repository currently contains the product and architecture specification. Implementation should begin from the active OpenSpec change and must include tests, documentation updates, and verification evidence before the change is archived.

See [ROADMAP.md](ROADMAP.md) and [docs/product-requirements.md](docs/product-requirements.md).

## Contributing

Contributions, bug reports, design discussions, and forks are welcome. Please read [CONTRIBUTING.md](CONTRIBUTING.md), [SECURITY.md](SECURITY.md), and the active OpenSpec change before proposing implementation work.

## License

MIT. See [LICENSE](LICENSE).

## Project notice

Codex Orchestrator is an independent community project and is not an official OpenAI product. “OpenAI” and “Codex” are trademarks of their respective owner.
