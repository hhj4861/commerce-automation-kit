# Account quota classification and automatic disconnect

- Goal: distinguish exhausted subscription allowance from temporary request throttling; disconnect unusable saved accounts and refresh UI after generation failure.
- Owner/scope: current Codex; isolated account-quota-state worktree. No other platform changes.
- Base: origin/main 221cbce. Worker OFF, Claude cross-check OFF.
- Known evidence: prior production message CODEX_RATE_LIMITED collapsed usage_limit_reached and generic 429. Raw diagnostic was intentionally not persisted; historical cause and current quota remain unproven. Saved credentials alone drove connected=true; failure retained credentials.
- Implementation: explicit exhaustion/authentication failure clears credential and account in the same CAS write as failed job; generic 429/network failures preserve connection. Safe error code stored; raw output never persisted. Generation failure refreshes the account badge once per transition; reason remains visible.
- Done criteria: classifier, encrypted-vault/worker, fencing, reconnect and UI tests; own commit/push + PR. Merge/deploy requires specific approval.
- Current result: final Node20 regression suite 87 pass / 0 fail / 0 skip. Headless Chrome completed 3 cases: Codex exhaustion, Claude exhaustion, Codex temporary throttle. Real UI modules, HTTP, encrypted SQLite vault and account worker; provider outcomes are fixtures, not live quota proof. Reconnect dialog, retained text and safe messages verified; screenshot inspected.
- Artifact directory: approved iCloud commerce-automation-kit/account-quota-state; tests-final.log, codex-quota.png and claude-quota.png. Browser test requires QUOTA_QA_OUTPUT and TMPDIR set there. Early browser fixture issues (object syntax, D1 return shape, UTF-8, async completion wait) fixed before final pass; not production defects.
- No live account disconnected, no generation retry or production change. Existing ambiguous CODEX_RATE_LIMITED records are not retroactively disconnected. Deployment needs Pages/UI and account worker; no credential-broker code changes.
- Next: commit/push and PR; specific merge/deploy approval, then production verification. Actual earlier limit cause cannot be recovered from the old safe code alone.

- First test run: 86 pass / 1 fail; failure in existing slow-renewal timing test observed an additional timer read after completion. Capture read count at completion rather than after polling wait; keep assertion of no queued renewal backlog unchanged. New quota, fencing and UI tests passed.
