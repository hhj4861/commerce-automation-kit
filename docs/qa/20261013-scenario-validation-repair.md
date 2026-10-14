# Scenario validation repair — 2026-10-13

- Goal/owner: Codex only; make generated-data validation actionable without exposing CLI output or retrying authentication/network failures.
- Base: 71c2b08 (includes approved #201/#204). Production #205 remains 4e26366.
- Evidence: production account worker logged `codex scenario UNKNOWN` after research. The exact failed field was not retained, so this is not proof of which validation failed. Source inspection shows uncoded duration/scene validation and non-allowlisted renderer errors collapse to UNKNOWN.
- Change: isolate synchronous generated-data validation; allowlisted SCENARIO_FORMAT_INVALID; format/arc/direction repairs share the existing one-repair budget with depth review. Research, provider and broker errors remain outside this boundary. No validation bypass or automatic paid-media generation.
- Done criteria: regression tests cover recovery, repeated malformed output, review rejection and non-retried provider/progress failures; commit/push and PR. New PR merge/production rollout requires explicit approval.
- Verification: account/Codex/scenario/repair 58 passed; explanation/hybrid/webtoon 21 passed with 1 opt-in test skipped. Actual body renderer initially failed due to sandbox IPC, then long iCloud socket path; a short symlink to the same iCloud storage resolved it and the targeted renderer test passed (exit 0). Total 80 distinct passed, 1 opt-in test not run. Fake transport/review fixtures do not prove live editorial quality.
- Current: implementation and local verification complete; production E2E still blocked by the prior scenario failure. Commit/push and review PR next. No production code change in this follow-up.
