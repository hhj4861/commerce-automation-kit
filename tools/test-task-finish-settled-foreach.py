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
spec = importlib.util.spec_from_file_location('repair', Path(__file__).with_name('task-finish-settled-foreach.py'))
repair = importlib.util.module_from_spec(spec); spec.loader.exec_module(repair)
original = (Path.home()/'.codex/hooks/task-finish/gate.py').read_text()
gate = types.ModuleType('gate')
exec(compile(repair.patch(original), '<candidate-gate>', 'exec'), gate.__dict__)
BASE = 1767225600


def row(kind, second, payload):
    return {'type': kind, 'timestamp': datetime.fromtimestamp(BASE+second, timezone.utc).isoformat(), 'payload': payload}


class SettledForeach(unittest.TestCase):
    def setUp(self):
        self.source = 'const r=await Promise.allSettled([tools.exec_command({cmd:"read"}),tools.exec_command({cmd:"denied"})]);r.forEach(text);'
        self.call = {'prepared_at': BASE+20, 'dispatch_version':14, 'transcript_path':'/host', 'turn_id':'turn', 'tool_name':'Bash'}
        self.calls = {'pending':self.call}
        self.failure = 'exec_command failed: CreateProcess { message: "Rejected(\\"This action was rejected due to unacceptable risk.'
        self.results = [{'status':'fulfilled','value':{'exit_code':0}}, {'status':'rejected','reason':self.failure}]
        self.event = row('event_msg',25,{'type':'item_completed','thread_id':'session','turn_id':'turn',
            'started_at_ms':(BASE+15)*1000,'completed_at_ms':(BASE+25)*1000,
            'item':{'type':'CommandExecution','id':'sibling','process_id':'42','command':['/bin/zsh','-lc','read'],
                    'cwd':'file:///repo','status':'completed','exit_code':0}})

    def records(self):
        return [row('response_item',10,{'type':'custom_tool_call','name':'exec','call_id':'outer','input':self.source,
                    'internal_chat_message_metadata_passthrough':{'turn_id':'turn'}}),copy.deepcopy(self.event),
                row('response_item',30,{'type':'custom_tool_call_output','call_id':'outer',
                    'internal_chat_message_metadata_passthrough':{'turn_id':'turn'},
                    'output':[{'type':'input_text','text':'Script completed\nWall time 20.0 seconds\nOutput:\n'},
                              *[{'type':'input_text','text':json.dumps(v)} for v in self.results]]})]

    def receipt(self, transform=None):
        records = self.records()
        if transform: transform(records)
        with patch.object(gate,'host_records',return_value=('session',Path('/host'),records)):
            return gate.settled_failure_receipt('session','/repo','pending',self.call,self.calls)

    def test_recovers_actual_refusal_only_with_native_sibling_exit(self):
        result=self.receipt()
        self.assertEqual(result['status'],'declined'); self.assertIsNone(result['exit_code'])
        self.assertEqual(result['step_index'],1); self.assertEqual(result['outer_call_id'],'outer')
        self.assertEqual(len(result['record_sha256']),64)

    def test_parser_rejects_mutation_callbacks_dynamic_calls_and_extra_work(self):
        for source in [self.source.replace('r.forEach(text)','r.reverse().forEach(text)'),
                       self.source.replace('r.forEach(text)','r.forEach(x=>text(x))'),
                       self.source+'text("extra")', self.source.replace('cmd:"read"','cmd:secret')]:
            with self.subTest(source=source): self.assertIsNone(gate.settled_batch(source))

    def test_missing_and_duplicate_native_siblings_are_not_proof(self):
        self.assertIsNone(self.receipt(lambda r:r.pop(1)))
        self.assertIsNone(self.receipt(lambda r:r.insert(1,copy.deepcopy(r[1]))))

    def test_wrong_native_session_turn_command_status_and_exit_are_rejected(self):
        for changes in [{'thread_id':'other'},{'turn_id':'other'},{'completed_at_ms':(BASE+31)*1000}]:
            with self.subTest(changes=changes): self.assertIsNone(self.receipt(lambda r:r[1]['payload'].update(changes)))
        for changes in [{'command':['/bin/zsh','-lc','other']},{'status':'in_progress'},{'exit_code':1},{'exit_code':True},{'cwd':None}]:
            with self.subTest(changes=changes): self.assertIsNone(self.receipt(lambda r:r[1]['payload']['item'].update(changes)))

    def test_any_native_event_for_declined_call_contradicts_not_started(self):
        def started(records):
            event=copy.deepcopy(records[1]); event['payload']['type']='item_started'; event['payload']['item']['id']='pending'; records.insert(1,event)
        self.assertIsNone(self.receipt(started))

    def test_multiple_pending_pres_or_rejections_are_ambiguous(self):
        self.calls['another']=copy.deepcopy(self.call); self.assertIsNone(self.receipt())
        del self.calls['another']
        self.results[0]={'status':'rejected','reason':self.failure}; self.assertIsNone(self.receipt())

    def test_unindexed_results_cannot_have_indices_extra_fields_or_reordered_values(self):
        for change in [lambda x:x[0].update(i=0),lambda x:x[1].update(extra=True),lambda x:x.reverse()]:
            saved=copy.deepcopy(self.results);change(self.results)
            self.assertIsNone(self.receipt());self.results=saved

    def test_unknown_failures_and_serialized_empty_error_do_not_prove_refusal(self):
        for failure in ['timeout','permission denied',{},None]:
            self.results[1]['reason']=failure;self.assertIsNone(self.receipt())

    def test_current_version_missing_binding_cannot_be_retroactively_rebound(self):
        self.call['dispatch_version']=16;self.assertIsNone(self.receipt())
        self.call['dispatch_version']=15;self.assertIsNotNone(self.receipt())

    def test_known_binding_must_match_source_and_step(self):
        receipt=self.receipt()
        self.call['dispatch_version']=16
        self.call['settled_dispatch']={k:v for k,v in receipt.items() if k not in ['source','status','exit_code','record_sha256']}
        self.assertIsNotNone(self.receipt())
        self.call['settled_dispatch']['step_index']=0;self.assertIsNone(self.receipt())

    def test_existing_indexed_echo_still_requires_exact_indices(self):
        self.source=self.source.replace('r.forEach(text)','r.forEach((v,i)=>text({i,...v}))')
        self.call['dispatch_version']=5
        for i,result in enumerate(self.results):result['i']=i
        self.assertIsNotNone(self.receipt())
        self.results[0]['i']=1;self.assertIsNone(self.receipt())

    def test_duplicate_or_wrong_turn_host_reply_is_rejected(self):
        self.assertIsNone(self.receipt(lambda r:r.append(copy.deepcopy(r[-1]))))
        self.assertIsNone(self.receipt(lambda r:r[-1]['payload']['internal_chat_message_metadata_passthrough'].update(turn_id='other')))

    def test_patch_is_idempotent_and_rejects_unexpected_version(self):
        candidate=repair.patch(original);self.assertEqual(repair.patch(candidate),candidate)
        self.assertIn(repair.MARKER,candidate)
        if repair.MARKER not in original:
            with self.assertRaises(ValueError):repair.patch(original.replace("'dispatch_version': 15", "'dispatch_version': 99"))


if __name__ == '__main__': unittest.main()
