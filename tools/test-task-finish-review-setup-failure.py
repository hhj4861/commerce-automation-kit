import copy
from datetime import datetime, timezone
import importlib.util
import json
from pathlib import Path
import types
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('repair', Path(__file__).with_name('task-finish-review-setup-failure.py'))
repair = importlib.util.module_from_spec(spec)
spec.loader.exec_module(repair)
source = (Path.home()/'.codex/hooks/task-finish/gate.py').read_text()
gate = types.ModuleType('gate')
exec(compile(repair.patch(source), '<patched-hook>', 'exec'), gate.__dict__)


def stamp(value):
    return datetime.fromtimestamp(value, timezone.utc).isoformat()


class ReviewSetupEvidence(unittest.TestCase):
    def setUp(self):
        self.link = {'outer_call_id': 'outer', 'thread_id': 'session', 'turn_id': 'turn', 'source_sha256': 'digest', 'transcript_path': 'host'}
        self.steps = [('poll', {'session_id': 77, 'chars': ''}), ('Bash', 'git status --short')]
        self.call = {'prepared_at': 1002, 'dispatch_version': 19, 'polled_dispatch': dict(self.link, step_index=1), 'transcript_path': 'host', 'turn_id': 'turn', 'tool_name': 'Bash'}
        self.calls = {'rejected': self.call}
        self.failure = ('Script error:\nexec_command failed: CreateProcess { message: "Rejected(\\"'
                        'Automatic approval review failed: failed to load workspace requirements\\\\n'
                        'The action was not executed because automatic approval review could not be completed. '
                        'This is a review failure, not a determination that the action is unsafe. '
                        'Do not bypass the approval check; resolve the error or ask the user for guidance.'
                        '\\")" }')
        self.output = [{'type': 'input_text', 'text': 'Script failed\nWall time 3.0 seconds\nOutput:\n'},
                       {'type': 'input_text', 'text': json.dumps({'session_id': 77})},
                       {'type': 'input_text', 'text': self.failure}]
        self.request = {'type': 'response_item', 'timestamp': stamp(1000), 'payload': {'type': 'custom_tool_call', 'call_id': 'outer'}}
        self.reply = {'type': 'response_item', 'timestamp': stamp(1003), 'payload': {'type': 'custom_tool_call_output', 'call_id': 'outer', 'output': self.output, 'internal_chat_message_metadata_passthrough': {'turn_id': 'turn'}}}
        self.native = {'type': 'event_msg', 'timestamp': stamp(1080), 'payload': {
            'type': 'item_completed', 'thread_id': 'session', 'turn_id': 'turn',
            'started_at_ms': 990000, 'completed_at_ms': 1080000,
            'item': {'id': 'poll-item', 'type': 'CommandExecution', 'cwd': 'file:///local/repo', 'status': 'completed', 'exit_code': 0, 'process_id': '77'}}}
        self.records = [self.request, self.reply, self.native]

    def receipt(self, module=gate):
        with patch.object(module, 'batch_envelope', return_value=(self.link, self.steps, self.request, self.records)):
            return module.polled_failure_receipt('session', 'repo', 'rejected', self.call, self.calls)

    def test_real_shape_is_not_started_never_success(self):
        before = copy.deepcopy(self.calls)
        result = self.receipt()
        self.assertEqual(result['status'], 'not_started')
        self.assertIsNone(result['exit_code'])
        self.assertEqual(result['poll_exit_code'], 0)
        self.assertTrue(result['poll_completed_after_failure'])
        self.assertEqual(before, self.calls)

    def test_native_poll_can_fail_but_rejected_command_did_not_start(self):
        self.native['payload']['item'].update(status='failed', exit_code=1)
        self.assertEqual(self.receipt()['status'], 'not_started')

    def test_completion_before_host_failure(self):
        self.native['timestamp'] = stamp(1002.5)
        self.native['payload']['completed_at_ms'] = 1002500
        self.assertFalse(self.receipt()['poll_completed_after_failure'])

    def test_missing_duplicate_or_wrong_native(self):
        original = self.records[:]
        for records in [original[:-1], original+[copy.deepcopy(self.native)]]:
            self.records = records
            self.assertIsNone(self.receipt())
        self.records = original
        for key, value in [('process_id', 'other'), ('id', 'rejected'), ('status', 'running'), ('exit_code', None), ('exit_code', True), ('cwd', None)]:
            with self.subTest(key=key):
                item = self.native['payload']['item']; old = item[key]
                item[key] = value
                self.assertIsNone(self.receipt())
                item[key] = old

    def test_wrong_thread_turn_or_completion_time(self):
        for key, value in [('thread_id', 'other'), ('turn_id', 'other'), ('started_at_ms', 1001000), ('completed_at_ms', 999000), ('completed_at_ms', True), ('completed_at_ms', 1081000)]:
            with self.subTest(key=key):
                old = self.native['payload'][key]
                self.native['payload'][key] = value
                self.assertIsNone(self.receipt())
                self.native['payload'][key] = old
        self.native['timestamp'] = stamp(1124)
        self.native['payload']['completed_at_ms'] = 1124000
        self.assertIsNone(self.receipt())

    def test_execution_start_contradicts_rejection(self):
        self.records.append({'type': 'event_msg', 'payload': {'type': 'item_started', 'item': {'id': 'rejected'}}})
        self.assertIsNone(self.receipt())

    def test_binding_must_match(self):
        for field, value in [('step_index', 0), ('source_sha256', 'wrong'), ('turn_id', 'other'), ('thread_id', 'other')]:
            with self.subTest(field=field):
                old = self.call['polled_dispatch'][field]
                self.call['polled_dispatch'][field] = value
                self.assertIsNone(self.receipt())
                self.call['polled_dispatch'][field] = old
        del self.call['polled_dispatch']
        self.assertIsNone(self.receipt())

    def test_only_exact_host_failure(self):
        for failure in [self.failure+'extra', self.failure.replace('workspace requirements', 'something else'), 'Script error:\ncommand failed']:
            self.output[2]['text'] = failure
            self.assertIsNone(self.receipt())
        self.output[2]['text'] = self.failure
        self.output[0]['text'] = 'Script completed\nWall time 3.0 seconds\nOutput:\n'
        self.assertIsNone(self.receipt())

    def test_duplicate_request_reply_and_other_pending(self):
        for extra in [self.request, self.reply]:
            self.records.append(copy.deepcopy(extra))
            self.assertIsNone(self.receipt())
            self.records.pop()
        self.calls['other'] = dict(self.call)
        self.assertIsNone(self.receipt())

    def test_three_step_dispatch_not_supported(self):
        self.steps.append(('Bash', 'other'))
        self.assertIsNone(self.receipt())

    def test_malformed_results(self):
        for value in ['{', 'null', '[]', '{"session_id":true}', '{"session_id":77,"exit_code":0}']:
            self.output[1]['text'] = value
            self.assertIsNone(self.receipt())

    def test_normal_failures_do_not_gain_late_poll_exception(self):
        self.output[2]['text'] = 'Script error:\nexec_command failed: CreateProcess { message: "Rejected(\\"This action was rejected due to unacceptable risk.'
        self.assertIsNone(self.receipt())

    def test_installer_idempotence_partial_patch_and_unchanged_guards(self):
        updated = repair.patch(source)
        self.assertEqual(repair.patch(updated), updated)
        with self.assertRaises(ValueError):
            repair.patch(updated.replace(repair.PROOF, ''))
        with self.assertRaises(ValueError):
            repair.patch('unsupported')
        self.assertEqual(source[source.index('def reconcile_calls('):], updated[updated.index('def reconcile_calls('):])


if __name__ == '__main__':
    unittest.main()
