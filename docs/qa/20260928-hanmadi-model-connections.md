# Hanmadi personal model connection QA — 2026-09-28

## Change and deployment boundary

Default conversation preserves Dify → LiteLLM → Gemini. Logged-in tutors may connect Codex through device login or Claude through an API key, then select an operator-listed model. Student share links cannot access personal credentials. This revision includes the private account service and its shared-host route, but **does not deploy production, create real provider grants or change Vercel secrets**. PR-specific merge/deployment approval is still required.

## Verified locally

- 10 Python tests passed: authenticated HTTP service, user/platform isolation, encrypted persistence and record binding, model allowlist, disconnect and late credential rejection, cancellation of pending login, duplicate/body limits, account locking, pinned real SDK device-flow interface with upstream I/O mocked.
- 3 TypeScript connection tests passed: safe projection, exact official challenge URL, expiry, selected-model validation, server configuration constraints.
- Existing Hanmadi 28 tests passed. Next production build, generated-route typecheck and targeted ESLint passed.
- New browser E2E passed: PIN login → Japanese first-speaking assessment → default Gemini-labelled conversation → Codex challenge → second-model selection → Claude API connection → disconnect → guided request → quota failure with no fallback → other-user/CSRF rejection. Real Next, FastAPI and encrypted SQLite; only OAuth/inference upstream mocked. No production credentials used.
- Existing browser regression passed: Japanese/Thai listen → repeat → situation → feedback → plan without typing, default Dify continuity/consent, three-language assessment, actor isolation, stale revision rejection, draft recovery, fake microphone and audio playback, 320/390/768/1280 widths, light/dark and contrast.
- Build and test processes were awaited to terminal exit. Test servers were terminated and awaited by the fixtures.

The assessment E2E initially clicked during navigation/hydration. Waiting for the assessment URL and network idle fixed the test synchronization; no assessment behavior was weakened or bypassed. A theme contrast assertion measured during a media-query transition; two animation frames now precede measurement, retaining the 4.5 threshold. A collapsed connection settings alert conflicted with the existing conversation alert selector; the connection alert now renders only when settings are open.

## Not claimed

- Real Codex or Claude inference is not proven by mock-provider tests. Requires an intended user's explicit login/key after deployment, and a real response per offered model.
- The model allowlist is operator configured. Only its first model is probed during account connection; each account's other model entitlement remains subject to provider response.
- No Claude.ai subscription token relay. See the official policy link in `services/ai-gateway/ACCOUNTS.md`.
- Caddy routing uses the pinned-container CI test; no local Docker runtime is installed. CI result is checked on the PR.
- Persistent account storage is single-host SQLite. Multi-host replication and encryption-key rotation migration are not implemented; documented backup/reconnect procedures apply.

Setup and recovery: `services/ai-gateway/ACCOUNTS.md`. Regression commands: the new workflow `.github/workflows/hanmadi-model-connections.yml` and existing `.github/workflows/hanmadi-dify.yml`.

CI discovery initially imported the new account tests into existing standard-library-only gateway jobs. The dependency-bearing suite now lives under `services/ai-gateway/tests/test_accounts.py` and its dedicated pinned-LiteLLM CI runs it explicitly. Existing gateway/subscription suites remain discovered and executed unchanged.

A real SQLite/threaded regression pauses credential encryption while disconnect starts. The transaction locks before checking account state, so disconnect executes after refresh and leaves the record disconnected with no secret.
