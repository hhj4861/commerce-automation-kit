#!/usr/bin/env python3
"""Bind hook dispatches to their own turn; preserve missing terminal evidence."""
import argparse
from datetime import datetime, timezone
import hashlib
import json
import os
from pathlib import Path
import subprocess
import tempfile

REVIEWED_GATE = "6d60104f828543b7e6f1f4d0fbdbc98c6a5c524555b867d0b116ec46730ff51f"

FILTER = '''        # An interrupted older turn can have no outer response. It must not
        # prevent binding this turn. Unknown turn metadata remains ambiguous.
        pending = {key: value for key, value in pending.items()
                   if value.get('internal_chat_message_metadata_passthrough', {}).get('turn_id')
                   in (None, event['turn_id'])}
'''

HELPER = '''def stale_turn_decline_receipt(sid, root, call_id, call, calls):
    """Recover only a proven prelaunch refusal hidden by older open envelopes.

    No cancellation, missing output, successful exit, or same-turn ambiguity
    qualifies. This returns a refusal with exit_code=None, never success.
    """
    try:
        if (calls.get(call_id) != call or call.get('tool_name') != 'Bash'
                or call.get('dispatch_checked') is not True or call.get('dispatch_version') != 19
                or call.get('actor_thread_id') not in (None, sid)
                or call.get('terminal') or call.get('paths') or call.get('new_paths')
                or any(v for k, v in call.items() if k == 'dispatch' or k.endswith('_dispatch'))):
            return None
        prepared, turn = call['prepared_at'], call['turn_id']
        if type(prepared) not in (int, float) or not float('-inf') < prepared < float('inf') or not turn:
            return None
        doc = host_records(call['transcript_path'], sid, root)
        if not doc or doc[0] != sid:
            return None
        thread, path, stream = doc
        # One immutable read, including the host reader's fingerprint check.
        records = list(stream)
        pending = {}
        def row_turn(row):
            return row.get('payload', {}).get('internal_chat_message_metadata_passthrough', {}).get('turn_id')
        for row in records:
            if row.get('type') != 'response_item' or host_time(row) > prepared:
                continue
            p = row.get('payload', {})
            if p.get('type') == 'custom_tool_call' and p.get('name') == 'exec':
                pending[p.get('call_id')] = row
            elif p.get('type') == 'custom_tool_call_output':
                pending.pop(p.get('call_id'), None)
        current = [r for r in pending.values() if row_turn(r) in (None, turn)]
        stale = [r for r in pending.values() if row_turn(r) not in (None, turn)]
        if len(current) != 1 or not stale or row_turn(current[0]) != turn:
            return None
        request = current[0]; outer = request['payload'].get('call_id')
        source = request['payload'].get('input', '')
        single = dispatch_input(source, 'Bash') is not None
        trailing = trailing_poll_batch(source)
        if (not outer or any(not r['payload'].get('call_id') or host_time(r) >= host_time(request) for r in stale)
                or not single and not (trailing and len(trailing) == 2 and trailing[0][0] == 'Bash')):
            return None
        replies = [r for r in records if r.get('type') == 'response_item'
                   and r.get('payload', {}).get('call_id') == outer]
        if (len(replies) != 2 or replies[0] != request
                or replies[1]['payload'].get('type') != 'custom_tool_call_output'
                or row_turn(replies[1]) != turn):
            return None
        started, ended = host_time(request), host_time(replies[1])
        if not started <= prepared < ended:
            return None
        peers = [k for k, v in calls.items() if v.get('transcript_path') == call['transcript_path']
                 and v.get('turn_id') == turn and started <= v.get('prepared_at', -1) < ended]
        if peers != [call_id]:
            return None
        for row in records:
            p = row.get('payload', {})
            if (row.get('type') == 'response_item' and row != request
                    and p.get('type') in ('custom_tool_call', 'function_call')
                    and started <= host_time(row) <= ended):
                return None
            if row.get('type') == 'event_msg' and p.get('type') == 'item_completed':
                item = p.get('item', {})
                if item.get('id') == call_id:
                    return None
                if (item.get('type') in ('CommandExecution', 'FileChange')
                        and p.get('thread_id') == thread and p.get('turn_id') == turn):
                    begin = p.get('started_at_ms')
                    if type(begin) not in (int, float) or not float('-inf') < begin < float('inf'):
                        return None
                    if started <= begin / 1000 <= ended:
                        return None
        link = {'outer_call_id': outer, 'source_sha256': hashlib.sha256(request['payload']['input'].encode()).hexdigest(),
                'thread_id': thread, 'transcript_path': str(path), 'turn_id': turn}
        # Reuse the original strict host refusal parser. The recovered binding
        # is local only; do not rewrite any Pre record or claim the command ran.
        if single:
            receipt = dispatch_receipt(sid, root, dict(call, dispatch=link))
        else:
            receipt = batch_failure_receipt(sid, root, call_id,
                dict(call, trailing_poll_dispatch=dict(link, step_index=0)), calls,
                parser=trailing_poll_batch, binding='trailing_poll_dispatch', introduced=8)
        if not receipt or receipt.get('status') != 'declined' or receipt.get('exit_code') is not None:
            return None
        return dict(receipt, source='stale-turn-host-refusal',
                    evidence_sha256=hashlib.sha256(json.dumps(stale + replies, sort_keys=True).encode()).hexdigest())
    except (OSError, ValueError, TypeError, AttributeError, IndexError, KeyError, OverflowError):
        return None
'''


