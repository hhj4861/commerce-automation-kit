#!/usr/bin/env python3
"""Evidence-only recovery of a refused shell after input to a terminated process.

Install a narrowly scoped matcher; normal gate reconcile retains all ownership,
commit, push and hold checks. Never edit the state database or host transcript.
"""
import argparse
import ast
from datetime import datetime, timezone
import hashlib
import json
import os
from pathlib import Path
import re
import subprocess
import tempfile

REVIEWED_GATE = '927fa7608db955d06c17bdbe2433ce970b61289c0e73b800b7b89f7cb49814a4'


def stdin_refusal_steps(source):
    """Parse exactly two awaited literal calls, without evaluating JavaScript."""
    if not isinstance(source, str) or len(source) > 16384:
        return None
    try:
        parser = LiteralBatch(source)
        steps = []
        for name in ('write_stdin', 'exec_command'):
            for token in ('text', '(', 'await', 'tools', '.', name, '('):
                parser.take(token)
            args = parser.expression()
            for token in (')', ')', ';'):
                parser.take(token)
            if not isinstance(args, dict):
                return None
            steps.append(args)
        if parser.peek() is not None:
            return None
        stdin, shell = steps
        if (set(stdin) - {'session_id', 'chars', 'yield_time_ms', 'max_output_tokens'}
                or type(stdin.get('session_id')) is not int or stdin['session_id'] <= 0
                or not isinstance(stdin.get('chars'), str) or not stdin['chars']
                or any(type(stdin[k]) is not int or stdin[k] <= 0
                       for k in ('yield_time_ms', 'max_output_tokens') if k in stdin)
                or set(shell) - {'cmd', 'workdir', 'sandbox_permissions', 'justification',
                                 'yield_time_ms', 'max_output_tokens', 'tty', 'login', 'shell', 'prefix_rule'}
                or not isinstance(shell.get('cmd'), str) or not shell['cmd']
                or shell.get('workdir') is not None and not Path(shell['workdir']).is_absolute()):
            return None
        return steps
    except (ValueError, TypeError, IndexError, KeyError, SyntaxError, RecursionError):
        return None


