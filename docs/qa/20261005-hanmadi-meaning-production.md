# Korean selection production check — 2026-10-05

The reported no-op was an undeployed release. The learner site reported revision 90f86d81 before this check, while approved PR #143 was merged as dd6a9ebf64644b95152c9c4aaaf82758b22dcc32.

Deployed the app tree identical to that merged revision to the existing learner Vercel project, using its existing production environment. Upload dry-run listed 237 files, no environment files/credentials or nonempty local data. Vercel deployment dpl_BjNycZw33puKDUM4amz3qLWzpMMg finished READY and exit 0, alias https://hanmadi-lake.vercel.app. The public /api/deployment endpoint now reports dd6a9ebf64644b95152c9c4aaaf82758b22dcc32. No admin deployment or authentication changes.

In the actual signed-in Chrome tab, reloaded the app and opened Japanese smalltalk level 1, sentence 2. Double-clicking 오늘 in 오늘 이 도시에 도착했어요. showed the lookup status, then highlighted exactly 今日 in 今日、この街に到着しました。. Clicking 今日 opened the existing word definition. This used the real configured provider, not a fixture. No word was saved and no lesson was completed by this check. The new deployment had no error-level logs returned in the 10-minute query window; that is not a comprehensive observability audit.

The definition exposed a separate pre-existing quality defect: it returned reading=오늘 and meaning=오늘 for 今日. This follow-up code change adds Japanese pronunciation guidance to vocabulary lookup, shares existing bounded sound checks, and rejects this observed exact-word Korean-reading error with one contextual repair attempt. It does not force every 今日 reading to 쿄오 (formal 곤니치 remains valid) or reject all matching gloss/pronunciation strings (loanwords can match). A repeated bad response fails visibly; no wrong phrase is returned to the save action.

The selection feature is deployed. This pronunciation follow-up needs its own PR approval before merge/deployment. Regression tests cover 오늘→쿄오 repair, repeated error rejection, coffee long vowels, and legitimate coincident loanword/contextual readings.

Local follow-up verification: npm test passed 228/228; TypeScript no-emit and ESLint for the modified files passed. Production word-reading repair remains unverified until this follow-up is approved and deployed.

## Selection UI follow-up

The long successful-alignment sentence and two always-visible instruction paragraphs are removed from the speaking card. Selecting Korean or dragging the original now reveals a compact 뜻 보기 action bubble attached to the first highlighted/selected line; its arrow follows the target even when the bubble must shift at the screen edge. Native range selection is retained, and the bubble can open the existing definition, close via ×, or dismiss on Escape without closing the lesson. Source words remain directly clickable. Context and goal are available in a collapsed 장면과 목표 disclosure; word instructions are available in 단어 도움말. Errors/loading remain visible when needed.

Chrome E2E (fixture provider) covers 320/390/844 px widths, anchored position/arrow, original and Korean range selection, full-sentence selection, Escape dismissal, nested-dialog focus restoration, explicit-only saving, and the existing four-language wordbook flows. Screenshots are in the designated iCloud task root under commerce-automation-kit/hanmadi-selection-tooltip-v3/. This UI and pronunciation follow-up are both in PR #146 and are not deployed by this change.
