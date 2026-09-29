#!/usr/bin/env python3
"""Explicit recovery of an aborted, allowlisted source-query batch.

Only marks the original result interrupted/unknown. Does not replay its JS,
relax completion checks, clear holds, or grant arbitrary command recovery.
"""
import argparse
import ast
import hashlib
import importlib.util
import json
from pathlib import Path
import subprocess

SOURCE_PATH = 'tools/task-finish-aborted-source-query.py'


def aq_source():
    # Entire reviewed source is allowlisted, including both commands. This is
    # intentionally narrower than a shell/JavaScript read-only classifier.
    return r'''const q=s=>"'"+s.replace(/'/g,"'\\''")+"'";
const py=`from pathlib import Path
p=Path('/opt/shared-ai/repo/services/dify/.upstream/dify/api/controllers/console/app/workflow.py').read_text().splitlines()
for a,b in [(145,158),(193,200),(630,695),(1305,1341)]:
 print('\\n'.join(p[a-1:b]))
`;
text(await tools.exec_command({cmd:`gcloud compute ssh shared-ai --project=replay-live-508202 --zone=us-central1-a --account=guswhd1085@gmail.com --tunnel-through-iap --command=${q("sudo /opt/shared-ai/venv/bin/python -c "+q(py))}`,sandbox_permissions:"require_escalated",justification:"운영 Dify의 낙관적 잠금과 게시 요청 필드를 고정 소스에서 확인합니다.",yield_time_ms:1000,max_output_tokens:2300}));
text(await tools.exec_command({cmd:"git status --short; git branch --show-current; git rev-parse HEAD @{upstream}; cat docs/SESSION-PROMPTS.md | head -65","max_output_tokens":1200}));
'''


def aq_require(value, message):
    if not value:
        raise GuardError('중단된 소스 조회 복구: ' + message)


def aq_evidence(records, sid, root, call_id, call, calls):
    aq_require(call.get('tool_name') == 'Bash' and not call.get('terminal')
               and call.get('dispatch_checked') is True and call.get('dispatch_version') == 19
               and call.get('actor_thread_id') in (None, sid)
               and call.get('tool_cwd') in (None, root)
               and not call.get('paths') and not call.get('new_paths')
               and not any(v for k, v in call.items() if k == 'dispatch' or k.endswith('_dispatch')),
               '바인딩 없는 v19 읽기 전용 호출만 지원합니다')
    turn, prepared = call.get('turn_id'), call.get('prepared_at')
    aq_require(turn and type(prepared) in (int, float), '턴/준비 시각이 필요합니다')
    candidates = [r for r in records if r.get('type') == 'response_item'
                  and r.get('payload', {}).get('type') == 'custom_tool_call'
                  and r['payload'].get('name') == 'exec'
                  and r['payload'].get('internal_chat_message_metadata_passthrough', {}).get('turn_id') == turn
                  and r['payload'].get('input') == aq_source()
                  and prepared - 60 < host_time(r) <= prepared]
    aq_require(len(candidates) == 1, '검토된 조회 원본이 유일하지 않습니다')
    request = candidates[0]; outer = request['payload'].get('call_id'); started = host_time(request)
    aq_require(outer and len([r for r in records if r.get('type') == 'response_item'
                              and r.get('payload', {}).get('call_id') == outer]) == 1,
               '원본 응답/중복 호출이 존재합니다. 일반 reconcile을 사용하세요')
    aborts = [r for r in records if r.get('type') == 'event_msg'
              and r.get('payload', {}).get('type') == 'turn_aborted'
              and r['payload'].get('turn_id') == turn and r['payload'].get('reason') == 'interrupted'
              and prepared < host_time(r) < prepared + 60]
    aq_require(len(aborts) == 1, '단일 실제 턴 중단 기록이 필요합니다')
    ended = host_time(aborts[0])
    peers = [k for k, v in calls.items() if v.get('turn_id') == turn
             and v.get('transcript_path') == call.get('transcript_path')
             and started <= v.get('prepared_at', -1) <= ended]
    aq_require(peers == [call_id], '원본 구간의 준비 호출이 유일하지 않습니다')
    for r in records:
        p = r.get('payload', {}); item = p.get('item', {})
        if r.get('type') == 'response_item' and r != request:
            if p.get('internal_chat_message_metadata_passthrough', {}).get('turn_id') == turn:
                aq_require(not (started <= host_time(r) <= ended and p.get('type') in
                                ('custom_tool_call', 'function_call')), '다른 도구 호출과 겹칩니다')
        if r.get('type') == 'event_msg' and p.get('type') in ('item_started', 'item_completed'):
            aq_require(item.get('id') != call_id, '대상의 실제 실행 기록이 있습니다')
            if p.get('turn_id') == turn and item.get('type') in ('CommandExecution', 'FileChange'):
                at = p.get('started_at_ms', host_time(r) * 1000) / 1000
                aq_require(not (started <= at <= ended or started <= host_time(r) <= ended),
                           '조회 구간에 실제 실행/파일 변경이 있습니다')
    return {'outer_call_id': outer, 'turn_id': turn, 'started': started, 'prepared': prepared,
            'ended': ended, 'source_sha256': hashlib.sha256(aq_source().encode()).hexdigest(),
            'records_sha256': rf_digest([request, aborts[0]])}


