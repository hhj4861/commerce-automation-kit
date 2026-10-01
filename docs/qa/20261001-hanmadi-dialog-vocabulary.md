# Hanmadi mobile dialogs and study vocabulary — 2026-10-01

## Changes

- Shared study dialogs keep the title and a 44px close control outside the scrolling content. Outside pointer down/up dismisses; inside-to-outside drags do not. Escape closes the active nested dialog and returns focus without scrolling the parent.
- Lesson native text supports word taps (Intl.Segmenter for English/Japanese/Thai/Spanish) and selected text ranges up to 80 characters. Mobile users can long-press and choose “선택한 표현 뜻 보기”.
- Authenticated, origin-checked, rate-limited `lookup-word` calls the default study model with the exact selection and sentence context. No automatic persistence or training contribution. Invalid generated content retries once; transport errors remain visible.
- “내 표현에 추가” explicitly persists a vocabulary expression through the existing per-user CAS store and duplicate identity. The saved source is displayed as “단어장에서”; the existing review queue includes these expressions.
- Lookup requests abort on dismissal and never replace a later selection. No production deployment in this change.

## Verification

- App unit tests: 144 passed, including 4 new segmentation/context/error tests.
- Changed TypeScript files ESLint and `tsc --noEmit --incremental false`: passed.
- Production `npm run build`: passed. Existing middleware deprecation warning remains.
- `HANMADI_E2E_ARTIFACTS=<isolated directory> npm run test:dialog-vocabulary`: passed, exit 0; servers stopped and isolated test state removed.
- Chrome touch emulation: 320×568, 390×844, 844×390; scrolled close remains visible, backdrop and Escape close; four-language tap and selected-range lookup, nested focus return, explicit persistence and reload, failure/retry. Real mouse drag also exercised.
- Screenshots inspected: `close-320.png`, `word-ja.png`. AI definitions in these screenshots are fixture text, not claims of live linguistic accuracy. Audio is deliberately stubbed in this interaction test; existing audio behavior is reused.
- Artifacts: `/Users/admin/Library/Mobile Documents/com~apple~CloudDocs/gpt 작업/commerce-automation-kit/hanmadi-dialog-vocabulary-20261001/`.

## Findings addressed / limits

- Initial setup selected monorepo dependencies; corrected using `npm ci --workspaces=false`. App typecheck/build and browser execution subsequently passed.
- Initial browser run revealed focus did not return after a touch-opened nested dialog. Explicit trigger focus plus dialog cleanup restoration fixed it; rerun passed.
- Physical iOS/Android selection handles and live model definition quality were not measured. Runtime explanations are labeled as AI-generated, not a curated dictionary.
