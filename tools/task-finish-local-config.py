#!/usr/bin/env python3
"""Install an explicitly approved, hash-bound local .env receipt in task-finish."""
import argparse
from datetime import datetime, timezone
import hashlib
from pathlib import Path
import re
import shutil

MARKER = '# task-finish: explicit local config receipts v1'
FUNCTIONS = '''# task-finish: explicit local config receipts v1
def local_config_fingerprint(data, root, path):
    """Never read values into the receipt; recheck Git, ownership and raw bytes."""
    record = data['files'].get(path)
    if (not record or not record.get('registered') or not record.get('edited')
            or record.get('original_head') is not None or record.get('worktree')
            or path in data['unknown']):
        raise GuardError('본인 소유의 미추적 로컬 설정만 승인할 수 있습니다: ' + path)
    target = Path(root) / path
    if (relpath(root, path, root) != path or target.resolve() != target
            or not re.fullmatch(r'\\.env(?:\\.(?:local|development|test|staging|production)(?:\\.local)?)?', target.name)
            or target.name.lower().endswith(('.example', '.sample', '.template', '.dist'))):
        raise GuardError('일반 .env 로컬 설정 파일만 승인할 수 있습니다: ' + path)
    info = target.lstat()
    if not stat.S_ISREG(info.st_mode) or stat.S_IMODE(info.st_mode) != 0o600 or info.st_nlink != 1:
        raise GuardError('단일 일반 파일과 0600 권한이 필요합니다: ' + path)
    if (run(root, 'ls-files', '--error-unmatch', '--', path, required=False).returncode == 0
            or blob(root, path, head(root)) is not None
            or (data.get('base') and blob(root, path, data['base']) is not None)
            or run(root, 'check-ignore', '-q', '--', path, required=False).returncode != 0):
        raise GuardError('Git에 등록되지 않고 ignore된 설정만 승인할 수 있습니다: ' + path)
    observed = blob(root, path)
    if not observed or observed != record.get('after'):
        raise GuardError('파일 변경 관찰을 먼저 완료하세요: ' + path)
    digest = hashlib.sha256(target.read_bytes()).hexdigest()
    final = target.lstat()
    identity = lambda s: (s.st_dev, s.st_ino, s.st_mode, s.st_nlink, s.st_size, s.st_mtime_ns, s.st_ctime_ns)
    if identity(info) != identity(final):
        raise GuardError('검증 중 로컬 설정이 변경됐습니다: ' + path)
    return {'root': root, 'path': path, 'blob': observed, 'sha256': digest,
            'mode': stat.S_IMODE(info.st_mode), 'base': data.get('base'),
            'branch': data['branch'], 'record': copy.deepcopy(record)}


def local_config_plan(store, sid, root, paths):
    if not paths:
        raise GuardError('승인할 파일 경로가 필요합니다')
    data = store.get(sid, root)
    if data.get('coverage_problem') or pending_path_owner(data, paths):
        raise GuardError('파일 관찰과 해당 파일의 도구 종료를 먼저 확인하세요')
    if branch(root) != data['branch']:
        raise GuardError('기존 작업 브랜치에서 승인해야 합니다')
    records = {}
    for path in paths:
        if active_owner(store, sid, root, path):
            raise GuardError('다른 세션의 소유권과 겹칩니다: ' + path)
        records[path] = local_config_fingerprint(data, root, path)
    evidence = {'session': sid, 'root': root, 'records': records}
    return dict(evidence, source_digest=hashlib.sha256(json.dumps(evidence, sort_keys=True).encode()).hexdigest())


def approve_local_config(store, sid, root, paths, expected_digest, reason):
    if not expected_digest or not reason or not reason.strip():
        raise GuardError('사용자 명시 승인 사유와 사전 확인한 source digest가 필요합니다')
    with store.transaction():
        evidence = local_config_plan(store, sid, root, paths)
        if evidence['source_digest'] != expected_digest:
            raise GuardError('사전 확인 이후 로컬 설정 또는 소유 기록이 변경됐습니다')
        data = store.get(sid, root)
        data.setdefault('local_config_approvals', []).append(dict(
            evidence, reason=reason.strip(), recorded_at=time.time()))
        # Retain files, calls, unknown paths and hold. Only normal Stop can finish.
        store.save(sid, root, data)
    return {'status': 'local-config-approved', 'completion': 'not-evaluated',
            'paths': paths, 'source_digest': evidence['source_digest']}


def approved_local_config(data, root, path):
    for receipt in reversed(data.get('local_config_approvals', [])):
        if receipt.get('root') != root or path not in receipt.get('records', {}):
            continue
        if not receipt.get('reason') or not receipt.get('session') or not receipt.get('recorded_at'):
            return False
        evidence = {key: receipt.get(key) for key in ('session', 'root', 'records')}
        if hashlib.sha256(json.dumps(evidence, sort_keys=True).encode()).hexdigest() != receipt.get('source_digest'):
            return False
        try:
            return local_config_fingerprint(data, root, path) == receipt['records'][path]
        except (GuardError, OSError):
            return False
    return False


'''

