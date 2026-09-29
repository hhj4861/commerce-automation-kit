# Aborted Hanmadi source-query recovery

## Cause and scope

A 2026-09-28 host interruption left a prepared command without a native start,
terminal event or outer tool reply. Its batch used a shell-quoting helper to
read a fixed Dify workflow source file over SSH, then read local Git status and
the session guide. The existing recovery accepts a different, single GitHub
observer shape, so it correctly refused this batch.

The new installer adds `aborted-source-query-plan` and
`approve-aborted-source-query`. It accepts only the exact reviewed read-only
batch embedded in `aq_source`; it does not classify arbitrary shell commands
or evaluate historical JavaScript. Altered sources, multiple preparations,
conflicting native execution, responses, overlapping calls, stale plans and
incomplete ownership observations are rejected.

The original authenticated transcript must show a unique matching request and
actual interrupted turn. The host SQLite history must independently say
`interrupted`. A fresh, independently constructed read-only SSH query verifies
that the source file is reachable and records its SHA-256; the query cannot
modify the server. The local source guide and original Git ancestry are also
checked. The original command is never reported successful or not-started:
its receipt is **interrupted, exit code unknown**.

Approval retains the original evidence and only adds that interruption receipt.
Normal reconciliation still observes all files and owns removal of the pending
call. File ownership, unknown files, holds, Git checks, Stop, prior recovery
functions and hook trust/configuration remain unchanged. This recovery does
not merge or deploy Hanmadi PR #61.

## Validation before application

- `python3 -B tools/test-task-finish-aborted-source-query.py`: 13 tests passed.
- Every existing function other than additive CLI dispatch is byte-for-byte
  unchanged by installation; this is asserted by the tests.
- An in-memory candidate evaluated the real host record and completed fresh
  read-only remote/local verification with exit 0, without writing any receipt.
- Original request `call_z9ZPgbkUsdGtR9TPCcfZNV1R`; prepared call
  `exec-7c2d308f-afb2-48a3-8f69-050f6f891e47`; original turn
  `01a0e694-4f02-7120-96bf-e71ad70e358e`.
- Transcript interruption: 2026-09-28 05:57:49.390 UTC. The current host database
  also reports that turn interrupted. No original process exit is claimed.
- Fresh Dify source SHA-256:
  `89e82eb4d8605bdc10ab92e7152d9fef6d85ccc3bd0a81f3a26cf368280230f3`.

## Installation and recovery

The installer requires its own source to match HEAD, an exact current hook
SHA-256, a backup and a final concurrency check before atomic replacement.
It reuses the established guarded installer from PR #58. Installation and
recovery are separate operations:

```sh
python3 -B tools/task-finish-aborted-source-query.py
python3 -B tools/task-finish-aborted-source-query.py --apply --expect-sha256 <printed-hash>
python3 ~/.codex/hooks/task-finish/gate.py aborted-source-query-plan --call-id <id>
python3 ~/.codex/hooks/task-finish/gate.py approve-aborted-source-query --call-id <id> --expect-source-digest <plan-digest> --reason <authorized-recovery-reason>
python3 ~/.codex/hooks/task-finish/gate.py reconcile
```

Use the printed backup as `TASK_FINISH_GATE` when rerunning installer regression
tests after installation. Never delete pending call/state entries or synthesize
native execution/transcript evidence to make the completion hook pass.
