#!/usr/bin/env python3
"""Recognize proven approval setup failures; never modify completion state."""
import argparse
from datetime import datetime, timezone
import hashlib
from pathlib import Path
import shutil

MARKER = '# task-finish: polled review setup failure v1'
ANCHOR = "        native = [r for r in records if r.get('type') == 'event_msg'\n"
HELPER = r'''        # task-finish: polled review setup failure v1
        # Only an exact host failure, in an already bound two-step dispatch.
        # A later native completion proves the preceding poll really terminated;
        # it does not turn the unstarted command into a successful execution.
        review_setup_failure = (
            parser is polled_batch and binding == 'polled_dispatch'
            and known is not None and len(steps) == 2
            and call.get('tool_name') == 'Bash'
            and output[2]['text'] == (
                'Script error:\nexec_command failed: CreateProcess { message: "Rejected(\\"'
                'Automatic approval review failed: failed to load workspace requirements\\\\n'
                'The action was not executed because automatic approval review could not be completed. '
                'This is a review failure, not a determination that the action is unsafe. '
                'Do not bypass the approval check; resolve the error or ask the user for guidance.'
                '\\")" }'))
        if review_setup_failure and any(
                r.get('type') == 'event_msg'
                and r.get('payload', {}).get('type') == 'item_started'
                and r['payload'].get('item', {}).get('id') == call_id for r in records):
            return None  # An execution start contradicts the host rejection.
'''
NATIVE = "        row = native[0]; payload = row['payload']; item = payload['item']\n"
LATE = '''        late_review_poll = (
            review_setup_failure and running_poll
            and type(payload.get('started_at_ms')) in (int, float)
            and type(payload.get('completed_at_ms')) in (int, float)
            and payload['started_at_ms'] / 1000 <= host_time(request)
            and ended <= host_time(row) <= ended + 120
            and prepared < payload['completed_at_ms'] / 1000 <= host_time(row))
'''
OLD_END = "                or host_time(row) >= ended or item.get('id') == call_id or type(item.get('exit_code')) is not int\n"
NEW_END = "                or (host_time(row) >= ended and not late_review_poll) or item.get('id') == call_id or type(item.get('exit_code')) is not int\n"
OLD_POLL = "                    and prepared < payload.get('completed_at_ms', float('inf')) / 1000 < ended)):\n"
NEW_POLL = "                    and prepared < payload.get('completed_at_ms', float('inf')) / 1000 < ended) and not late_review_poll):\n"
FAILURE = "            elif failure.startswith(prefix + 'Failed to create unified exec process: '):\n"
CLASSIFY = "            elif review_setup_failure:\n                status = 'not_started'\n"
RECEIPT = "                'legacy_size_recovery': oversized_legacy,\n"
PROOF = "                **({'review_setup_failure': True, 'poll_completed_after_failure': late_review_poll} if review_setup_failure else {}),\n"


def patch(source):
    start = source.index('def polled_failure_receipt(')
    end = source.index('\ndef yielded_batch_failure_receipt(', start)
    original = source[start:end]
    pairs = [(ANCHOR, HELPER + ANCHOR), (NATIVE, NATIVE + LATE),
             (OLD_END, NEW_END), (OLD_POLL, NEW_POLL),
             (FAILURE, CLASSIFY + FAILURE), (RECEIPT, RECEIPT + PROOF)]
    if MARKER in original:
        if any(original.count(new) != 1 for _, new in pairs):
            raise ValueError('Partial or modified repair; refusing to overwrite')
        return source
    updated = original
    for old, new in pairs:
        if updated.count(old) != 1:
            raise ValueError('Unsupported hook version; no changes applied')
        updated = updated.replace(old, new)
    result = source[:start] + updated + source[end:]
    compile(result, '<task-finish-review-setup>', 'exec')
    return result


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--gate', type=Path, default=Path.home()/'.codex/hooks/task-finish/gate.py')
    parser.add_argument('--apply', action='store_true')
    parser.add_argument('--expect-sha256')
    args = parser.parse_args()
    original = args.gate.read_text()
    digest = hashlib.sha256(original.encode()).hexdigest()
    updated = patch(original)
    if args.apply and updated != original:
        if args.expect_sha256 != digest or args.gate.read_text() != original:
            raise SystemExit('Source changed or expected digest missing; not applied')
        backup = args.gate.parent/'backups'/('review-setup-failure-'+datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%S%fZ')+'.py')
        shutil.copy2(args.gate, backup)
        temporary = args.gate.with_suffix('.review-setup.tmp')
        temporary.write_text(updated)
        temporary.chmod(args.gate.stat().st_mode & 0o777)
        if args.gate.read_text() != original:
            temporary.unlink()
            raise SystemExit('Concurrent hook edit; not applied; backup retained')
        temporary.replace(args.gate)
        print('Applied; original preserved:', backup)
    else:
        print('Already repaired' if updated == original else 'Patch validates; not applied')
    print('Source SHA-256:', digest)


if __name__ == '__main__':
    main()
