import copy
import importlib.util
import json
import os
from pathlib import Path
import unittest
from unittest.mock import patch

HERE = Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location('update', HERE / 'task-finish-hook-dispatch-turn.py')
update = importlib.util.module_from_spec(spec)
spec.loader.exec_module(update)
gate = Path(os.environ.get('TASK_FINISH_TEST_GATE', Path.home() / '.codex/hooks/task-finish/gate.py'))
original = gate.read_text()
ns = {'__name__': 'candidate', '__file__': str(gate)}
exec(compile(update.patch(original), str(gate), 'exec'), ns)


def row(at, kind, turn='new', **values):
    return {'timestamp': f'2026-09-28T00:00:{at:02d}Z', 'type': 'response_item',
            'payload': {'type': kind, 'internal_chat_message_metadata_passthrough': {'turn_id': turn}, **values}}


class DispatchTurns(unittest.TestCase):
    def setUp(self):
        self.old = row(1, 'custom_tool_call', turn='old', name='exec', call_id='old-outer',
                       input='text(await tools.exec_command({cmd:"old"}));')
        self.request = row(10, 'custom_tool_call', name='exec', call_id='new-outer',
                           input='text(await tools.exec_command({cmd:"new"}));')
        self.reply = row(20, 'custom_tool_call_output', call_id='new-outer', output=[
            {'type': 'input_text', 'text': 'Script failed\nWall time 10.0 seconds\nOutput:\n'},
            {'type': 'input_text', 'text': 'Script error:\nexec_command failed: CreateProcess { message: "Rejected(\\"This action was rejected due to unacceptable risk.\\nReason: test\\")" }'}])
        self.records = [self.old, self.request, self.reply]
        self.call = {'tool_name': 'Bash', 'dispatch_checked': True, 'dispatch_version': 19,
                     'prepared_at': ns['host_time'](row(15, 'unused')), 'turn_id': 'new',
                     'transcript_path': '/host/transcript', 'paths': [], 'new_paths': []}
        self.calls = {'target': self.call, 'orphan': dict(self.call, turn_id='old', prepared_at=ns['host_time'](row(2, 'unused')))}
        self.context = patch.dict(ns, {'host_records': lambda *args: ('session', Path('/host/transcript'), self.records)})
        self.context.start(); self.addCleanup(self.context.stop)

    def receipt(self):
        return ns['stale_turn_decline_receipt']('session', '/repo', 'target', self.call, self.calls)

    def binding(self):
        return ns['dispatch_context'](dict(self.call, tool_input={'command': 'new'}), 'session', '/repo', at=self.call['prepared_at'])

    def test_older_open_turn_no_longer_blocks_current_binding(self):
        link = self.binding()
        self.assertEqual(link['outer_call_id'], 'new-outer')
        self.assertEqual(link['turn_id'], 'new')

    def test_actual_refusal_keeps_null_exit_and_orphan_unchanged(self):
        before = copy.deepcopy(self.calls)
        proof = self.receipt()
        self.assertEqual(proof['status'], 'declined')
        self.assertIsNone(proof['exit_code'])
        self.assertEqual(proof['source'], 'stale-turn-host-refusal')
        self.assertEqual(self.calls, before)

    def test_trailing_poll_not_executed_when_first_command_declined(self):
        self.request['payload']['input'] += '\ntext(await tools.write_stdin({session_id:123,chars:"",yield_time_ms:1000}));'
        link = ns['same_turn_batch_envelope'](self.call, 'session', '/repo', self.call['prepared_at'], ns['trailing_poll_batch'])
        self.assertEqual(link[0]['outer_call_id'], 'new-outer')
        proof = self.receipt()
        self.assertEqual(proof['status'], 'declined')
        self.assertIsNone(proof['exit_code'])
        self.assertEqual(proof['step_index'], 0)

    def test_executed_prefix_or_second_shell_is_not_supported(self):
        for source in ['text(await tools.write_stdin({session_id:123,chars:""}));\n' + self.request['payload']['input'],
                       self.request['payload']['input'] + '\ntext(await tools.exec_command({cmd:"second"}));']:
            self.request['payload']['input'] = source
            self.assertIsNone(self.receipt())

    def test_same_or_unknown_turn_remains_ambiguous(self):
        for turn in ['new', None]:
            with self.subTest(turn=turn):
                self.old['payload']['internal_chat_message_metadata_passthrough']['turn_id'] = turn
                self.assertIsNone(self.binding())
                self.assertIsNone(self.receipt())

    def test_no_stale_envelope_cannot_rebind_unexplained_missing_pre(self):
        self.records.remove(self.old)
        self.assertIsNone(self.receipt())

    def test_missing_duplicate_or_wrong_turn_reply_stays_pending(self):
        for records in [[self.old, self.request], self.records + [self.reply],
                        [self.old, self.request, dict(self.reply, payload=dict(self.reply['payload'], internal_chat_message_metadata_passthrough={'turn_id': 'other'}))]]:
            with self.subTest(records=len(records)):
                with patch.dict(ns, {'host_records': lambda *args: ('session', Path('/host/transcript'), records)}):
                    self.assertIsNone(self.receipt())

    def test_success_running_cancel_or_generic_error_not_refusal(self):
        for output in ['cancelled', 'Script error: timeout', json.dumps({'exit_code': 0}), json.dumps({'session_id': 123})]:
            self.reply['payload']['output'][1]['text'] = output
            self.assertIsNone(self.receipt())

    def test_peer_pre_or_native_execution_blocks_recovery(self):
        self.calls['peer'] = copy.deepcopy(self.call)
        self.assertIsNone(self.receipt()); del self.calls['peer']
        self.records.append({'timestamp': row(21, 'unused')['timestamp'], 'type': 'event_msg',
                             'payload': {'type': 'item_completed', 'thread_id': 'session', 'turn_id': 'new',
                                         'started_at_ms': ns['host_time'](row(12, 'unused')) * 1000,
                                         'item': {'id': 'other', 'type': 'CommandExecution', 'exit_code': 0}}})
        self.assertIsNone(self.receipt())

    def test_target_terminal_any_turn_blocks_recovery(self):
        self.records.append({'timestamp': row(21, 'unused')['timestamp'], 'type': 'event_msg',
                             'payload': {'type': 'item_completed', 'item': {'id': 'target'}}})
        self.assertIsNone(self.receipt())

    def test_dynamic_source_extra_tool_or_wrong_actor_blocks(self):
        source = self.request['payload']['input']
        self.request['payload']['input'] = 'const x="new"; text(await tools.exec_command({cmd:x}));'
        self.assertIsNone(self.receipt()); self.request['payload']['input'] = source
        self.call['actor_thread_id'] = 'other'; self.assertIsNone(self.receipt()); del self.call['actor_thread_id']
        self.records.insert(2, row(16, 'function_call', name='wait', call_id='extra'))
        self.assertIsNone(self.receipt())

    def test_paths_existing_binding_or_invalid_timestamp_blocks(self):
        for key, value in [('paths', ['file']), ('dispatch', {'outer_call_id': 'different'}),
                           ('prepared_at', float('nan')), ('prepared_at', True), ('prepared_at', 0)]:
            old = copy.deepcopy(self.call)
            self.call[key] = value
            self.assertIsNone(self.receipt())
            self.call.clear(); self.call.update(old)

    def test_changed_installer_input_refused(self):
        with self.assertRaises(ValueError):
            update.patch(original + '\n')


if __name__ == '__main__':
    unittest.main()
