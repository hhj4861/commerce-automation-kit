#!/usr/bin/env python3
"""Recognize a bound three-step dispatch failure; never edit completion state."""
import argparse
from datetime import datetime, timezone
import hashlib
from pathlib import Path
import shutil

MARKER = '# task-finish: three-step invalid patch prefix v1'
HELPER = r'''# task-finish: three-step invalid patch prefix v1
def completed_three_step_patch_prefix(records, link, steps, output, known, call_id, started, prepared, ended):
    """Prove two native command completions preceding a rejected duplicate patch.

    The first command yielded; it may finish within 30 seconds AFTER failure.
    Only native events for the exact command/process/turn count. The final patch
    remains failed, never successful. No state, ownership or Git checks change.
    """
    try:
        if (not known or known.get('step_index') != 2 or len(steps) != 3
                or [s[0] for s in steps] != ['Bash', 'Bash', 'apply_patch']
                or len(output) != 4):
            return None
        patch = steps[2][1]
        if not isinstance(patch, str) or len(patch.encode()) > 16384:
            return None
        lines = patch.splitlines()
        if (len(lines) < 5 or lines[0] != '*** Begin Patch' or lines[-1] != '*** End Patch'
                or not lines[1].startswith('*** Delete File: ')
                or not lines[2].startswith('*** Add File: ')
                or any(not line.startswith('+') for line in lines[3:-1])):
            return None
        path = lines[1][len('*** Delete File: '):]
        if not Path(path).is_absolute() or lines[2] != '*** Add File: ' + path:
            return None
        failure = 'Script error:\napply_patch verification failed: invalid patch: multiple operations target ' + path
        if output[-1].get('text') != failure:
            return None
        first = json.loads(output[1]['text']); second = json.loads(output[2]['text'])
        process = first.get('session_id'); second_code = second.get('exit_code')
        if (type(process) is not int or process <= 0 or 'exit_code' in first
                or type(second_code) is not int or second.get('session_id') is not None):
            return None
        native = []
        for row in records:
            event = row.get('payload', {}); item = event.get('item', {})
            if row.get('type') != 'event_msg' or event.get('type') != 'item_completed':
                continue
            if item.get('id') == call_id:
                return None  # The rejected patch cannot also have executed.
            if (event.get('thread_id') == link['thread_id'] and event.get('turn_id') == link['turn_id']
                    and item.get('type') in ('CommandExecution', 'FileChange')):
                begin = event.get('started_at_ms')
                if (type(begin) in (int, float) and started <= begin / 1000 < ended
                        or item.get('type') == 'FileChange' and started <= host_time(row) < ended):
                    native.append(row)
        if len(native) != 2:
            return None  # Missing, duplicate or unaccounted prefix execution.
        used = set(); evidence = []
        for pos, command_text in enumerate([steps[0][1], steps[1][1]]):
            matches = [r for r in native if r['payload'].get('item', {}).get('command', [None])[-1] == command_text]
            if len(matches) != 1:
                return None
            row = matches[0]; event = row['payload']; item = event['item']
            command = item.get('command'); code = item.get('exit_code')
            begin = event.get('started_at_ms'); end = event.get('completed_at_ms')
            if (item.get('type') != 'CommandExecution' or not isinstance(item.get('id'), str) or not item['id']
                    or item['id'] in used or type(code) is not int
                    or item.get('status') != ('completed' if code == 0 else 'failed')
                    or not canonical_cwd(item.get('cwd'))
                    or not isinstance(command, list) or len(command) != 3
                    or command[1] not in ('-c', '-lc', '-ic', '-ilc') or command[2] != command_text
                    or type(begin) not in (int, float) or type(end) not in (int, float)
                    or not started <= begin / 1000 <= prepared
                    or not begin <= end or not end / 1000 <= host_time(row) <= ended + 30):
                return None
            if pos == 0:
                if item.get('process_id') != str(process):
                    return None
            elif code != second_code or host_time(row) > prepared:
                return None
            used.add(item['id']); evidence.append(row)
        # Item IDs cannot be reused even outside the dispatch interval.
        for identity in used:
            if sum(1 for row in records if row.get('type') == 'event_msg'
                   and row.get('payload', {}).get('type') == 'item_completed'
                   and row['payload'].get('item', {}).get('id') == identity) != 1:
                return None
        return hashlib.sha256(json.dumps(evidence, sort_keys=True).encode()).hexdigest()
    except (ValueError, TypeError, AttributeError, IndexError, KeyError, OverflowError, RecursionError):
        return None


'''
ANCHOR = 'def completed_yielded_prefix(records, link, steps, output, known, call_id, started, prepared, ended):\n'
OLD = '''    patch_proof = completed_yielded_patch_prefix(
        records, link, steps, output, known, call_id, started, prepared, ended)'''
NEW = '''    three_step_proof = completed_three_step_patch_prefix(
        records, link, steps, output, known, call_id, started, prepared, ended)
    if three_step_proof:
        return three_step_proof
''' + OLD


def patch(source):
    if MARKER in source:
        if source.count(HELPER) != 1 or source.count(NEW) != 1:
            raise ValueError('Partial or modified repair; refusing to overwrite')
        return source
    if source.count(ANCHOR) != 1 or source.count(OLD) != 1:
        raise ValueError('Unsupported hook version; no changes applied')
    source = source.replace(ANCHOR, HELPER + ANCHOR).replace(OLD, NEW)
    compile(source, '<task-finish-three-step>', 'exec')
    return source


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--gate', type=Path, default=Path.home()/'.codex/hooks/task-finish/gate.py')
    parser.add_argument('--apply', action='store_true')
    parser.add_argument('--expect-sha256')
    args = parser.parse_args()
    original = args.gate.read_text(); digest = hashlib.sha256(original.encode()).hexdigest()
    updated = patch(original)
    if args.apply and original != updated:
        if args.expect_sha256 != digest:
            raise SystemExit('Source changed or expected digest missing; not applied')
        if args.gate.read_text() != original:
            raise SystemExit('Concurrent hook edit; not applied')
        backup = args.gate.parent/'backups'/('three-step-failure-'+datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%S%fZ')+'.py')
        shutil.copy2(args.gate, backup)
        temporary = args.gate.with_suffix('.three-step.tmp')
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
