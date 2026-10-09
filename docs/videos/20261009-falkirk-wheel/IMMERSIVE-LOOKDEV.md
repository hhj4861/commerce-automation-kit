# Falkirk: immersive scene look-development

- Goal: apply the user's latest Daegwallyeong/ Dujiangyan visual references to three actual Blender keyframes before spending time on full animation.
- Owner: invoking Codex, worker/Claude flags OFF. Branch `feat/architecture-render-kit`, base `080cd53`. Earlier comparison is rejected, not a visual baseline.
- Scope: `immersive-scene.py`, verification and this task card. No Shopshorts runtime edits, deployment, paid media, full-film replacement or upload.
- Source: latest guidance in root `docs/videos/PRODUCTION-STYLE.md` at `9cd4331`; actual official facility photo viewed on Scottish Canals (https://www.scottishcanals.co.uk/visit/canals/visit_falkirk_wheel). No borrowed image textures/video.
- Done criteria: three representative 9:16 frames from a continuous authored 3D scene; physical location continuity; inspect each, correct framing issues; honest technical/visual limits; commit/push own sources. Keyframes are not a completed motion sample.
- Current: three 1080×1920 keyframes and a contact board rendered, technically checked and visually inspected. User aesthetic approval is pending; full animation remains unmade.

- First attempt: scene built, but exact float equality on Blender float32 location rejected 2.05. Changed to a 1e-5 tolerance; geometry unchanged. Retry checks this hypothesis.
- Preview 1 failed visual review: overbright pastel materials, geometric blob crowns, foreground rail blocking the bow. Preview 2 separates sky/sun exposure, uses porous leaf meshes, finer lower water ripples, and an inside-channel close camera.
- Preview 2: rail obstruction resolved. Remaining issues were weak front lighting, sparse foliage, and water mesh frequencies exceeding grid sampling (striped highlights). Preview 3 uses an explicit camera-side sun direction, denser leaf clusters, and lower mesh-wave frequencies.
- Preview 3: water aliasing and major obstructions resolved. Final pass tightens the site framing and replaces the solid cabin box with window pillars, interior seats and a floor so glazing has real depth. Final renders require separate inspection.

## Delivery and validation

- Final frames: `/Users/admin/Downloads/vedio/falkirk-lookdev-v3/{falkirk-site-v3.png,falkirk-entry-v3.png,falkirk-water-v3.png}`.
- Board: `/Users/admin/Downloads/vedio/falkirk-lookdev-v3/falkirk-lookdev-v3.jpg`.
- Blender 4.5.10, Cycles Metal GPU, 64 samples, 1080×1920. Render process exit 0. All three PNGs decoded, dimensions/hash/source revision checked. Python AST and `git diff --check` passed. API calls 0.
- Final frames inspected: whole wheel silhouette remains within the establishing frame, same boat/water height across cameras, rail obstruction corrected, contextual terrain/trees/upper approach visible. The model and terrain are still simplified. These checks do not declare the reference quality matched or user preference satisfied.
- Water is a procedural surface, not a hydrodynamic solution. A still cannot demonstrate the intended displaced-water flow. That needs a subsequent animated test after the visual direction is accepted.
- No source/runtime code from Shopshorts changed in this follow-up. No paid generation, video replacement, deployment or upload. Existing rejected samples are retained for history, not a passed benchmark.
- Next: review these exact three frames with the user; only then build/verify movement and explanation continuity. Do not silently promote this scene into production defaults.

## Reproduce

`blender -b --factory-startup --python-exit-code 1 --python immersive-scene.py -- --out <cache>/final --percent 100 --samples 64`.
Then `python3 lookdev-verify.py --render-dir <cache>/final --deliver-dir <Downloads>/vedio/falkirk-lookdev-v3 --report <verification.json>`.
Scene sources and Blender-generated manifests remain together under the task's source/cache paths. The final frames are computed Blender pixels, not AI-enhanced stills that the renderer cannot reproduce.

## Motion follow-up — user request 2026-10-09

- User requested a video from the new keyframes. Base `1dfe630`; same owner/branch. Scope now includes `immersive-motion.py`, `motion-finish.py`, and a motion verification report.
- Produce a 17-second body-motion excerpt with the previously generated complete displacement narration (Kyle, 1.1×); no new paid calls. Preserve original full film and all rejected samples.
- Camera sequence: contextual wide → entering boat → same bow and moving water. Gate stays open, wheel stationary throughout boat entry. Constant mean water height; waves are illustrative, not CFD or a quantified displacement simulation.
- Acceptance: motion frames inspected before full render, direct MP4 output without large frame sequences, complete audio/captions and ending pause, full decode/A/V/frame checks, own commit/push. No production default changes or deployment.
- Current: implementation prepared; animation rendering/verification pending. Historical keyframe report records the earlier source hash; it is not evidence for the new animated frames.

- Motion preview 1: entry/close views retain the same hull and unobstructed waterline. The establishing view cropped the stern at the right edge; widened its lens and aimed slightly lower before the final render. Original static cameras remain unchanged.


## Motion result

- Delivered `/Users/admin/Downloads/vedio/falkirk-immersive-motion-v3.mp4`: 17.000s, 408 frames, 1080×1920, 24fps, H.264/AAC, 11,192,677 bytes. File SHA-256 and exact input/source hashes are in `motion-verification.json`.
- Same Cycles Metal renderer/64 samples, direct MP4 output. Actual animation render: 2616.98 seconds (43m37s), excluding scene construction and final assembly. Two small preview passes preceded the final render; one camera-framing rework. No model token/cost metrics available and no paid generation calls.
- Rendering and assembly processes both exited 0. Full ffmpeg decode passed; audio/video duration difference 0.000s; audio mean -18.0dB, peak -1.5dB. Complete original displacement narration reused at Kyle 1.1×, with 2.016s after the spoken ending. All original words included in captions.
- Inspected eight frames including both sides of the cuts at 3.5s and 10.5s. Whole boat in wide frame, monotonic entry, consistent hull and waterline, moving water highlights, unobstructed bow close-up; caption placement checked on actual output. This is representative frame inspection, not a claim of watching every frame in real time or matching the user's reference quality.
- This is a body-motion proof, not the complete Falkirk film. No new Higgsfield introduction, wheel rotation sequence, production integration or upload. Original finished film preserved. Water is illustrative, not a quantitative hydrodynamics simulation.
- Next useful action: user reviews this actual moving sample before approving a full-film visual replacement. The branch contains the reproducible scene, animation and finishing scripts; do not promote the older rejected renderer into production.

Reproduce motion: `blender -b --factory-startup --python-exit-code 1 --python immersive-motion.py -- --out <cache>/final --percent 100 --samples 64`.
Then `python3 motion-finish.py --cache <cache>/final --source-cache <original-falkirk-cache> --output <Downloads>/vedio/falkirk-immersive-motion-v3.mp4 --report motion-verification.json`.
