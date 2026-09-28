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

This document initially records a tested candidate, not installation or successful
Stop execution. Installation and observed reconciliation are recorded separately
after they actually occur. PR #50 (Hanmadi adaptive learning) was explicitly
approved and merged at `b108081a62421724e034c9aa05def6a3d1e499a6`.
