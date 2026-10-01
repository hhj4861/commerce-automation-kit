# Task-finish repeated failure repair — 2026-10-01

## Observed problem

An old apply_patch invocation has no terminal receipt. Its host turn remains inProgress; this is not proof of success or interruption. The existing three-attempt limit was reset on each ordinary UserPromptSubmit, causing the identical blocker to start its retries again on every new request.

## Change

Preserve attempts across user prompts. Stop still computes the failure signature and grants a fresh budget when the signature changes, or resets attempts after successful verification. After three identical failures it stops automatic continuation while explicitly retaining unfinished status. Real user prompts still resume explicit holds. Missing calls, file ownership, commit/push validation, hook configuration and trust are unchanged.

This repairs retry behavior, not the historical missing receipt. No live state or transcript is rewritten. The installer requires committed source, an exact installed hash, a backup and atomic replacement.

## Verification

Pending: isolated SQLite transition tests, committed installer application, installed-source rerun and upstream push.

Official hook behavior: https://learn.chatgpt.com/docs/hooks?translationFallback=de-DE — Stop decision:block creates another turn; continue:false ends continuation and does not certify task success.
