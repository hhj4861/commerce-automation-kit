import copy
from datetime import datetime, timezone
import importlib.util
import json
import os
from pathlib import Path
import sys
import unittest
from unittest.mock import patch

HERE = Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location('stdin_update', HERE / 'task-finish-stdin-refusal.py')
updater = importlib.util.module_from_spec(spec)
spec.loader.exec_module(updater)
GATE = Path(os.environ.get('TASK_FINISH_TEST_GATE', Path.home() / '.codex/hooks/task-finish/gate.py'))
namespace = {'__name__': 'candidate_gate', '__file__': str(GATE)}
exec(compile(updater.patch(GATE.read_text()), str(GATE), 'exec'), namespace)


def row(t, kind, payload):
    return {'timestamp': datetime.fromtimestamp(t, timezone.utc).isoformat(), 'type': kind, 'payload': payload}


class Recovery(unittest.TestCase):
    def setUp(self):
        self.sid, self.turn, self.cid = 'thread', 'turn', 'refused'
        self.call = {'tool_name': 'Bash', 'dispatch_checked': True, 'dispatch_version': 19,
                     'prepared_at': 110, 'turn_id': self.turn, 'transcript_path': '/host.jsonl',
                     'paths': [], 'new_paths': []}
        self.calls = {self.cid: self.call}
        source = 'text(await tools.write_stdin({session_id:99,chars:"query\\n"}));\ntext(await tools.exec_command({cmd:"deploy",workdir:"/repo"}));'
        metadata = {'internal_chat_message_metadata_passthrough': {'turn_id': self.turn}}
        self.request = row(100, 'response_item', {'type': 'custom_tool_call', 'name': 'exec',
                                'call_id': 'outer', 'input': source, **metadata})
        failure = 'Script error:\nexec_command failed: CreateProcess { message: "Rejected(\\"This action was rejected due to unacceptable risk.\\nReason: no approval\\")" }'
        self.reply = row(120, 'response_item', {'type': 'custom_tool_call_output', 'call_id': 'outer',
                        'output': [{'type': 'input_text', 'text': 'Script failed\nWall time 20.0 seconds\nOutput:\n'},
                                   {'type': 'input_text', 'text': json.dumps({'session_id': 99})},
                                   {'type': 'input_text', 'text': failure}], **metadata})
        self.proof = row(201, 'event_msg', {'type': 'item_completed', 'thread_id': self.sid,
                     'turn_id': self.turn, 'started_at_ms': 90000, 'completed_at_ms': 200000,
                     'item': {'type': 'CommandExecution', 'id': 'prefix', 'process_id': '99',
                              'cwd': 'file:///repo', 'status': 'failed', 'exit_code': 1}})
        self.records = [self.request, self.reply, self.proof]

    def receipt(self):
        with patch.dict(namespace, {'host_records': lambda *args: (self.sid, Path('/host.jsonl'), self.records)}):
            return namespace['stdin_refusal_receipt'](self.sid, Path('/repo'), self.cid, self.call, self.calls)

    def test_later_native_failure_is_not_fabricated_success(self):
        receipt = self.receipt()
        self.assertEqual(receipt['status'], 'declined')
        self.assertIsNone(receipt['exit_code'])
        self.assertEqual(receipt['prefix_exit_code'], 1)
        self.assertEqual(receipt['step_index'], 1)
        self.assertNotIn('query', json.dumps(receipt))
        self.assertNotIn('deploy', json.dumps(receipt))

    def test_completed_prefix_requires_matching_exit(self):
        self.proof['payload']['completed_at_ms'] = 105000
        self.proof['timestamp'] = row(106, '', {})['timestamp']
        self.reply['payload']['output'][1]['text'] = json.dumps({'exit_code': 1})
        self.assertIsNotNone(self.receipt())
        self.reply['payload']['output'][1]['text'] = json.dumps({'exit_code': 0})
        self.assertIsNone(self.receipt())

    def test_reject_missing_native(self):
        self.records.remove(self.proof)
        self.assertIsNone(self.receipt())

    def test_reject_duplicate_native(self):
        self.records.append(copy.deepcopy(self.proof))
        self.assertIsNone(self.receipt())

    def test_reject_wrong_identity_status_and_time(self):
        mutations = [('thread_id', 'other'), ('turn_id', 'other'), ('started_at_ms', 130000),
                     ('completed_at_ms', 80000), ('completed_at_ms', float('nan'))]
        for key, value in mutations:
            with self.subTest(key=key, value=value):
                original = self.proof['payload'][key]
                self.proof['payload'][key] = value
                self.assertIsNone(self.receipt())
                self.proof['payload'][key] = original
        for key, value in [('status', 'running'), ('status', 'completed'), ('exit_code', None),
                           ('exit_code', True), ('process_id', 'other'), ('cwd', None), ('id', self.cid)]:
            with self.subTest(key=key, value=value):
                original = self.proof['payload']['item'][key]
                self.proof['payload']['item'][key] = value
                self.assertIsNone(self.receipt())
                self.proof['payload']['item'][key] = original

    def test_reject_native_target_execution(self):
        other = copy.deepcopy(self.proof); other['payload']['item']['id'] = self.cid
        other['payload']['item']['process_id'] = '100'
        self.records.append(other)
        self.assertIsNone(self.receipt())

    def test_reject_ambiguous_pending(self):
        self.calls['other'] = dict(self.call)
        self.assertIsNone(self.receipt())

    def test_reject_new_version_and_existing_binding(self):
        for key, value in [('dispatch_version', 20), ('dispatch_checked', False),
                           ('batch_dispatch', {'outer_call_id': 'outer'}), ('paths', ['file']),
                           ('terminal', {'status': 'declined'})]:
            with self.subTest(key=key):
                sentinel = object(); original = self.call.get(key, sentinel)
                self.call[key] = value
                self.assertIsNone(self.receipt())
                if original is sentinel:
                    del self.call[key]
                else:
                    self.call[key] = original

    def test_reject_spoofed_host_envelope(self):
        original = copy.deepcopy(self.reply)
        for header in ['Script completed\nWall time 20 seconds\nOutput:\n', 'Script running with cell ID 1']:
            self.reply['payload']['output'][0]['text'] = header
            self.assertIsNone(self.receipt())
        self.reply.clear(); self.reply.update(original)
        self.reply['payload']['output'][2]['text'] = 'stdout: This action was rejected due to unacceptable risk.'
        self.assertIsNone(self.receipt())

    def test_reject_wrong_process_result(self):
        for result in [{'session_id': 100}, {'exit_code': None}, {'session_id': True}, {'exit_code': True}]:
            self.reply['payload']['output'][1]['text'] = json.dumps(result)
            self.assertIsNone(self.receipt())

    def test_reject_wrong_reply_turn_and_duplicates(self):
        self.reply['payload']['internal_chat_message_metadata_passthrough']['turn_id'] = 'other'
        self.assertIsNone(self.receipt())
        self.reply['payload']['internal_chat_message_metadata_passthrough']['turn_id'] = self.turn
        self.records.append(copy.deepcopy(self.reply))
        self.assertIsNone(self.receipt())

    def test_reject_extra_execution(self):
        other = copy.deepcopy(self.proof)
        other['payload']['item'].update(id='unexpected', process_id='100')
        other['payload']['started_at_ms'] = 115000
        self.records.append(other)
        self.assertIsNone(self.receipt())

    def test_reject_extra_outer_call(self):
        other = copy.deepcopy(self.request)
        other['payload']['call_id'] = 'extra'
        self.records.append(other)
        self.assertIsNone(self.receipt())

    def test_parser_bounds_and_no_execution(self):
        parse = namespace['stdin_refusal_steps']
        source = self.request['payload']['input']
        self.assertIsNotNone(parse(source))
        for invalid in [source + 'throw Error();', source.replace('chars:"query\\n"', 'chars:""'),
                        source.replace('99', 'true'), source.replace('"deploy"', 'run()'),
                        source.replace('text(await', 'text(tools.exec_command({}));text(await', 1),
                        source + ' ' * 16384, source.replace('session_id:99', 'session_id:99,session_id:99')]:
            self.assertIsNone(parse(invalid))

    def test_installer_fails_closed_on_changed_gate(self):
        with self.assertRaises(ValueError):
            updater.patch(GATE.read_text() + '\n')

    def test_existing_reconcile_guards_preserved(self):
        original = GATE.read_text()
        updated = updater.patch(original)
        start = updated.index('def stdin_refusal_steps(')
        end = updated.index('def reconcile_calls(', start)
        restored = (updated[:start] + updated[end:]).replace(
            '\n                       or stdin_refusal_receipt(sid, root, call_id, call, current[\'calls\'])', '')
        self.assertEqual(restored, original)


if __name__ == '__main__':
    unittest.main()
