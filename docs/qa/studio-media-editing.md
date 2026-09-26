# Studio audio information, removal and caption review

Date: 2026-09-26. Branch: `fix/studio-media-editing`, based on `e3dc100`.

## Findings and changes

- The script-to-caption action appended a new caption on each click. It now updates one script caption per selected video clip and recognizes matching legacy captions. A separate cleanup action removes overlays with identical text, timing and style; it does not remove deliberately different overlays.
- Toolbar Delete/Backspace ignored caption selection and targeted video. It now targets the selected caption, music segment, narration or video. The last video remains protected. Visible video/narration removal controls supplement the existing music/caption controls. All edit operations support undo/redo.
- Audio library × removes that asset's timeline references and hides its library entry. `edit.hiddenAudioAssets` persists across reload; restore makes library files visible again. Original uploaded bytes are retained. Narration removal sets `voice: none`; it does not erase generated audio.
- Music discovery now shows official source links, availability and usage notes for YouTube Audio Library, Pixabay, Suno and Eleven Music. This is a source guide plus the existing rights-confirmed file upload, not a scraped/downloadable track catalogue. Suno subscription and Eleven Music-specific limits remain unverified.
- The renderer's connected ElevenLabs account is read using the official subscription API (5-second timeout; 5-minute successful cache; 1-minute failure cache). Only plan, used/limit/remaining and timestamp reach the worker heartbeat and authenticated Studio config. Billing/invoice details and keys are excluded. Missing, failed or stale reads never claim free access. The UI explicitly distinguishes the production service account from the Google sign-in account. Existing supported voices and sample playback remain unchanged; generation still consumes usage.

Stored edit fields are additive: `captions[].source?: 'script'`, `hiddenAudioAssets?: string[]`. No database migration or credential scope expansion.

## Verification

- Full Shopshorts suite: 213 tests passed, 0 failed, including existing ffmpeg/audio timing and auth/publication gate tests.
- A sandboxed rerun hit `EPERM` on local HTTP/tsx IPC sockets. The same full suite passed with the required execution permission; no test or hook was disabled.
- New model tests cover deleting captions/audio/voice while retaining the last video, legacy music removal, library removal save/reload, repeated script captions after persistence and exact duplicate cleanup.
- A new local API → save/reload → actual ffmpeg render test compares decoded video pixels: one script-caption application and repeated application are identical; deleting the caption changes the output back to the uncaptioned scene.
- Subscription tests cover single-flight caching, API failures, malformed responses, stale information, redaction and worker heartbeat → Pages config.
- Read-only production inspection of the requested project (`0afdb0ad-b212-4fd5-be3f-7dc7038e1610`, revision 13): one image scene, zero stored captions, selected Yooni voice. Original image inspection showed no embedded text. Existing production state did not reproduce the reported visual duplication; the repeat-button defect was established in code and covered by regression tests. No project mutation or paid generation was performed.
- Read-only ElevenLabs lookup with the available local key succeeded and reported Starter. This validates API compatibility; production display uses its own worker's key and should be confirmed after deployment.
- Native Chrome displayed the current production editor. Modified-UI interaction testing was not completed: concurrent user/browser changes repeatedly invalidated the UI state, so automation stopped. Local isolated fixture was started; no assertion of native-browser E2E success is made.
- `node --check apps/shopshorts/public/editor.js` and `git diff --check` passed.

## Official sources checked

- [YouTube Audio Library](https://support.google.com/youtube/answer/3376882?hl=en): free music/effects, per-track attribution and off-platform caveat.
- [Pixabay license summary](https://pixabay.com/service/license-summary/): free use/adaptation, standalone distribution and additional-rights restrictions.
- [ElevenLabs subscription endpoint](https://elevenlabs.io/docs/api-reference/user/subscription/get): GET `/v1/user/subscription`, tier and usage fields.
- [ElevenLabs publishing terms](https://help.elevenlabs.io/hc/en-us/articles/13313564601361-Can-I-publish-the-content-I-generate-on-the-platform): free plan lacks a commercial license; paid/product-specific terms apply.
- [Suno download policy update](https://about.suno.com/blog/suno-updates-tos): download and commercial-use rules depend on subscription. UI links to current conditions without inferring the user's plan.
- [Eleven Music terms](https://elevenlabs.io/music-terms): linked for product-specific verification; no music quota or blanket commercial entitlement is inferred from TTS credits.

## Release status

Implementation is on the task branch only. Merge needs explicit PR approval. Then deploy Pages/Functions and restart the production worker from the merged revision. No operating project data needs migration. Confirm native UI removal/undo/save/reload and fresh account information before calling production verified.
