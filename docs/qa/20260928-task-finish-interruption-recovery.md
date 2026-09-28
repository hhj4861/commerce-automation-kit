# Completion-hook interruption recovery

## Scope

Source and tests belong to `hhj4861/commerce-automation-kit`, in the isolated
`fix/task-finish-recovery` worktree. This is a local completion-hook repair,
not a Shopshorts production deployment or a change to another repository.

## Cause and behavior

A host restart interrupted the preparation of a Git fetch, leaving no native
command completion. Its unanswered outer call then prevented the v19 dispatcher
from binding a later, genuinely rejected command. Ordinary reconciliation kept
both calls pending.

`tools/task-finish-interruption-recovery.py` adds explicit plan/approve commands:

- `restart-fetch-plan` / `approve-restart-fetch`: authenticate the literal
  poll → fetch/status/diff → version sequence, unique prepared call, actual turn
  interruption, original host replacement, and completed prefix. Recheck the
  original clean worktree and GitHub remote ancestry without replaying the shell.
  Preserve `interrupted` with unknown original exit code.
- `restart-decline-plan` / `approve-restart-decline`: require the first recovery's
  reconciled evidence, reproduce the two-pending-envelope cause, authenticate the
  unique host refusal before any command execution, and preserve `declined` with
  unknown exit code. Never retry the rejected action.

Each approval requires the current plan digest. Existing file observation,
ownership, unknown-file, hold, commit/push, Stop, and reconciliation functions
remain byte-for-byte unchanged. An approved receipt is not task completion.
No transcript, hook configuration, or trust changes are made.

## Verification

- Unit tests cover missing/ambiguous evidence, source injection, wrong scope,
  native execution conflicting with refusal, tampering, stale digests, active
  processes, dirty worktrees, and preservation of unrelated changes/holds.
- Read-only evaluation against the actual session authenticated both records.
  It did not write a completion receipt or execute either original command.
- Original production checkout was clean at
  `1b8da461c7f8efa73a70d57e0458b458c842abe3`; checked target paths had no diff;
  remote `main` was reachable and contained that commit.
- Restart logs had rotated. Recovery requires the preserved native exit-0
  output of the exact earlier SELECT-only SQLite diagnostic. Its log body is
  truncated, so the proof combines the session-specific daemon recovery, actual
  turn abort, differing host identities, and current interrupted-turn record;
  it does not assert an unseen previous-turn field in the truncated log.

Run before installation:

```sh
python3 -B tools/test-task-finish-interruption-recovery.py
python3 -B tools/task-finish-interruption-recovery.py
```

Apply only committed source, with the exact installed SHA printed by the preview:

```sh
python3 -B tools/task-finish-interruption-recovery.py --apply --expect-sha256 <sha>
```

The installer preserves a timestamped backup, checks for concurrent edits, and
atomically replaces only the hook implementation. For post-install regression
tests, set `TASK_FINISH_GATE` to the printed backup path. Then use the installed
hook's plan/approve commands with `--call-id`, `--expect-source-digest`, and a
specific `--reason`; run ordinary `reconcile` and completion checks afterwards.
Installation and actual reconciliation must be reported separately from this
committed verification record.
