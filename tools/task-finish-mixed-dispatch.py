#!/usr/bin/env python3
"""Install host-evidence recovery for literal batches mixing calls and empty polls."""
import argparse
from datetime import datetime, timezone
import hashlib
from pathlib import Path
import shutil

MARKER = '# task-finish: mixed literal dispatch recovery v12'
FUNCTIONS = r'''# task-finish: mixed literal dispatch recovery v12
def mixed_literal_batch(source):
    """Only previously unsupported interleavings; never reinterpret older bindings."""
    try:
        steps = LiteralBatch(source, allow_poll=True).read()
        if (len(steps) < 2 or not any(kind == 'poll' for kind, _ in steps)
                or not any(kind != 'poll' for kind, _ in steps)
                or any(parser(source) is not None for parser in
                       (literal_batch, polled_batch, trailing_poll_batch, leading_poll_batch))):
            return None
        return steps
    except (ValueError, TypeError, IndexError, SyntaxError, RecursionError):
        return None


def mixed_literal_failure_receipt(sid, root, call_id, call, calls):
    """A host failure plus native termination of every executed prefix step.

    No code is executed to parse the envelope. A yielded prefix command must
    have actually finished before the failed step was prepared. Later source
    steps are unexecuted, not successful. Unsupported evidence stays pending.
    """
    try:
        prepared = call['prepared_at']
        found = batch_envelope(call, sid, root, prepared, mixed_literal_batch)
        if not found:
            return None
        link, steps, request, records = found
        known = call.get('mixed_literal_dispatch')
        if not known and call.get('dispatch_version') != 11:
            return None  # Only v11 lacked this grammar. New mismatches stay pending.
        if known and any(known.get(k) != v for k, v in link.items()):
            return None
        replies = [r for r in records if r.get('type') == 'response_item'
                   and r.get('payload', {}).get('type') == 'custom_tool_call_output'
                   and r['payload'].get('call_id') == link['outer_call_id']]
        if len(replies) != 1:
            return None
        reply = replies[0]; payload = reply['payload']
        started, ended = host_time(request), host_time(reply)
        output = host_output(payload.get('output'))
        if (not started <= prepared < ended
                or payload.get('internal_chat_message_metadata_passthrough', {}).get('turn_id') != link['turn_id']
                or not output or len(output) < 2
                or not re.fullmatch(r'Script failed\nWall time [0-9.]+ seconds\nOutput:\n', output[0]['text'])):
            return None
        index = len(output) - 2
        if (index >= len(steps) or steps[index][0] not in ('Bash', 'apply_patch')
                or steps[index][0] != call.get('tool_name')
                or known and known.get('step_index') != index):
            return None
        outstanding = [key for key, other in calls.items()
                       if other.get('transcript_path') == call.get('transcript_path')
                       and other.get('turn_id') == call.get('turn_id')
                       and started <= other.get('prepared_at', -1) < ended and not other.get('terminal')]
        if outstanding != [call_id]:
            return None
        native = [r for r in records if r.get('type') == 'event_msg'
                  and r.get('payload', {}).get('type') == 'item_completed']
        if any(r['payload'].get('item', {}).get('id') == call_id for r in native):
            return None  # A native execution contradicts dispatch-before-start failure.
        used = set(); evidence = []
        for pos, (kind, args) in enumerate(steps[:index]):
            result = json.loads(output[pos + 1]['text'])
            if not isinstance(result, dict) or kind not in ('Bash', 'poll'):
                return None  # File-change prefixes are intentionally unsupported here.
            code, process = result.get('exit_code'), result.get('session_id')
            if (code is not None and (type(code) is not int or process is not None)
                    or process is not None and (type(process) is not int or process <= 0)
                    or code is None and process is None
                    or kind == 'poll' and (code is None or process is not None)):
                return None
            matches = []
            for row in native:
                event = row['payload']; item = event.get('item', {})
                if item.get('type') != 'CommandExecution':
                    continue
                if kind == 'poll':
                    if str(item.get('process_id')) != str(args['session_id']):
                        continue
                else:
                    command = item.get('command')
                    if (not isinstance(command, list) or len(command) != 3
                            or command[1] not in ('-c', '-lc', '-ic', '-ilc') or command[2] != args
                            or not started <= event.get('started_at_ms', -1) / 1000 < prepared):
                        continue
                if process is not None and str(item.get('process_id')) != str(process):
                    continue
                matches.append(row)
            if len(matches) != 1:
                return None
            row = matches[0]; event = row['payload']; item = event['item']
            if (event.get('thread_id') != link['thread_id'] or event.get('turn_id') != link['turn_id']
                    or not isinstance(item.get('id'), str) or not item['id'] or item['id'] in used
                    or item.get('status') not in ('completed', 'failed')
                    or type(item.get('exit_code')) is not int
                    or item['status'] == 'failed' and item['exit_code'] == 0
                    or not canonical_cwd(item.get('cwd'))
                    or code is not None and item['exit_code'] != code
                    or event.get('completed_at_ms', float('inf')) / 1000 > host_time(row)
                    or host_time(row) > prepared):
                return None
            used.add(item['id']); evidence.append(row)
        # Reject unaccounted executions begun inside this envelope, including tail steps.
        if any(started <= row['payload'].get('started_at_ms', -1) / 1000 < ended
               and row['payload'].get('thread_id') == link['thread_id']
               and row['payload'].get('turn_id') == link['turn_id']
               and row['payload'].get('item', {}).get('id') not in used for row in native):
            return None
        failure = output[-1]['text']; status = None
        prefix = 'Script error:\nexec_command failed: CreateProcess { message: "Rejected(\\"'
        if call.get('tool_name') == 'Bash':
            if failure.startswith(prefix + 'This action was rejected due to unacceptable risk.'):
                status = 'declined'
            elif failure.startswith(prefix + 'Failed to create unified exec process: '):
                status = 'not_started'
        elif failure.startswith('Script error:\napply_patch verification failed: '):
            status = 'failed'
        elif failure.startswith('Script error:\nThis action was rejected due to unacceptable risk.\nReason: '):
            status = 'declined'
        if status is None:
            return None
        return {'source': 'mixed-literal-dispatch-failure', 'status': status, 'exit_code': None,
                **link, 'step_index': index, 'prefix_item_ids': sorted(used),
                'record_sha256': hashlib.sha256(json.dumps([reply, *evidence], sort_keys=True).encode()).hexdigest()}
    except (OSError, ValueError, TypeError, AttributeError, IndexError, KeyError, OverflowError):
        return None


'''


