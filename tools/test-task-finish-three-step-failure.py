import copy
from datetime import datetime, timezone
import importlib.util
import json
from pathlib import Path
import types
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('repair', Path(__file__).with_name('task-finish-three-step-failure.py'))
repair = importlib.util.module_from_spec(spec)
spec.loader.exec_module(repair)
source = (Path.home()/'.codex/hooks/task-finish/gate.py').read_text()
gate = types.ModuleType('gate')
exec(compile(repair.patch(source), '<patched-hook>', 'exec'), gate.__dict__)


def stamp(t):
    return datetime.fromtimestamp(t, timezone.utc).isoformat()


class ThreeStepEvidence(unittest.TestCase):
    def setUp(self):
        self.start, self.prepared, self.end = 1000.0, 1002.0, 1003.0
        self.link = {'outer_call_id': 'outer', 'thread_id': 'session', 'transcript_path': 'host', 'turn_id': 'turn', 'source_sha256': 'digest'}
        self.patch = '*** Begin Patch\n*** Delete File: /local/body.md\n*** Add File: /local/body.md\n+body\n*** End Patch'
        self.steps = [('Bash', 'build'), ('Bash', 'git status --short'), ('apply_patch', self.patch)]
        self.call = {'prepared_at': self.prepared, 'dispatch_version': 19, 'batch_dispatch': dict(self.link, step_index=2), 'transcript_path': 'host', 'turn_id': 'turn', 'tool_name': 'apply_patch'}
        self.calls = {'patch': self.call}
        self.output = [
            {'type': 'input_text', 'text': 'Script failed\nWall time 3.0 seconds\nOutput:\n'},
            {'type': 'input_text', 'text': json.dumps({'session_id': 77})},
            {'type': 'input_text', 'text': json.dumps({'exit_code': 0})},
            {'type': 'input_text', 'text': 'Script error:\napply_patch verification failed: invalid patch: multiple operations target /local/body.md'},
        ]
        self.reply = {'type': 'response_item', 'timestamp': stamp(self.end), 'payload': {'type': 'custom_tool_call_output', 'call_id': 'outer', 'output': self.output, 'internal_chat_message_metadata_passthrough': {'turn_id': 'turn'}}}
        self.request = {'timestamp': stamp(self.start)}
        self.first = self.native('build-id', 'build', '77', 1000.2, 1023)
        self.second = self.native('status-id', 'git status --short', '78', 1001, 1001.5)
        self.records = [self.reply, self.second, self.first]

    def native(self, identity, command, process, begin, end):
        return {'type': 'event_msg', 'timestamp': stamp(end), 'payload': {
            'type': 'item_completed', 'thread_id': 'session', 'turn_id': 'turn',
            'started_at_ms': begin*1000, 'completed_at_ms': end*1000,
            'item': {'id': identity, 'type': 'CommandExecution', 'command': ['zsh', '-lc', command], 'cwd': 'file:///local/repo', 'status': 'completed', 'exit_code': 0, 'process_id': process}}}

    def receipt(self):
        with patch.object(gate, 'batch_envelope', return_value=(self.link, self.steps, self.request, self.records)):
            return gate.batch_failure_receipt('session', 'repo', 'patch', self.call, self.calls)

    def test_delayed_prefix_is_failed_patch_not_success(self):
        before = copy.deepcopy(self.calls)
        receipt = self.receipt()
        self.assertEqual(receipt['status'], 'failed')
        self.assertIsNone(receipt['exit_code'])
        self.assertEqual(receipt['step_index'], 2)
        self.assertIn('yielded_prefix_sha256', receipt)
        self.assertEqual(before, self.calls)

    def test_next_query_does_not_invalidate_exact_native_identity(self):
        self.records.append({'type': 'response_item', 'timestamp': stamp(1010), 'payload': {'type': 'custom_tool_call', 'call_id': 'later'}})
        self.records.append(self.native('later-id', 'different later query', '79', 1011, 1025))
        self.assertIsNotNone(self.receipt())

    def test_failed_build_is_terminal_but_never_successful_patch(self):
        self.first['payload']['item'].update(status='failed', exit_code=1)
        self.assertEqual(self.receipt()['status'], 'failed')

    def test_missing_native_completion(self):
        self.records.remove(self.first)
        self.assertIsNone(self.receipt())

    def test_duplicate_native_completion(self):
        self.records.append(copy.deepcopy(self.first))
        self.assertIsNone(self.receipt())

    def test_bad_native_fields(self):
        for key, value in [('status', 'running'), ('exit_code', None), ('exit_code', True), ('exit_code', 1), ('process_id', 'wrong'), ('command', ['zsh', '-lc', 'other']), ('cwd', None), ('id', 'patch')]:
            with self.subTest(key=key, value=value):
                old = copy.deepcopy(self.first['payload']['item'])
                self.first['payload']['item'][key] = value
                self.assertIsNone(self.receipt())
                self.first['payload']['item'] = old

    def test_wrong_turn_or_thread(self):
        for key in ('thread_id', 'turn_id'):
            with self.subTest(key=key):
                old = self.first['payload'][key]
                self.first['payload'][key] = 'other'
                self.assertIsNone(self.receipt())
                self.first['payload'][key] = old

    def test_invalid_times(self):
        for key, value in [('started_at_ms', 999000), ('started_at_ms', 1004000), ('completed_at_ms', 1000000), ('completed_at_ms', 99999999)]:
            with self.subTest(key=key, value=value):
                old = self.first['payload'][key]
                self.first['payload'][key] = value
                self.assertIsNone(self.receipt())
                self.first['payload'][key] = old
        self.first['timestamp'] = stamp(1034)
        self.first['payload']['completed_at_ms'] = 1034000
        self.assertIsNone(self.receipt())

    def test_immediate_second_command_must_match(self):
        self.output[2]['text'] = json.dumps({'exit_code': 1})
        self.assertIsNone(self.receipt())
        self.output[2]['text'] = json.dumps({'session_id': 78})
        self.assertIsNone(self.receipt())

    def test_second_completion_cannot_arrive_after_patch(self):
        self.second['timestamp'] = stamp(1004)
        self.second['payload']['completed_at_ms'] = 1004000
        self.assertIsNone(self.receipt())

    def test_extra_execution_in_dispatch_is_ambiguous(self):
        self.records.append(self.native('extra-id', 'extra', '80', 1001, 1005))
        self.assertIsNone(self.receipt())

    def test_duplicate_global_identity(self):
        extra = self.native('build-id', 'other', '99', 2000, 2001)
        extra['payload']['turn_id'] = 'another-turn'
        self.records.append(extra)
        self.assertIsNone(self.receipt())

    def test_patch_cannot_also_have_executed(self):
        extra = self.native('patch', 'other', '99', 2000, 2001)
        self.records.append(extra)
        self.assertIsNone(self.receipt())

    def test_command_output_cannot_impersonate_host_failure(self):
        self.output[0]['text'] = 'Script completed\nWall time 3.0 seconds\nOutput:\n'
        self.assertIsNone(self.receipt())

    def test_failure_must_match_exact_patch_path(self):
        self.output[-1]['text'] += '-different'
        self.assertIsNone(self.receipt())

    def test_other_patch_errors_are_not_widened(self):
        self.output[-1]['text'] = 'Script error:\napply_patch verification failed: something else'
        self.assertIsNone(self.receipt())

    def test_source_and_step_binding_mismatch(self):
        for field, value in [('source_sha256', 'wrong'), ('step_index', 1), ('turn_id', 'wrong'), ('thread_id', 'wrong')]:
            with self.subTest(field=field):
                old = self.call['batch_dispatch'][field]
                self.call['batch_dispatch'][field] = value
                self.assertIsNone(self.receipt())
                self.call['batch_dispatch'][field] = old

    def test_unbound_current_dispatch_stays_pending(self):
        del self.call['batch_dispatch']
        self.assertIsNone(self.receipt())

    def test_additional_pending_call_is_ambiguous(self):
        self.calls['other'] = dict(self.call)
        self.assertIsNone(self.receipt())

    def test_malformed_results_fail_closed(self):
        for value in ['{', '[]', 'null', '{"session_id":true}', '{"session_id":77,"exit_code":0}']:
            with self.subTest(value=value):
                self.output[1]['text'] = value
                self.assertIsNone(self.receipt())

    def test_patch_shape_is_narrow(self):
        for value in [self.patch.replace('*** Add File: /local/body.md', '*** Add File: /local/other.md'), self.patch.replace('+body', 'body'), self.patch.replace('/local/body.md', 'relative.md'), self.patch.replace('+body', '+body\n*** Update File: /local/a')]:
            with self.subTest(value=value):
                self.steps[2] = ('apply_patch', value)
                self.assertIsNone(self.receipt())

    def test_installer_idempotent_and_rejects_partial_patch(self):
        once = repair.patch(source)
        self.assertEqual(repair.patch(once), once)
        with self.assertRaises(ValueError):
            repair.patch(once.replace(repair.NEW, repair.OLD))
        with self.assertRaises(ValueError):
            repair.patch('unsupported')

    def test_unrelated_checks_unchanged(self):
        updated = repair.patch(source)
        self.assertEqual(source[source.index('def check('):], updated[updated.index('def check('):])
        self.assertTrue(gate.check({'coverage_problem': 'unverified'}, 'repo'))


if __name__ == '__main__':
    unittest.main()
