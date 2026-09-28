# Personal model connections

Hanmadi keeps its existing default Dify → LiteLLM `hanmadi-chat` → Gemini path. Personal selections instead use the private account service → one isolated LiteLLM process → selected provider. Speech remains on the existing shared audio service. Festa can reuse this HTTP service with a separate platform key and server-derived subject; this change does not deploy or modify Festa.

## Authentication and model selection

- Codex uses the pinned LiteLLM 1.102.1 ChatGPT device login. The browser sees only the exact official verification URL and short-lived code. Users complete login themselves. Tokens and refreshes remain server-side.
- Claude uses an Anthropic **API key**, not a Claude.ai subscription token. Third-party Claude.ai credential collection/relay is disallowed by [Anthropic policy](https://code.claude.com/docs/en/legal-and-compliance).
- A successful probe with the first configured provider model marks a connection connected. The model picker exposes the operator allowlist; it does not claim every listed model was probed or is included in every account plan. An unavailable selected model fails visibly. No fallback consumes another account or Gemini credits.
- Hanmadi accepts personal connections only for a logged-in tutor with a stable `tid`. Student share links never authorize a tutor's personal account. The browser cannot provide a subject, platform key or destination URL.
- Selection defaults to Gemini on page reload. Switching models opens a separate tab-local conversation draft; default Dify consent and conversation continuity are retained. Connection revocation immediately deletes local encrypted credentials and cancels pending login. Provider-side grant revocation is separate.

## Deployment (not applied by this change)

Use the shared AI VM's existing TLS edge. Run one account service instance with a durable local volume; SQLite/fcntl are not a multi-host datastore.

1. Provision a private, mode-0600 `services/ai-gateway/.env.accounts` through the server secret manager. It is gitignored. Required values:
   - `ACCOUNT_ENCRYPTION_KEY`: a Fernet key generated securely with `Fernet.generate_key()`.
   - `ACCOUNT_PLATFORM_KEYS`: JSON object of distinct random keys of at least 32 characters, e.g. platform names `hanmadi` and `festa`. Never share one key across platforms.
   - `ACCOUNT_MODELS`: JSON object with nonempty `codex` and `claude` model ID arrays. Set currently verified provider IDs; no assumed model name is shipped. IDs permit letters, numbers, dots and hyphens, without provider prefixes. First model is the connection probe.
2. Start the pinned container with `docker compose -f compose.accounts.yaml up -d`. Only loopback port 4190 is published. The shared-host Caddyfile exposes `/accounts/connections` and `/accounts/v1/chat/completions`, preserving authentication and stripping `/accounts`; arbitrary administration paths remain closed.
3. Set server-only Hanmadi variables: `AI_ACCOUNTS_URL=https://<existing-shared-ai-host>/accounts`, `AI_ACCOUNTS_KEY` matching the Hanmadi platform key, and a separate random `AI_ACCOUNTS_SUBJECT_SECRET` of at least 32 characters. Do not use `NEXT_PUBLIC_` variables. Preserve current Gemini/Dify/audio settings.
4. Redeploy Hanmadi only after approval. Log in as the intended user, connect Codex, select each offered model and perform a short real conversation. Verify Claude with the user's API key if desired. Confirm disconnect and provider-side revocation separately. Test fixtures are not evidence of a real account grant.

## Storage, restart and recovery

`accounts-data` contains SQLite metadata and encrypted credentials/challenges. It must persist across container updates. Directory mode is 0700, DB 0600, and each encrypted payload is bound to its random connection ID. Subprocesses serialize one account's token refresh using a file lock and never store OAuth tokens as plaintext auth files. Provider stdout/stderr is suppressed; API responses are projections without secrets.

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
