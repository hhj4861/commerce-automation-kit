"""Evidence failures stay pending; recovery never manufactures original success."""
import copy
import ast
import hashlib
import json
import os
from pathlib import Path
import sys
import tempfile
import unittest
from unittest import mock

DIRECTORY = Path(__file__).resolve().parent
sys.path.insert(0, str(DIRECTORY))
import importlib.util
from datetime import datetime, timezone
spec = importlib.util.spec_from_file_location('recovery', DIRECTORY / 'task-finish-interruption-recovery.py')
update = importlib.util.module_from_spec(spec); spec.loader.exec_module(update)

GATE = Path(os.environ.get('TASK_FINISH_GATE', Path.home() / '.codex/hooks/task-finish/gate.py'))
BASE = GATE.read_text()
CANDIDATE = (DIRECTORY / 'task-finish-interruption-recovery.py').read_text()


def guard(source):
    ns = {'__name__': 'isolated_guard', '__file__': str(GATE)}
    exec(compile(source, '<isolated-guard>', 'exec'), ns)
    return ns


class RestartFetchTest(unittest.TestCase):
    def row(self, at, kind, cid, turn, **extra):
        return {'timestamp': datetime.fromtimestamp(self.epoch + at, timezone.utc).isoformat(),
            'type': 'response_item', 'payload': {'type': kind, 'call_id': cid,
                'internal_chat_message_metadata_passthrough': {'turn_id': turn}, **extra}}

    def native(self, at, cid, turn, cmd, cwd, start=None):
        r = self.row(at, 'item_completed', '', turn)
        r['type'] = 'event_msg'
        r['payload'] = {'type': 'item_completed', 'thread_id': self.sid, 'turn_id': turn,
            'started_at_ms': (self.epoch + (at - 0.1 if start is None else start)) * 1000,
            'completed_at_ms': (self.epoch + at) * 1000,
            'item': {'type': 'CommandExecution', 'id': cid, 'status': 'completed', 'exit_code': 0,
                'cwd': cwd, 'command': ['/bin/zsh', '-lc', cmd]}}
        return r

    def setUp(self):
        self.g = guard(update.patch(BASE, CANDIDATE))
        self.sid, self.root, self.path = 'session-a', '/project', Path('/host/session.jsonl')
        self.epoch = 1700000000
        self.source = ('text(await tools.write_stdin({session_id:42,chars:"",yield_time_ms:1000}));'
                       'text(await tools.exec_command({cmd:"git fetch origin main; git status --porcelain; '
                       'git diff --name-only HEAD ' + 'a' * 40 + ' -- apps/project package.json",'
                       'workdir:"/production",login:false}));'
                       'text(await tools.exec_command({cmd:"node /cache/node_modules/wrangler/bin/wrangler.js --version",'
                       'workdir:"/production/apps/project",login:false}));')
        self.call = {'prepared_at': self.epoch + 15, 'transcript_path': str(self.path), 'turn_id': 'turn',
                     'tool_name': 'Bash', 'dispatch_version': 19, 'dispatch_checked': True,
                     'leading_poll_dispatch': {'outer_call_id': 'outer', 'thread_id': self.sid, 'turn_id': 'turn',
                         'transcript_path': str(self.path), 'step_index': 1,
                         'source_sha256': hashlib.sha256(self.source.encode()).hexdigest()}}
        prefix = self.native(8, 'previous', 'turn', 'inspect', '/project', start=7)
        prefix['payload']['item']['process_id'] = '42'
        abort = self.row(18, '', '', '')
        abort.update(type='event_msg', payload={'type': 'turn_aborted', 'turn_id': 'turn', 'reason': 'interrupted'})
        self.rows = [prefix, self.row(10, 'custom_tool_call', 'outer', 'turn', name='exec', input=self.source), abort]
        self.calls = {'inner': self.call}
        self.g['rf_records'] = lambda *args: (self.sid, self.path, self.rows)

    def check(self):
        return self.g['rf_envelope'](self.sid, self.root, 'inner', self.call, self.calls)

    def test_exact_source_and_original_interruption(self):
        link, parsed = self.check()
        self.assertEqual(parsed['commit'], 'a' * 40)
        self.assertEqual(link['binding']['step_index'], 1)
        self.assertNotIn('exit_code', link)

    def test_shell_injection_dynamic_inputs_and_extra_steps_rejected(self):
        for before, after in [('main;', 'main; rm -rf x;'), ('apps/project', '../secret'),
                              ('apps/project', '--output=bad'), ('apps/project', '/absolute'),
                              ('main;', 'main$(touch x);'), ('--version', '--help; touch x'),
                              ('login:false', 'login:true'), ('chars:""', 'chars:"yes"'),
                              ('session_id:42', 'session_id:process'), (' -- apps/project', ' -- :(top)apps/project')]:
            with self.subTest(after=after):
                self.assertIsNone(self.g['rf_source'](self.source.replace(before, after)))
        self.assertIsNone(self.g['rf_source'](self.source + 'text(await tools.exec_command({cmd:"touch x"}));'))
        self.assertIsNone(self.g['rf_source']('x' * 8193))

    def test_wrong_binding_state_and_scope_fail_closed(self):
        original = copy.deepcopy(self.call)
        for key, value in [('terminal', {'exit_code': 0}), ('paths', ['changed.py']), ('new_paths', ['new.py']),
                           ('actor_thread_id', 'other'), ('dispatch_version', 20), ('tool_cwd', '/other'),
                           ('prepared_at', self.epoch + 30), ('batch_dispatch', {'step_index': 1})]:
            self.call.clear(); self.call.update(copy.deepcopy(original)); self.call[key] = value
            with self.subTest(key=key), self.assertRaises(self.g['GuardError']): self.check()
        for key, value in [('source_sha256', 'bad'), ('thread_id', 'other'), ('step_index', 2)]:
            self.call.clear(); self.call.update(copy.deepcopy(original)); self.call['leading_poll_dispatch'][key] = value
            with self.subTest(key=key), self.assertRaises(self.g['GuardError']): self.check()

    def test_response_native_start_and_duplicate_evidence_rejected(self):
        initial = copy.deepcopy(self.rows)
        extra = [self.row(19, 'custom_tool_call_output', 'outer', 'turn', output='done'),
                 self.native(16, 'inner', 'turn', 'fetch', '/production'),
                 self.native(16, 'other', 'turn', 'touch file', '/production', start=15),
                 copy.deepcopy(self.rows[0]), copy.deepcopy(self.rows[-1])]
        for row in extra:
            self.rows[:] = copy.deepcopy(initial) + [row]
            with self.assertRaises(self.g['GuardError']): self.check()
        self.rows[:] = initial
        self.calls['second'] = copy.deepcopy(self.call)
        with self.assertRaises(self.g['GuardError']): self.check()

    def test_missing_failed_and_boolean_prefix_exit_rejected(self):
        for value in [None, 1, True]:
            self.rows[0]['payload']['item']['exit_code'] = value
            with self.assertRaises(self.g['GuardError']): self.check()
        self.rows.pop(0)
        with self.assertRaises(self.g['GuardError']): self.check()

    def test_cli_patch_preserves_all_existing_checks_and_refuses_reinstall(self):
        result = update.patch(BASE, CANDIDATE)
        names = [n.name for n in ast.parse(BASE).body if isinstance(n, ast.FunctionDef) and n.name != 'main']
        for name in names:
            self.assertEqual(update.function(BASE, name), update.function(result, name))
        with self.assertRaises(ValueError): update.patch(result, CANDIDATE)

    def test_real_transcript_index_includes_abort_and_rejects_partial_tail(self):
        g = guard(update.patch(BASE, CANDIDATE))
        with tempfile.TemporaryDirectory() as directory:
            home = Path(directory).resolve(); sessions = home / 'sessions'; sessions.mkdir()
            path = sessions / 'sample.jsonl'
            meta = {'type': 'session_meta', 'payload': {'id': self.sid, 'cwd': self.root}}
            rows = [meta, *self.rows]
            path.write_text(''.join(json.dumps(r) + '\n' for r in rows))
            with mock.patch.dict(g['os'].environ, {'CODEX_HOME': str(home)}):
                result = list(g['rf_records'](str(path), self.sid, self.root)[2])
                self.assertEqual(len(result), 4)
                self.assertEqual(result[-1]['payload']['type'], 'turn_aborted')
                with path.open('a') as out: out.write('{')
                with self.assertRaises(ValueError): g['rf_records'](str(path), self.sid, self.root)

    def archive_fixture(self):
        link, _ = self.check()
        command = self.g['rf_probe_command'](self.sid, 'turn', self.epoch, self.epoch + 30)
        row = self.native(40, 'probe', 'later-turn', command, self.root, start=39)
        row['payload']['item']['source'] = 'unified_exec_startup'
        logs = [(self.epoch + 10, 'host', 'pid:11:aaaa', 'source'),
                (self.epoch + 18, 'codex_core::session::handlers', 'pid:22:bbbb',
                 'thread_id=session-a turn_trigger: Some("daemon_recovery")')]
        row['payload']['item']['stdout'] = 'LOG_SCHEMA []\nRESTART ' + repr(logs) + "\nTURN [('interrupted',)]\n"
        self.g['host_records'] = lambda *args: (self.sid, self.path, [row])
        return link, row

    def test_archive_requires_exact_native_readonly_query(self):
        link, row = self.archive_fixture()
        result = self.g['rf_archived_restart'](self.sid, 'turn', link, self.root)
        self.assertEqual(result['old_host'], 'pid:11:aaaa')
        self.assertEqual(result['archived_native_id'], 'probe')
        original = copy.deepcopy(row)
        for key, value in [('exit_code', True), ('source', 'assistant'), ('status', 'inProgress'), ('cwd', '/other')]:
            row.clear(); row.update(copy.deepcopy(original)); row['payload']['item'][key] = value
            with self.subTest(key=key), self.assertRaises(self.g['GuardError']):
                self.g['rf_archived_restart'](self.sid, 'turn', link, self.root)
        row.clear(); row.update(copy.deepcopy(original))
        row['payload']['item']['command'][2] += '\nprint("fake")'
        with self.assertRaises(self.g['GuardError']): self.g['rf_archived_restart'](self.sid, 'turn', link, self.root)

    def test_archive_missing_ambiguous_or_unrelated_hosts_rejected(self):
        for before, after in [('pid:22:bbbb', 'pid:11:aaaa'), ('thread_id=session-a', 'thread_id=other'),
                              ('interrupted', 'completed'), ('daemon_recovery', 'manual')]:
            link, row = self.archive_fixture()
            row['payload']['item']['stdout'] = row['payload']['item']['stdout'].replace(before, after)
            with self.subTest(before=before), self.assertRaises(self.g['GuardError']):
                self.g['rf_archived_restart'](self.sid, 'turn', link, self.root)
        link, row = self.archive_fixture()
        self.g['host_records'] = lambda *args: (self.sid, self.path, [row, row])
        with self.assertRaises(self.g['GuardError']): self.g['rf_archived_restart'](self.sid, 'turn', link, self.root)

    def test_verification_rejects_active_fetch_dirty_tree_and_wrong_remote(self):
        parsed = self.g['rf_source'](self.source)
        self.g['repository'] = lambda p: p
        self.g['run'] = lambda *a: mock.Mock(returncode=0)
        replies = {'common': '/shared.git', 'ps': '99 python3', 'dirty': '', 'url': 'https://github.com/a/b.git'}
        def run(argv, cwd):
            if argv[0] == 'ps': return replies['ps']
            if argv[1:] == ['rev-parse', '--git-common-dir']: return replies['common']
            if argv[1] == 'status': return replies['dirty']
            if argv[1] == 'remote': return replies['url']
            if argv[1] == 'rev-parse': return 'a' * 40
            if argv[1] == 'ls-remote': return 'a' * 40 + '\trefs/heads/main'
            return ''
        self.g['rf_run'] = run
        self.assertEqual(self.g['rf_verify']('/project', parsed, {'old_host': 'pid:11:aaaa'})['head'], 'a' * 40)
        replies['url'] = 'git@github.com:a/b.git'
        self.assertEqual(self.g['rf_verify']('/project', parsed, {'old_host': 'pid:11:aaaa'})['head'], 'a' * 40)
        for key, value in [('ps', '11 codex'), ('ps', '77 git fetch origin main'), ('dirty', ' M source.py'),
                           ('url', 'https://example.com/repo'), ('url', 'https://token@github.com/a/b')]:
            old = replies[key]; replies[key] = value
            with self.subTest(key=key), self.assertRaises(self.g['GuardError']):
                self.g['rf_verify']('/project', parsed, {'old_host': 'pid:11:aaaa'})
            replies[key] = old

    def test_approve_preserves_hold_ownership_and_uses_unknown_exit(self):
        from contextlib import nullcontext
        data = {'calls': {'inner': copy.deepcopy(self.call)}, 'files': {'mine': {'after': 'blob'}},
                'unknown': {'foreign': 'blob'}, 'hold': 'needs review'}
        class Store:
            def get(s, *args): return copy.deepcopy(data)
            def transaction(s): return nullcontext()
            def save(s, sid, root, value): data.clear(); data.update(copy.deepcopy(value))
        g = self.g
        evidence = {'source_digest': 'digest', 'call_sha256': g['rf_digest'](data['calls']['inner']),
                    'file_basis_sha256': g['rf_digest'](g['observation_basis'](data)), 'head': 'head'}
        g['restart_fetch_plan'] = lambda *args: evidence
        g['head'] = lambda *args: 'head'
        g['reconcile_calls'] = lambda *args, **kw: copy.deepcopy(data)
        with self.assertRaises(g['GuardError']): g['approve_restart_fetch'](Store(), 'session-a', '/project', 'inner', 'bad', 'approved')
        self.assertNotIn('terminal', data['calls']['inner'])
        result = g['approve_restart_fetch'](Store(), 'session-a', '/project', 'inner', 'digest', 'approved')
        self.assertIsNone(result['original_exit_code'])
        self.assertEqual(result['status'], 'interrupted')
        self.assertEqual(data['hold'], 'needs review')
        self.assertEqual(data['unknown'], {'foreign': 'blob'})
        self.assertEqual(data['files'], {'mine': {'after': 'blob'}})


