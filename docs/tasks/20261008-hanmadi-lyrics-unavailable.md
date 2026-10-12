# Hanmadi lyrics unavailable UX

- Goal: stop directing learners into futile retries when the lyric feed is not configured or not approved.
- Owner: invoking Codex only; existing owned lyrics worktree, branch `fix/hanmadi-lyrics-unavailable`, base `7a7b634bda9764ab348a7caed880e8021772d9ad` (PR163 production).
- Scope: music screen unavailable copy/CTA and existing music E2E. No provider configuration, credentials, license, song content or production deployment changes.
- Done: pending states explicitly unavailable with no retry or premature learning promise; official playback still offered; temporary/expired feed can retry; ready lesson unchanged. Validate lint/type and browser journey, commit/push own files, PR for separate merge approval.
- Current result: implementation prepared. Actual Pretender lyric supply remains disconnected; this UX fix cannot activate it.
- Checks: TypeScript no-emit, changed component ESLint, script syntax and git diff checks passed. Existing Chrome music E2E passed after adding both non-retryable states and retry-preservation checks. The 12-line synthetic lesson journey, cursor persistence, failure/recovery and 320/390/1024px overflow checks passed; no client errors. Fixture servers exited and account state was removed. Generated Next dev instruction stubs were read and removed after server exit.
- Evidence: iCloud `commerce-automation-kit/hanmadi-lyrics-unavailable/result.json`, `server.log`, screenshots. These are synthetic supplier/video/audio fixtures, not actual song playback or licensed supply validation.
- Next: PR-specific merge approval; production remains PR163 until separately deployed. Actual Pretender learning still needs its licensed feed.