def patch(source):
    if hashlib.sha256(source.encode()).hexdigest() != REVIEWED_GATE:
        raise ValueError("Installed gate changed; review required, no changes applied")
    start = source.index('def dispatch_context(')
    end = source.index('\ndef legacy_subdirectory_patch_receipt(', start)
    part = source[start:end]
    anchor = '        if len(pending) != 1:\n'
    if part.count(anchor) != 1:
        raise ValueError('Unexpected dispatch contract')
    updated = source[:start] + part.replace(anchor, FILTER + anchor) + source[end:]
    start = updated.index('def same_turn_batch_envelope(')
    end = updated.index('\ndef continued_envelope(', start)
    part = updated[start:end]
    anchor = '    if len(pending) != 1:\n'
    scoped = '''    # Preserve unknown metadata as ambiguity, but scope identified envelopes
    # to this turn; the separate continued_envelope handles cross-turn waits.
    pending = {key: row for key, row in pending.items()
               if row.get('payload', {}).get('internal_chat_message_metadata_passthrough', {}).get('turn_id')
               in (None, call.get('turn_id'))}
'''
    if part.count(anchor) != 1:
        raise ValueError('Unexpected batch contract')
    updated = updated[:start] + part.replace(anchor, scoped + anchor) + updated[end:]
    anchor = 'def reconcile_calls(store, sid, root, recover=True, only=None):'
    receipt = 'receipt = (evidence.get(call_id) or dispatch_receipt(sid, root, call)'
    if updated.count(anchor) != 1 or updated.count(receipt) != 1:
        raise ValueError('Unexpected reconciliation contract')
    updated = updated.replace(anchor, HELPER + '\n\n' + anchor).replace(
        receipt, receipt + '\n                       or stale_turn_decline_receipt(sid, root, call_id, call, current[\'calls\'])')
    compile(updated, '<hook-dispatch-turn-candidate>', 'exec')
    return updated


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--gate', type=Path, default=Path.home() / '.codex/hooks/task-finish/gate.py')
    parser.add_argument('--apply', action='store_true')
    args = parser.parse_args()
    original = args.gate.read_text(); updated = patch(original)
    if not args.apply:
        print(json.dumps({'validated': True, 'applied': False, 'sha256': hashlib.sha256(updated.encode()).hexdigest()}))
        return
    repo = Path(__file__).resolve().parent.parent
    relative = str(Path(__file__).resolve().relative_to(repo))
    committed = subprocess.check_output(['git', '-C', str(repo), 'show', 'HEAD:' + relative])
    if committed != Path(__file__).read_bytes():
        raise ValueError('Installer must match committed source')
    backup = args.gate.parent / 'backups' / ('hook-dispatch-turn-' + datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%S%fZ') + '.py')
    backup.parent.mkdir(parents=True, exist_ok=True)
    with backup.open('xb') as f:
        f.write(original.encode()); f.flush(); os.fsync(f.fileno())
    backup.chmod(0o600)
    temporary = None
    try:
        with tempfile.NamedTemporaryFile(dir=args.gate.parent, prefix='.hook-dispatch-turn-', delete=False) as f:
            temporary = Path(f.name); f.write(updated.encode()); f.flush(); os.fsync(f.fileno())
        temporary.chmod(args.gate.stat().st_mode & 0o777)
        if args.gate.read_text() != original:
            raise ValueError('Gate changed during install')
        os.replace(temporary, args.gate)
    finally:
        if temporary and temporary.exists():
            temporary.unlink()
    print(json.dumps({'applied': True, 'backup': str(backup), 'sha256': hashlib.sha256(updated.encode()).hexdigest()}))


if __name__ == '__main__':
    main()