CLI = '''    if args.action in ('local-config-plan', 'approve-local-config'):
        paths = sorted({relpath(root, value, os.getcwd()) for value in args.path}, key=lambda p: p or '')
        if None in paths:
            raise GuardError('저장소 내부 파일 경로가 필요합니다')
        if args.action == 'local-config-plan':
            result = local_config_plan(store, sid, root, paths)
        else:
            result = approve_local_config(store, sid, root, paths, args.expect_source_digest, args.reason)
        print(json.dumps(result, ensure_ascii=False))
        return 0
'''


def patch(source):
    if MARKER in source:
        if FUNCTIONS not in source or CLI not in source:
            raise ValueError('Partial or changed local-config implementation; inspect manually')
        return source
    replacements = {
        'def check(data, root):\n': FUNCTIONS + 'def check(data, root):\n',
        "        expected = record['after']\n        if expected == original:\n":
        "        expected = record['after']\n        if approved_local_config(data, root, path):\n            continue\n        if expected == original:\n",
        "    if args.action == 'cancel-empty-track':\n": CLI + "    if args.action == 'cancel-empty-track':\n",
        "'excluded', 'hold', 'coverage_problem')}": "'excluded', 'hold', 'coverage_problem', 'local_config_approvals')}",
        "('base', 'branch', 'files', 'unknown', 'hold', 'coverage_problem')}":
        "('base', 'branch', 'files', 'unknown', 'hold', 'coverage_problem', 'local_config_approvals')}",
    }
    for old, new in replacements.items():
        if source.count(old) != 1:
            raise ValueError('Unexpected hook version; no changes applied')
        source = source.replace(old, new)
    source, count = re.subn(r"(parser.add_argument\('action', choices=\[)([^\n]+)(\]\))",
                          r"\1\2, 'local-config-plan', 'approve-local-config'\3", source)
    if count != 1:
        raise ValueError('Unexpected command parser; no changes applied')
    compile(source, '<local-config-task-finish>', 'exec')
    return source


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--gate', type=Path, default=Path.home()/'.codex/hooks/task-finish/gate.py')
    parser.add_argument('--apply', action='store_true')
    parser.add_argument('--expect-sha256')
    args = parser.parse_args()
    original = args.gate.read_bytes()
    digest = hashlib.sha256(original).hexdigest()
    updated = patch(original.decode()).encode()
    if not args.apply:
        print('Patch validated; installed source SHA-256:', digest)
        return
    if not args.expect_sha256 or args.expect_sha256 != digest:
        raise ValueError('Expected installed-source SHA-256 required; revalidate before applying')
    if updated == original:
        print('Already installed; no changes')
        return
    backup = args.gate.parent/'backups'/('local-config-'+datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%S%fZ')+'.py')
    backup.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(args.gate, backup)
    temporary = args.gate.with_name('.local-config-'+digest+'.tmp')
    try:
        with temporary.open('xb') as f:
            f.write(updated)
        temporary.chmod(args.gate.stat().st_mode & 0o777)
        if args.gate.read_bytes() != original or backup.read_bytes() != original:
            raise ValueError('Hook changed during installation; no replacement applied')
        temporary.replace(args.gate)
    finally:
        temporary.unlink(missing_ok=True)
    print('Applied; original preserved:', backup)


if __name__ == '__main__':
    main()
