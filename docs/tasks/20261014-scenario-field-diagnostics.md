# Scenario field diagnostics — 2026-10-14

- Goal: make format repair actionable and show draft review only when matching validated evidence exists.
- Owner: current Codex session, `fix/shopshorts-scenario-field-diagnostics`; shared broker untouched.
- Base: main `1d9c69ed8ba3f8e2400f06beb2778fa5fbbcc1a5`. Production observation: deploy `1cec2cef08ade129569af771ee7592eb928ce22c`.
- Evidence: one real scenario run after worker restart reached revision, then SCENARIO_FORMAT_INVALID without a field. Raw invalid output was not retained; exact invalid field and first failure type are unknown. The review button returned no review evidence.
- Scope: fixed field/rule diagnostics for basic scene and hybrid/architecture validators, safe public labels, validated review availability in project sync and UI. No retry, budget, generation model or acceptance changes.
- Done: repair tests, worker→broker→project tests, local browser evidence, own commit/push and PR. Production requires explicit approval of the new PR, then same-project real generation.
- Verification: final focused suite 97 passed, 2 opt-in Blender/full-hybrid E2E cases skipped. Includes the actual body render route with stubbed paid providers, worker→encrypted broker→project failure transport, one-repair boundaries, legacy failure migration and outage handling. Local Chrome confirmed no review button for a format-only failure and working draft/reason retrieval for validated review evidence. `git diff --check` clean.
- Test environment: a first body-render check failed on the long iCloud Unix socket path; a short symlink to the same physical iCloud directory resolved it. The next attempt could not register an external alias and did not render; final repo-scoped alias was removed after use. Logs: designated iCloud `commerce-automation-kit/scenario-field-diagnostics/final-tests.log`.
- Current: prepared for review, not deployed. Production still uses #224 and real full generation is incomplete. New PR approval is required; same QA/voice/style/budget remain unchanged.