class RestartDeclineTest(unittest.TestCase):
    row = RestartFetchTest.row
    native = RestartFetchTest.native
    check = RestartFetchTest.check

    def setUp(self):
        RestartFetchTest.setUp(self)
        link, _ = self.check()
        evidence = {'session': self.sid, 'root': self.root, 'call_id': 'old-inner',
                    'original': link}
        evidence['source_digest'] = self.g['rf_digest'](evidence)
        self.prior = {'source': 'approved-daemon-interruption', 'status': 'interrupted',
                      'exit_code': None, 'evidence': evidence}
        self.decline = {'prepared_at': self.epoch + 35, 'transcript_path': str(self.path),
                        'turn_id': 'new-turn', 'tool_name': 'Bash', 'dispatch_checked': True,
                        'dispatch_version': 19}
        source = 'text(await tools.exec_command({cmd:"blocked",login:false}));text(await tools.exec_command({cmd:"later",login:false}));'
        self.rejection_rows = [*copy.deepcopy(self.rows),
            self.row(30, 'custom_tool_call', 'rejected-outer', 'new-turn', name='exec', input=source),
            self.row(40, 'custom_tool_call_output', 'rejected-outer', 'new-turn', output=[
                {'type': 'input_text', 'text': 'Script failed\nWall time 10.0 seconds\nOutput:\n'},
                {'type': 'input_text', 'text': 'Script error:\nexec_command failed: CreateProcess { message: "Rejected(\\"This action was rejected due to unacceptable risk.\\")" }'}])]

    def decline_proof(self):
        return self.g['rd_evidence'](self.rejection_rows, self.sid, self.root, 'rejected-inner',
                                    self.decline, {'rejected-inner': self.decline}, self.prior)

    def test_real_refusal_shape_after_interrupted_envelope(self):
        proof = self.decline_proof()
        self.assertEqual(proof['outer_call_id'], 'rejected-outer')
        self.assertEqual(proof['prior_source_digest'], self.prior['evidence']['source_digest'])
        self.assertNotIn('exit_code', proof)

    def test_missing_or_tampered_previous_interruption_rejected(self):
        original = copy.deepcopy(self.prior)
        for key, value in [('source', 'manual'), ('status', 'completed'), ('exit_code', 0)]:
            self.prior = copy.deepcopy(original); self.prior[key] = value
            with self.subTest(key=key), self.assertRaises(self.g['GuardError']): self.decline_proof()
        self.prior = original; self.prior['evidence']['original']['ended'] += 1
        with self.assertRaises(self.g['GuardError']): self.decline_proof()

    def test_forged_script_output_timeout_and_success_rejected(self):
        original = copy.deepcopy(self.rejection_rows)
        for before, after in [('unacceptable risk.', 'deadline.'), ('Script error:', 'printed by shell:'),
                              ('Script failed', 'Script completed'), ('CreateProcess', 'stdout')]:
            self.rejection_rows = copy.deepcopy(original)
            for block in self.rejection_rows[-1]['payload']['output']:
                block['text'] = block['text'].replace(before, after)
            with self.subTest(before=before), self.assertRaises(self.g['GuardError']): self.decline_proof()

    def test_ambiguous_response_and_native_execution_rejected(self):
        original = copy.deepcopy(self.rejection_rows)
        for extra in [copy.deepcopy(original[-1]), self.native(38, 'rejected-inner', 'new-turn', 'blocked', self.root),
                      self.native(38, 'other-inner', 'new-turn', 'unexpected', self.root),
                      self.row(32, 'custom_tool_call', 'other', 'new-turn', name='exec', input='dynamic')]:
            self.rejection_rows = copy.deepcopy(original) + [extra]
            with self.assertRaises(self.g['GuardError']): self.decline_proof()

    def test_wrong_turn_bound_calls_and_changed_source_rejected(self):
        original = copy.deepcopy(self.decline)
        for key, value in [('batch_dispatch', {'step_index': 0}), ('paths', ['mine']),
                           ('dispatch_version', 20), ('turn_id', 'elsewhere')]:
            self.decline = copy.deepcopy(original); self.decline[key] = value
            with self.subTest(key=key), self.assertRaises(self.g['GuardError']): self.decline_proof()
        self.decline = original
        self.rejection_rows[-2]['payload']['input'] += 'unawaited();'
        with self.assertRaises(self.g['GuardError']): self.decline_proof()

    def test_refusal_approval_retains_ownership_hold_and_never_returns_success(self):
        from contextlib import nullcontext
        data = {'calls': {'inner': copy.deepcopy(self.decline)}, 'files': {'mine': {'edited': True}},
                'unknown': {'foreign': 'digest'}, 'hold': 'unrelated hold'}
        class Store:
            def get(s, *args): return copy.deepcopy(data)
            def transaction(s): return nullcontext()
            def save(s, sid, root, value): data.clear(); data.update(copy.deepcopy(value))
        g = self.g
        evidence = {'source_digest': 'digest', 'call_sha256': g['rf_digest'](data['calls']['inner']),
                    'file_basis_sha256': g['rf_digest'](g['observation_basis'](data)), 'head': 'head'}
        g['restart_decline_plan'] = lambda *args: evidence
        g['head'] = lambda *args: 'head'
        g['reconcile_calls'] = lambda *args, **kw: copy.deepcopy(data)
        with self.assertRaises(g['GuardError']):
            g['approve_restart_decline'](Store(), 'session-a', '/project', 'inner', 'stale', 'verified')
        self.assertNotIn('terminal', data['calls']['inner'])
        result = g['approve_restart_decline'](Store(), 'session-a', '/project', 'inner', 'digest', 'verified')
        self.assertEqual(result['status'], 'declined'); self.assertIsNone(result['original_exit_code'])
        self.assertEqual(data['files'], {'mine': {'edited': True}})
        self.assertEqual(data['unknown'], {'foreign': 'digest'})
        self.assertEqual(data['hold'], 'unrelated hold')


class InstallerTest(unittest.TestCase):
    def test_digest_required_backup_and_atomic_install(self):
        with tempfile.TemporaryDirectory() as directory:
            gate = Path(directory) / 'gate.py'; original = b'original'; gate.write_bytes(original)
            with self.assertRaises(ValueError): update.apply_update(gate, original, b'new', 'incorrect')
            self.assertEqual(gate.read_bytes(), original)
            backup = update.apply_update(gate, original, b'new', hashlib.sha256(original).hexdigest())
            self.assertEqual(backup.read_bytes(), original); self.assertEqual(gate.read_bytes(), b'new')

    def test_changed_installed_hook_is_preserved(self):
        with tempfile.TemporaryDirectory() as directory:
            gate = Path(directory) / 'gate.py'; gate.write_bytes(b'changed')
            with self.assertRaises(ValueError):
                update.apply_update(gate, b'original', b'new', hashlib.sha256(b'original').hexdigest())
            self.assertEqual(gate.read_bytes(), b'changed')


if __name__ == '__main__': unittest.main()
