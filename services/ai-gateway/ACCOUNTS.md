# Personal model connections

Hanmadi keeps its existing default Dify → LiteLLM `hanmadi-chat` → Gemini path. Personal selections instead use the private account service → one isolated LiteLLM process → selected provider. Speech remains on the existing shared audio service. Festa can reuse this HTTP service with a separate platform key and server-derived subject; this change does not deploy or modify Festa.

## Authentication and model selection

- Codex uses the pinned LiteLLM 1.102.1 ChatGPT device login. The browser sees only the exact official verification URL and short-lived code. Users complete login themselves. Tokens and refreshes remain server-side.
- Claude retains its existing Anthropic API key contract. SDK 0.3 adds explicit `authMethod: "claude-code"` for running the unmodified official Claude Code binary, where each user completes the native login. Raw subscription access tokens are never accepted. See the opt-in deployment section below and [Anthropic hosting/authentication conditions](https://code.claude.com/docs/en/legal-and-compliance).
- A successful probe with the first configured provider model marks Codex/API-key connections connected. Native Claude Code uses `claude auth status --json` after successful native login; models are checked on their first real request. The model picker exposes the operator allowlist; it does not claim every listed model was probed or is included in every account plan. An unavailable selected model fails visibly. No fallback consumes another account or Gemini credits.
- Hanmadi accepts personal connections only for a logged-in tutor with a stable `tid`. Student share links never authorize a tutor's personal account. The browser cannot provide a subject, platform key or destination URL.
- Selection defaults to Gemini on page reload. Switching models opens a separate tab-local conversation draft; default Dify consent and conversation continuity are retained. Connection revocation immediately deletes local encrypted credentials and cancels pending login. Provider-side grant revocation is separate.

## Deployment (not applied by this change)

Use the shared AI VM's existing TLS edge. Run one account service instance with a durable local volume; SQLite/fcntl are not a multi-host datastore.

1. Provision a private, mode-0600 `services/ai-gateway/.env.accounts` through the server secret manager. It is gitignored. Required values:
   - `ACCOUNT_ENCRYPTION_KEY`: a Fernet key generated securely with `Fernet.generate_key()`.
   - `ACCOUNT_PLATFORM_KEYS`: JSON object of distinct random keys of at least 32 characters, e.g. platform names `hanmadi` and `festa`. Never share one key across platforms.
   - `ACCOUNT_MODELS`: JSON object with nonempty `codex` and `claude` model ID arrays. Set currently verified provider IDs; no assumed model name is shipped. IDs permit letters, numbers, dots and hyphens, without provider prefixes. First model is the connection probe.
2. Start the pinned container with `docker compose --env-file .env.accounts -f compose.accounts.yaml up -d --build`. Only loopback port 4190 is published. The shared-host Caddyfile exposes `/accounts/connections` and `/accounts/v1/chat/completions`, preserving authentication and stripping `/accounts`; arbitrary administration paths remain closed.
3. Set server-only Hanmadi variables: `AI_ACCOUNTS_URL=https://<existing-shared-ai-host>/accounts`, `AI_ACCOUNTS_KEY` matching the Hanmadi platform key, and a separate random `AI_ACCOUNTS_SUBJECT_SECRET` of at least 32 characters. Do not use `NEXT_PUBLIC_` variables. Preserve current Gemini/Dify/audio settings.
4. Redeploy Hanmadi only after approval. Log in as the intended user, connect Codex, select each offered model and perform a short real conversation. Verify Claude with the user's API key if desired. Confirm disconnect and provider-side revocation separately. Test fixtures are not evidence of a real account grant.

## Storage, restart and recovery

`accounts-data` contains SQLite metadata and encrypted credentials/challenges. It must persist across container updates. Directory mode is 0700, DB 0600, and each encrypted payload is bound to its random connection ID. Subprocesses serialize one account's token refresh using a file lock. Codex credentials remain encrypted in SQLite; native Claude Code owns its separate credential files, described below. Provider stdout/stderr is suppressed; API responses are projections without secrets.

Back up the database consistently using SQLite backup or stop the service before copying the volume. Protect encryption keys separately from backups. Restoring requires both DB and original encryption key. Never silently generate a new key on restart. Encryption-key rotation requires a planned decrypt/re-encrypt migration (not implemented); alternatively explicitly disconnect all accounts and require reconnection. Platform-key rotation requires coordinated server/app deployment. Rotating the subject secret or changing tutor IDs changes account identity and requires a migration or reconnection.

Pending device-login workers do not survive restarts; they expire after 16 minutes and the user can cancel/reconnect. Connected records survive restart. Authentication/refresh failures, quota exhaustion and malformed replies fail closed. Explicit reconnect is required after an invalid connection state. Eight login slots and eight chat slots are independent so pending logins do not occupy all chat workers. Browser requests and worker operations have bounded timeouts. More than one process for a single connection is rejected while its lock is held.

The service records provider/subject/state, not conversation transcripts. Hanmadi still applies its existing rate limits. Shared audio usage has its existing billing, independent of the selected chat model.

## Verification

- `python -m unittest discover -s tests -p test_accounts.py -v` with `litellm[proxy]==1.102.1`.
- `node --import tsx --test lib/model-connections.test.ts` in `apps/hanmadi`.
- `ACCOUNT_TEST_PYTHON=<python> node scripts/model-connections-smoke.mjs`: isolated real Next/FastAPI/SQLite, mocked OAuth/inference only.
- Existing `scripts/language-flow-smoke.mjs`: Japanese/Thai voice-first and default Dify regression.
- Shared-host CI tests the real pinned Caddy container routing.

No production account, provider key, OAuth grant or live billing is exercised by automated fixtures.

## Shared client and Festa

`@cak/litellm-client` 0.2 exports `createAccountClient({baseUrl, apiKey, subject})`. Applications supply their own verified server identity; the service derives platform from its distinct key. The client validates public records, exact device-login URL, model selection and rechecks connection state for every text/JSON generation. Hanmadi and Festa use the same versioned library. No shared login or shared personal credential is introduced.

Festa's optional personal connection is bound to a signed HttpOnly browser session (30 days), not a cross-device user account. Its connect requests include `ttlSeconds` equal to the remaining session lifetime. The service clears encrypted secrets/challenges after expiry, including when the browser never returns, and refuses late refresh writes. Existing identified Hanmadi accounts without TTL are unchanged. The database adds a nullable `expires` column automatically; back up the existing volume before upgrade. An expired record remains as non-secret metadata until disconnected.

Structured completions accept bounded `max_tokens` (1–2000) and `response_format: json_schema`. Both are passed to pinned LiteLLM; provider refusal, truncation or schema incompatibility fails visibly with no fallback. Festa additionally validates actual travel rules on output. Default text callers retain the previous worker input and output limits.

## Opt-in native Claude Code (SDK 0.3)

`POST /connections` with `{provider:"claude", authMethod:"claude-code"}` starts the pinned, unmodified official `claude auth login --claudeai`. The CLI owns authorization, PKCE, token exchange and refresh. No private OAuth endpoint/client is reimplemented, and the service never reads/copies native credential files. The public challenge has `kind:"code-entry"`, an allowlisted native URL, `code:""`, and expiry. The end user signs in on Anthropic's page and submits its one-time code to `POST /connections/{id}/authorize`. The service validates subject/platform, pending state, challenge state, expiry and single submission. Only an encrypted transient code is queued for the CLI's stdin; it is not returned or logged.

Generation runs `claude -p` with the selected model in that user's profile: safe mode, empty tools, strict empty MCP config, no customization sources or session persistence. JSON schema is passed through the CLI and structured results are returned in the existing completion envelope. The CLI has no exact `max_tokens` equivalent here: native generation uses the CLI defaults, a 28-second deadline and existing output-size limits; the caller's `max_tokens` remains validated but is not a native token budget. Failed or incomplete results never switch providers.

### Runtime and credentials

- `Dockerfile.accounts` installs LiteLLM 1.102.1 and official Claude Code 2.1.284 on Debian. Build the image before rollout. Existing Codex/API contracts and the accounts-data volume remain unchanged.
- Explicitly set `ACCOUNT_CLAUDE_CONFIG_ROOT=/account-data/claude-code` in `.env.accounts` and use `docker compose --env-file .env.accounts ...` so Compose interpolation receives it. Empty/unset disables new native connections. `ACCOUNT_CLAUDE_BINARY` defaults to `/usr/local/bin/claude`.
- The CLI manages native credentials beneath one random connection ID per `CLAUDE_CONFIG_DIR`. Native files are **not covered by the SQLite Fernet key**. The deployment must use encrypted persistent disks and encrypted/access-controlled backups; directories are 0700, worker umask is 077. Do not put profiles on a public/shared writable mount or expose them to app/browser logs.
- Preserve the volume, native profiles and original DB encryption key together across restart/restore. Do not import an operator's home config or credentials. Native configuration/auth methods are not patched. Existing API-key callers can still authenticate via their original contract.
- Disconnect/TTL expiry stops worker process groups (including native descendants), removes the native profile and refuses late replies. Login failure/cancellation removes the profile too. Provider-side app grant revocation is separate. Cleanup runs every 60 seconds and on access; expired metadata remains for explicit reconnect. Pending login cannot resume across service restart.
- Inference and login run with an allowlisted environment: no inherited Anthropic key, Claude token, provider override or MCP settings. Transcripts are not retained by the wrapper; `--no-session-persistence` disables CLI conversation files. Operational telemetry from the official CLI remains governed by its native settings.

### Validation and rollout

Run `PYTHONPATH=services/ai-gateway python -m unittest discover -s services/ai-gateway/tests -p 'test_accounts.py'` and `test_claude_code.py` in the pinned Python environment, plus `node --test packages/litellm-client/test/*.test.mjs`. Native tests use a subprocess fixture for stdin, profile isolation and generation; they do not grant a real account. A local probe with the actual 2.1.284 binary verified URL generation and the one-time code prompt only.

This source change does not deploy/enable the runtime. This development host has no Docker runtime; the `native-runtime` job in the personal-model-connections workflow builds the Linux image and runs both account suites inside its read-only container. Require that check to pass before rollout. A real subscription login/inference remains an end-user acceptance check. Build/health-check the new image, preserve encrypted storage, then activate the native profile setting before deploying Festa 0.3 client. Test a user's direct login, actual model request, cancellation, expiry and disconnection. Roll back the image and disable new native connections if acceptance fails; do not delete existing account data to roll back.
