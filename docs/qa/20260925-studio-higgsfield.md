# Studio Higgsfield subscription integration — 2026-09-25

## Scope and release state

Adds an official Higgsfield CLI media provider to the manual Studio worker. OAuth is stored in the existing Cloudflare encrypted credential vault (D1 ciphertext, encryption key in Secrets Store), not Pages/browser storage. The official CLI is pinned at 1.1.26 and performs refresh itself.

Implementation is on `feat/studio-higgsfield`; production remains on PR #24 until this PR is approved and deployed. No new credentials have been imported to production and no paid generation was submitted during the checks below. An attempted live-test click was rejected by automatic approval review; explicit permission for the 2-credit test has been requested.

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
- Native Chrome showed the isolated actual Studio media screen, correct Higgsfield credit disclosure, checked review approval, and 0/1 progress. Paid click was blocked before submission. Fresh-image generation/completed-preview E2E and video generation remain unverified until explicitly approved.

## Approved release procedure (not executed)

1. Merge this PR only after its explicit approval. Update the permanent production checkout to that merge commit and install its pinned dependencies including the Higgsfield CLI binary. Do not use the temporary worktree as the production runtime.
2. Deploy the credential broker and Pages release together. Pages must accept `mediaJobs` before the new worker submits media.
3. Drain/stop the studio worker before credential import. Use the existing runner signing key and `node apps/shopshorts/higgsfield-auth-import.mjs --file <official-CLI-credentials.json> --workspace <owned-workspace-id>`. The import validates ownership, stores and rereads the encrypted record, and prints only plan/credit metadata. No credential contents are placed in arguments.
4. Start the dedicated production studio service. It selects Higgsfield when the central record exists. Confirm its heartbeat `mediaProvider: higgsfield`, then retry missing scenes from the Studio UI after required spend approval.
5. Keep one media-worker credential consumer per Higgsfield account. Commands within this worker are serialized; CAS fails closed on a conflicting external refresh. After import, do not keep using the copied local CLI refresh token for other sessions. Reconnect by performing fresh official OAuth, draining the worker, and importing with explicit `--replace`; never overwrite a live token silently.
6. Inspect output thumbnails/actual media and provider usage. This change never publishes videos or changes upload approval gates.

The opt-in `test/studio-higgsfield-live.mjs --live-one-image` harness takes an explicitly selected approved production project, copies only its first scene to an isolated local store, preflights exactly 2 credits and waits for the browser action. It does not modify production. Required environment variables are `HIGGSFIELD_TEST_PROJECT`, `HIGGSFIELD_WORKSPACE_ID`, `HIGGSFIELD_CREDENTIALS_PATH`, and the existing `CAK_RUNNER_KEY_FILE`. Runtime output is ignored under `docs/out/higgsfield-live`.
