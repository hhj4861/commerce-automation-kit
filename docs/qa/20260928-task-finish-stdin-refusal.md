# Completion hook: stdin prefix followed by refused command

The Hanmadi session had one historical v19 PreToolUse record that normal
reconciliation could not match. Its literal outer call sent input to an existing
process and then requested a shell command. The host rejected the shell before
execution. The input process subsequently terminated with native exit code 1.
Existing empty-poll matchers intentionally do not accept this input-bearing form.

`tools/task-finish-stdin-refusal.py` adds a separate, bounded matcher. It requires
an authenticated host transcript, exactly two awaited literal calls, one pending
v19 record with no existing binding, matching session/turn/times, the host's exact
CreateProcess refusal envelope and a unique native completion of the input
process. Missing, running, duplicate, conflicting and ambiguous evidence fails
closed. No JavaScript is evaluated. Input strings and stdout are not copied into
the receipt. The command stays `declined`, with `exit_code: null`; the earlier
process's real exit code is separately preserved.

The updater pins the entire reviewed installed gate SHA-256, requires its own
source to match Git HEAD for installation, creates a backup and replaces the
script atomically. Hook trust, approval policy, transcripts and state DB are not
edited. Only the normal `gate.py reconcile` command writes recovered receipts,
then runs the existing file ownership, commit, push and hold checks. A preservation
test proves that removing the added matcher and its invocation restores every
byte of the original gate.

Validation before installation:

- 16 regression tests passed, including negative identity/time/output/native
  evidence/parser/installer-drift cases.
- Dry-run validated the installer against the reviewed gate.
- Read-only replay against the actual authenticated host transcript returned
  `declined`, null exit code, and prefix `failed` / exit 1. No host reader was mocked
  for this replay. An initial diagnostic used a Path object instead of the gate's
  string root contract and returned null; correcting only that diagnostic input
  produced the verified result.
- Host evidence digest:
  `409cc05e003ff0304e97c3e137f959b034799b5329755379648314ff76ad670f`.
- Reviewed original gate:
  `927fa7608db955d06c17bdbe2433ce970b61289c0e73b800b7b89f7cb49814a4`.

## Installed and observed

The user explicitly requested PR #50 merge and block repair. PR #50 was merged
at `b108081a62421724e034c9aa05def6a3d1e499a6`. The recovery installer was committed
and pushed as `930a353` on `fix/task-finish-stdin-refusal`, then applied after the
normal approval review. This recovery branch has not been merged into main.

- Installed gate SHA-256:
  `6fe893215a0704192ac7596f686e565c8310845ace3f3c86eb8f8350ee9bcdc5`.
- Backup: `~/.codex/hooks/task-finish/backups/stdin-refusal-20260928T030237657607Z.py`.
- Normal `gate.py reconcile` exited 0 and recorded the actual
  `stdin-prefix-host-refusal` receipt with the proof digest above. The historical
  call is no longer pending. Its command remains declined with no exit code.
- The only new ownership observation was the keyword-intel daily-status file.
  Its working diff/status was clean and its 2026-09-28 automation commit was
  `1acef2c`; it was excluded with that reason through the official CLI. No other
  session's files were edited, staged or committed.
- No coverage problem or hold remained in the observed root status. A status
  command can include its own current invocation; this is distinct from a stale
  historical call. Actual Stop execution is observed only when this turn ends.
- Registering the global gate path was attempted; `track` rejected the path
  because it is outside Git. The registered, committed updater is the source of
  the installed change. No state, transcript or trust setting was edited.

To rerun the updater tests after installation, point them at the preserved
reviewed original using `TASK_FINISH_TEST_GATE`:

```sh
TASK_FINISH_TEST_GATE="$HOME/.codex/hooks/task-finish/backups/stdin-refusal-20260928T030237657607Z.py" \
  python3 tools/test-task-finish-stdin-refusal.py -v
```

An attempted Hanmadi production deployment was rejected before execution by
automatic approval review because the latest request explicitly approved merge
and block repair, not production deployment. Separate production approval was
requested. The PR merge and hook repair are complete; this rejection is not a
production deployment result.