def patch(source):
    if MARKER in source:
        if (FUNCTIONS not in source
                or "or mixed_literal_failure_receipt(sid, root, call_id, call, current['calls'])" not in source
                or 'mixed_literal_dispatch = batch_dispatch_context(event, sid, root, mixed_literal_batch)' not in source
                or "prepared['mixed_literal_dispatch'] = mixed_literal_dispatch" not in source):
            raise ValueError('Installed mixed-dispatch implementation differs; inspect before updating')
        return source
    replacements = {
        'def settled_syntax(source):\n': FUNCTIONS + 'def settled_syntax(source):\n',
        "            receipt = (evidence.get(call_id) or dispatch_receipt(sid, root, call)":
        "            receipt = (evidence.get(call_id) or dispatch_receipt(sid, root, call)\n"
        "                       or mixed_literal_failure_receipt(sid, root, call_id, call, current['calls'])",
        '        for attempt in range(3):\n            observed = store.get(sid, root)\n':
        "        mixed_literal_dispatch = batch_dispatch_context(event, sid, root, mixed_literal_batch) if not any((dispatch, batch_dispatch, polled_dispatch, settled_dispatch, trailing_poll_dispatch, leading_poll_dispatch)) else None\n"
        '        for attempt in range(3):\n            observed = store.get(sid, root)\n',
        "'dispatch_checked': True, 'dispatch_version': 11}":
        "'dispatch_checked': True, 'dispatch_version': 12}",
        '            if dispatch:\n                prepared[\'dispatch\'] = dispatch\n':
        "            if mixed_literal_dispatch:\n                prepared['mixed_literal_dispatch'] = mixed_literal_dispatch\n"
        '            if dispatch:\n                prepared[\'dispatch\'] = dispatch\n',
    }
    for old, new in replacements.items():
        if source.count(old) != 1:
            raise ValueError('Unexpected hook version; no changes applied')
        source = source.replace(old, new)
    compile(source, '<mixed-dispatch-task-finish>', 'exec')
    return source


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--gate', type=Path, default=Path.home()/'.codex/hooks/task-finish/gate.py')
    parser.add_argument('--apply', action='store_true')
    parser.add_argument('--expect-sha256')
    args = parser.parse_args()
    original = args.gate.read_bytes(); digest = hashlib.sha256(original).hexdigest()
    updated = patch(original.decode()).encode()
    if not args.apply:
        print('Patch validated; installed source SHA-256:', digest)
        return
    if args.expect_sha256 != digest:
        raise ValueError('Expected installed-source SHA-256 required; validate before applying')
    if updated == original:
        print('Already installed; no changes')
        return
    backup = args.gate.parent/'backups'/('mixed-dispatch-'+datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%S%fZ')+'.py')
    backup.parent.mkdir(parents=True, exist_ok=True); shutil.copy2(args.gate, backup)
    temporary = args.gate.with_name('.mixed-dispatch-'+digest+'.tmp')
    try:
        with temporary.open('xb') as stream:
            stream.write(updated)
        temporary.chmod(args.gate.stat().st_mode & 0o777)
        if args.gate.read_bytes() != original or backup.read_bytes() != original:
            raise ValueError('Hook changed during installation; no replacement applied')
        temporary.replace(args.gate)
    finally:
        temporary.unlink(missing_ok=True)
    print('Applied; original preserved:', backup)


if __name__ == '__main__':
    main()
