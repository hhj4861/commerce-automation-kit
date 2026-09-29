"""Fail-closed interruption receipts; no original success or skipped gates."""
import ast
import copy
from datetime import datetime, timezone
import hashlib
import importlib.util
import os
from pathlib import Path
import tempfile
import unittest
from unittest import mock
from contextlib import nullcontext
from types import SimpleNamespace

HERE = Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location('update', HERE / 'task-finish-aborted-source-query.py')
update = importlib.util.module_from_spec(spec); spec.loader.exec_module(update)
GATE = Path(os.environ.get('TASK_FINISH_GATE', Path.home() / '.codex/hooks/task-finish/gate.py'))
BASE = GATE.read_text(); CANDIDATE = (HERE / 'task-finish-aborted-source-query.py').read_text()


def guard():
    ns = {'__name__': 'isolated_guard', '__file__': str(GATE)}
    exec(compile(update.patch(BASE, CANDIDATE), '<candidate>', 'exec'), ns)
    return ns


class AbortedQueryTests(unittest.TestCase):
    def row(self, at, kind, **fields):
        return {'timestamp': datetime.fromtimestamp(1700000000 + at, timezone.utc).isoformat(),
                'type': kind, 'payload': fields}

    def setUp(self):
        self.g = guard(); self.sid = 'sid'; self.root = '/project'; self.cid = 'inner'
        self.call = {'tool_name': 'Bash', 'dispatch_checked': True, 'dispatch_version': 19,
                     'prepared_at': 1700000015, 'turn_id': 'turn', 'transcript_path': '/host/session.jsonl',
                     'head': 'a' * 40}
        self.calls = {self.cid: self.call}
        self.request = self.row(10, 'response_item', type='custom_tool_call', name='exec',
                                call_id='outer', input=self.g['aq_source'](),
                                internal_chat_message_metadata_passthrough={'turn_id': 'turn'})
        self.abort = self.row(20, 'event_msg', type='turn_aborted', turn_id='turn', reason='interrupted')
        self.rows = [self.request, self.abort]

    def check(self):
        return self.g['aq_evidence'](self.rows, self.sid, self.root, self.cid, self.call, self.calls)

    def test_exact_readonly_batch_and_real_abort(self):
        evidence = self.check()
        self.assertEqual(evidence['outer_call_id'], 'outer')
        self.assertNotIn('exit_code', evidence)
        self.assertEqual(evidence['ended'], 1700000020)

    def test_any_source_change_injection_or_extra_command_rejected(self):
        source = self.request['payload']['input']
        for old, new in [('read_text()', 'write_text("bad")'), ('git status --short', 'git reset --hard'),
                         ('shared-ai --project=', 'other --project='), ('workflow.py', 'passwords'),
                         ('q(py)', 'q(other)'), ('const q=', 'evil();const q=')]:
            self.request['payload']['input'] = source.replace(old, new)
            with self.subTest(new=new), self.assertRaises(self.g['GuardError']): self.check()
        self.request['payload']['input'] = source + 'text(await tools.exec_command({cmd:"touch x"}));'
        with self.assertRaises(self.g['GuardError']): self.check()

    def test_missing_duplicate_wrong_or_late_abort(self):
        cases = [[self.request], [self.request, self.abort, self.abort],
                 [self.request, self.row(20, 'event_msg', type='turn_aborted', turn_id='other', reason='interrupted')],
                 [self.request, self.row(90, 'event_msg', type='turn_aborted', turn_id='turn', reason='interrupted')],
                 [self.request, self.row(20, 'event_msg', type='turn_aborted', turn_id='turn', reason='success')]]
        for rows in cases:
            self.rows = rows
            with self.assertRaises(self.g['GuardError']): self.check()

    def test_original_response_requires_normal_reconciliation(self):
        self.rows.append(self.row(21, 'response_item', type='custom_tool_call_output', call_id='outer', output='done'))
        with self.assertRaises(self.g['GuardError']): self.check()

    def test_wrong_call_metadata_and_existing_binding_rejected(self):
        original = copy.deepcopy(self.call)
        for key, value in [('tool_name', 'apply_patch'), ('terminal', {'status': 'completed'}),
                           ('paths', ['x']), ('new_paths', ['x']), ('actor_thread_id', 'other'),
                           ('tool_cwd', '/other'), ('dispatch', {'outer_call_id': 'outer'}),
                           ('dispatch_version', 20), ('prepared_at', 1700000030)]:
            self.call.clear(); self.call.update(copy.deepcopy(original)); self.call[key] = value
            with self.subTest(key=key), self.assertRaises(self.g['GuardError']): self.check()

    def test_duplicate_preparation_or_concurrent_tool_rejected(self):
        self.calls['second'] = copy.deepcopy(self.call)
        with self.assertRaises(self.g['GuardError']): self.check()
        del self.calls['second']
        extra = copy.deepcopy(self.request); extra['payload']['call_id'] = 'other'; extra['payload']['input'] = 'anything'
        self.rows.append(extra)
        with self.assertRaises(self.g['GuardError']): self.check()

    def test_actual_execution_including_late_terminal_rejected(self):
        for kind in ('item_started', 'item_completed'):
            for item_type, ident, at in [('CommandExecution', 'inner', 30), ('FileChange', 'other', 16),
                                         ('CommandExecution', 'other', 16)]:
                self.rows = [self.request, self.abort, self.row(at, 'event_msg', type=kind, turn_id='turn',
                    item={'type': item_type, 'id': ident}, started_at_ms=(1700000000 + at) * 1000)]
                with self.subTest(kind=kind, item_type=item_type), self.assertRaises(self.g['GuardError']): self.check()

    def test_patch_preserves_every_existing_function_except_cli(self):
        patched = update.patch(BASE, CANDIDATE)
        for node in ast.parse(BASE).body:
            if isinstance(node, ast.FunctionDef) and node.name != 'main':
                self.assertEqual(update.function(BASE, node.name), update.function(patched, node.name), node.name)
        with self.assertRaises(ValueError): update.patch(patched, CANDIDATE)

    def test_receipt_preserves_unrelated_state_and_unknown_exit(self):
        data = {'calls': copy.deepcopy(self.calls), 'files': {'own': {'edited': True}},
                'unknown': {'other': {}}, 'hold': 'pending external work'}
        class Store:
            def get(self, *args): return copy.deepcopy(data)
            def transaction(self): return nullcontext()
            def save(self, sid, root, value): data.clear(); data.update(copy.deepcopy(value))
        evidence = {'source_digest': 'approved', 'call_sha256': self.g['rf_digest'](data['calls'][self.cid]),
                    'file_basis_sha256': self.g['rf_digest'](self.g['observation_basis'](data)), 'head': 'h'}
        self.g['aborted_source_query_plan'] = lambda *a: evidence
        self.g['head'] = lambda *a: 'h'
        reconcile = mock.Mock(return_value=data); self.g['reconcile_calls'] = reconcile
        result = self.g['approve_aborted_source_query'](Store(), self.sid, self.root, self.cid, 'approved', 'user approved recovery')
        self.assertEqual(result['status'], 'interrupted'); self.assertIsNone(result['original_exit_code'])
        self.assertEqual(result['completion'], 'not-evaluated')
        self.assertEqual(data['hold'], 'pending external work'); self.assertIn('other', data['unknown'])
        self.assertEqual(data['files'], {'own': {'edited': True}})
        self.assertIsNone(data['calls'][self.cid]['terminal']['exit_code'])
        reconcile.assert_called_once_with(mock.ANY, self.sid, self.root, only=self.cid)

    def test_stale_plan_cannot_write_receipt(self):
        store = mock.Mock(); self.g['aborted_source_query_plan'] = lambda *a: {'source_digest': 'changed'}
        with self.assertRaises(self.g['GuardError']):
            self.g['approve_aborted_source_query'](store, self.sid, self.root, self.cid, 'old', 'reason')
        store.save.assert_not_called()

    def test_concurrent_observation_change_cannot_write_receipt(self):
        data = {'calls': copy.deepcopy(self.calls), 'files': {}}
        evidence = {'source_digest': 'ok', 'call_sha256': self.g['rf_digest'](self.call),
                    'file_basis_sha256': self.g['rf_digest'](self.g['observation_basis'](data)), 'head': 'h'}
        data['files']['other'] = {'edited': True}
        store = mock.Mock(); store.get.return_value = data; store.transaction.return_value = nullcontext()
        self.g['aborted_source_query_plan'] = lambda *a: evidence; self.g['head'] = lambda *a: 'h'
        with self.assertRaises(self.g['GuardError']):
            self.g['approve_aborted_source_query'](store, self.sid, self.root, self.cid, 'ok', 'reason')
        store.save.assert_not_called()

    def test_plan_rejects_wrong_host_and_incomplete_observation(self):
        store = mock.Mock(); store.get.return_value = {'calls': self.calls, 'coverage_problem': 'missing'}
        with self.assertRaises(self.g['GuardError']): self.g['aborted_source_query_plan'](store, self.sid, self.root, self.cid)
        store.get.return_value = {'calls': self.calls}
        self.g['rf_records'] = lambda *a: ('other', Path('/host/session.jsonl'), self.rows)
        with self.assertRaises(self.g['GuardError']): self.g['aborted_source_query_plan'](store, self.sid, self.root, self.cid)

    def test_fresh_verification_requires_host_interruption_and_no_active_query(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory); (root / 'docs').mkdir(); (root / 'docs/SESSION-PROMPTS.md').write_text('local')
            self.g['repository'] = lambda r: r; self.g['run'] = lambda *a: SimpleNamespace(returncode=0)
            database = mock.Mock(); database.execute.return_value.fetchall.return_value = [('interrupted',)]
            commands = []
            def run(argv, cwd):
                commands.append(argv)
                return '' if argv[0] == 'ps' else ('a' * 64 if argv[0] == 'gcloud' else 'b' * 40)
            self.g['rf_run'] = run
            with mock.patch.object(self.g['sqlite3'], 'connect', return_value=database):
                result = self.g['aq_verify'](self.sid, str(root), self.call, {})
                self.assertEqual(result['fresh_remote_source_sha256'], 'a' * 64)
                self.assertIn('mode=ro', self.g['sqlite3'].connect.call_args.args[0])
                self.assertTrue(any(a[0] == 'gcloud' and 'read_bytes()' in a[-1] for a in commands))
                database.execute.return_value.fetchall.return_value = [('completed',)]
                with self.assertRaises(self.g['GuardError']): self.g['aq_verify'](self.sid, str(root), self.call, {})
                database.execute.return_value.fetchall.return_value = [('interrupted',)]
                self.g['rf_run'] = lambda *a: '1 gcloud compute ssh shared-ai --project=replay-live-508202 workflow.py'
                with self.assertRaises(self.g['GuardError']): self.g['aq_verify'](self.sid, str(root), self.call, {})


if __name__ == '__main__': unittest.main()
