# Power Management

Power management is a privileged subsystem. Its design goal is convenience without surprise.

## Supported conceptual actions

- none,
- lock,
- sleep,
- hibernate,
- shutdown,
- restart.

Wake scheduling is a separate capability because reliable support depends on operating system, hardware, firmware, and configuration.

## Core safety rule

A power action is never triggered just because:
- Codex exited,
- a provider turn ended,
- a message contains “done,”
- a timer expired.

It is eligible only when the configured completion policy is satisfied.

## Eligibility pipeline

```text
candidate completion
       |
       v
verification policy
       |
       v
job terminal success?
       |
       v
other protected jobs active?
       |
       v
power capability available?
       |
       v
user opted in for this job/profile?
       |
       v
visible cancellable countdown
       |
       v
re-check guards
       |
       v
execute platform action
```

Every rejected guard produces a user-visible reason and audit event.

## Required guards

Before disruptive actions:
- target job is successfully completed,
- required verification passed,
- no pending approval/input for the job,
- no protected sibling job would be interrupted,
- no application-level “prevent power actions” override is active,
- platform reports the action supported,
- user explicitly enabled the action,
- countdown has not been cancelled.

## Countdown

Default behavior should include a visible countdown. The exact default duration may be chosen during implementation and must remain configurable.

The countdown must:
- show the intended action,
- identify the triggering job,
- allow cancellation,
- survive renderer reload without becoming an untracked timer,
- re-check eligibility immediately before execution.

## Dry-run

Development, tests, and CI must use a simulated PowerAdapter by default.

Real power actions require an explicit runtime mode and must never occur in automated tests.

## Preventing sleep while work is active

The app may request a system sleep block while protected work is active.

The block must:
- be reference-counted or derived from current protected jobs,
- be released when no longer needed,
- be released during orderly application shutdown,
- be reconciled on restart.

## Sleeping while waiting

A future policy may allow sleeping during a long wait. This feature is separate from “prevent sleep.”

Before offering “sleep until resume”:
- confirm a reliable wake strategy exists for the current platform,
- communicate uncertainty,
- persist the resume schedule before sleeping,
- provide a fallback if automatic wake is not supported.

## Hibernate and wake

Do not claim that a machine will automatically wake from hibernation unless the platform adapter has positively verified a supported mechanism.

Firmware/BIOS, OS policy, AC/battery state, and hardware can affect wake behavior.

## Audit

Record:
- requested action,
- policy source,
- eligibility checks,
- countdown start,
- cancellation if any,
- execution attempt,
- platform result/error.

Do not log sensitive unrelated environment data.

## Platform implementation

Use per-platform adapters rather than scattering shell commands through the application.

Conceptual interface:

```ts
interface PowerAdapter {
  capabilities(): Promise<PowerCapabilities>
  inhibitSleep(reason: string): Promise<InhibitorHandle>
  releaseInhibitor(handle: InhibitorHandle): Promise<void>
  sleep(): Promise<PowerResult>
  hibernate(): Promise<PowerResult>
  shutdown(): Promise<PowerResult>
  restart(): Promise<PowerResult>
}
```

Implementation details and required privileges must be documented per OS.
