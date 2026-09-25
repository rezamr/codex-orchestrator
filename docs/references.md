# Upstream Technical References

Use current official documentation when implementing or changing integrations. These references are intentionally kept separate from behavior specs because upstream APIs and tooling can evolve.

## OpenAI Codex

- App-server protocol guide:
  https://developers.openai.com/codex/app-server/
- Codex as a platform / app-server integration:
  https://developers.openai.com/blog/codex-as-a-platform
- Codex MCP-server removal and migration to app-server:
  https://developers.openai.com/docs/mcp-server
- Goals in Codex:
  https://developers.openai.com/cookbook/examples/codex/using_goals_in_codex
- Codex learning/docs hub:
  https://developers.openai.com/learn/codex

## OpenSpec

- Documentation:
  https://openspec.dev/
- Quickstart:
  https://openspec.dev/docs/quickstart
- Spec-driven schema:
  https://openspec.dev/docs/schemas/spec-driven
- Project configuration:
  https://openspec.dev/docs/configuration/config-yaml
- Change metadata:
  https://openspec.dev/docs/configuration/change-metadata
- Upstream repository:
  https://github.com/Fission-AI/OpenSpec

## Electron

- Security checklist:
  https://www.electronjs.org/docs/latest/tutorial/security
- Context isolation:
  https://www.electronjs.org/docs/latest/tutorial/context-isolation
- Process sandboxing:
  https://www.electronjs.org/docs/latest/tutorial/sandbox

## Platform power APIs

- Windows `shutdown` command:
  https://learn.microsoft.com/windows-server/administration/windows-commands/shutdown
- Windows `LockWorkStation` API:
  https://learn.microsoft.com/windows/win32/api/winuser/nf-winuser-lockworkstation
- systemd-logind capability model (used to define the future Linux probe requirement):
  https://www.freedesktop.org/wiki/Software/systemd/logind/

## Maintenance rule

When upstream documentation conflicts with an old integration detail in this repository:

1. preserve the product's behavioral and safety requirements,
2. update the provider/tooling adapter to the current supported upstream interface,
3. document the compatibility change,
4. update ADR/spec/design artifacts when the change affects architecture or observable behavior.
