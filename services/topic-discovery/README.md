# Shared discovery v1

Status: PR #130 merged on 2026-10-03; production is not enabled. Deployment preflight found a missing Python CA trust store, now fixed in the production-wiring follow-up. No live search/Jev/LLM calls were made by the fixture tests. Default `DISCOVERY_ENABLED=0` preserves deployed clients until the shared service, scoped keys and acceptance checks are ready.

## Ownership and protocol agreement

Coordinated directly with Codex **JEV** (`01a0dbe8-c325-7680-ad08-abaab2ef43a2`) on 2026-10-03. Core/SDK and quality evaluation remain that session's scope. This change adds the selection orchestration and consuming adapters. Existing `@cak/litellm-client` **0.4.0**, `createJevClient.evaluate({state, questions})`, model `jev-1.13.0`, are reused unmodified via `jev-bridge.mjs`. No account tokens are copied or migrated; no default operator model replaces the user's chosen subscription.

## One workflow, different execution adapters

1. Authenticated backend/worker sends category, brief, `content|business`, selected provider/model and optional old history.
2. Shared server searches the official Naver Web Search API, assigns evidence IDs, merges its own scoped recommendation history and creates the versioned generation prompt.
3. The backend claims **one** generation action and uses its existing Codex/Claude runtime with a draft-only mode that disables native web search/tools in the process arguments. It checks the owner, selected provider/model, connection state and cancellation before generation and again before submitting completion. The browser never receives the platform key or submits completion directly.
4. Shared server validates the untrusted generated candidates and cited IDs, performs candidate-specific searches, then calls Jev with separate relevance, semantic duplicate, evidence support and profile-value questions.
5. Server maps those bounded choices to `accepted|held|rejected`. Clients render/use only accepted candidates while keeping existing publication/business approval gates.

The prompt, search, decision rubric and history are centralized. The existing authenticated platform worker executes the LLM request; this v1 does **not** move every runtime process or login into the discovery container. Future server-native runtime adapters can use the same action protocol. Their introduction must retain account ownership and revocation checks.

Content prioritizes a real case, expected versus actual answer, a non-obvious explanation, visual question and everyday relevance. Business uses customer pain, demand evidence, alternatives/differentiation and a small validation experiment. Ad counts and local ranking scores are proxies, never proven profitability or business GO approval.

## Evidence limits

Naver returns indexed **search excerpts**, not independently verified full pages. Every evidence row is `kind: search_excerpt`; every result carries `factChecked: false` and `requiresHumanReview: true`. URL membership alone never passes the support question. Unsupported mechanisms, missing primary context, invented popularity/health claims and uncertainty are held. Before production/content publication, inspect primary pages and preserve the clients' existing deeper evidence gates. This service is candidate screening, not a general fact-check certification system.

Confidence/probability thresholds (0.8 and winning margin 0.2) are versioned conservative policy values, **not measured accuracy**. Live quality calibration with architecture, psychology, blog and business cases is still required. Official API contract: https://developers.naver.com/docs/serviceapi/search/web/web.md . Search-provider cache/redistribution conditions remain TODO(D1); no resale/feed API is introduced. Keep the database private and review retention before rollout.

## HTTP contract

All paths are relative to `/discovery` at the private shared TLS edge. Headers:

- `Authorization: Bearer <distinct platform key>`: platform derives from server configuration, never request JSON.
- `X-Discovery-Subject: <64 lowercase hex>`: derived by the authenticated backend. Shopshorts uses its existing Google-owner digest. CLI/blog/business have explicitly provisioned service identities. Do not accept a browser's arbitrary subject.
- `Idempotency-Key: <8..100 letters/digits/_/->` on start. Keep stable across retries. Generate a new key only for an intentional new recommendation.

`POST /v1/discover` body:

```json
{"profile":"content","category":"건축학","brief":"국내의 의외의 실제 건축 사례\n숏폼 60초, 그림 중심","runtime":{"provider":"codex","model":"provider-default"},"history":[{"title":"기존 주제","entity":"기존 대상","answer":"기존 설명"}]}
```

Returns `requestId, rubricVersion, state, action, evidence, candidates, usage, reasonCodes, expiresAt`. `action` contains an opaque ID, immutable runtime and server prompt. Runtime `provider-default` means the existing user's configured native default; it is not a claim that the actual resolved model was independently measured.

- `POST /v1/discover/<id>/claim` `{actionId}`: one consumer transitions to `generating`. A duplicate claim is 409 and must not trigger another LLM call.
- `POST /v1/discover/<id>/complete` `{actionId,runtime,output:{candidates:[...]}}`: consumes a result once; identical replay returns stored status/result, changed replay is 409. On generation failure submit `generationError:true` instead of output.
- `GET /v1/discover/<id>`: read the same platform/subject request. Other scopes see 404. There is no cross-user list endpoint or browser CORS access.

