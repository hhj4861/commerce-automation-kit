#!/usr/bin/env python3
"""Explicit cancellation of the single user-abandoned Honam debug patch.

Archives unknown original outcome. Never invents an execution receipt, clears
ownership, certifies completion, or changes hook configuration/trust.
"""
import argparse
import copy
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import subprocess
import sys
import stat
import time

ROOT = '/Users/admin/workSpace/commerce-automation-kit'
SESSION = '01a0b3ac-df1b-7293-a99c-74f3c6e650d0'
CALL = 'exec-7637494a-d410-4a49-ac90-0c920609cb95'
TURN = '01a0ec3f-8a89-71e3-b1c7-9934f9870585'
OUTER = 'call_1eMXLBrycU0iYtS31Aj3U3c5'
SOURCE_SHA = 'a07565732283b3037f41ddd90ff071c64532b745db53e477e2ab343b53252d43'
TARGET = 'docs/videos/20260929-honam-datacenter/produce.mjs'
BLOB = '100644:04a90e4d287cd67bda9a218ed0399551e580dc01'
SOURCE_PATH = 'tools/task-finish-cancel-orphan.py'


def require(value, message):
    if not value:
        raise ValueError(message)


def digest(value):
    return hashlib.sha256(json.dumps(value, sort_keys=True).encode()).hexdigest()


def validate_call(call):
    require(isinstance(call, dict) and not call.get('terminal'), 'Original unresolved call is required')
    require(call.get('tool_name') == 'apply_patch' and call.get('turn_id') == TURN
            and call.get('paths') == [TARGET] and call.get('new_paths') == []
            and call.get('actor_thread_id') in (None, SESSION), 'Unsupported cancellation scope')
    binding = call.get('batch_dispatch', {})
    require(binding.get('outer_call_id') == OUTER and binding.get('thread_id') == SESSION
            and binding.get('turn_id') == TURN and binding.get('step_index') == 0
            and binding.get('source_sha256') == SOURCE_SHA, 'Original binding differs')
    require(call.get('known_before', {}).get(TARGET) == BLOB
            and call.get('snapshot', {}).get(TARGET) == BLOB, 'Original file observation differs')


def validate_current(gate, store, data, expected_head=None):
    require(gate.repository(ROOT) == ROOT, 'Repository moved')
    if expected_head:
        require(gate.head(ROOT) == expected_head, 'HEAD changed after plan')
    require(not data.get('coverage_problem') and TARGET not in data['unknown'], 'Unresolved target ownership or coverage')
    require(not gate.active_owner(store, SESSION, ROOT, TARGET), 'Another session owns target')
    require(gate.blob(ROOT, TARGET) == BLOB and gate.blob(ROOT, TARGET, gate.head(ROOT)) == BLOB,
            'Target differs from the pre-call observation or committed file')


def original_request(gate, call):
    # Cancellation needs the authenticated request, not a claim about its missing
    # outcome. Validate the historical prefix twice; an appended live tail is OK.
    sessions = Path.home() / '.codex/sessions'
    candidate = Path(call['transcript_path'])
    resolved = candidate.resolve(strict=True)
    require(not sessions.is_symlink() and resolved.is_relative_to(sessions.resolve())
            and not candidate.is_symlink()
            and not any(p.is_symlink() for p in candidate.parents if p.is_relative_to(sessions)),
            'Transcript path is not a regular host session path')
    with resolved.open('rb') as stream:
        info = os.fstat(stream.fileno())
        require(stat.S_ISREG(info.st_mode), 'Regular transcript required')
        rows = gate.transcript_records(stream)
        raw, first = next(rows)
        meta = first.get('payload', {})
        require(first.get('type') == 'session_meta' and meta.get('id') == SESSION
                and (gate.session_repository_matches(meta.get('cwd'), ROOT)
                     or gate.relocated_repository_matches(meta, ROOT)), 'Session metadata differs')
        prefix = hashlib.sha256(raw)
        length = len(raw)
        request = None
        for raw, row in rows:
            prefix.update(raw)
            length += len(raw)
            payload = row.get('payload', {})
            if row.get('type') == 'response_item' and payload.get('call_id') == OUTER:
                require(payload.get('internal_chat_message_metadata_passthrough', {}).get('turn_id') == TURN,
                        'Request turn differs')
                request = payload
                break
        require(request is not None, 'Original request is missing')
        stream.seek(0)
        second = hashlib.sha256()
        remaining = length
        while remaining:
            chunk = stream.read(min(remaining, 1024 * 1024))
            require(chunk, 'Transcript was truncated')
            second.update(chunk)
            remaining -= len(chunk)
        after = resolved.stat()
        require((info.st_dev, info.st_ino) == (after.st_dev, after.st_ino)
                and second.digest() == prefix.digest(), 'Historical prefix changed')
        return request


