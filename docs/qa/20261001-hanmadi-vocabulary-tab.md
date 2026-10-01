# Hanmadi vocabulary menu — 2026-10-01

## Scope

- Added the fifth bottom destination, 단어장, preserving 스터디 / AI 대화 / 번역 / 내 표현.
- Selected-language vocabulary includes entries saved by PR #106 (`source:vocabulary`) and shared entries explicitly added later (`inVocabulary:true`). No bulk migration or automatic collection.
- Search native text/Korean meaning/pronunciation, hide/reveal meaning, hear pronunciation, select all/due words, mark recall and remove from the vocabulary list. Existing review scheduling remains one day for help / three days for recall.
- Reusing an existing chat/translation expression marks membership instead of creating a duplicate or rewriting its origin. Removing its vocabulary membership preserves that original expression. Words originally created from study are deleted through the same per-user store.
- User confirmed explicit button-only saving. Copy now directs users to 단어장.
- Listing, searching and reviewing use stored data, with no text LLM request. No Obsidian migration or LiteLLM infrastructure changes.

## Verification

- Unit tests: 150 passed. Changed TSX/TS ESLint, TypeScript and production build passed.
- Extended dialog-vocabulary Chrome E2E passed: five 44px+ menu targets without horizontal overflow at 320/390/844 widths; four languages, selection and nested dialogs; search, meaning visibility, review, reload, removal and shared-expression preservation. LLM fixture call count unchanged during wordbook browsing/search/review.
- E2E first attempt counted navigation before client hydration; wait for the loaded menu was added. Rerun passed.
- Actual device selection behavior / live model linguistic accuracy are outside this local UI test. No live-provider speed claim from fixture evidence.
- Screenshot reviewed: wordbook.png in the artifact folder below.
- Artifacts: `/Users/admin/Library/Mobile Documents/com~apple~CloudDocs/gpt 작업/commerce-automation-kit/hanmadi-wordbook-20261001/`.

## Separate production LLM status check

Before this change, revision 87e896c753296d6ccaa40430eda65ecc4b70397e returned HTTP 200 for four chat + four translation + one lookup + one audio request. The test disabled automatic saving; saved expressions remained zero and logout succeeded. Thai chat took 24,316ms; other chat requests 2,267–4,469ms, translations 2,013–2,204ms, lookup 1,547ms. This confirms sampled availability, not universal reliability or semantic correctness. The slow Thai request and previously observed generated text defects remain separate improvements.

## Storage and performance recommendation

Obsidian stores local Markdown files and can serve as an optional authoring tool. It is not the app's multi-user runtime store or an automatic LLM accelerator. Keep structured per-user study state and review scheduling in the application store; use retrieval only when context is needed and separately measure provider/retry latency. For repeated compatible requests, scoped response caching can avoid a model call. No broad shared cache of private conversations was enabled.

References: https://obsidian.md/help/data-storage and https://docs.litellm.ai/docs/proxy/caching (checked 2026-10-01).