def stdin_refusal_receipt(sid, root, call_id, call, calls):
    """Historical v19 only: host refusal AND native completion of the input process."""
    try:
        if (calls.get(call_id) != call or call.get('tool_name') != 'Bash'
                or call.get('dispatch_checked') is not True or call.get('dispatch_version') != 19
                or call.get('actor_thread_id') not in (None, sid)
                or call.get('paths') or call.get('new_paths') or call.get('terminal')
                or any(v for k, v in call.items() if k == 'dispatch' or k.endswith('_dispatch'))):
            return None
        prepared, turn = call['prepared_at'], call['turn_id']
        if type(prepared) not in (int, float) or not float('-inf') < prepared < float('inf'):
            return None
        doc = host_records(call['transcript_path'], sid, root)
        if not doc or doc[0] != sid:
            return None
        thread, path, records = doc
        def turn_of(row):
            return row.get('payload', {}).get('internal_chat_message_metadata_passthrough', {}).get('turn_id')
        candidates = []
        for request in records:
            p = request.get('payload', {})
            if (request.get('type') != 'response_item' or p.get('type') != 'custom_tool_call'
                    or p.get('name') != 'exec' or not p.get('call_id') or turn_of(request) != turn):
                continue
            steps = stdin_refusal_steps(p.get('input'))
            if not steps:
                continue
            rows = [r for r in records if r.get('type') == 'response_item'
                    and r.get('payload', {}).get('call_id') == p['call_id']]
            if (len(rows) != 2 or rows[0] != request
                    or rows[1]['payload'].get('type') != 'custom_tool_call_output'
                    or turn_of(rows[1]) != turn):
                continue
            reply = rows[1]
            if host_time(request) <= prepared < host_time(reply):
                candidates.append((request, reply, steps))
        if len(candidates) != 1:
            return None
        request, reply, (stdin, shell) = candidates[0]
        started, ended = host_time(request), host_time(reply)
        output = host_output(reply['payload'].get('output'))
        if (not output or len(output) != 3
                or not re.fullmatch(r'Script failed\nWall time [0-9.]+ seconds\nOutput:\n', output[0]['text'])):
            return None
        prefix = 'Script error:\nexec_command failed: CreateProcess { message: "Rejected(\\"'
        failure = output[2]['text']
        if (not failure.startswith(prefix + 'This action was rejected due to unacceptable risk.')
                or not failure.endswith('\\")" }')):
            return None
        result = json.loads(output[1]['text'])
        if not isinstance(result, dict):
            return None
        process = str(stdin['session_id'])
        running = type(result.get('session_id')) is int and str(result['session_id']) == process and result.get('exit_code') is None
        terminal = type(result.get('exit_code')) is int and result.get('session_id') is None
        if not running and not terminal:
            return None
        native = [r for r in records if r.get('type') == 'event_msg'
                  and r.get('payload', {}).get('type') == 'item_completed']
        matches = [r for r in native if r['payload'].get('item', {}).get('type') == 'CommandExecution'
                   and str(r['payload']['item'].get('process_id')) == process]
        if len(matches) != 1:
            return None
        proof = matches[0]; e = proof['payload']; item = e['item']
        begin, finish = e.get('started_at_ms'), e.get('completed_at_ms')
        code = item.get('exit_code')
        if (e.get('thread_id') != thread or e.get('turn_id') != turn
                or not isinstance(item.get('id'), str) or not item['id'] or item['id'] == call_id
                or not canonical_cwd(item.get('cwd')) or type(code) is not int
                or item.get('status') != ('completed' if code == 0 else 'failed')
                or type(begin) not in (int, float) or type(finish) not in (int, float)
                or not 0 <= begin <= started * 1000 <= finish <= host_time(proof) * 1000
                or not float('-inf') < host_time(proof) < float('inf')
                or terminal and (code != result['exit_code'] or host_time(proof) > prepared)
                or running and finish / 1000 < prepared):
            return None
        # No conflicting target completion, duplicate process event, or unexpected
        # native execution in the rejected request's execution interval.
        for row in native:
            ev = row['payload']; it = ev.get('item', {})
            if it.get('id') == call_id:
                return None
            if row != proof and it.get('id') == item['id']:
                return None
            if (ev.get('thread_id') == thread and ev.get('turn_id') == turn
                    and it.get('type') in ('CommandExecution', 'FileChange') and row != proof):
                at = ev.get('started_at_ms')
                if type(at) not in (int, float) or not float('-inf') < at < float('inf'):
                    return None
                if started <= at / 1000 <= ended:
                    return None
        if any(r.get('type') == 'response_item'
               and r.get('payload', {}).get('type') in ('custom_tool_call', 'function_call')
               and started <= host_time(r) <= ended and r != request for r in records):
            return None
        outstanding = [k for k, v in calls.items() if v.get('transcript_path') == call['transcript_path']
                       and v.get('turn_id') == turn and started <= v.get('prepared_at', -1) < ended]
        if outstanding != [call_id]:
            return None
        return {'source': 'stdin-prefix-host-refusal', 'status': 'declined', 'exit_code': None,
                'thread_id': thread, 'turn_id': turn, 'transcript_path': str(path),
                'outer_call_id': request['payload']['call_id'], 'step_index': 1,
                'source_sha256': hashlib.sha256(request['payload']['input'].encode()).hexdigest(),
                'prefix_process_id': process, 'prefix_item_id': item['id'],
                'prefix_status': item['status'], 'prefix_exit_code': code,
                'record_sha256': hashlib.sha256(json.dumps([request, reply, proof], sort_keys=True).encode()).hexdigest()}
    except (OSError, ValueError, TypeError, AttributeError, IndexError, KeyError, OverflowError, RecursionError):
        return None


def patch(source):
    if hashlib.sha256(source.encode()).hexdigest() != REVIEWED_GATE:
        raise ValueError('Installed gate changed; review required, no changes applied')
    own = Path(__file__).read_text()
    tree = ast.parse(own)
    functions = '\n\n'.join(ast.get_source_segment(own, n) for n in tree.body
                            if isinstance(n, ast.FunctionDef) and n.name.startswith('stdin_refusal_'))
    marker = 'def reconcile_calls(store, sid, root, recover=True, only=None):'
    old = 'receipt = (evidence.get(call_id) or dispatch_receipt(sid, root, call)'
    if source.count(marker) != 1 or source.count(old) != 1:
        raise ValueError('Unexpected reconcile contract')
    updated = source.replace(marker, functions + '\n\n\n' + marker).replace(
        old, old + '\n                       or stdin_refusal_receipt(sid, root, call_id, call, current[\'calls\'])')
    compile(updated, '<stdin-refusal-candidate>', 'exec')
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
    backup = args.gate.parent / 'backups' / ('stdin-refusal-' + datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%S%fZ') + '.py')
    backup.parent.mkdir(parents=True, exist_ok=True)
    with backup.open('xb') as f:
        f.write(original.encode()); f.flush(); os.fsync(f.fileno())
    backup.chmod(0o600)
    temporary = None
    try:
        with tempfile.NamedTemporaryFile(dir=args.gate.parent, prefix='.stdin-refusal-', delete=False) as f:
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
