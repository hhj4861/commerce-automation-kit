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
