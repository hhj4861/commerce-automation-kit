# Hanmadi Spanish pronunciation/meaning follow-up — 2026-10-01

## Problem and change

Production revision `2e0340e5af01f1c46fde4286c0760f35caae1113` returned valid JSON but had these observed language-quality errors:

| Path | Observed error | Intended behavior |
| --- | --- | --- |
| Korean → Spanish | `La cuenta, por favor.` / `라 꿰운따, 포르 파보르.` | Approximate reading `라 꾸엔따, 포르 파보르.` |
| Spanish → Korean | `얼음 없는 커피 한 잔 주세요, 포르 파보르.` | Natural Korean meaning without a phonetic suffix |
| Learner recast | `por favor` / `뽀르 바뽀르` | Approximate reading `포르 파보르` |

Shared Spanish guidance now applies to translation, AI replies and the learner's own recast. A deliberately narrow validator recognizes these observed errors and uses the existing single regeneration on the same selected model. It does not introduce a verifier call for every valid reply. Invalid optional study phrases are omitted; invalid main translations/replies fail after the bounded retry. Provider/auth failures still propagate, with no automatic model fallback.

Korean sound hints are approximations, not IPA or certified transliterations. This guard does not prove arbitrary Spanish pronunciation or meaning correct. Whole-word matching and exclusions for quoted/name/metalinguistic content limit false positives; naturally worded Korean translations and valid reading variants are covered by regression tests.

## Evidence and limits

- Unit tests: **107 passed**, including 5 added regressions covering translation, reverse translation, roleplay, learner recast, study-save exclusion, accepted variants and names/quotes.
- TypeScript: installed compiler (`node node_modules/typescript/bin/tsc --noEmit`) passed. `npx tsc` initially resolved the wrong workspace executable; its failure was not treated as a pass.
- ESLint: **0 errors**, 4 existing warnings in unchanged files.
- Full Chrome E2E: **passed**, including the 1,280-phrase traversal, new Spanish repair cases, study saving, account isolation, provider connection flows, admin publishing and 320–1440 px layout checks.
- Production Next.js build: **passed**, including TypeScript and generation of all 49 routes. Existing middleware-convention notice remains.
- E2E uses the real local Next.js routes and Chrome, with controlled upstream AI/audio fixtures. It verifies validation/retry/UI/save behavior; it is not a fresh live Gemini or speech-accuracy certification.
- Existing E2E traverses 4 languages × 8 situations × 4 levels × 10 phrases (1,280 displayed phrases), compares source content and verifies uniqueness/layout. That is not an independent linguistic review of all sentences.
- Initial E2E reached the Spanish checks but failed when Turbopack scanned a Chrome socket in an app-local temporary directory. Artifacts were moved outside the source tree before rerunning. A subsequent launch failed on an incorrectly resolved temporary path; it was corrected to an absolute path and its empty folders removed.
- Test artifacts/logs: sibling `hanmadi-spanish-quality-qa/` under the user's designated iCloud work root, not versioned source. Screenshot `screenshots/spanish-translation-repair.png` was visually inspected at 390 px and shows the corrected sentence/readout without overflow.

## Language references

- [RAE: b/v pronunciation](https://www.rae.es/duda-linguistica/existe-diferencia-en-la-pronunciacion-de-b-y-v): same basic bilabial pronunciation; the selected Hangul approximations are product guidance, not RAE-specified Korean spelling.
- [RAE: favor / por favor](https://dle.rae.es/favor): request expression; translate its function rather than inserting the sounds into Korean meaning.

## Release status

Changes are on `fix/hanmadi-spanish-quality-20261001`. This follow-up is not merged or deployed. Production remains the previously verified revision above. A new PR requires its own merge approval.
