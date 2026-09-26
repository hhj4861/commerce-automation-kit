# Studio time-positioned editor verification

Date: 2026-09-26. Branch: `feat/studio-audio-timeline`, based on `e512d4e`.

## Scope and reference

CapCut's official [audio timeline guide](https://www.capcut.com/tools/add-audio-to-video) informed the library → viewer → inspector → timeline workflow, source trim, timing, volume and fades. The UI uses Shopshorts assets and its own styling.

- Left media/audio/voice/text library, center preview, right contextual settings, bottom labeled tracks. Optional full-workspace focus mode.
- Video drag to a time position or onto another video to reorder; edge trim; source-frame numeric trim; split/cut/copy/paste/delete; undo/redo; captions stay attached to their video.
- Music clips with independent timeline position, source offset, length, volume, fade in/out; drag and edge trim; split/cut/copy/paste/delete. Overlapping audio appears on separate rows and mixes together.
- Frame-level playhead, timeline zoom/fit and snapping to clip boundaries/playhead. Blank video intervals preview and render as black; narration is silent there. Audio continues independently.
- Audio-library preview and selected-segment preview use the uploaded file, without requesting TTS. Narration selection/generation remains the existing explicit workflow.

Not implemented in this change: stacked visual overlays, keyframe animation, speed ramps, transition effects or arbitrary voice-clip detachment. This is a working timeline structure, not complete CapCut feature parity.

## Stored timing contract

Existing `edit.version: 2` fields retain their meaning. Append-only fields:

- `clips[].startFrame?`: absolute 30fps timeline position. Omission preserves sequential legacy timing. Video intervals cannot overlap. Reorder is an explicit ripple operation that packs video clips; music positions do not move.
- `musicClips?`: up to 32 `{id, assetId, startFrame, inFrame, outFrame, volume, fadeInFrames, fadeOutFrames}` entries. End frames are exclusive. Fade lengths cannot exceed clip length together. All ranges obey the project length limit.
- Omitted `musicClips` adapts old `music/musicVolume` into a full-video-duration looping segment. Explicit `[]` means no music and cannot resurrect the legacy value.
- Total duration is the latest video/audio end; audio extending past video produces black tail frames. Short source music loops for the selected range. Source offset and duration apply before fades and timeline delay.
- Renderer resamples music to 44.1kHz and delays by exact sample counts (1470 samples/frame). PCM scene/gap intermediates avoid AAC padding shifting frame boundaries. Only the final mix is AAC.

## Verification results

- `npm test -w @cak/app-shopshorts`: **204 passed, 0 failed**, including real ffmpeg render tests and existing auth, scenarios, media, narration and publication gate regressions.
- Follow-up targeted serialization test passed after rejecting missing/non-string music IDs. `git diff --check` passed.
- New actual-render test: 150 output frames; blue at frames 0/29, black at 30/89, red at 90/119, black at 120/149. Checks center pixels to avoid aspect-ratio padding. 48kHz source audio is trimmed past initial silence, delayed, faded and overlapped; decoded PCM RMS confirms intended audible and silent intervals.
- Model tests cover explicit-position split/paste continuity, reorder, malformed intervals, bounds, legacy removal, fade gains, preview seeking/stop/late metadata.

## Native Chrome E2E

Run `node apps/shopshorts/test/studio-timeline-browser.mjs`. It binds only `127.0.0.1:5203`, creates isolated synthetic image/tone assets in the OS temp directory and permits local rendering only. No provider credentials or production writes.

Observed with CUA:

1. Open editor, select music and set start 2s, length 4s, fade in 0.5s. Save; read API verifies start=60/out=120/fadeIn=15. Reload restores values.
2. Enter focus mode. Pointer-drag music from 2s to 3s; drag back; trim right edge from 4s to 3s. Split at 3s into adjacent 1s/2s segments, preserving source offset.
3. Copy the second segment and paste at 8s. Add another audio asset at 8s; two distinct rows appear for overlapping music.
4. Reorder the first two video clips; attached caption follows. Drag third video to frame 419, leaving a black interval. Seek to 11s and play: Chrome reports active audio playback while the video preview is blank.
5. Save, reload, then click final render. Local worker reports task `a4d0a7e0-549e-425d-9cc5-6b4cf8b17138` done and UI advances to final-video review. Output duration is 539/30 seconds. No platform upload performed.

Fixture project: `7e76f453-6be9-4aea-be7f-e6aed461f8cc`. This is temporary local test data, not an operating customer project. Screenshot inspection confirmed the focus-mode four-panel workspace and color-coded timeline. Mobile CSS is included; native mobile-device verification was not performed.

## Release

Not deployed in this change. After PR-specific merge approval, update/restart the production renderer from the merged commit, then deploy Pages/Functions from the same commit so new timing fields are interpreted consistently. No secret migration, new dependencies or paid generation is required.
