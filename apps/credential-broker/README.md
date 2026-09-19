# Cloudflare credential management

The account Secrets Store `cak-secrets` owns static keys (`CAK_*`). The
`cak-credential-broker` Worker resolves bindings; Pages uses its private RPC service
binding. No browser route exposes the Pages bundle. The public `/github/secrets`
route accepts GitHub OIDC only, bound to this repository's immutable IDs, approved
refs, workflow path, subject, event and GitHub-hosted runner. Each workflow receives
only its own keys. Forks, pull requests, tags and reusable-workflow substitution are
rejected. GitHub stores only the non-secret `CAK_SECRETS_URL` repository variable.

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
7. Set GitHub variable `CAK_SECRETS_URL`; arm the broker with `MIGRATION_SHA` equal
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
