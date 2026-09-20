import copy
from datetime import datetime, timezone
import importlib.util
import json
from pathlib import Path
import sys
import types
import unittest
from unittest.mock import patch

sys.dont_write_bytecode = True
spec = importlib.util.spec_from_file_location('repair', Path(__file__).with_name('task-finish-mixed-dispatch.py'))
repair = importlib.util.module_from_spec(spec); spec.loader.exec_module(repair)
original = (Path.home()/'.codex/hooks/task-finish/gate.py').read_text()
gate = types.ModuleType('gate')
exec(compile(repair.patch(original), '<candidate-gate>', 'exec'), gate.__dict__)
BASE = 1767225600


def row(kind, second, payload):
    return {'type': kind, 'timestamp': datetime.fromtimestamp(BASE+second, timezone.utc).isoformat(), 'payload': payload}


def native(identifier, process, command, started, ended):
    return row('event_msg', ended, {'type': 'item_completed', 'thread_id': 'session', 'turn_id': 'turn',
        'started_at_ms': (BASE+started)*1000, 'completed_at_ms': (BASE+ended)*1000,
        'item': {'type': 'CommandExecution', 'id': identifier, 'process_id': str(process),
                 'command': ['/bin/zsh', '-lc', command], 'cwd': 'file:///repo', 'status': 'completed', 'exit_code': 0}})


def shell(command):
    return 'text(await tools.exec_command('+json.dumps({'cmd':command})+'));'


def poll(process):
    return 'text(await tools.write_stdin('+json.dumps({'session_id':process,'chars':''})+'));'


class MixedRecovery(unittest.TestCase):
    def setUp(self):
        self.source = poll(11)+poll(12)+shell('prefix')+shell('rejected')
        self.call = {'prepared_at': BASE+20, 'dispatch_version':11, 'transcript_path':'/host',
                     'turn_id':'turn', 'tool_name':'Bash'}
        self.calls = {'pending':self.call}
        self.failure = 'Script error:\nexec_command failed: CreateProcess { message: "Rejected(\\"This action was rejected due to unacceptable risk.'
        self.prefix = [{'exit_code':0},{'exit_code':0},{'session_id':13}]
        self.events = [native('poll1',11,'old1',1,5),native('poll2',12,'old2',2,8),native('prefix',13,'prefix',12,18)]

    def records(self):
        return [row('response_item',10,{'type':'custom_tool_call','name':'exec','call_id':'outer','input':self.source,
                  'internal_chat_message_metadata_passthrough':{'turn_id':'turn'}}),*self.events,
                row('response_item',30,{'type':'custom_tool_call_output','call_id':'outer',
                  'internal_chat_message_metadata_passthrough':{'turn_id':'turn'},
                  'output':[{'type':'input_text','text':'Script failed\nWall time 20.0 seconds\nOutput:\n'},
                            *[{'type':'input_text','text':json.dumps(v)} for v in self.prefix],
                            {'type':'input_text','text':self.failure}]})]

    def receipt(self, transform=None):
        records=self.records()
        if transform: transform(records)
        with patch.object(gate,'host_records',return_value=('session',Path('/host'),records)):
            return gate.mixed_literal_failure_receipt('session','/repo','pending',self.call,self.calls)

    def test_mixed_prefix_has_real_native_termination(self):
        value=self.receipt()
        self.assertEqual(value['status'],'declined');self.assertIsNone(value['exit_code'])
        self.assertEqual(value['step_index'],3);self.assertEqual(value['prefix_item_ids'],['poll1','poll2','prefix'])

    def test_first_failed_patch_does_not_run_or_validate_later_steps(self):
        self.source='text(await tools.apply_patch("invalid patch"));'+poll(99)+shell('never executed')
        self.call['tool_name']='apply_patch';self.prefix=[];self.events=[]
        self.failure='Script error:\napply_patch verification failed: invalid patch'
        value=self.receipt();self.assertEqual(value['status'],'failed');self.assertEqual(value['step_index'],0)
        self.assertEqual(value['prefix_item_ids'],[]);self.assertIsNone(value['exit_code'])

    def test_missing_duplicate_or_running_native_prefix_is_not_terminal(self):
        for mutation in [lambda r:r.pop(3),lambda r:r.insert(3,copy.deepcopy(r[3])),
                         lambda r:r[3]['payload']['item'].update(status='in_progress')]:
            with self.subTest(mutation=mutation):self.assertIsNone(self.receipt(mutation))

    def test_wrong_session_turn_process_command_and_code_are_rejected(self):
        for changes in [{'thread_id':'another'},{'turn_id':'another'}]:
            with self.subTest(changes=changes):self.assertIsNone(self.receipt(lambda r:r[3]['payload'].update(changes)))
        for changes in [{'process_id':'wrong'},{'command':['/bin/zsh','-lc','other']},{'exit_code':True},{'cwd':None},{'status':'failed'}]:
            with self.subTest(changes=changes):self.assertIsNone(self.receipt(lambda r:r[3]['payload']['item'].update(changes)))
        self.prefix[0]['exit_code']=1;self.assertIsNone(self.receipt())

    def test_yielded_or_future_prefix_does_not_prove_completion(self):
        self.prefix[0]={'session_id':11};self.assertIsNone(self.receipt())
        self.prefix[0]={'exit_code':0}
        self.events[2]=native('prefix',13,'prefix',12,21);self.assertIsNone(self.receipt())

    def test_ambiguous_pre_or_contradictory_native_execution_is_rejected(self):
        self.calls['second']=dict(self.call);self.assertIsNone(self.receipt());self.calls.pop('second')
        self.events.append(native('pending',14,'rejected',21,22));self.assertIsNone(self.receipt())

    def test_unaccounted_tail_execution_is_rejected(self):
        self.events.append(native('tail',14,'unexpected command',21,22));self.assertIsNone(self.receipt())

    def test_duplicate_host_response_and_wrong_turn_are_rejected(self):
        self.assertIsNone(self.receipt(lambda r:r.append(copy.deepcopy(r[-1]))))
        self.assertIsNone(self.receipt(lambda r:r[-1]['payload']['internal_chat_message_metadata_passthrough'].update(turn_id='other')))
        self.assertIsNone(self.receipt(lambda r:r[0]['payload']['internal_chat_message_metadata_passthrough'].update(turn_id='other')))

    def test_success_output_or_command_printed_error_is_not_host_failure(self):
        self.assertIsNone(self.receipt(lambda r:r[-1]['payload']['output'][0].update(text='Script completed\nWall time 20.0 seconds\nOutput:\n')))
        self.failure=json.dumps({'exit_code':1,'output':self.failure});self.assertIsNone(self.receipt())

    def test_unknown_failure_or_yield_stays_pending(self):
        self.failure='Script error: unknown error';self.assertIsNone(self.receipt())
        self.assertIsNone(self.receipt(lambda r:r[-1]['payload']['output'][0].update(text='Script running with cell ID abc\nWall time 20.0 seconds\nOutput:\n')))

    def test_new_unbound_mismatched_or_unknown_version_is_not_rebound(self):
        for version in [None,10,12,13]:
            self.call['dispatch_version']=version
            with self.subTest(version=version):self.assertIsNone(self.receipt())

    def test_new_exact_pre_binding_is_required(self):
        self.call['dispatch_version']=12
        with patch.object(gate,'host_records',return_value=('session',Path('/host'),self.records())),patch.object(gate.time,'time',return_value=BASE+20):
            event=dict(self.call,tool_input={'command':'rejected'})
            self.call['mixed_literal_dispatch']=gate.batch_dispatch_context(event,'session','/repo',gate.mixed_literal_batch)
        self.assertEqual(self.receipt()['status'],'declined')
        self.call['mixed_literal_dispatch']['source_sha256']='changed';self.assertIsNone(self.receipt())

    def test_receipt_does_not_mutate_files_hold_or_calls(self):
        self.call.update(snapshot={'a':'old'},known_before={'a':'old'})
        saved=copy.deepcopy(self.calls);self.receipt();self.assertEqual(self.calls,saved)


