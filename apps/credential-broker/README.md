# Cloudflare credential management

## Applied state — 2026-09-19

- Cloudflare account `8707f7095965c1c134cd93e0b68248ca`, store `cak-secrets`
  (`de2c8d7c3e9c4067acc22212522c0fc4`): 19 application values plus the vault key.
- Worker: `https://cak-credential-broker.guswhd1085.workers.dev` deployed; API-key
  reads, anonymous denial and concurrent OAuth-runtime rejection verified remotely.
- D1: Codex auth, YouTube tokens and YouTube client JSON encrypted and read-back verified.
- GitHub import: [successful run](https://github.com/hhj4861/commerce-automation-kit/actions/runs/35429028671).
  Actual OIDC reads passed for [keywords](https://github.com/hhj4861/commerce-automation-kit/actions/runs/35429162127),
  [TTS](https://github.com/hhj4861/commerce-automation-kit/actions/runs/35429163973) and
  [music](https://github.com/hhj4861/commerce-automation-kit/actions/runs/35429165212).
  No media generation or Telegram delivery was requested by these verification jobs.
- Production Pages switched after explicit user approval. Its private service
  binding resolves central credentials. The blog token was migrated, compared
  with the source, and verified with a read-only GitHub request. Both duplicate
  Pages secrets and the sealed migration copy were removed; import mode is closed.
- Google GIS mode and the production origin are configured. Google admission
  remains closed until the operator supplies allowed account emails. Existing
  administrator-token access remains available.
- Existing GitHub secrets remain for default-branch scheduled jobs. Removing them
  requires the workflow changes to reach `main`; PR merge needs explicit approval.
- Local port 5198 and the production queue worker now run together under one
  central-credential wrapper/lease. Existing local projects and notification data
  remain in `/private/tmp/shopshorts-studio-ui`. Cloud worker heartbeat was verified.
- The notification queue token is also central (`SHOPSHORTS_CF_QUEUE_TOKEN`).
  Central mode rejects missing credentials instead of using an old local token file.
- Production Pages does not yet have a Codex recommendation bridge; recommendations
  work only on the local server. Presence-based generation capabilities do not
  prove that the previously invalid Gemini credential is accepted by the provider.

Deployment evidence, remaining gates and restart command:
[`docs/CLOUDFLARE-SECRETS-CUTOVER.md`](../../docs/CLOUDFLARE-SECRETS-CUTOVER.md).

The account Secrets Store `cak-secrets` owns static keys (`CAK_*`). The
`cak-credential-broker` Worker resolves bindings; Pages uses its private RPC service
binding. No browser route exposes the Pages bundle. The public `/github/secrets`
route accepts GitHub OIDC only, bound to this repository's immutable IDs, approved
refs, workflow path, subject, event and GitHub-hosted runner. Each workflow receives
only its own keys. Forks, pull requests, tags and reusable-workflow substitution are
rejected. After default-branch cutover, GitHub needs only the non-secret
`CAK_SECRETS_URL` repository variable. Existing GitHub secrets are retained until
that cutover is approved and verified.

Codex and YouTube auth records are AES-256-GCM encrypted in D1 `credential_vault`.
The separate `CAK_VAULT_KEY` Secrets Store key never enters GitHub or the runner.
Record names are authenticated data; updates require the expected revision.
Do not overwrite/rotate the vault encryption key without re-encrypting its records.

## Runtime

```sh
npm run start:cloud-secrets -w @cak/app-shopshorts
# OR (one OAuth runtime at a time)
npm run worker:cloud-secrets -w @cak/app-shopshorts
```

The runner's Ed25519 private key defaults to the gitignored, mode-0600
`apps/shopshorts/data/credential-runner.jwk`. On another server provision that key
through its secure bootstrap channel and set `CAK_RUNNER_KEY_FILE`; its matching
public JWK is in the Worker configuration. `CAK_SECRETS_URL` overrides the broker URL.
The bootstrap key is the unavoidable local trust credential, not an API-key cache.
Never place it in GitHub Actions secrets. Rotate/revoke access by changing the
Worker's public JWK and replacing the authorized runner's private key.

The wrapper hydrates API keys in memory and OAuth files in an isolated mode-0700
temporary directory (files 0600). Official CLIs perform provider refresh; changed
auth files are written back to D1 every 15 seconds and on normal exit. A D1 lease
allows one OAuth runtime, renewed on every flush. Persistence/lease failure stops
the child and retains the restricted cache for operator recovery; it does not
report success. Abrupt host loss can still lose a just-refreshed token before the
next flush: reconnect if the provider invalidated its previous refresh token.
Do not run another CLI against copies of these same provider tokens concurrently.

Existing `npm start`/`npm run worker` remain explicit local `.env` modes. Launching
the Cloudflare wrapper is required to switch the actual running process. Never
restart a process owned by another session without coordinating the shared server.

## Migration

`admin.mjs` reads the official Wrangler login cache and an allowlist of project
`.env` names. It never logs values or raw API error bodies. Local-only paths are
not stored as cloud credentials. Auth JSON is stored in the encrypted vault, not
Secrets Store (which has a 1,024-byte value limit).

1. `wrangler login` with account/user read, Workers/Pages/D1/Secrets Store write.
2. `wrangler secrets-store store create cak-secrets --remote` (once).
3. `node apps/credential-broker/admin.mjs init` (once; creates a private runner key).
4. `node apps/credential-broker/admin.mjs register-local`.
5. Apply `schema.sql` to the bound D1 database and deploy `wrangler.json`.
6. `node apps/credential-broker/admin.mjs import-oauth` (existing cloud records preserved).
7. Initial GitHub migration was completed with commit `6adbf5b`. Its temporary
   `secrets_mode=import` workflow step has been removed. For an explicitly authorized
   future import, restore/review that step first. Set GitHub variable
   `CAK_SECRETS_URL`; arm the broker with `MIGRATION_SHA` equal
   to the exact reviewed migration commit and `MIGRATION_EXPIRES_AT` as epoch ms.
   Dispatch `keyword-intel-sync.yml` at that commit's branch with
   `secrets_mode=import, send_telegram=false`. Import is write-once, bounded and
   encrypted in D1. `admin.mjs promote-migration github` moves it into Secrets Store.
8. During Pages migration only, set `CAK_IMPORT_LEGACY_SECRETS=1` in Pages and an
   unexpired `MIGRATION_EXPIRES_AT` on the broker. Private RPC seals the legacy blog
   token into D1; `admin.mjs promote-migration pages` registers it centrally.
9. Redeploy bindings, verify real GitHub OIDC reads using `secrets_mode=verify`
   and each media workflow's `verify_secrets_only=true` (no generation or messages).
10. Remove import mode and temporary migration switches, delete sealed migration
    records after verification, and remove duplicate Pages secrets after the
    production service binding works. GitHub secrets must remain until the default
    branch switches: merge requires the user's explicit PR approval. Then verify
    default-branch workflows and delete only the migrated application secret names.

Absent credentials are not invented: Coupang keys require issuance; Google GIS
does not require a client secret. Existing Gemini key registration does not prove
that the provider accepts it. Claude subscription credentials are not imported:
third-party dashboard subscription login requires Anthropic approval; use a
supported API key integration for Claude instead.

## Verification

`node --test apps/credential-broker/test/*.test.mjs` covers identity restrictions,
real runner signatures, scoped responses, encryption/tamper/CAS handling, bounded
imports, cache cleanup, refresh writeback, and GitHub mask/export handling.
`wrangler deploy --dry-run --config apps/credential-broker/wrangler.json` checks
the Worker bundle. A successful secret read proves storage/access, not provider
key validity. Never include credential values in screenshots, logs or artifacts.

References: [Secrets Store](https://developers.cloudflare.com/secrets-store/integrations/workers/),
[GitHub OIDC](https://docs.github.com/en/actions/reference/security/oidc),
[Claude authentication restrictions](https://code.claude.com/docs/en/legal-and-compliance).
