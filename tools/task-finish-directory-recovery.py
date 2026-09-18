#!/usr/bin/env python3
"""User-approved path-registration repair; never edits the state database directly."""
import argparse
from datetime import datetime, timezone
from pathlib import Path
import shutil

OLD = "            known_before = {path: view.value(path) for path in data['files']}"
NEW = """            known_before = {}
            for path in data['files']:
                try:
                    known_before[path] = view.value(path)
                except GuardError as error:
                    # Recovery stays usable; Stop still rejects incomplete coverage.
                    known_before[path] = 'unsupported'
                    data['coverage_problem'] = str(error)"""
FUNCTION = '''def cancel_empty_track(store, sid, root, paths, reason):
    """Cancel only an unused absent-file registration; retain its audit record."""
    if not paths or not reason or not reason.strip():
        raise GuardError('취소할 빈 파일 경로와 사유가 필요합니다')
    with store.transaction():
        data = store.get(sid, root)
        for path in paths:
            record = data['files'].get(path)
            if (not record or not record.get('registered')
                    or any(record.get(k) is not None for k in ('before', 'after', 'original_head'))
                    or blob(root, path) is not None
                    or (data.get('base') and blob(root, path, data['base']) is not None)
                    or path in data['unknown']
                    or any(call.get('known_before', {}).get(path) is not None
                           for call in data['calls'].values())):
                raise GuardError('실제 변경 또는 파일이 있는 등록은 취소할 수 없습니다: ' + path)
        for path in paths:
            data.setdefault('cancelled_empty_registrations', []).append({
                'path': path, 'record': data['files'].pop(path),
                'reason': reason.strip(), 'recorded_at': time.time(),
            })
        data['status'] = 'unfinished'
        store.save(sid, root, data)
    return {'status': 'unfinished', 'cancelled_empty_paths': paths}


'''

def patch(source):
    if 'def cancel_empty_track(' in source:
        if NEW not in source:
            raise ValueError('Partial repair; inspect manually')
        return source
    if source.count(OLD) != 1:
        raise ValueError('Unexpected hook version; no changes applied')
    source = source.replace(OLD, NEW)
    source = source.replace('def main():\n', FUNCTION + 'def main():\n')
    source = source.replace("choices=['hook', 'status', 'track', 'exclude', 'hold', 'reconcile', 'handoff-plan', 'handoff']", "choices=['hook', 'status', 'track', 'exclude', 'hold', 'reconcile', 'handoff-plan', 'handoff', 'cancel-empty-track']")
    marker = "    if args.action in ('handoff-plan', 'handoff'):"
    source = source.replace(marker, """    if args.action == 'cancel-empty-track':
        paths = sorted({relpath(root, value, os.getcwd()) for value in args.path}, key=lambda p: p or '')
        if None in paths:
            raise GuardError('저장소 내부 파일 경로가 필요합니다')
        print(json.dumps(cancel_empty_track(store, sid, root, paths, args.reason), ensure_ascii=False))
        return 0
""" + marker)
    compile(source, '<repaired-task-finish>', 'exec')
    return source

if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--apply', action='store_true')
    parser.add_argument('--gate', type=Path, default=Path.home()/'.codex/hooks/task-finish/gate.py')
    args = parser.parse_args()
    original = args.gate.read_text()
    updated = patch(original)
    if args.apply and updated != original:
        backup = args.gate.parent/'backups'/('directory-registration-'+datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%S%fZ')+'.py')
        backup.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(args.gate, backup)
        temporary = args.gate.with_suffix('.recovery.tmp')
        temporary.write_text(updated)
        temporary.chmod(args.gate.stat().st_mode & 0o777)
        temporary.replace(args.gate)
        print('Applied; original preserved:', backup)
    else:
        print('Already repaired' if updated == original else 'Patch validates; not applied')
