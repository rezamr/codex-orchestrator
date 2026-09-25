# Preload

The preload layer is the narrow typed bridge between renderer and main.

Rules:
- context isolation remains enabled,
- expose explicit operations rather than generic IPC/send/execute primitives,
- no arbitrary filesystem or shell access,
- keep contracts in `src/shared/`,
- main validates every privileged request even if renderer validation already exists.