class ParserAndInstall(unittest.TestCase):
    def test_only_literal_awaited_calls_and_empty_polls(self):
        valid=poll(1)+poll(2)+shell('a')+shell('b')
        self.assertEqual(len(gate.mixed_literal_batch(valid)),4)
        for invalid in [valid.replace('"chars": ""','"chars": "x"'),valid+'throw Error("x");',valid.replace('await tools','tools'),
                        'for(;;){}'+valid,valid.replace('"cmd": "a"','"cmd": process.env.CMD')]:
            with self.subTest(invalid=invalid):self.assertIsNone(gate.mixed_literal_batch(invalid))

    def test_supported_older_grammars_are_not_reinterpreted(self):
        for source in [shell('a')+shell('b'),poll(1)+shell('b'),poll(1)+shell('a')+shell('b'),shell('a')+poll(1)+poll(2)]:
            with self.subTest(source=source):self.assertIsNone(gate.mixed_literal_batch(source))

    def test_idempotent_patch_and_existing_checks_preserved(self):
        updated=repair.patch(original);self.assertEqual(repair.patch(updated),updated)
        for name,end in [('check','stop_event'),('stop_event','handle')]:
            extract=lambda s:s[s.index('def '+name+'('):s.index('def '+end+'(')]
            self.assertEqual(extract(original),extract(updated))
        anchor = 'def mixed_literal_batch(source):' if repair.MARKER in original else 'def settled_syntax(source):'
        with self.assertRaises(ValueError):repair.patch(original.replace(anchor,'def renamed(source):'))
        with self.assertRaises(ValueError):repair.patch(updated.replace("prepared['mixed_literal_dispatch'] = mixed_literal_dispatch",'pass'))


if __name__=='__main__':unittest.main()