Candidate fields are `title, entity, location, question, expectedAnswer, answer, whyItMatters, direction, keyword, openingVisual, evidenceIds`. Text is bounded and extra fields are rejected. For business, expectedAnswer describes existing alternatives, answer describes the proposed solution/limits, direction describes the validation experiment. Model-supplied verdicts and new source IDs are not accepted.

`complete` means the workflow ended, not that every candidate passed. Read each decision. `held` includes missing evidence, generation failure, malformed output, expiration or verification failure. `skipped_by_budget` is an explicit 429 before starting a request. There is no generation/provider fallback.

## Durability, limits and failures

SQLite stores scoped requests, idempotency fingerprints, action state and accepted history. `BEGIN IMMEDIATE` prevents duplicate claims and concurrent discovery for one subject, including multiple workers. Expiration and expected-state transitions share one write transaction; late external responses cannot resurrect terminal requests. Only accepted candidates establish duplicate history. Up to 100 recent accepted candidates within the same profile plus imported history are considered (combined cap 100; server history takes precedence); this is a bounded history window, not all-time semantic deduplication.

Requests expire in 10 minutes. A crash after search/claim/review is not automatically retried, because the provider may already have billed it. Query the saved request; expiration leaves a visible hold. Create a new request intentionally after investigating. In-flight cancellation/revocation at the adapter prevents submission; unsubmitted actions expire held. A disconnected browser does not cancel the existing Shopshorts account-worker job.

Default rolling 24-hour limit: **30 requests per platform**, each at most 1 generation claim, 4 search attempts and 3 Jev attempts, no hidden retry. Eight HTTP operations may run concurrently. Search timeout 12s, Jev SDK timeout 5s, bridge process ceiling 12s, client HTTP deadline 120s. Attempt counters are committed before each external dispatch, including calls whose response arrives after expiry. They are conservative attempted calls, not proof of provider billing. `costUsd:null` means unknown, not free. These limits bound call counts, not a currency spending guarantee; provider quotas and service-key spending caps must also be configured before enabling.

SQLite contains planning text and evidence; no subscription tokens or model platform keys. Use encrypted local server storage, private directory/0600 file, restricted backups, one host with a local filesystem (not NFS/iCloud). Logs omit prompts, keys and raw upstream bodies. Back up this volume before upgrades. No schema rollback/deletion automation is provided.

## Provision and enable after approval

1. Through existing Cloudflare secret management, provision distinct `DISCOVERY_PLATFORM_KEYS` entries for `shopshorts`, `wp-auto-blog`, `venture-studio`, and CLI if separate. Inject existing Naver credentials and a budgeted **discovery-scoped** JEV LiteLLM key. Never reuse a master key or an unrelated platform's key. `.env.example` contains names only.
2. Prepare `services/topic-discovery/data` on the shared server with owner UID 1000 and mode 0700. Preserve/backup existing data. Use `.env` mode0600, `DISCOVERY_DB=/discovery-data/discovery.sqlite`. Build/start with `docker compose -f services/topic-discovery/compose.yaml up -d --build` from the repository. Local port is 127.0.0.1:4195 only.
3. Validate the shared TLS edge allowlist and deploy it in its own approved rollout. Existing gateway deployments do not automatically start this new service. No change here claims that GitOps has already provisioned it.
4. Configure each backend with `DISCOVERY_URL=https://<shared-host>/discovery`, its `DISCOVERY_API_KEY`, and then `DISCOVERY_ENABLED=1`. Shopshorts derives subject/job ID from the authenticated account worker. CLI/blog/business also need `DISCOVERY_SUBJECT` and stable request IDs. Never put these in browser/public variables.
5. Test real selected Codex and Claude accounts, revocation while generating, duplicate retry, primary evidence quality, same-topic exclusion, all-held UX and independent users. Record actual live costs before raising limits. Enable clients only after these checks. To roll back, disable the client flag and roll back code deliberately; do not erase account credentials or discovery history.

### CLI

Set `DISCOVERY_URL/API_KEY/SUBJECT`, the desired existing native login and process `TMPDIR` to the approved artifact root. Send request JSON (profile/category/brief/history) on stdin:

```sh
node services/topic-discovery/cli.mjs --request-id <stable-request-id> --provider codex --model <selected-model>
```

`--provider claude` uses that existing native login. The CLI checks native login status; it never starts login or silently uses API-key billing. Exit 0 means at least one candidate passed, 2 means completed/held without an accepted candidate, 1 means execution failure. No auto publication occurs.

### Consumers

- Shopshorts: `recommendBrief` routes to the server only when enabled. The existing Codex/Claude worker owns credentials and rechecks the owner record around generation. A local unauthenticated direct recommendation path cannot invent a subject and fails visibly when enabled. Approved candidates retain existing topic/direction/keyword/case-study UI shapes.
- wp-auto-blog: companion `feat/shared-topic-discovery` branch connects both `market_topics.select_category` and general LLM collection. It keeps exact-keyword demand and publication checks; unrelated measured terms cannot enter the shared shortlist. The vendored Python file is transport only, no rubric copy.
- venture-studio: companion `feat/shared-discovery` connects `business_discovery.py discover` and opt-in reports through this CLI. Existing raw ranking remains separate from the server decision; no automatic GO.

