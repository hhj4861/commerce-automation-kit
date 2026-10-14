# Hanmadi Korean meaning selection — 2026-10-05

## Behavior

In a study lesson, double-click or use native selection handles on the Korean meaning. After a 450 ms debounce, the authenticated study API asks the default LiteLLM model for the corresponding exact original span. For example, selecting 오늘 in 오늘 이 도시에 도착했어요. highlights 今日 in 今日、この街に到着しました。. Clicking the highlight opens the existing contextual word definition. Selection/lookup never saves a word; the existing explicit save button remains required.

English, Japanese, Thai and Spanish share this path. The selected Korean offset and original sentence are supplied as context. Generated translations or invalid offsets cannot be highlighted: the server derives the range from an exact original substring and occurrence. No reliable match produces an explanation instead of a guessed fallback. A model can still choose a semantically wrong substring; exact-substring validation is not proof of semantic accuracy.

Requests are debounced and cached within the current card (up to 32 selections). New selections abort the previous client request and ignore its result; this does not guarantee cancellation of upstream inference already in progress. Changing the sentence/language unmounts the card and clears its selection state. No new credentials, persistence schema, auto-save behavior or provider configuration is introduced.

## Verification

- npm test: 225/225 passed, including four-language alignment, repeated occurrences, UTF-16 offsets, invalid selections, invented substrings, uncertain null and bounded retries.
- ESLint: zero errors; four existing unrelated warnings.
- TypeScript: node node_modules/typescript/bin/tsc --noEmit --incremental false passed.
- npm run build: passed (existing middleware deprecation warning).
- Browser E2E: Chrome with touch emulation at 320×568, 390×844 and 844×390. Exact user example 오늘 → 今日, click-through to word definition, native Korean range selection, no automatic persistence, delayed stale-result rejection, original drag selection while highlighted and reopened-card reset passed. Existing four-language source word selection, nested-dialog focus/close, explicit saving and vocabulary review also passed.
- Browser screenshot today-alignment.png visually checked: both selected meaning and corresponding original are visible; the original remains clickable.
- Vocabulary browser E2E added to the existing GitHub Actions user-journeys workflow. It uses installed Chromium by default; local Chrome is opt-in via PLAYWRIGHT_CHANNEL=chrome.

Browser tests use a deterministic provider fixture. Actual mobile Safari/Android long-press gestures and live-provider semantic accuracy/latency were not verified by these tests. No production deployment was performed for this change.

Artifacts: /Users/admin/Library/Mobile Documents/com~apple~CloudDocs/gpt 작업/commerce-automation-kit/hanmadi-meaning-selection-v3/
