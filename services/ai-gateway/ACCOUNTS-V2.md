# Accounts v2 — isolated serverless staging

This implements Phase 7's API-key contract separately from the VM's
`account_service.py`. It is not a production cutover. Existing VM OAuth/CLI runtime,
Hanmadi deployment, app URLs and existing keys are unchanged.

## Supported contract

- `GET /connections`: only records belonging to the platform key + HMAC subject.
- `POST /connections`: `provider: openai|claude`, `apiKey`, optional `authMethod: api-key`
  and `ttlSeconds` (60..2592000). A single model-list request (5-second deadline,
  no inference) intersects the operator allowlist with visible model IDs. Exact
  IDs are required; a model alias missing from the catalogue is not guessed.
  Returns 202 with connected or error. Errors never persist the provider key.
- Duplicate non-disconnected provider records, including error/expired, return 409.
- `POST /v1/chat/completions`: `<connection-id>:<model>`, text messages, up to 2000
  output tokens, optional json_schema. No streaming for this account endpoint
  (the existing shared LiteLLM streaming endpoint remains separate).
- DELETE clears the encrypted secret and retains a disconnected record. This does
  not revoke the underlying provider API key. Expiration clears the secret too.
- v2 rejects `codex` or `claude-code` with 400 `unsupported_auth_method`, per the
  migration plan D4. **It does not replace VM subscription-login capabilities.**

One request has a total 9-second lifecycle / 28-second chat deadline. Provider calls
are cancelled on expiry, no automatic paid retries. An already-started provider
request may still incur cost after client disconnect; a revoked connection cannot
return its late reply. Interrupted verification leaves a key-free authorizing row;
a later request or daily maintenance turns it into error after 30 seconds.

## Storage and keys

Set `ACCOUNT_DATABASE_URL` to a **separate blank accounts staging database/owner**,
`ACCOUNT_PLATFORM_KEYS` to distinct synthetic platform tokens, `ACCOUNT_MODELS` to
explicit OpenAI/Claude lists, and `ACCOUNT_KEYRING` to a JSON object mapping small
positive key IDs to base64-encoded 32-byte keys. `ACCOUNT_ACTIVE_KEY_ID` selects the
write version. Secret Manager supplies these values; never put real keys in Git,
CLI arguments, test logs or iCloud. Connection secrets use AES-256-GCM with a random
nonce and AAD binding id, platform, subject and provider. No SQLite, CLI, local
credential directories or background worker is installed in the new image.

Run `python accounts_store.py migrate` as the migration Job before setting serve.
No schema mutation happens at service startup. `expire` clears expired secrets;
Terraform defines a daily UTC maintenance Job/Scheduler so idle instances need not
stay running. Reads/chat also expire records immediately. Idle ciphertext cleanup
can lag by up to a day, while expired credentials are denied at request time.

For rotation: add the new key alongside the old versions in Secret Manager, change
active key ID, deploy, run `rotate`, verify all live ciphertext has the new ID, then
retain old encryption keys through the provider's actual PITR retention window.
`export-metadata` emits an explicit allowlist excluding ciphertext and key IDs;
store exports only in restricted backup storage, not general task artifacts.
It is an audit export, **not credential-restoring backup**; reconnect after a
metadata-only recovery. Neon PITR may retain old ciphertext until its configured
retention expires. Check the actual plan/retention before consumer rollout; deletion
from the active table is not a claim of instantaneous physical deletion everywhere.

## Deployment boundary

- Images: `accounts-staging` + `edge-accounts`, manually built from reviewed main
  by shared-ai-images.yml. Current production and `edge-platforms` images remain.
- Terraform defaults are off. `prepare_accounts_staging=true` creates 3 empty
  staging secrets. After safe injection use `accounts_staging` with immutable image,
  explicit secret versions, model IDs, active key ID and `serve=false` for jobs.
- Run migration and inspect schema. Then `serve=true` exposes the internal service,
  injects ACCOUNTS_UPSTREAM into the IAM-private staging edge, and schedules expiry.
  Choose `edge-accounts` only after **both** discovery and accounts staging serve.
  Preserve all existing platform_staging and other Phase 2 variables when planning;
  review a full plan with no production resource changes/deletions before apply.
- accounts Cloud Run has internal ingress, app-level platform authentication and
  0..2 instances. The public-facing staging edge continues requiring operator IAM.
- Test with temporary provider API keys/permissions and revoke them afterward.
  Actual provider calls and browser E2E have not run for this new code.
- Consumer work remains: version/package the common client for Hanmadi, introduce
  the OpenAI key UI and disable subscription login only in an explicit v2 preview.
  Current production UI stays v1; consumer enablement/terms gate is separate.

## Validation and references

`python -m unittest discover -s services/ai-gateway/tests -p 'test_accounts_*py'`
locally runs cipher/API/provider tests, marking PostgreSQL-only tests skipped when
no test URL exists. CI `tests/run_accounts_v2_contract.py` **requires** a disposable
PostgreSQL 16 database and fails on any skip. It also runs the unmodified JS consumer
against a real HTTP API, PostgreSQL, and a synthetic provider, restarts the server
and verifies recovery, tenant isolation and revocation. Synthetic responses do not
prove provider compatibility/quality or an actual platform UI flow.

Provider shapes: local installed official openai Python SDK models/list and chat
completions (max_completion_tokens, response_format, store=false); official
[Claude models](https://platform.claude.com/docs/en/api/models/list) and
[Messages](https://platform.claude.com/docs/en/api/messages/create). Claude structured
responses use native [output_config.format](https://platform.claude.com/docs/en/build-with-claude/structured-outputs),
which avoids tool-forcing incompatibility with newer models. Configure models supporting
structured output; unsupported schemas/models fail instead of falling back. The server
and client validate JSON-object output; consumers still validate domain constraints. No provider key is ever sent to arbitrary model-supplied
hosts and redirects are refused.

Verification on 2026-10-11, code 39da7de (PR #183):
- [Accounts CI](https://github.com/hhj4861/commerce-automation-kit/actions/runs/38139636462): 31 tests, zero skips, PostgreSQL 16 + actual HTTP/client restart roundtrip; 33 JS tests; built non-root image imports passed.
- [Host CI](https://github.com/hhj4861/commerce-automation-kit/actions/runs/38139636338): 87 tests, Terraform validation, real Caddy accounts routes and denied subscription/unknown paths passed.
- These results are for the synthetic-provider CI environment. New accounts Cloud Run deployment, actual provider credentials, consumer UI rollout and cold latency are still outstanding.
