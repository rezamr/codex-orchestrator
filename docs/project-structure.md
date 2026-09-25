# Target Project Structure

This is the intended structure after the initial implementation change.

```text
codex-orchestrator/
├── .agents/skills/               # OpenSpec-managed Codex skills
├── .github/
│   ├── ISSUE_TEMPLATE/
│   ├── workflows/
│   └── PULL_REQUEST_TEMPLATE.md
├── docs/
│   ├── decisions/
│   ├── architecture.md
│   ├── codex-integration.md
│   ├── development.md
│   ├── power-management.md
│   ├── product-requirements.md
│   ├── project-structure.md
│   ├── release-process.md
│   ├── security-model.md
│   └── ui-ux-guidelines.md
├── openspec/
│   ├── changes/
│   ├── specs/
│   └── config.yaml
├── src/
│   ├── main/
│   │   ├── application/
│   │   ├── domain/
│   │   ├── infrastructure/
│   │   │   ├── database/
│   │   │   ├── logging/
│   │   │   ├── providers/
│   │   │   └── platform/
│   │   └── ipc/
│   ├── preload/
│   ├── renderer/
│   │   ├── components/
│   │   ├── pages/
│   │   ├── stores/
│   │   ├── composables/
│   │   └── styles/
│   └── shared/
│       ├── contracts/
│       ├── schemas/
│       └── types/
├── tests/
│   ├── unit/
│   ├── integration/
│   ├── e2e/
│   └── fixtures/
├── AGENTS.md
├── CHANGELOG.md
├── CONTRIBUTING.md
├── LICENSE
├── README.md
└── package.json
```

Do not create layers only to match this diagram. The implementation should keep module boundaries meaningful and avoid one-class-per-file ceremony when it adds no value.
