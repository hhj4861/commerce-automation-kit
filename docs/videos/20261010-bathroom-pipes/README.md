# Bathroom pipe reference comparison — task card

- Goal: create an original architecture Short on the actual reference topic and compare spatial clarity, materials, movement and explanation.
- Owner/scope: invoking Codex only; these seven source files. Existing render-kit branch, base d12c7e4. No common renderer, other sessions, production or upload changes.
- Reference: https://www.youtube.com/shorts/2XaDa6qlHr4 (~179 seconds). Selected frames and playback inspected; not downloaded/reused. Creator tools unknown.
- Source: https://journal.khousing.or.kr/articles/xml/7z70/ (KICT authors, 2017). Under-slab and on-slab systems; no universal diameter/slab thickness or zero-noise claim.
- Acceptance criteria: original script + depth review; interior and cutaway previews checked; official 6s Higgs intro <=54 credits; Kyle 1.1x; complete ending; 1080x1920 decode/audio/caption checks; actual comparison; own commit/upstream push.
- Current: final 56.041667s / 1080x1920 / 24fps MP4 created. Full decode, audio, A/V timing and exact-source caption coverage passed. Final contact sheet and prior motion previews inspected. Render exit 0 (10,350 seconds); assemble/verify/contact each exit 0. Own source commit/upstream push is the final repository step.
- Storage: intermediates in iCloud task cache; final /Users/admin/Downloads/vedio/bathroom-pipes-architecture-short.mp4.
- Quality: technical checks pass; reference parity is not achieved. Water/obstruction depiction and scale transitions remain more schematic. See verification.json for evidence and limits.

## Preview findings and corrections

Initial high camera hid the ceiling pipe behind the upper slab. Lowered the view into the actual void. Widened stacked-room framing, moved ceiling panels sideways out of view, created a true hatch gap and service-wall frame. Water markers are illustrative; opaque pipe shells are sectioned to expose them. No fluid/structural simulation claim.

Reference inspected: 0s apartment context, ~27s penetration closeup, ~35.9s stacked bathrooms, ~45s pipe detail, 90s pipe/slab detail, 150s apartment context; selected playback only, not a complete audio/transcript review. Our opening is official Higgsfield, body is authored Blender; creator tools unknown.

## Final comparison

Output: `/Users/admin/Downloads/vedio/bathroom-pipes-architecture-short.mp4` (56.04s, 15,433,645 bytes). Kyle 1.1x, Pretendard SemiBold, original 6s Higgsfield opening plus authored Blender body. The last narrated sentence is complete and has 2.72s of visual hold.

The reference also uses simple bathroom geometry in some frames. Its more noticeable advantage is concrete water/obstruction imagery and changes from building context to pipe closeups. Our consistent rooms and exposed route support comprehension, but cyan flow beads and noise rings remain schematic. Higher render samples alone will not close this gap. A future iteration should prioritize causal motion and varied spatial transitions.

Comparison is between selected reference frames/playback (~179s total) and our 56s film, not equal-duration scripts or audience performance. The creator's tools and costs are unknown. The reference was not downloaded or reused. No full-reference transcript review or human full-film audio listening is claimed. QuickTime opening did not complete through the UI; file decode and frame inspection passed independently.

## Reproduction and verification

`produce.mjs`, `scene.py` and `render.py` are this video's isolated production sources. `story.json` / `review.json` hold the exact reviewed script. `verification.json` records final hashes, 1,345 frames, audio peak -1.4 dB, A/V duration difference <1 ms, complete caption coverage, source hashes, paid-job receipt identity and inspection limitations. Reuse downloaded assets; do not repeat paid generation by default.

Three preview iterations corrected framing, ceiling occlusion and pipe visibility before full rendering. Two 2-second movement tests checked flow and service-wall opening. Full render took 10,350 seconds (~2h53m); total task duration and token usage were not reliably measured. No production app, uploaded video or default renderer was changed by this isolated comparison.

## Audio / typography revision task

- Request: investigate inaudible playback and replace old-looking caption/title treatment.
- Scope: finish-v2.py, verification-v2.json and this task note only; existing Blender/Higgsfield/TTS assets reused. Base c338ea4.
- Findings: original final MP4 has a default mono AAC-LC track, 44.1 kHz, measured mean -17.7 dB / peak -1.4 dB. User playback environment is not yet identified; no proven root cause.
- Acceptance: complete 56s revision, explicit 48 kHz stereo AAC default Korean track, per-scene non-silence/source-correlation checks, larger clean title and rounded caption panels, visual inspection, own commit and upstream push.
- Current: v2 MP4 exported and verified; original preserved. 1,345 frames, all 8 narration segments non-silent, original-audio correlation 0.9995, all 23 caption midpoint pixel checks pass. Title/body/ending sampled frames inspected. Playback environment remains unconfirmed; do not call the reported user-side audio issue fixed.

- V2 output: `/Users/admin/Downloads/vedio/bathroom-pipes-architecture-short-v2.mp4`.
- Design: actual Pretendard font rasterization, 88px left-aligned white/mint title, 62px caption text with a rounded translucent charcoal panel and no stroke, clean white floor labels. Same pictures, words, Kyle voice and 1.1x timing.
- Revision verification caught captions advancing when the first generated clip changed to Blender. A dense alpha graphics track alone did not resolve it. Preserving the multi-input filter graph across same-size/yuv420p source clips did; source-layout assertions and actual caption pixel/timing checks guard this export.
- Audio: explicit default Korean AAC-LC stereo 48 kHz, peak -1.20 dB. Original final-file speech was independently decoded/transcribed. No system/player settings changed. File checks cannot establish why a particular user player was silent.
- Additional paid generations: zero. No production defaults or existing uploaded videos changed. Own source commit/upstream push follows these checks.
