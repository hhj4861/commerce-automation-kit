# Hanmadi chat timing and Japanese no-ice reply — 2026-10-01

## Production baseline

After vocabulary PR #112 was merged/deployed (revision `e8696706f6a87cb4d4bbdbd611cf9aee32b2f161`), a separate QA account with both automatic-save switches off sent four requests:

| Language / input | HTTP | End-to-end time |
| --- | --- | --- |
| Thai / 얼음 없이 커피 한 잔 주세요. | 200 | 4,554 ms |
| Thai / ขอกาแฟหนึ่งแก้ว ไม่ใส่น้ำแข็งครับ | 200 | 2,116 ms |
| Thai / 좋아요. 감사합니다! | 200 | 2,133 ms |
| Japanese / 얼음 없이 커피 한 잔 주세요. | 200 | 2,492 ms |

The previous isolated Thai 24,316 ms result did not recur. Four samples do not establish a latency distribution or explain that earlier delay. Current chat already generates the partner reply and learner recast in parallel; a quality regeneration or slow branch can still delay the combined response. The client library has no hidden retries; valid content does not incur a separate verifier call.

The Japanese response actually added an unrequested temperature: `氷抜きのアイスコーヒーですね`. No ice does not establish iced coffee. This observed defect is repaired by the change below. The QA account was logged out; no test conversation was automatically saved. This sample is not a certification of all generated pronunciation or meaning.

## Changes

- Reinforced the Japanese cafe instruction and added a deliberately narrow guard for an unrequested temperature assertion ending in `コーヒーですね` after an explicit Korean no-ice coffee request. Prior user mentions of temperature are conservatively preserved; an assistant's own invented choice does not establish a user preference. Neutral temperature questions remain allowed. This is not a universal semantic classifier.
- Invalid content gets at most one regeneration on the same selected model. Persistent invalid replies fail; provider/authentication failures do not switch models. No new model call is made solely for diagnostics.
- Added request-local `Server-Timing` for total, quota, knowledge, reply, learner, reply_llm, learner_llm and save where executed. `_llm` includes completion setup/model selection and the upstream request, not just provider inference. Calls show actual completion invocations, including a quality repair. Stage durations overlap and must not be summed as total latency.
- Stage duration measures completed work. `pending` explicitly identifies unfinished concurrent work if another branch has already failed. Such a branch is not represented as a completed zero-duration call.
- For requests lasting at least 8 seconds, server errors or measured stage failures, log `hanmadi_chat_timing` with only language, HTTP status and numeric stage measurements. No prompt, response, account ID, connection ID, secret, model ID or exception text is accepted by the logger. Fast successful requests have timing headers but no new log entry. Logging failure never changes the response.
- Kept authentication, usage limits, `no-store`, response JSON, automatic-save consent and the existing parallel execution behavior. No shared conversation cache, timeout reduction, provider fallback, storage migration or Obsidian integration.

## Verification

- Unit tests: 154 passed. Added observed-reply repair/persistent failure, real prior user preference vs assistant fabrication, neutral question, parallel timing, completion counts, in-flight markers, error preservation and secret-free logging checks.
- TypeScript and changed-file ESLint passed.
- Full Chrome E2E passed against local Next and synthetic providers: all four languages / 1,280 displayed phrases, translation, dialogue, model selection, consent/isolation and storage flows. New assertions inspect real route timing headers and count 2 Japanese reply completions for one repair; Thai invalid learner content reports two completions, preserves a valid partner reply and remains unsaved.
- Local test server completed with exit 0 and removed its isolated state file. No live provider performance improvement is inferred from fixture results.
- Production build: passed (exit 0). Existing middleware deprecation notice remains.

Artifacts: `/Users/admin/Library/Mobile Documents/com~apple~CloudDocs/gpt 작업/commerce-automation-kit/hanmadi-chat-timing-20261001/` (`e2e.log`, `build.log`, `screenshots/`). Unit log: sibling `hanmadi-pr112-production/chat-timing-unit.log`.

## Release boundary

This follow-up is on `fix/hanmadi-chat-latency-diagnostics`, not in production. PR #112 remains the production revision. Its prior approval does not approve this new PR. After approval and deployment, use timing headers/slow-event logs to identify the delayed branch before changing provider timeouts, models or cache policy.
