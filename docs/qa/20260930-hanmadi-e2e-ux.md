# Hanmadi E2E UX verification — 2026-09-30

## Fix

An AI reply cleared the chat input unconditionally. If a learner typed their next message while waiting, the arriving reply erased that new draft. The input now clears only when it still matches the submitted text.

A deterministic browser regression delays the chat request, types the next draft, releases the request and checks the preserved text. Before the fix it failed with an empty actual value; after the fix it passed. A simulated HTTP 502 also verifies that failed sends preserve both the draft and the existing conversation without adding a false reply.

## Verification

- Full `npm run test:v2`: PASS, exit 0; test servers stopped and isolated state removed.
- `npm test`: 93 passed, exit 0.
- ESLint and `tsc --noEmit --incremental false`: exit 0; four existing lint warnings, no errors.
- Browser E2E includes signup, language selection, oral-first placement, ten-phrase lessons, previous/next navigation, persistence, four levels × eight scenarios, 320–1440px layouts, translation, AI conversation, learner recasts, personal study, account isolation, model connection flows, and administrator review/publishing.
- Synthetic upstreams exercise translation, speech, OAuth and learning integration deterministically. These passes do not establish real external-provider authentication or real microphone/audio quality.
- A separate production browser check confirmed a real Japanese AI response and the learner phrase displayed in Japanese, Korean pronunciation and Korean meaning, with the personal-study saved indicator. The delayed-input defect was reproduced locally, not reproduced in that live timing attempt.

## Evidence and scope

Local screenshots and test cache are under the user-designated artifact directory:

`/Users/admin/Library/Mobile Documents/com~apple~CloudDocs/gpt 작업/commerce-automation-kit/hanmadi-e2e-20260930/`

The regression checks the draft value directly; `screenshots/chat-draft-preserved.png` captures the conversation after the response but is not by itself proof of the below-fold input value.

This change is prepared on `fix/hanmadi-e2e-ux-20260930`. Production has not been changed by this task. Merge and deployment remain separate steps requiring PR-specific approval.