def aq_verify(sid, root, call, proof):
    from contextlib import closing
    import shlex
    home = Path(os.environ.get('CODEX_HOME', Path.home() / '.codex')).resolve()
    aq_require(home == (Path.home() / '.codex').resolve(), '기본 호스트 기록만 지원합니다')
    with closing(sqlite3.connect((home / 'thread_history_1.sqlite').as_uri() + '?mode=ro', uri=True)) as db:
        status = db.execute('SELECT status FROM thread_turns WHERE thread_id=? AND turn_id=?',
                            (sid, call['turn_id'])).fetchall()
    aq_require(status == [('interrupted',)], '호스트 DB가 중단을 확인하지 않습니다')
    aq_require(repository(root) == root and run(root, 'merge-base', '--is-ancestor', call['head'], 'HEAD').returncode == 0,
               '원본 저장소/커밋 연결이 없습니다')
    processes = rf_run(['ps', '-axo', 'pid=,command='], root)
    aq_require(not any('gcloud compute ssh shared-ai' in line and
                       'replay-live-508202' in line and 'workflow.py' in line
                       for line in processes.splitlines()), '같은 서버 조회 프로세스가 실행 중입니다')
    # A fresh equivalent query is independently generated, never eval/exec of
    # historical JS. Python executes only a literal source-file read and hash.
    remote = ("from pathlib import Path; import hashlib; "
              "p=Path('/opt/shared-ai/repo/services/dify/.upstream/dify/api/controllers/console/app/workflow.py'); "
              "data=p.read_bytes(); print(hashlib.sha256(data).hexdigest())")
    output = rf_run(['gcloud', 'compute', 'ssh', 'shared-ai', '--project=replay-live-508202',
                     '--zone=us-central1-a', '--account=guswhd1085@gmail.com', '--tunnel-through-iap',
                     '--command=sudo /opt/shared-ai/venv/bin/python -c ' + shlex.quote(remote)], root)
    aq_require(re.fullmatch(r'[0-9a-f]{64}', output) is not None, '새 소스 조회 검증 실패')
    current = rf_run(['git', 'rev-parse', 'HEAD'], root)
    local = Path(root) / 'docs/SESSION-PROMPTS.md'
    aq_require(local.is_file() and not local.is_symlink(), '로컬 안내 파일이 없습니다')
    return {'host_turn_status': 'interrupted', 'fresh_remote_source_sha256': output,
            'current_head': current, 'local_source_sha256': hashlib.sha256(local.read_bytes()).hexdigest(),
            'original_exit_code': None}


def aborted_source_query_plan(store, sid, root, call_id):
    data = store.get(sid, root); call = data['calls'].get(call_id)
    aq_require(call is not None and not data.get('coverage_problem'), '호출/관찰이 불완전합니다')
    document = rf_records(call['transcript_path'], sid, root)
    aq_require(document and document[0] == sid, '인증된 원본 호스트 기록이 필요합니다')
    proof = aq_evidence(list(document[2]), sid, root, call_id, call, data['calls'])
    verification = aq_verify(sid, root, call, proof)
    evidence = {'session': sid, 'root': root, 'call_id': call_id, 'call_sha256': rf_digest(call),
                'file_basis_sha256': rf_digest(observation_basis(data)), 'head': head(root),
                'original': proof, 'verification': verification}
    return dict(evidence, source_digest=rf_digest(evidence))


