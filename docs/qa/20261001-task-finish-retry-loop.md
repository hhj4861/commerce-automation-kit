# Task-finish repeated failure repair — 2026-10-01

## Observed problem

An old apply_patch invocation has no terminal receipt. Its host turn remains inProgress; this is not proof of success or interruption. The existing three-attempt limit was reset on each ordinary UserPromptSubmit, causing the identical blocker to start its retries again on every new request.

## Change

Preserve attempts across user prompts. Stop still computes the failure signature and grants a fresh budget when the signature changes, or resets attempts after successful verification. After three identical failures it stops automatic continuation while explicitly retaining unfinished status. Real user prompts still resume explicit holds. Missing calls, file ownership, commit/push validation, hook configuration and trust are unchanged.

This repairs retry behavior, not the historical missing receipt. No live state or transcript is rewritten. The installer requires committed source, an exact installed hash, a backup and atomic replacement.

## Verification

- Six isolated SQLite transition tests passed before installation and again against installed code.
- Tests cover repeated real prompts, changed blockers, actual success, hold/resume semantics, retained missing receipts and continued commit/upstream checks.
- AST comparison confirms only the prompt reset in handle changes; stop_event, check, receipt validation and reconciliation are unchanged.
- Installed from commit 6a4d094, after matching original SHA-256 44758ee9865dcb6e80fbaf9b1acfc0a7d0053915ce1f97b51dd4be00445ad6c4.
- Original backed up at ~/.codex/hooks/task-finish/backups/interruption-recovery-20261001T044731232796Z.py.
- Worktree reconcile completed with no pending calls. This does not clear the root session's historical missing receipt.
- Actual future Stop execution and hook trust acceptance are distinct from these tests; no trust setting was changed.

Official hook behavior: https://learn.chatgpt.com/docs/hooks?translationFallback=de-DE — Stop decision:block creates another turn; continue:false ends continuation and does not certify task success.
