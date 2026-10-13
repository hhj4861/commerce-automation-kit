# Personal model connections (accounts v1) — retired

Retired on 2026-10-13. The v1 service (`account_service.py`: Codex device login, native Claude Code login and Claude API keys; SQLite + Fernet on port 4190) was not moved to the rebuilt shared-ai VM, and the edge returns 404 for `/accounts/*`. Its code, image definition, tests and workflow were removed from this repository in #222.

- Why: provider terms do not allow a third-party service to collect, store or relay subscription credentials, and v1 had no real users. See master plan D4 in `docs/20261009-shared-ai-serverless-migration-plan.md` and the [Claude legal and compliance page](https://code.claude.com/docs/en/legal-and-compliance).
- Copies of the test-era credentials remain only on the old VM disk and its snapshots, which are deleted at D+7 (`docs/plans/20261012-shared-ai-vm-maintenance.md` §8, `docs/qa/20261013-shared-ai-vm-maintenance-result.md`).
- API-key-only personal connections: accounts v2, see [`ACCOUNTS-V2.md`](ACCOUNTS-V2.md) (code only; its serverless staging was torn down on 2026-10-12).
- The previous v1 runbook: [ACCOUNTS.md at 33fac8c](https://github.com/hhj4861/commerce-automation-kit/blob/33fac8c8fac6ac3a633ef1f1eff6d9724f15caa7/services/ai-gateway/ACCOUNTS.md).
