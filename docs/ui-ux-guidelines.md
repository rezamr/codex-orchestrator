# UI / UX Guidelines

## Design character

The application is an operational control surface. It should feel calm, serious, fast, and trustworthy.

The UI is **not** a gaming dashboard, crypto dashboard, or colorful AI demo.

## Visual principles

- neutral background/surfaces,
- one restrained brand accent,
- semantic colors only for status and risk,
- avoid gratuitous gradients,
- avoid rainbow status palettes,
- avoid excessive shadows/glass effects,
- modest border radius,
- compact but comfortable density,
- strong typographic hierarchy,
- consistent spacing scale,
- animations only when they explain state change.

Both light and dark themes may be supported, but the initial implementation should establish one excellent theme before duplicating complexity.

## Information architecture

Primary navigation:

- Dashboard
- Projects
- Jobs
- Sessions / History
- Activity
- Automations
- Settings

Diagnostics may live under Settings or an advanced area.

## Dashboard

The first screen should answer:

- What is running?
- What is waiting?
- What needs me?
- What failed?
- What will happen next?
- Is Codex connected?
- Is any power action scheduled?

Prefer a compact operational summary over decorative KPI cards.

## Job detail

Job detail should contain:
- objective,
- state,
- project,
- provider/session,
- attempt count,
- next action,
- timeline,
- approvals/input,
- verification,
- completion policy,
- power action.

The timeline should distinguish model activity, commands, application decisions, retries, and user actions.

## State presentation

Every state has:
- stable text label,
- icon/symbol,
- optional restrained semantic color,
- explanatory secondary text when action is required.

Never rely on color alone.

Example labels:
- Running
- Waiting for approval
- Waiting for usage reset
- Scheduled to resume
- Verifying
- Verification failed
- Completed
- Needs review
- Cancelled

## Forms

Use progressive disclosure.

A new job form should make the safe/common path easy while advanced retry, verification, and power policies remain expandable.

Defaults must never silently enable shutdown/hibernate.

## Power actions

Power actions require especially clear UX:
- explicit selection,
- summary before task start,
- prominent countdown when eligible,
- obvious Cancel button,
- no ambiguous icon-only controls.

## Error UX

Errors should contain:
- what happened,
- what the application knows,
- whether work is safe,
- suggested next action,
- expandable technical details.

Avoid raw stack traces as the primary message.

## Accessibility

- keyboard navigation,
- visible focus,
- ARIA labels where needed,
- sufficient contrast,
- reduced-motion respect,
- no tiny click targets,
- screen-reader-friendly status text.

## Responsive desktop behavior

Support practical resizing, but optimize for desktop use. Avoid mobile-style navigation patterns unless a future remote/mobile client is intentionally designed.

## Empty states

Empty states should teach the next action with one clear primary CTA. Do not fill empty space with decorative illustration that obscures purpose.

## Confirmation philosophy

Do not confirm routine reversible actions.

Do confirm or gate:
- cancelling active work when it may lose progress,
- deleting local history,
- changing a policy that can interrupt work,
- real shutdown/restart/hibernate actions when configured interactively.

## Design system

Implementation should create shared:
- spacing tokens,
- typography tokens,
- semantic color tokens,
- status component,
- buttons,
- inputs,
- dialogs,
- tables/lists,
- timeline items,
- toasts,
- empty states.

Do not style each screen independently.