def plan(gate, store):
    data = store.get(SESSION, ROOT)
    call = data['calls'].get(CALL)
    validate_call(call)
    validate_current(gate, store, data)
    payload = original_request(gate, call)
    require(payload.get('type') == 'custom_tool_call' and payload.get('name') == 'exec'
            and hashlib.sha256(payload.get('input', '').encode()).hexdigest() == SOURCE_SHA,
            'Original source differs')
    commit = gate.git(ROOT, 'log', '-1', '--format=%H', '--', TARGET).strip()
    require(commit and gate.blob(ROOT, TARGET, commit) == BLOB, 'Committed target is not verified')
    error = gate.remote_contains(ROOT, {commit})
    require(not error, error or 'Target commit is not on upstream')
    evidence = {'session': SESSION, 'root': ROOT, 'call_id': CALL, 'call_sha256': digest(call),
                'head': gate.head(ROOT), 'target': TARGET, 'target_blob': BLOB,
                'target_commit': commit, 'original_outcome': 'unknown', 'action': 'user-cancelled'}
    return dict(evidence, source_digest=digest(evidence))


def cancel(gate, store, expected, reason):
    require(expected and reason and reason.strip(), 'Explicit cancellation reason and reviewed plan digest required')
    evidence = plan(gate, store)
    require(evidence['source_digest'] == expected, 'Cancellation plan changed')
    with store.transaction():
        data = store.get(SESSION, ROOT)
        call = data['calls'].get(CALL)
        validate_call(call)
        require(digest(call) == evidence['call_sha256'], 'Call changed after plan')
        validate_current(gate, store, data, evidence['head'])
        require(CALL not in data.get('cancelled_calls', {}), 'Cancellation already archived')
        # A cancellation is a new user decision, not evidence of original success.
        data.setdefault('cancelled_calls', {})[CALL] = {
            'status': 'user-cancelled', 'original_outcome': 'unknown',
            'reason': reason.strip(), 'cancelled_at': time.time(),
            'original_call': copy.deepcopy(call), 'evidence': evidence}
        del data['calls'][CALL]
        # Preserve files, unknown paths, holds, other calls and unfinished status.
        store.save(SESSION, ROOT, data)
    return {'status': 'user-cancelled', 'call_id': CALL, 'original_outcome': 'unknown',
            'archive': 'cancelled_calls', 'completion': 'not-evaluated'}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--apply', action='store_true')
    parser.add_argument('--expect-source-digest')
    parser.add_argument('--reason')
    args = parser.parse_args()
    if args.apply:
        repo = Path(__file__).resolve().parents[1]
        env = {k: v for k, v in os.environ.items() if not k.startswith('GIT_')}
        env.update(GIT_OPTIONAL_LOCKS='0', GIT_TERMINAL_PROMPT='0')
        require(Path(__file__).read_bytes() == subprocess.check_output(
            ['git', '-C', str(repo), 'show', 'HEAD:' + SOURCE_PATH], env=env), 'Commit reviewed source before apply')
    path = Path.home() / '.codex/hooks/task-finish/gate.py'
    sys.path.insert(0, str(path.parent))
    spec = importlib.util.spec_from_file_location('installed_gate', path)
    gate = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(gate)
    store = gate.Store(Path.home() / '.codex/state/task-finish')
    try:
        result = cancel(gate, store, args.expect_source_digest, args.reason) if args.apply else plan(gate, store)
        print(json.dumps(result, ensure_ascii=False))
    finally:
        store.db.close()


if __name__ == '__main__':
    main()
