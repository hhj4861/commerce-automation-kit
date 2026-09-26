# Editor narration preview — 2026-09-26

## Problem and behavior

The editor's central playback originally played visuals/captions/background music only. Narration was synthesized only during final render; selecting a voice played an unrelated official sample. The user confirmed the missing audio was the central timeline playback, not the sample buttons.

The editor now offers `대본 음성 만들기` after choosing a voice. It saves edits and enqueues a durable `narration` task using the existing media worker and ElevenLabs TTS atom. On completion the central button becomes `음성과 함께 재생`. The UI discloses voice usage and explicitly explains silence when `내레이션 없음` is selected. No speech-synthesis browser voice substitutes for the selected ElevenLabs voice.

- Speech assets are stored alongside project media with voice, source text, duration and narration purpose. They are excluded from the background-music picker.
- Only referenced scenes are synthesized; split/copied clips share source speech. Voice or narration changes invalidate readiness. Trims, splits, seeks and pause use the same source-frame offset as final rendering. Speech does not loop after its natural end.
- Each completed asset is checkpointed. A checkpoint failure can reuse completed local audio; persisted audio is reusable after a worker restart and by final render. Synthesis failures are redacted and never presented as completed assets.
- Existing review, revision CAS, worker authorization and task-ID validation apply to the new operation. Generation survives closing the page; playback itself requires another user click after completion.

## Verified

- 42 distinct related Node tests passed: editor/model, API, status, narration, local storage/real ffmpeg rendering, service and heartbeat. The last follow-up reran 11 narration/status tests after the completion-copy change. `git diff --check` and JavaScript syntax checks passed.
- New tests cover approval/voice gates, forged or stale worker writes, actual MP3 cache/readback, voice/text invalidation, split-clip reuse, failed checkpoints, safe error output, seeking/pausing/end-of-speech, late metadata and stale play failures.
- Native Chrome at local port 5202: `대본 음성 만들기` → queued status → completed stored MP3 → `음성과 함께 재생`. Clicking playback changed the transport to pause, advanced the playhead and Chrome reported `오디오 재생`. This was a **local ffmpeg test tone**, not real Yooni speech.
- Opt-in harness: `node apps/shopshorts/test/studio-narration-live.mjs --fixture` performs no external API or production-data access. Output lives under ignored `docs/out/narration-live/fixture`.
- Actual one-scene ElevenLabs verification was blocked by automatic approval review because the specific external text transfer and paid TTS usage lacked explicit approval. Approval was requested; no real TTS was submitted in this run. `--live-one-narration` remains opt-in, takes `NARRATION_TEST_PROJECT` and `CAK_RUNNER_KEY_FILE`, copies an approved source image/scene to local storage, and never mutates production.

## Release state and sequence

This narration change is on `fix/studio-narration-preview`, not deployed. Its PR requires specific merge approval. After approval, drain the media worker, update the permanent checkout to the merged revision, deploy Pages, then restart the worker so old workers cannot claim the new task kind. Existing media and publishing gates remain in force.

Separately approved PR #26 **was merged and deployed** during this task: merge `bd548ca96bf6a8f9000f9056fda6e44d78022583`, Pages https://205048d0.shopshorts-dash.pages.dev . Production config returned `mediaProvider: higgsfield`; native Chrome displayed the Higgsfield credit/4–15-second video hint. This does not include the narration fix.
