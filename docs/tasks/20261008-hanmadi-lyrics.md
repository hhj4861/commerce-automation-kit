# Hanmadi — licensed lyrics learning connection

- Goal: official YouTube playback + licensed lyrics in source order, Japanese / Korean pronunciation / Korean meaning, repeat practice. No manual-paste UX or unrelated emotional conversation exercises.
- Owner/scope: invoking Codex; `feat/hanmadi-lyrics-learning`, base `bc69d156955d5fd8ade53c7321d1596f4bab40fd` (PR #160). Other sessions' files unchanged.
- User confirmed no existing lyrics service/license; prepare connection structure only. No Pretender lyrics fetched, transcribed, copied or invented. No commercial account/contract purchased.
- Done criteria: authenticated feed boundary, clear unconfigured state, reviewed lines/navigation/account cursor/expiry handling, official player with manual segment replay where timestamps exist, tests/type/lint/browser E2E, own commit/push and PR. Separate PR merge approval still required.
- Baseline: PR #160 was deployed to learner production at merge revision above, deployment `dpl_9snArBmh3Kxqp4fBwnd8pHtDmNZG`; public release probes passed. Its emotional-conversation music UI did not meet the corrected request. This branch replaces that UI, not existing ordinary study lessons.

## Supplier boundary (not activated)

This is a **Hanmadi-owned adapter contract**, not a claim that Musixmatch/LyricFind natively exposes this endpoint or that a commercial connector is finished. `GET /api/study/music` authenticates the learner and retrieves one reviewed Pretender lesson from a server-configured trusted feed. It does not scrape YouTube or transcribe/reconstruct a song.

Runtime configuration:
- `HANMADI_MUSIC_CATALOG_URL`: HTTPS URL of the trusted adapter's single JSON lesson endpoint; no embedded credentials, query string or redirects. Local HTTP only in development for fixture tests.
- `HANMADI_MUSIC_CATALOG_TOKEN`: optional private bearer token; never a public client variable.
- `HANMADI_MUSIC_LICENSE_APPROVED=true`: operator attestation AFTER confirming the actual agreement, exact song/version, territory/audience restrictions, attribution/reporting and display/translation/pronunciation/TTS/cache permissions. A flag or feed declaration does not itself obtain a license.

JSON follows `LicensedMusicLesson` in `lib/music-lyrics.ts`: `trackId: "pretender"`, immutable `revision`, ISO `expiresAt`, `attribution {label,url}`, `rights {reference,display,translation,pronunciation,speech}` and ordered `lines [{id,text,reading,meaning,startSeconds?,endSeconds?}]`. Both timestamps are optional together; without verified timings the UI offers pronunciation practice, not fabricated synchronized playback. Repeated chorus lines stay in order with distinct IDs. A new revision resets the learner's cursor.

The supplier adapter must provide reviewed Korean meanings/pronunciations before publication. This branch deliberately makes no runtime LLM call for lyric preparation: no guessed continuation, unnecessary first-line latency, training contribution or incidental content export. No copyrighted examples are included. Only the cursor is persisted per learner; lyric responses are no-store and are not put in shared knowledge, expressions, localStorage or logs. Existing speech service uses its normal audio cache; its storage/retention must be approved before enabling any licensed content.

TODO(D1) before real activation: select/contract supplier; confirm Pretender coverage and learning/translation/TTS rights, geography and attribution/reporting requirements; implement the supplier-specific adapter (including any geo checks or mandatory tracking); privately provision configuration; validate the real licensed payload and audio/caption accuracy; approve production release. Do not point this adapter directly at an arbitrary Musixmatch endpoint. No live lyrics integration is claimed by fixture success.

Official references checked 2026-10-08:
- https://developers.google.com/youtube/v3/docs/captions/download — caption downloads require permission to edit the video.
- https://developers.google.com/youtube/player_parameters — embed captions and start/end parameters; playback may be restricted and seek timing is not guaranteed word-accurate.
- https://github.com/musixmatch/musixmatch-sdk — official search/retrieval API, commercial integration not yet configured.

## Checks and current result

Connection structure implemented locally. Real supplier/API access, Pretender lyrics and production activation remain unavailable. Browser tests use original synthetic Japanese sentences, fixture video and fixture speech responses; they cannot establish actual song or TTS playback quality.

- Hanmadi unit suite: 244/244 passed (`npm test` from `apps/hanmadi`). Includes 5 new license/schema/provider boundary tests.
- Next route type generation + TypeScript no-emit: passed. Changed-file ESLint and `git diff --check`: passed.
- Final Next 16.3.6 production build: passed. Existing middleware-to-proxy deprecation warning remains unrelated.
- E2E: `PLAYWRIGHT_CHANNEL=chrome npm run test:music` passed on final UI. 12 ordered fixture lines including a repeated line; 320/390/1024px no horizontal overflow; no client errors. Ready and pending screenshots visually reviewed. Found overlapping sticky navigation over speech controls; corrected to normal flow before rerunning E2E.
- UI → authenticated API → trusted fixture feed → account-scoped cursor → reload restoration verified. Previous/next/restart, hidden meanings, manual segment replay URL, pronunciation request, unavailable timing, failed save retry, account isolation, auth/origin/index/revision guards, feed errors, expiry and revision invalidation exercised. State inspection confirms no lyrics/expressions/shared training writes.
- Evidence: `/Users/admin/Library/Mobile Documents/com~apple~CloudDocs/gpt 작업/commerce-automation-kit/hanmadi-lyrics-learning/` (`result.json`, `server.log`, `lyrics-320.png`, `lyrics-390.png`, `lyrics-1024.png`, `music-pending.png`). Local headless Chrome/fixture evidence, not physical iOS or production playback.
- Initial test invocation accidentally targeted the root workspaces and was interrupted (exit 130); unrelated workspace dependencies are not installed. Only the subsequent app-scoped suite is claimed as passed. First E2E attempt found no bundled Playwright browser, cleaned up and exited; reran with installed Chrome. Initial type/lint failures (missing generated PageProps, test env type, impure state initializer) were fixed before final checks.
- Next dev generated only local AGENTS.md/CLAUDE.md stubs; read and removed after test servers stopped. Existing repo guidance remains unchanged. External artifact paths cannot be tracked by the gate's repository-only `track` command; source paths were registered before edits.
- Next action: review PR and obtain PR-specific merge approval. Separately secure actual licensed supply and validate its adapter before enabling real lyrics. No commercial provider, environment key or production deployment was changed.