## Verification

Use `DISCOVERY_TEST_DIR` and process `TMPDIR` under the approved artifact root locally. CI uses its isolated runner temporary directory. All fixtures use synthetic keys and stub search/model responses; none proves production model quality.

```sh
PYTHONDONTWRITEBYTECODE=1 python3 -m unittest discover -s services/topic-discovery -p test_service.py -v
node --test services/topic-discovery/test-client.mjs apps/shopshorts/test/topic-discovery.test.mjs
```

Tests cover actual JS/Python HTTP adapters, scope isolation, conflicting/idempotent requests, single generation claim, persisted duplicate history, model binding, expiry, evidence ID fabrication, low-confidence/unavailable review, revocation before completion, and no silent legacy fallback. Existing Shopshorts recommendation/Codex/Claude tests also run before commit.

## Production credential delivery (follow-up)

The existing Cloudflare Secrets Store owns `CAK_DISCOVERY_SHOPSHORTS_KEY`, `CAK_DISCOVERY_BLOG_KEY`, `CAK_DISCOVERY_VENTURE_KEY`, `CAK_DISCOVERY_CLI_KEY` and `CAK_DISCOVERY_JEV_API_KEY`. Before deploying the new broker bindings, register distinct high-entropy values with `node apps/credential-broker/admin.mjs register-discovery /absolute/private/credentials.json` (file mode 0600, local approved private runtime path, never iCloud). This command writes only binding metadata to wrangler.json. It does not enable clients. Keep Jev route/model/expiry/budget limits and the private server env lifecycle separate from client keys; Jev credentials are not returned by any client route.

Authenticated `/runner/discovery` accepts exactly one `platform` (`shopshorts`, `wp-auto-blog`, `venture-studio`, `cli`) and returns that one platform key. The existing signed runner JWK is an **operator credential**, not a per-user credential; never distribute it to a browser, customer, or public CI. Generic runner/static secrets and Pages RPC exclude these discovery keys. The operator's ability to select a platform is intentional; the shared discovery API still derives platform from that platform's distinct key and scopes requests by subject.

For the Shopshorts account worker, set `DISCOVERY_ENABLED=1`, `DISCOVERY_URL=https://shared-ai-d5cy7m6i7q-uc.a.run.app/discovery`, and existing private `CAK_RUNNER_KEY_FILE`. Each recommendation fetches its current shopshorts key before executing the existing owner-bound account runtime. Native connection/scenario jobs do not require this new key. Missing central credentials fail closed, including when an old DISCOVERY_API_KEY exists in the environment. No global Codex OAuth lease or token migration is involved.

For a trusted operator CLI use those URL/runner settings plus `DISCOVERY_SUBJECT=<provisioned stable service identity>` and `DISCOVERY_PLATFORM=cli`. For the venture adapter use `DISCOVERY_PLATFORM=venture-studio` and its own subject with `DISCOVERY_CLI` pointing to the reviewed local release. The same CLI enforces the shared transport. A non-operator backend may receive its own DISCOVERY_API_KEY from its private secret injector instead; do not hand it the shared runner JWK. Rotation reads fresh keys per recommendation/CLI invocation, but the discovery server platform map must be rotated in coordination before clients resume.

Blog OIDC is off until `GITHUB_BLOG_DISCOVERY_ENABLED=true`. Only immutable blog repository/owner IDs, main, GitHub-hosted schedule/dispatch and two reviewed workflow paths qualify. The companion blog follow-up adds a single-request, no-publication live check and a default-off category workflow flag. Other direct collector runtimes need their own env injection; merging alone does not turn every client on.

### Observed deployment preflight — 2026-10-03

- Approved commerce #130, blog #78 and venture #43 are merged.
- VM build `cak-discovery:04988fd48ffb` completed, but an actual Python HTTPS request to Naver failed with `CERTIFICATE_VERIFY_FAILED`; trust paths were absent. TLS verification was not disabled.
- Follow-up installs `ca-certificates` and checks a populated Python trust store in CI. Existing services were not restarted, public edge not switched, and no new discovery keys or paid model calls were provisioned at this point.
- Rollout remains pending follow-up PR approval, central secret provisioning, edge/service activation, and real-account quality checks. Passing fixtures or an image build is not production activation.

Follow-up validation: the isolated VM image `cak-discovery:ca-trust-check` built successfully. Python reported 150 trusted CA certificates and reached the official Naver search endpoint with TLS verification enabled, returning expected unauthenticated HTTP 401. No API keys/model calls were used. Broker, account and recommendation fixtures passed (129 JS tests total across the regression run and one added boundary case); Python server tests passed 18/18.
