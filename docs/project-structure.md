# Project Structure

This tree describes the current implementation. Keep boundaries useful and avoid adding layers only to match a diagram.

```text
codex-orchestrator/
├── .agents/skills/                  # OpenSpec-managed Codex skills
├── .github/                         # CI, issue forms, PR template
├── build/                           # Source icons used by packaging
├── docs/
│   ├── decisions/                   # Architecture Decision Records
│   └── *.md                         # Product, architecture, integration, safety, release guides
├── openspec/
│   ├── changes/                     # Active and archived change artifacts
│   └── specs/                       # Synchronized product specifications
├── scripts/                         # Build/support scripts
├── src/
│   ├── main/
│   │   ├── application/             # Orchestrator, scheduler, verification
│   │   ├── domain/                  # State machine and policy logic
│   │   ├── infrastructure/
│   │   │   ├── database/            # SQLite store and numbered migrations
│   │   │   ├── logging/             # Structured logs and redaction
│   │   │   ├── platform/            # Power and OS capability adapters
│   │   │   └── providers/           # Provider interface, Codex and fake adapters
│   │   ├── ipc/                     # Validated main-process handlers
│   │   └── security/                # Trusted renderer/URL boundary
│   ├── preload/                     # Narrow typed context bridge
│   ├── renderer/src/
│   │   ├── components/              # Shared interface components
│   │   ├── pages/                   # Dashboard, jobs, history, activity, settings
│   │   ├── stores/                  # Renderer-facing orchestrator state
│   │   └── styles/                  # Neutral accessible design system
│   └── shared/
│       ├── contracts/               # Typed IPC channels/API
│       ├── schemas/                  # Zod validation
│       └── types/                   # Shared domain projections
├── tests/
│   ├── unit/
│   ├── integration/                 # SQLite/provider/orchestrator + opt-in live Codex check
│   ├── e2e/                          # Playwright Electron workflows
│   └── fixtures/                     # Deterministic fake app-server
├── AGENTS.md
├── CHANGELOG.md
├── CONTRIBUTING.md
├── LICENSE
├── README.md
├── ROADMAP.md
└── package.json / package-lock.json
```

Build output (`out/`, `release/`), databases, logs, caches, Playwright results, local secrets, and dependencies are generated or machine-specific and are excluded by `.gitignore`.
