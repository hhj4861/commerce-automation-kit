#!/usr/bin/env python3
"""Add an explicit, evidence-bound recovery for a daemon-interrupted Git fetch.

Never claim original command success. No transcript edits, hook trust changes,
automatic recovery, source-file exemptions or general shell replay.
"""
import argparse
import hashlib
import json
import os
from pathlib import Path
import re
import subprocess

import ast
from datetime import datetime, timezone
import shutil

SOURCE_PATH = 'tools/task-finish-interruption-recovery.py'


def function(source, name):
    nodes = [node for node in ast.parse(source).body
             if isinstance(node, ast.FunctionDef) and node.name == name]
    if len(nodes) != 1:
        raise ValueError('Expected exactly one function: ' + name)
    node = nodes[0]
    return '\n'.join(source.splitlines()[node.lineno - 1:node.end_lineno])

def apply_update(gate, original, updated, expected):
    digest = hashlib.sha256(original).hexdigest()
    if digest != expected:
        raise ValueError('Expected installed SHA-256 is required; no update applied')
    backup = gate.parent / 'backups' / ('interruption-recovery-' + datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%S%fZ') + '.py')
    temporary = gate.with_name('.interruption-recovery-' + digest + '.tmp')
    backup.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(gate, backup)
    created = False
    try:
        with temporary.open('xb') as stream:
            created = True
            stream.write(updated)
        temporary.chmod(gate.stat().st_mode & 0o777)
        if gate.read_bytes() != original or backup.read_bytes() != original:
            raise ValueError('Installed code changed during update; no replacement applied')
        temporary.replace(gate)
    finally:
        if created:
            temporary.unlink(missing_ok=True)
    return backup


def rf_require(condition, message):
    if not condition:
        raise GuardError('재시작 fetch 복구: ' + message)


def rf_digest(value):
    return hashlib.sha256(json.dumps(value, sort_keys=True).encode()).hexdigest()


def rf_source(source):
    if not isinstance(source, str) or len(source) > 8192:
        return None
    steps = leading_poll_batch(source)
    if not steps or [s[0] for s in steps] != ['poll', 'Bash', 'Bash']:
        return None
    try:
        parser = LiteralBatch(source, allow_poll=True)
        arguments = []
        for tool in ('write_stdin', 'exec_command', 'exec_command'):
            for token in ('text', '(', 'await', 'tools', '.', tool, '('): parser.take(token)
            arguments.append(parser.expression())
            for token in (')', ')'): parser.take(token)
            if parser.peek() == ';': parser.take(';')
        if parser.peek() is not None: return None
    except (ValueError, TypeError, IndexError, KeyError, SyntaxError):
        return None
    poll, fetch, version = arguments
    allowed = {'cmd', 'workdir', 'login', 'sandbox_permissions', 'justification', 'max_output_tokens', 'yield_time_ms'}
    for args in (fetch, version):
        if (set(args) - allowed or args.get('login') is not False
                or not isinstance(args.get('workdir'), str)
                or not Path(args['workdir']).is_absolute()):
            return None
    match = re.fullmatch(r'git fetch origin ([A-Za-z0-9][A-Za-z0-9_/-]*); git status --porcelain; '
                         r'git diff --name-only HEAD ([0-9a-f]{40}) -- ([A-Za-z0-9_./ -]+)', fetch['cmd'])
    if not match:
        return None
    paths = match[3].split(' ')
    if any(not p or p.startswith(('/', '-')) or '..' in p.split('/') for p in paths):
        return None
    if not re.fullmatch(r'node /[A-Za-z0-9_./-]+/node_modules/wrangler/bin/wrangler.js --version', version['cmd']):
        return None
    return {'poll': poll, 'fetch': fetch, 'version': version, 'branch': match[1], 'commit': match[2], 'paths': paths}


def rf_records(path, sid, root):
    document = host_records(path, sid, root)
    if not document: return None
    thread, resolved, records = document
    offsets = list(records.offsets)
    with resolved.open('rb') as stream:
        rf_require(DispatchRecords.fingerprint(os.fstat(stream.fileno())) == records.snapshot, '기록이 변경됐습니다')
        position = 0
        for raw, row in transcript_records(stream):
            if row.get('type') == 'event_msg' and row.get('payload', {}).get('type') in ('turn_aborted', 'item_started'):
                offsets.append((position, len(raw)))
                rf_require(len(offsets) <= 200000, '기록이 너무 큽니다')
            position += len(raw)
    return thread, resolved, DispatchRecords(resolved, records.snapshot, sorted(offsets))


def rf_envelope(sid, root, call_id, call, calls):
    rf_require(call.get('tool_name') == 'Bash' and call.get('dispatch_checked') is True
               and call.get('dispatch_version') == 19 and not call.get('terminal')
               and not call.get('paths') and not call.get('new_paths')
               and call.get('actor_thread_id') in (None, sid), '미종료 v19 조회 호출만 지원합니다')
    binding = call.get('leading_poll_dispatch')
    rf_require(isinstance(binding, dict) and binding.get('step_index') == 1, '원본 단계 바인딩이 필요합니다')
    rf_require(not any(v for k, v in call.items() if (k == 'dispatch' or k.endswith('_dispatch'))
                       and k != 'leading_poll_dispatch'), '여러 바인딩이 존재합니다')
    document = rf_records(call['transcript_path'], sid, root)
    rf_require(document and document[0] == sid, '원본 세션 기록이 필요합니다')
    _, path, stream = document
    outer, turn = binding['outer_call_id'], call['turn_id']
    # Freeze only this turn and this outer call, once. Reading the very long live
    # transcript repeatedly increases races without adding evidence.
    records = [r for r in stream if r.get('payload', {}).get('call_id') == outer
               or r.get('payload', {}).get('turn_id') == turn
               or r.get('payload', {}).get('item', {}).get('id') == call_id]
    responses = [r for r in records if r.get('type') == 'response_item' and r.get('payload', {}).get('call_id') == outer]
    rf_require(len(responses) == 1, '응답이 있거나 원본 호출이 중복됩니다. 일반 reconcile을 사용하세요')
    request = responses[0]; payload = request['payload']; source = payload.get('input')
    rf_require(payload.get('type') == 'custom_tool_call' and payload.get('name') == 'exec'
               and payload.get('internal_chat_message_metadata_passthrough', {}).get('turn_id') == turn,
               '호출 종류 또는 턴 불일치')
    expected = {'outer_call_id': outer, 'thread_id': sid, 'turn_id': turn, 'transcript_path': str(path),
                'source_sha256': hashlib.sha256(source.encode()).hexdigest(), 'step_index': 1}
    rf_require(binding == expected, '호출 바인딩 또는 소스 해시 불일치')
    parsed = rf_source(source)
    rf_require(parsed is not None, '허용된 fetch/status/diff 조회 형식이 아닙니다')
    rf_require(call.get('tool_cwd') in (None, parsed['fetch']['workdir']), '작업 경로 불일치')
    started, prepared = host_time(request), call['prepared_at']
    rf_require(type(prepared) in (int, float) and started <= prepared < started + 60, '준비 시각 불일치')
    aborts = [r for r in records if r.get('type') == 'event_msg'
              and r.get('payload', {}).get('type') == 'turn_aborted'
              and r['payload'].get('turn_id') == turn and prepared < host_time(r) < prepared + 60]
    rf_require(len(aborts) == 1, '단일 실제 턴 중단 기록이 필요합니다')
    ended = host_time(aborts[0])
    peers = [k for k, v in calls.items() if v.get('turn_id') == turn
             and v.get('transcript_path') == str(path) and started <= v.get('prepared_at', -1) <= ended]
    rf_require(peers == [call_id], '같은 구간에 여러 준비 호출이 있습니다')
    native = [r for r in records if r.get('type') == 'event_msg' and r.get('payload', {}).get('type') in ('item_started', 'item_completed')]
    rf_require(not any(r['payload'].get('item', {}).get('id') == call_id for r in native),
               '실제 명령 시작 또는 종료 기록이 존재합니다. 일반 복구를 사용하세요')
    prefix = [r for r in native if r['payload'].get('type') == 'item_completed'
              and str(r['payload'].get('item', {}).get('process_id')) == str(parsed['poll']['session_id'])
              and r['payload'].get('turn_id') == turn]
    rf_require(len(prefix) == 1, '선행 조회 프로세스의 단일 종료 증거가 필요합니다')
    event = prefix[0]['payload']; item = event['item']
    rf_require(event.get('thread_id') == sid and item.get('type') == 'CommandExecution'
               and item.get('status') == 'completed' and type(item.get('exit_code')) is int and item['exit_code'] == 0
               and event.get('started_at_ms', 0) <= event.get('completed_at_ms', -1)
               and event['completed_at_ms'] / 1000 <= host_time(prefix[0]) <= prepared,
               '선행 조회의 종료·시간 증거 불일치')
    for r in native:
        event = r['payload']; item = event.get('item', {})
        if event.get('turn_id') != turn or item.get('type') not in ('CommandExecution', 'FileChange'):
            continue
        at = event.get('started_at_ms', -1) / 1000
        rf_require(not (started <= at <= ended), '조회 구간에 다른 실제 실행이 있습니다')
    return {'binding': binding, 'started': started, 'prepared': prepared, 'ended': ended,
            'records_sha256': rf_digest([request, aborts[0], prefix[0]])}, parsed


def rf_probe_command(sid, turn, lower, upper):
    return ("python3 - <<'PY'\nimport sqlite3,json\nfrom pathlib import Path\n"
            "home=Path.home()/'.codex'\n"
            f"sid='{sid}'; turn='{turn}'\n"
            "c=sqlite3.connect(f'file:{home}/logs_2.sqlite?mode=ro',uri=True)\n"
            "print('LOG_SCHEMA',c.execute('pragma table_info(logs)').fetchall())\n"
            "print('RESTART',c.execute(\"select ts,target,process_uuid,substr(feedback_log_body,1,1400) from logs where ts between "
            f"{lower} and {upper} and (thread_id=? or target='codex_app_server') order by ts limit 35\",(sid,)).fetchall())\n"
            "h=sqlite3.connect(f'file:{home}/thread_history_1.sqlite?mode=ro',uri=True)\n"
            "print('TURN',h.execute('select status from thread_turns where thread_id=? and turn_id=?',(sid,turn)).fetchall())\nPY")


def rf_archived_restart(sid, turn, link, root):
    document = host_records(link['binding']['transcript_path'], sid, root)
    rf_require(document and document[0] == sid, '원본 세션 조회 증거가 필요합니다')
    pattern = re.escape(rf_probe_command(sid, turn, 'LOW', 'HIGH')).replace('LOW', r'(\d+)').replace('HIGH', r'(\d+)')
    proofs = []
    for row in document[2]:
        event = row.get('payload', {}); item = event.get('item', {}); command = item.get('command')
        if (row.get('type') != 'event_msg' or event.get('type') != 'item_completed'
                or not isinstance(command, list) or len(command) != 3 or command[1] not in ('-c', '-lc')): continue
        match = re.fullmatch(pattern, command[2])
        if not match: continue
        lower, upper = map(int, match.groups())
        rf_require(link['started'] - 30 <= lower <= link['started'] and link['ended'] <= upper <= link['ended'] + 90
                   and event.get('thread_id') == sid and item.get('type') == 'CommandExecution'
                   and item.get('source') == 'unified_exec_startup' and item.get('status') == 'completed'
                   and type(item.get('exit_code')) is int and item['exit_code'] == 0
                   and canonical_cwd(item.get('cwd')) == root and not item.get('stderr')
                   and link['ended'] < event.get('started_at_ms', 0) / 1000
                   <= event.get('completed_at_ms', 0) / 1000 <= host_time(row), '보존 조회 명령·시각·종료 불일치')
        output = item.get('stdout', item.get('aggregated_output', ''))
        lines = output.splitlines()
        rf_require(len(lines) == 3 and all(line.startswith(prefix) for line, prefix in zip(lines, ('LOG_SCHEMA ', 'RESTART ', 'TURN '))),
                   '보존 조회 출력 형식 불일치')
        logs, status = ast.literal_eval(lines[1][8:]), ast.literal_eval(lines[2][5:])
        rf_require(status == [('interrupted',)] and isinstance(logs, list) and 1 <= len(logs) <= 35
                   and all(isinstance(v, tuple) and len(v) == 4 and type(v[0]) is int and lower <= v[0] <= upper
                           and all(isinstance(x, str) for x in v[1:]) for v in logs), '보존 조회 값 불일치')
        old = sorted({v[2] for v in logs if link['started'] - 1 <= v[0] <= link['prepared']})
        new = [v for v in logs if v[1] == 'codex_core::session::handlers' and 'daemon_recovery' in v[3]
               and link['prepared'] < v[0] <= link['ended'] + 5]
        rf_require(len(old) == 1 and len(new) == 1 and old[0] != new[0][2]
                   and f'thread_id={sid}' in new[0][3] and 'turn_trigger: Some("daemon_recovery")' in new[0][3]
                   and all(re.fullmatch(r'pid:[0-9]+:[0-9a-f-]+', p) for p in (old[0], new[0][2])),
                   '보존된 호스트 재시작이 유일하지 않습니다')
        proofs.append({'old_host': old[0], 'new_host': new[0][2], 'archived_native_id': item['id'],
                       'records_sha256': rf_digest(row)})
    rf_require(len(proofs) == 1, '원본 로그 또는 단일 실제 조회 종료 증거가 필요합니다')
    return proofs[0]


def rf_restart(sid, turn, link, root):
    from contextlib import closing
    home = Path(os.environ.get('CODEX_HOME', Path.home() / '.codex')).resolve()
    rf_require(home == (Path.home() / '.codex').resolve(), '기본 호스트 기록만 지원합니다')
    def connect(name):
        return sqlite3.connect((home / name).as_uri() + '?mode=ro', uri=True)
    with closing(connect('thread_history_1.sqlite')) as db:
        status = db.execute('SELECT status FROM thread_turns WHERE thread_id=? AND turn_id=?', (sid, turn)).fetchall()
    rf_require(status == [('interrupted',)], '호스트 턴이 interrupted가 아닙니다')
    with closing(connect('logs_2.sqlite')) as db:
        old = db.execute('SELECT DISTINCT process_uuid FROM logs WHERE thread_id=? AND ts BETWEEN ? AND ?',
                         (sid, int(link['started']), int(link['prepared']))).fetchall()
        resumed = db.execute("SELECT ts,process_uuid,feedback_log_body FROM logs WHERE thread_id=? AND ts BETWEEN ? AND ? AND target='codex_core::session::handlers' AND feedback_log_body LIKE '%daemon_recovery%'",
                             (sid, int(link['prepared']), int(link['ended']) + 5)).fetchall()
    if not old and not resumed:
        return rf_archived_restart(sid, turn, link, root)
    rf_require(len(old) == 1 and len(resumed) == 1, '유일한 원본 호스트와 daemon recovery 기록이 필요합니다')
    original, replacement = old[0][0], resumed[0][1]
    rf_require(original != replacement and all(re.fullmatch(r'pid:[0-9]+:[0-9a-f-]+', p or '') for p in (original, replacement))
               and f'expected_previous_turn_id: "{turn}"' in resumed[0][2], '재시작 호스트 또는 이전 턴 불일치')
    return {'old_host': original, 'new_host': replacement, 'records_sha256': rf_digest([status, old, resumed])}


def rf_run(argv, cwd):
    env = dict(os.environ, GIT_TERMINAL_PROMPT='0', GIT_OPTIONAL_LOCKS='0')
    for key in list(env):
        if key.startswith('GIT_') and key not in ('GIT_TERMINAL_PROMPT', 'GIT_OPTIONAL_LOCKS'):
            env.pop(key)
    result = subprocess.run(argv, cwd=cwd, env=env, capture_output=True, text=True, timeout=45)
    rf_require(result.returncode == 0, '새 검증 실패: ' + argv[0])
    return result.stdout.strip()


def rf_verify(root, parsed, restart):
    cwd = str(Path(parsed['fetch']['workdir']).resolve())
    rf_require(repository(cwd) == cwd and run(root, 'rev-parse', '--git-common-dir').returncode == 0,
               '원본 작업 저장소가 없습니다')
    def common(at):
        return str((Path(at) / rf_run(['git', 'rev-parse', '--git-common-dir'], at)).resolve())
    rf_require(common(root) == common(cwd), '원본 작업 폴더는 같은 Git 저장소여야 합니다')
    processes = rf_run(['ps', '-axo', 'pid=,command='], cwd)
    pid = restart['old_host'].split(':')[1]
    fetch_command = 'git fetch origin ' + parsed['branch']
    rf_require(not any(line.split()[0] == pid or fetch_command in line for line in processes.splitlines() if line.split()),
               '원본 호스트 또는 조회 프로세스가 아직 존재합니다')
    rf_require(rf_run(['git', 'status', '--porcelain'], cwd) == '', '원본 작업 폴더의 미커밋 변경을 먼저 해결하세요')
    url = rf_run(['git', 'remote', 'get-url', 'origin'], cwd)
    rf_require(re.fullmatch(r'(?:https://github.com/|git@github.com:)[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+(?:\.git)?', url),
               'GitHub HTTPS 또는 SSH origin만 지원합니다')
    head_oid = rf_run(['git', 'rev-parse', 'HEAD'], cwd)
    ref = 'refs/heads/' + parsed['branch']
    remote = rf_run(['git', 'ls-remote', '--exit-code', 'origin', ref], cwd).split()
    rf_require(len(remote) == 2 and remote[1] == ref and re.fullmatch('[0-9a-f]{40}', remote[0]), '원격 커밋 확인 실패')
    rf_run(['git', 'merge-base', '--is-ancestor', parsed['commit'], head_oid], cwd)
    rf_run(['git', 'merge-base', '--is-ancestor', head_oid, remote[0]], cwd)
    diff = rf_run(['git', 'diff', '--name-only', 'HEAD', parsed['commit'], '--', *parsed['paths']], cwd)
    rf_require(rf_run(['git', 'rev-parse', 'HEAD'], cwd) == head_oid and rf_run(['git', 'status', '--porcelain'], cwd) == '',
               '검증 중 작업 폴더 변경')
    return {'cwd': cwd, 'head': head_oid, 'remote': remote, 'target_commit': parsed['commit'], 'diff': diff}


def restart_fetch_plan(store, sid, root, call_id):
    data = store.get(sid, root); call = data['calls'].get(call_id)
    rf_require(call is not None and not data.get('coverage_problem'), '호출 또는 파일 관찰이 불완전합니다')
    for attempt in range(3):
        try:
            link, parsed = rf_envelope(sid, root, call_id, call, data['calls'])
            restart = rf_restart(sid, call['turn_id'], link, root)
            break
        except ValueError as error:
            if 'transcript changed' not in str(error) or attempt == 2: raise
    verification = rf_verify(root, parsed, restart)
    evidence = {'session': sid, 'root': root, 'call_id': call_id, 'call_sha256': rf_digest(call),
                'file_basis_sha256': rf_digest(observation_basis(data)), 'head': head(root),
                'original': link, 'restart': restart, 'verification': verification}
    return dict(evidence, source_digest=rf_digest(evidence))


def approve_restart_fetch(store, sid, root, call_id, expected_digest, reason):
    rf_require(expected_digest and reason and reason.strip(), '명시적 복구 승인 사유와 plan digest가 필요합니다')
    evidence = restart_fetch_plan(store, sid, root, call_id)
    rf_require(evidence['source_digest'] == expected_digest, '사전 확인 이후 증거가 변경됐습니다')
    with store.transaction():
        data = store.get(sid, root)
        rf_require(rf_digest(data['calls'].get(call_id)) == evidence['call_sha256']
                   and rf_digest(observation_basis(data)) == evidence['file_basis_sha256'] and head(root) == evidence['head'],
                   '검증 중 관찰 상태가 변경됐습니다')
        receipt = {'source': 'approved-daemon-interruption', 'status': 'interrupted', 'exit_code': None,
                   'resolution': 'fetch-state-reverified', 'reason': reason.strip(), 'evidence': evidence,
                   'recorded_at': time.time(), 'approved_by_session': sid}
        data.setdefault('restart_fetch_resolutions', []).append(receipt)
        data['calls'][call_id]['terminal'] = receipt
        store.save(sid, root, data)
    result = reconcile_calls(store, sid, root, only=call_id)
    return {'status': 'interrupted', 'original_exit_code': None, 'completion': 'not-evaluated',
            'pending_calls': list(result['calls']), 'source_digest': evidence['source_digest']}


def rd_evidence(records, sid, root, call_id, call, calls, prior):
    """Prove an unbound refusal was shadowed by the verified interrupted fetch."""
    rf_require(calls.get(call_id) == call and call.get('tool_name') == 'Bash'
               and call.get('dispatch_checked') is True and call.get('dispatch_version') == 19
               and call.get('actor_thread_id') in (None, sid) and not call.get('terminal')
               and not call.get('paths') and not call.get('new_paths')
               and not any(v for k, v in call.items() if k == 'dispatch' or k.endswith('_dispatch')),
               '바인딩 없는 v19 거절 호출만 지원합니다')
    rf_require(prior.get('source') == 'approved-daemon-interruption'
               and prior.get('status') == 'interrupted' and prior.get('exit_code') is None,
               '검증된 선행 중단 영수증이 필요합니다')
    old = prior['evidence']; original = old['original']; binding = original['binding']
    rf_require(old['source_digest'] == rf_digest({k: v for k, v in old.items() if k != 'source_digest'})
               and old['session'] == sid and old['root'] == root
               and binding['transcript_path'] == call['transcript_path'], '선행 증거 범위 불일치')
    old_rows = [r for r in records if r.get('type') == 'response_item'
                and r.get('payload', {}).get('call_id') == binding['outer_call_id']]
    rf_require(len(old_rows) == 1 and old_rows[0]['payload'].get('type') == 'custom_tool_call'
               and old_rows[0]['payload'].get('name') == 'exec', '선행 중단 호출 기록 불일치')
    source = old_rows[0]['payload']['input']; parsed = rf_source(source)
    rf_require(parsed and hashlib.sha256(source.encode()).hexdigest() == binding['source_sha256'],
               '선행 중단 소스 불일치')
    aborts = [r for r in records if r.get('type') == 'event_msg'
              and r.get('payload', {}).get('type') == 'turn_aborted'
              and r['payload'].get('turn_id') == binding['turn_id']
              and host_time(r) == original['ended']]
    prefixes = [r for r in records if r.get('type') == 'event_msg'
                and r.get('payload', {}).get('type') == 'item_completed'
                and r['payload'].get('turn_id') == binding['turn_id']
                and str(r['payload'].get('item', {}).get('process_id')) == str(parsed['poll']['session_id'])]
    rf_require(len(aborts) == len(prefixes) == 1
               and rf_digest([old_rows[0], aborts[0], prefixes[0]]) == original['records_sha256'],
               '선행 중단 증거가 변경됐습니다')
    prepared = call['prepared_at']; turn = call['turn_id']
    rf_require(type(prepared) in (int, float) and original['ended'] < prepared
               and turn != binding['turn_id'], '거절 호출 시각·턴 불일치')
    pending, cells, waits = {}, {}, {}
    for row in records:
        if row.get('type') != 'response_item' or host_time(row) > prepared:
            continue
        p = row['payload']; kind = p.get('type'); cid = p.get('call_id')
        row_turn = p.get('internal_chat_message_metadata_passthrough', {}).get('turn_id')
        if kind == 'custom_tool_call' and p.get('name') == 'exec':
            rf_require(cid not in pending, '중복 요청')
            pending[cid] = row
        elif kind == 'custom_tool_call_output':
            cell = yielded_cell(p.get('output'))
            if cell:
                rf_require((row_turn, cell) not in cells, '중복 실행 셀')
                cells[(row_turn, cell)] = cid
            else:
                pending.pop(cid, None)
        elif kind == 'function_call' and p.get('name') == 'wait':
            args = json.loads(p.get('arguments', '{}'))
            waits[cid] = cells.get((row_turn, args.get('cell_id')))
        elif kind == 'function_call_output' and not yielded_cell(p.get('output')):
            pending.pop(waits.get(cid), None)
    rf_require(len(pending) == 2 and binding['outer_call_id'] in pending,
               '바인딩 누락 원인이 선행 중단 하나로 한정되지 않습니다')
    request = next(v for k, v in pending.items() if k != binding['outer_call_id'])
    p = request['payload']; outer = p['call_id']; source = p.get('input')
    steps = literal_batch(source)
    rf_require(steps and len(steps) == 2 and all(s[0] == 'Bash' for s in steps)
               and p.get('internal_chat_message_metadata_passthrough', {}).get('turn_id') == turn,
               '두 순차 명령의 첫 단계 거절만 지원합니다')
    pair = [r for r in records if r.get('type') == 'response_item'
            and r.get('payload', {}).get('call_id') == outer]
    rf_require(len(pair) == 2 and pair[0] == request, '유일한 실제 거절 응답이 필요합니다')
    reply = pair[1]; q = reply['payload']; started, ended = host_time(request), host_time(reply)
    rf_require(q.get('type') == 'custom_tool_call_output'
               and q.get('internal_chat_message_metadata_passthrough', {}).get('turn_id') == turn
               and original['ended'] < started <= prepared < ended < started + 120,
               '요청·준비·거절 시각 또는 턴 불일치')
    output = q.get('output')
    rf_require(isinstance(output, list) and len(output) == 2
               and all(isinstance(v, dict) and v.get('type') == 'input_text' for v in output)
               and re.fullmatch(r'Script failed\nWall time [0-9.]+ seconds\nOutput:\n', output[0].get('text', '')),
               '첫 명령 실행 전 호스트 거절 형식이 아닙니다')
    failure = output[1].get('text', '')
    rf_require(failure.startswith('Script error:\nexec_command failed: CreateProcess { message: "Rejected(\\"This action was rejected due to unacceptable risk.')
               and failure.endswith('\\")" }'), '실제 승인 거절이 아닙니다')
    outstanding = [k for k, v in calls.items() if v.get('turn_id') == turn
                   and v.get('transcript_path') == call['transcript_path']
                   and started <= v.get('prepared_at', -1) < ended]
    rf_require(outstanding == [call_id], '거절 구간의 준비 호출이 유일하지 않습니다')
    for row in records:
        e = row.get('payload', {}); item = e.get('item', {})
        if row.get('type') == 'event_msg' and e.get('type') in ('item_started', 'item_completed'):
            rf_require(item.get('id') != call_id and not started <= host_time(row) <= ended
                       and not started <= e.get('started_at_ms', -1) / 1000 <= ended,
                       '실제 시작 또는 종료와 모순되는 거절입니다')
        if row.get('type') == 'response_item' and e.get('type') in ('custom_tool_call', 'function_call'):
            rf_require(not (started <= host_time(row) <= ended and row != request), '동시 호출로 인한 모호한 거절')
    return {'outer_call_id': outer, 'thread_id': sid, 'turn_id': turn,
            'source_sha256': hashlib.sha256(source.encode()).hexdigest(),
            'records_sha256': rf_digest(pair), 'prior_source_digest': old['source_digest']}


def restart_decline_plan(store, sid, root, call_id):
    data = store.get(sid, root); call = data['calls'].get(call_id)
    rf_require(call and not data.get('coverage_problem'), '호출 또는 파일 관찰이 불완전합니다')
    receipts = data.get('restart_fetch_resolutions', [])
    rf_require(len(receipts) == 1, '단일 선행 fetch 복구 영수증이 필요합니다')
    prior = receipts[0]
    rf_require(prior['evidence']['call_id'] not in data['calls'], '선행 중단의 파일 관찰을 먼저 완료하세요')
    doc = rf_records(call['transcript_path'], sid, root)
    rf_require(doc and doc[0] == sid, '실제 호스트 기록이 필요합니다')
    proof = rd_evidence(list(doc[2]), sid, root, call_id, call, data['calls'], prior)
    old = prior['evidence']
    rf_require(rf_restart(sid, old['original']['binding']['turn_id'], old['original'], root) == old['restart'],
               '선행 재시작 증거가 변경됐습니다')
    evidence = {'session': sid, 'root': root, 'call_id': call_id, 'call_sha256': rf_digest(call),
                'file_basis_sha256': rf_digest(observation_basis(data)), 'head': head(root), 'refusal': proof}
    return dict(evidence, source_digest=rf_digest(evidence))


def approve_restart_decline(store, sid, root, call_id, expected_digest, reason):
    rf_require(expected_digest and reason and reason.strip(), '복구 사유와 plan digest가 필요합니다')
    evidence = restart_decline_plan(store, sid, root, call_id)
    rf_require(evidence['source_digest'] == expected_digest, '거절 증거가 변경됐습니다')
    with store.transaction():
        data = store.get(sid, root)
        rf_require(rf_digest(data['calls'].get(call_id)) == evidence['call_sha256']
                   and rf_digest(observation_basis(data)) == evidence['file_basis_sha256'] and head(root) == evidence['head'],
                   '검증 중 관찰 상태가 변경됐습니다')
        receipt = {'source': 'restart-shadowed-host-refusal', 'status': 'declined', 'exit_code': None,
                   'reason': reason.strip(), 'evidence': evidence, 'recorded_at': time.time(), 'approved_by_session': sid}
        data.setdefault('restart_decline_resolutions', []).append(receipt)
        data['calls'][call_id]['terminal'] = receipt
        store.save(sid, root, data)
    result = reconcile_calls(store, sid, root, only=call_id)
    return {'status': 'declined', 'original_exit_code': None, 'completion': 'not-evaluated',
            'pending_calls': list(result['calls']), 'source_digest': evidence['source_digest']}


def approval_timeout_evidence(records, sid, call_id, call, calls):
    """Authenticate a yielded two-command batch's second-step approval timeout."""
    rf_require(calls.get(call_id) == call and call.get('tool_name') == 'Bash'
               and call.get('dispatch_checked') is True and call.get('dispatch_version') == 19
               and call.get('actor_thread_id') in (None, sid) and not call.get('terminal')
               and not call.get('paths') and not call.get('new_paths')
               and not any(v for k, v in call.items() if k == 'dispatch' or k.endswith('_dispatch')),
               '바인딩 없는 v19 승인 시간 초과만 지원합니다')
    def turn_of(row):
        return row.get('payload', {}).get('internal_chat_message_metadata_passthrough', {}).get('turn_id')
    turn, prepared = call['turn_id'], call['prepared_at']
    requests = [r for r in records if r.get('type') == 'response_item'
                and r.get('payload', {}).get('type') == 'custom_tool_call'
                and r['payload'].get('name') == 'exec' and turn_of(r) == turn and host_time(r) <= prepared]
    rf_require(requests, '원본 요청이 없습니다')
    request = max(requests, key=host_time); p = request['payload']; outer = p['call_id']
    steps = literal_batch(p.get('input'))
    rf_require(steps and len(steps) == 2 and all(s[0] == 'Bash' for s in steps), '두 순차 Bash 호출만 지원합니다')
    rows = [r for r in records if r.get('type') == 'response_item' and r.get('payload', {}).get('call_id') == outer]
    rf_require(len(rows) == 2 and rows[0] == request and rows[1]['payload'].get('type') == 'custom_tool_call_output'
               and turn_of(rows[1]) == turn, '원본 요청·yield 응답이 유일하지 않습니다')
    yielded = rows[1]; output = host_output(yielded['payload'].get('output')); cell = yielded_cell(yielded['payload'].get('output'))
    rf_require(cell and output and len(output) == 2, '첫 단계 결과를 포함한 단일 yield가 필요합니다')
    result = json.loads(output[1]['text'])
    rf_require(isinstance(result, dict) and type(result.get('exit_code')) is int and result['exit_code'] == 0
               and not result.get('session_id'), '첫 단계의 실제 종료 결과가 필요합니다')
    waits = [r for r in records if r.get('type') == 'response_item'
             and r.get('payload', {}).get('type') == 'function_call' and r['payload'].get('name') == 'wait'
             and host_time(r) > host_time(yielded)
             and json.loads(r['payload'].get('arguments', '{}')).get('cell_id') == cell]
    rf_require(len(waits) == 1, '유일한 실제 wait가 필요합니다')
    wait = waits[0]; args = json.loads(wait['payload']['arguments'])
    rf_require(not args.get('terminate'), '강제 종료는 승인 시간 초과가 아닙니다')
    wait_rows = [r for r in records if r.get('type') == 'response_item'
                 and r.get('payload', {}).get('call_id') == wait['payload']['call_id']]
    rf_require(len(wait_rows) == 2 and wait_rows[0] == wait
               and wait_rows[1]['payload'].get('type') == 'function_call_output'
               and turn_of(wait_rows[1]) == turn_of(wait), '실제 wait 종료 응답이 필요합니다')
    reply = wait_rows[1]; blocks = host_output(reply['payload'].get('output'))
    expected = ('Script error:\nexec_command failed: CreateProcess { message: "Rejected(\\"'
                'The automatic permission approval review did not finish before its deadline. '
                'Do not assume the action is unsafe based on the timeout alone. '
                'You may retry once, or ask the user for guidance or explicit approval.\\")" }')
    rf_require(blocks and len(blocks) == 2 and blocks[1]['text'] == expected
               and re.fullmatch(r'Script failed\nWall time [0-9.]+ seconds\nOutput:\n', blocks[0]['text']),
               '정확한 호스트 승인 시간 초과 응답이 아닙니다')
    started, ended = host_time(request), host_time(reply)
    rf_require(started < host_time(yielded) <= prepared < host_time(wait) < ended, '호출·준비·wait 시각 불일치')
    natives = [r for r in records if r.get('type') == 'event_msg'
               and r.get('payload', {}).get('type') == 'item_completed' and r['payload'].get('turn_id') == turn
               and started <= host_time(r) <= ended]
    rf_require(len(natives) == 1, '첫 단계 외에 실행된 명령이 있습니다')
    proof = natives[0]; e = proof['payload']; item = e.get('item', {}); command = item.get('command')
    rf_require(e.get('thread_id') == sid and item.get('type') == 'CommandExecution'
               and item.get('source') == 'unified_exec_startup' and item.get('status') == 'completed'
               and item.get('id') != call_id and type(item.get('exit_code')) is int and item['exit_code'] == 0
               and isinstance(command, list) and len(command) == 3 and command[1] in ('-c', '-lc')
               and command[2] == steps[0][1] and canonical_cwd(item.get('cwd'))
               and started <= e.get('started_at_ms', -1) / 1000
               <= e.get('completed_at_ms', -1) / 1000 <= host_time(proof) <= host_time(yielded)
               and result.get('output') == item.get('stdout', item.get('aggregated_output')),
               '첫 단계 native 종료 증거 불일치')
    for row in records:
        event = row.get('payload', {}); value = event.get('item', {})
        if row.get('type') == 'event_msg' and event.get('type') in ('item_started', 'item_completed'):
            rf_require(value.get('id') != call_id, '시간 초과 대상의 실제 실행 기록이 있습니다')
            if event.get('turn_id') == turn and value.get('id') != item.get('id'):
                rf_require(not started <= event.get('started_at_ms', -1) / 1000 <= ended,
                           '원본 턴의 다른 실행과 모순됩니다')
        if row.get('type') == 'response_item' and turn_of(row) == turn:
            rf_require(not (started <= host_time(row) <= prepared and row != request
                            and event.get('type') in ('custom_tool_call', 'function_call')), '모호한 동시 호출')
    outstanding = [k for k, v in calls.items() if v.get('turn_id') == turn
                   and v.get('transcript_path') == call['transcript_path'] and started <= v.get('prepared_at', -1) < ended]
    rf_require(outstanding == [call_id], '준비된 명령이 유일하지 않습니다')
    return {'outer_call_id': outer, 'cell_id': cell, 'step_index': 1, 'prefix_item_id': item['id'],
            'source_sha256': hashlib.sha256(p['input'].encode()).hexdigest(),
            'records_sha256': rf_digest([request, yielded, proof, wait, reply])}


def approval_timeout_plan(store, sid, root, call_id):
    data = store.get(sid, root); call = data['calls'].get(call_id)
    rf_require(call and not data.get('coverage_problem'), '호출 또는 파일 관찰이 불완전합니다')
    doc = rf_records(call['transcript_path'], sid, root)
    rf_require(doc and doc[0] == sid, '실제 호스트 기록이 필요합니다')
    proof = approval_timeout_evidence(list(doc[2]), sid, call_id, call, data['calls'])
    evidence = {'session': sid, 'root': root, 'call_id': call_id, 'call_sha256': rf_digest(call),
                'file_basis_sha256': rf_digest(observation_basis(data)), 'head': head(root), 'timeout': proof}
    return dict(evidence, source_digest=rf_digest(evidence))


def approve_approval_timeout(store, sid, root, call_id, expected_digest, reason):
    rf_require(expected_digest and reason and reason.strip(), '복구 사유와 plan digest가 필요합니다')
    evidence = approval_timeout_plan(store, sid, root, call_id)
    rf_require(evidence['source_digest'] == expected_digest, '시간 초과 증거가 변경됐습니다')
    with store.transaction():
        data = store.get(sid, root)
        rf_require(rf_digest(data['calls'].get(call_id)) == evidence['call_sha256']
                   and rf_digest(observation_basis(data)) == evidence['file_basis_sha256'] and head(root) == evidence['head'],
                   '검증 중 관찰 상태가 변경됐습니다')
        receipt = {'source': 'host-approval-timeout', 'status': 'not_started', 'exit_code': None,
                   'reason': reason.strip(), 'evidence': evidence, 'recorded_at': time.time(), 'approved_by_session': sid}
        data.setdefault('approval_timeout_resolutions', []).append(receipt)
        data['calls'][call_id]['terminal'] = receipt
        store.save(sid, root, data)
    result = reconcile_calls(store, sid, root, only=call_id)
    return {'status': 'not_started', 'original_exit_code': None, 'completion': 'not-evaluated',
            'pending_calls': list(result['calls']), 'source_digest': evidence['source_digest']}


def patch(installed, candidate):
    for name in ('leading_poll_batch', 'host_records', 'host_time', 'observation_basis', 'reconcile_calls'):
        function(installed, name)
    before = function(installed, 'main')
    anchor = "choices=["
    dispatch = "    if args.action in ('unused-handoff-plan', 'unused-handoff'):"
    if before.count(anchor) != 1 or before.count(dispatch) != 1:
        raise ValueError('Unrecognized CLI layout')
    already = 'def restart_fetch_plan(' in installed
    after = before if already else before.replace(anchor, "choices=['restart-fetch-plan', 'approve-restart-fetch', 'restart-decline-plan', 'approve-restart-decline',", 1)
    if "parser.add_argument('--call-id')" not in after:
        after = after.replace("    parser.add_argument('--session')", "    parser.add_argument('--call-id')\n    parser.add_argument('--session')", 1)
    if not already:
        after = after.replace(dispatch,
        "    if args.action in ('restart-fetch-plan', 'approve-restart-fetch'):\n"
        "        result = restart_fetch_plan(store, sid, root, args.call_id) if args.action == 'restart-fetch-plan' else approve_restart_fetch(store, sid, root, args.call_id, args.expect_source_digest, args.reason)\n"
        "        print(json.dumps(result, ensure_ascii=False))\n        return 0\n" + dispatch, 1)
    if not already:
        after = after.replace(dispatch,
        "    if args.action in ('restart-decline-plan', 'approve-restart-decline'):\n"
        "        result = restart_decline_plan(store, sid, root, args.call_id) if args.action == 'restart-decline-plan' else approve_restart_decline(store, sid, root, args.call_id, args.expect_source_digest, args.reason)\n"
        "        print(json.dumps(result, ensure_ascii=False))\n        return 0\n" + dispatch, 1)
    names = ('rf_require', 'rf_digest', 'rf_source', 'rf_records', 'rf_envelope', 'rf_probe_command',
             'rf_archived_restart', 'rf_restart', 'rf_run', 'rf_verify',
             'restart_fetch_plan', 'approve_restart_fetch', 'rd_evidence', 'restart_decline_plan', 'approve_restart_decline',
             'approval_timeout_evidence', 'approval_timeout_plan', 'approve_approval_timeout')
    present = {n.name for n in ast.parse(installed).body if isinstance(n, ast.FunctionDef)}
    for name in names:
        if name in present and function(installed, name) != function(candidate, name):
            raise ValueError('Conflicting recovery already installed: ' + name)
    missing = [name for name in names if name not in present]
    if not missing:
        raise ValueError('Recovery already installed')
    if already and set(missing) != {'approval_timeout_evidence', 'approval_timeout_plan', 'approve_approval_timeout'}:
        raise ValueError('Partial recovery installation')
    after = after.replace(anchor, "choices=['approval-timeout-plan', 'approve-approval-timeout',", 1)
    after = after.replace(dispatch,
        "    if args.action in ('approval-timeout-plan', 'approve-approval-timeout'):\n"
        "        result = approval_timeout_plan(store, sid, root, args.call_id) if args.action == 'approval-timeout-plan' else approve_approval_timeout(store, sid, root, args.call_id, args.expect_source_digest, args.reason)\n"
        "        print(json.dumps(result, ensure_ascii=False))\n        return 0\n" + dispatch, 1)
    helpers = '\n\n\n'.join(function(candidate, name) for name in missing)
    result = installed.replace(before, helpers + '\n\n\n' + after, 1)
    compile(result, '<restart-fetch-candidate>', 'exec')
    return result


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--gate', type=Path, default=Path.home() / '.codex/hooks/task-finish/gate.py')
    parser.add_argument('--apply', action='store_true'); parser.add_argument('--expect-sha256')
    args = parser.parse_args(); root = Path(__file__).resolve().parents[1]
    candidate = (root / SOURCE_PATH).read_bytes(); original = args.gate.read_bytes()
    updated = patch(original.decode(), candidate.decode()).encode()
    if not args.apply:
        print('Verified update; installed SHA-256: ' + hashlib.sha256(original).hexdigest()); return
    env = {k: v for k, v in os.environ.items() if not k.startswith('GIT_')}
    env.update(GIT_TERMINAL_PROMPT='0', GIT_OPTIONAL_LOCKS='0')
    if candidate != subprocess.check_output(['git', '-C', str(root), 'show', 'HEAD:' + SOURCE_PATH], env=env):
        raise ValueError('Candidate must match committed source')
    print('Applied explicit restart recovery; backup: ' + str(apply_update(args.gate, original, updated, args.expect_sha256)))


if __name__ == '__main__':
    main()
