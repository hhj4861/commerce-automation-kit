# Studio Higgsfield subscription integration — 2026-09-25

## Scope and release state

Adds an official Higgsfield CLI media provider to the manual Studio worker. OAuth is stored in the existing Cloudflare encrypted credential vault (D1 ciphertext, encryption key in Secrets Store), not Pages/browser storage. The official CLI is pinned at 1.1.26 and performs refresh itself.

PR #25 was explicitly approved, merged and deployed on 2026-09-26 KST. Production runs merge commit `c779876156a7c78471e3cf73ea729152f6547d7f`. The official OAuth credentials were imported into the Cloudflare vault after draining the worker. One explicitly approved 2-credit image generation completed through the production Studio UI. The earlier approval-review rejection occurred before this explicit approval; no generation was submitted by that rejected attempt.

## Production acceptance — 2026-09-26 KST

- Broker deployment: `375a4105-13ec-48b1-ab21-35f2a84571ae`; Pages deployment: https://8bb11e2f.shopshorts-dash.pages.dev (main production alias updated).
- Permanent runtime checkout: `/Users/admin/workSpace/shopshorts-production`, detached at the approved merge commit. Official CLI version 1.1.26 installed and verified; dedicated launchd studio service restarted successfully.
- Central credential hydration succeeded after import, and the worker used Higgsfield for the paid image request. No credential values are recorded here.
- Verification project: https://shopshorts-dash.pages.dev/studio?id=0afdb0ad-b212-4fd5-be3f-7dc7038e1610 . Contains only the first reviewed scene copied from the existing three-scene project, which was not changed.
- UI request at `2026-09-25T15:33:29.967Z`, worker start at `15:33:38.605Z`; task `8d8cb696-eb45-4b56-ae61-ac83653ce4f7` reached `done`. Provider job `6df2d61b-e070-436f-82dd-31100b1ccdb4` produced the image.
- Preflight 2 credits; workspace balance changed from 1327.0999755859375 to 1325.0999755859375. Exactly one paid image was requested.
- Production asset read returned `image/png`, 7,725,784 bytes with valid PNG signature. Native Chrome showed the generated image, 1/1 completed progress, and the same image in the editor.
- Video generation, narration, rendering and upload were not requested or live-tested in this acceptance run.
- Discovered display defect: the Pages heartbeat endpoint discarded `mediaProvider`, leaving the old Google video-duration hint even though the worker used Higgsfield. The follow-up branch `fix/studio-media-provider-status` preserves only supported provider identifiers and tests authenticated heartbeat → config propagation, old/unknown values and unauthorized writes. This follow-up is not yet deployed and requires its own PR merge approval.
- Follow-up verification: 41 distinct Node tests passed (35 Studio/provider/service tests plus 6 existing Pages API regression tests); `git diff --check` passed.

## Verified provider facts

- Official subscription OAuth login works; one owned Plus workspace returned about 1,327.10 credits.
- Official CLI `model get nano_banana_2` returned **Nano Banana Pro**, image, `1k/2k/4k` and `9:16/16:9` support. Studio chooses 2K.
- `generate cost nano_banana_2` for the reviewed image scene returned **2 credits**. Three such images would be 6 credits; cost is queried again before every submission.
- `model get seedance_2_0` confirms standard mode, 1080p, aspect ratio, duration and `generate_audio` parameters. Studio uses 4–15 seconds, standard, 1080p, no generated dialogue/audio. Longer edited scenes loop existing clips.
- CLI `generate get` on one existing owned completed image returned an object with `id`, `status: completed`, and `result_url`. The new downloader successfully fetched the real PNG (1,205,971 bytes).
- Hydrating actual OAuth credentials into a private temporary file and selecting the workspace through CLI environment settings successfully returned the image model schema. No generated media is claimed from this read-only check.
- Web Unlimited/free generations do **not** apply to MCP/CLI. Existing plan credits apply; separate dollar-billed API credentials are not used.

Primary references, checked 2026-09-25:

- https://higgsfield.ai/creator-hub/help-center/integrations/what-is-higgsfield-mcp
- https://higgsfield.ai/creator-hub/help-center/integrations/how-do-i-access-higgsfield-via-cli
- https://higgsfield.ai/creator-hub/help-center/integrations/what-is-the-higgsfield-api
- https://github.com/higgsfield-ai/cli

## Reliability and verification

- Before a paid submission, a `mediaJobs` intent is saved with the scene fingerprint and current cost. Accepted provider IDs are saved locally and checkpointed to the project in D1. Retry polls the same job after timeout/download failure; uncertain submission responses stop instead of charging again. Explicit provider failure is retryable.
- Scene assets are checkpointed only after actual media download and storage. The existing progress bar counts stored scene assets, and ready scenes keep their previews.
- Only the authenticated current worker/task can checkpoint `mediaJobs`; stale tasks and browser-forged completion remain blocked.
- Each CLI command hydrates the latest encrypted credential record into mode-0600 files inside a private temporary directory. Refresh changes are persisted with revision CAS even when a provider command fails. Failed persistence retains restricted recovery files and stops later calls from that runner.
- Inherited Higgsfield endpoint/auth overrides are removed before cloud credentials are hydrated. No Google fallback is attempted once a Higgsfield vault record is selected.
- Download permits HTTPS Higgsfield/CloudFront hosts, validates redirects and MIME, rejects empty output and streams with a 50MB limit. Tokens never accompany media CDN downloads.
- Final relevant Node regression suite passed **213 tests**; focused authentication/provider/service suite passed 15 tests. Python launch-service suite passed 3 tests. Broker Wrangler dry-run build succeeded.
- Before release, Native Chrome showed the isolated Studio media screen, correct Higgsfield credit disclosure, checked review approval, and 0/1 progress. The first paid click was blocked pending approval. Production fresh-image/completed-preview E2E is now verified as recorded above; video generation remains unverified.

## Release and credential replacement procedure

1. Merge this PR only after its explicit approval. Update the permanent production checkout to that merge commit and install its pinned dependencies including the Higgsfield CLI binary. Do not use the temporary worktree as the production runtime.
2. Deploy the credential broker and Pages release together. Pages must accept `mediaJobs` before the new worker submits media.
3. Drain/stop the studio worker before credential import. Use the existing runner signing key and `node apps/shopshorts/higgsfield-auth-import.mjs --file <official-CLI-credentials.json> --workspace <owned-workspace-id>`. The import validates ownership, stores and rereads the encrypted record, and prints only plan/credit metadata. No credential contents are placed in arguments.
4. Start the dedicated production studio service. It selects Higgsfield when the central record exists. Confirm its heartbeat `mediaProvider: higgsfield`, then retry missing scenes from the Studio UI after required spend approval.
5. Keep one media-worker credential consumer per Higgsfield account. Commands within this worker are serialized; CAS fails closed on a conflicting external refresh. After import, do not keep using the copied local CLI refresh token for other sessions. Reconnect by performing fresh official OAuth, draining the worker, and importing with explicit `--replace`; never overwrite a live token silently.
6. Inspect output thumbnails/actual media and provider usage. This change never publishes videos or changes upload approval gates.

The opt-in `test/studio-higgsfield-live.mjs --live-one-image` harness takes an explicitly selected approved production project, copies only its first scene to an isolated local store, preflights exactly 2 credits and waits for the browser action. It does not modify production. Required environment variables are `HIGGSFIELD_TEST_PROJECT`, `HIGGSFIELD_WORKSPACE_ID`, `HIGGSFIELD_CREDENTIALS_PATH`, and the existing `CAK_RUNNER_KEY_FILE`. Runtime output is ignored under `docs/out/higgsfield-live`.
