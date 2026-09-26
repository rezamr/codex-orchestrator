# Controlled Manual Test Checklist

Usage-consuming real Codex turns and real power actions are controlled release gates, not routine development steps. Never run either in CI, the default automated test suite, a normal workstation session, or a machine with unsaved work. The opt-in read-only Codex compatibility test is separate and does not start a turn.

For `0.1.0-alpha.1`, visually confirm after launch that Dashboard has a Codex conversation/workspace summary, Projects lists working folders discovered from conversations, Jobs lists eligible existing conversations, Activity lists recent Codex updates separately from job events, and History retains read-only transcript browsing. A **Continue** click is usage-consuming and must follow the controlled real-turn procedure below; do not click it during a read-only smoke test. The Automations page intentionally shows only Orchestrator-owned schedules.

## Alpha.2 correction smoke checks

- Select an existing conversation in History, choose Continue, and confirm the form shows that exact title, thread id, and workspace. Cancel the form; no turn should start.
- Open a new job form and verify its destination explicitly says new conversation with no existing history. Merely typing “please continue” must not select another conversation.
- On an existing local thread, choose Open in ChatGPT and confirm the same technical thread opens in the desktop app. This navigation must not submit a prompt. A missing app/protocol handler must produce a visible error.
- In a disposable workspace with the fake provider, configure an npm check and confirm a failed launch ends in Verification Failed with evidence, never a stuck Verifying state. After a completed provider attempt, Rerun checks only must not add another Codex attempt.
- Restart after interrupted verification: the job should require review, the old check run should no longer appear running, and checks-only retry should remain available for a completed provider attempt.

These checks do not replace the controlled real-Codex or real-power procedures below.

## Record for every run

- application version and commit;
- operating system/version and hardware class;
- Codex CLI version when applicable;
- exact capability/action selected;
- expected and observed state, countdown, notification, and audit event;
- recovery result after resume/restart;
- tester and date.

Do not record account identifiers, tokens, source content, or machine-specific secrets.

## Read-only Codex app-server compatibility

The read-only live integration test was run successfully on 2026-09-25. Maintainers may repeat it locally with an installed Codex CLI:

```powershell
$env:CODEX_ORCHESTRATOR_LIVE_CODEX_TEST = '1'
npm exec -- vitest run tests/integration/codex-live-readonly.test.ts
```

It discovers and version-checks the CLI, requests account/usage summaries without forcing token refresh, lists active and archived threads, and reads the newest available thread without resuming it. It does not print or persist returned conversation/account content and does not consume usage by starting a turn. Do not add this test to default CI or attach raw test data to reports.

## Real Codex turn

The initialize/account handshake is already verified without consuming usage. A release candidate may additionally run one controlled turn:

1. Use a disposable Git repository with no secrets and a clean working tree.
2. Confirm the installed Codex is authenticated through its supported login flow.
3. Register the disposable repository in the GUI and choose **Codex app-server**.
4. Submit a bounded read-only objective and keep the default `on-request` approval behavior.
5. Confirm session/attempt creation, streamed activity, approval handling if requested, verification evidence, and terminal state.
6. Confirm logs/diagnostics contain no authentication material.
7. Delete the disposable repository and retain only sanitized test notes.

Never alter provider usage limits, billing, authentication, sandbox, or safety controls to make this test pass.

## Real Windows power actions

Prerequisites:

- a controlled sacrificial Windows test machine with recovery access;
- no unsaved work, active downloads, other users, or protected jobs;
- hibernation enabled before testing hibernate;
- an unpacked/installed packaged build (development builds always simulate);
- the global power opt-in enabled in Settings only for the duration of the test.

For each of lock, sleep, hibernate, restart, and shutdown:

1. Create a fake-provider job with a harmless objective and a passing deterministic verification check.
2. Select exactly one post-completion action.
3. First confirm the visible persisted countdown and cancel it; verify no action occurs and a cancellation event is recorded.
4. Repeat, allow the countdown to expire, and confirm the final eligibility check blocks execution if a protected sibling job is introduced.
5. Remove the sibling only after the blocked case is recorded, then repeat and observe the operating-system result.
6. After returning to the application, confirm the job, verification run, schedule outcome, and redacted power audit event survived restart/resume.
7. Disable the global power opt-in before moving to the next action or ending the session.

Stop immediately if capability reporting is inaccurate, the countdown cannot be cancelled, verification failure still permits the action, another protected job is interrupted, or state/audit data is missing.