def approve_aborted_source_query(store, sid, root, call_id, expected_digest, reason):
    aq_require(expected_digest and reason and reason.strip(), '복구 승인 사유와 plan digest가 필요합니다')
    evidence = aborted_source_query_plan(store, sid, root, call_id)
    aq_require(evidence['source_digest'] == expected_digest, '검증 후 증거가 변경됐습니다')
    with store.transaction():
        data = store.get(sid, root)
        aq_require(rf_digest(data['calls'].get(call_id)) == evidence['call_sha256']
                   and rf_digest(observation_basis(data)) == evidence['file_basis_sha256']
                   and head(root) == evidence['head'], '검증 중 소유/파일/호출/커밋 변경')
        receipt = {'source': 'approved-aborted-source-query', 'status': 'interrupted', 'exit_code': None,
                   'resolution': 'superseded-by-fresh-readonly-verification', 'reason': reason.strip(),
                   'approved_by_session': sid, 'recorded_at': time.time(), 'evidence': evidence}
        data.setdefault('aborted_source_query_resolutions', []).append(receipt)
        data['calls'][call_id]['terminal'] = receipt
        store.save(sid, root, data)
    result = reconcile_calls(store, sid, root, only=call_id)
    return {'status': 'interrupted', 'original_exit_code': None, 'completion': 'not-evaluated',
            'pending_calls': list(result['calls']), 'source_digest': evidence['source_digest']}


def function(source, name):
    nodes = [n for n in ast.parse(source).body if isinstance(n, ast.FunctionDef) and n.name == name]
    if len(nodes) != 1: raise ValueError('Expected one function: ' + name)
    n = nodes[0]
    return '\n'.join(source.splitlines()[n.lineno - 1:n.end_lineno])


def patch(installed, candidate):
    for name in ('rf_records', 'rf_run', 'rf_digest', 'host_time', 'observation_basis', 'reconcile_calls'):
        function(installed, name)
    names = ('aq_source', 'aq_require', 'aq_evidence', 'aq_verify',
             'aborted_source_query_plan', 'approve_aborted_source_query')
    if any('def ' + n + '(' in installed for n in names):
        raise ValueError('Recovery already installed or conflicts')
    before = function(installed, 'main')
    anchor = "    if args.action == 'reconcile':"
    if before.count(anchor) != 1 or before.count('choices=[') != 1:
        raise ValueError('Unrecognized CLI layout')
    after = before.replace('choices=[', "choices=['aborted-source-query-plan', 'approve-aborted-source-query',", 1)
    after = after.replace(anchor,
        "    if args.action in ('aborted-source-query-plan', 'approve-aborted-source-query'):\n"
        "        result = aborted_source_query_plan(store, sid, root, args.call_id) if args.action == 'aborted-source-query-plan' else approve_aborted_source_query(store, sid, root, args.call_id, args.expect_source_digest, args.reason)\n"
        "        print(json.dumps(result, ensure_ascii=False))\n        return 0\n" + anchor, 1)
    helpers = '\n\n\n'.join(function(candidate, name) for name in names)
    result = installed.replace(before, helpers + '\n\n\n' + after, 1)
    compile(result, '<aborted-source-query>', 'exec')
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
    if candidate != subprocess.check_output(['git', '-C', str(root), 'show', 'HEAD:' + SOURCE_PATH]):
        raise ValueError('Candidate must match committed source')
    spec = importlib.util.spec_from_file_location('installer', root / 'tools/task-finish-interruption-recovery.py')
    installer = importlib.util.module_from_spec(spec); spec.loader.exec_module(installer)
    print('Applied; backup: ' + str(installer.apply_update(args.gate, original, updated, args.expect_sha256)))


if __name__ == '__main__':
    main()
