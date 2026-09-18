import importlib.util
import sys
sys.dont_write_bytecode=True
from pathlib import Path
import tempfile
import types
import unittest
from unittest.mock import patch
spec=importlib.util.spec_from_file_location('repair',Path(__file__).with_name('task-finish-directory-recovery.py'))
repair=importlib.util.module_from_spec(spec);spec.loader.exec_module(repair)
gate=types.ModuleType('gate')
exec(compile(repair.patch((Path.home()/'.codex/hooks/task-finish/gate.py').read_text()),'<patched>','exec'),gate.__dict__)

class Recovery(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory();self.addCleanup(self.temp.cleanup)
        self.store=gate.Store(Path(self.temp.name));self.addCleanup(self.store.db.close)
        self.data={'base':'abc','branch':'feature','files':{'fonts':{'before':None,'after':None,'original_head':None,'registered':True,'edited':True}},'unknown':{},'calls':{'pending':{'known_before':{'fonts':None}}},'status':'pending'}
        self.store.save('session','repo',self.data);self.store.db.commit()
    def test_absent_registration_audited_without_finishing_calls(self):
        with patch.object(gate,'blob',return_value=None):
            gate.cancel_empty_track(self.store,'session','repo',['fonts'],'mistaken directory path')
        data=self.store.get('session','repo')
        self.assertEqual(data['calls'],self.data['calls']);self.assertEqual(data['status'],'unfinished')
        self.assertEqual(data['files'],{});self.assertEqual(data['cancelled_empty_registrations'][0]['record'],self.data['files']['fonts'])
    def test_actual_file_or_directory_cannot_be_cancelled(self):
        for value in ['100644:abc','unsupported']:
            with self.subTest(value=value),patch.object(gate,'blob',return_value=value):
                with self.assertRaises(gate.GuardError):gate.cancel_empty_track(self.store,'session','repo',['fonts'],'reason')
        self.assertIn('fonts',self.store.get('session','repo')['files'])
    def test_prior_changes_and_incomplete_evidence_are_preserved(self):
        for key in ['before','after','original_head']:
            data=gate.copy.deepcopy(self.data);data['files']['fonts'][key]='100644:abc';self.store.save('session','repo',data);self.store.db.commit()
            with patch.object(gate,'blob',return_value=None),self.assertRaises(gate.GuardError):gate.cancel_empty_track(self.store,'session','repo',['fonts'],'reason')
        data=gate.copy.deepcopy(self.data);data['calls']['pending']['known_before']['fonts']='unsupported';self.store.save('session','repo',data);self.store.db.commit()
        with patch.object(gate,'blob',return_value=None),self.assertRaises(gate.GuardError):gate.cancel_empty_track(self.store,'session','repo',['fonts'],'reason')
    def test_stop_still_rejects_coverage_failures(self):
        self.assertTrue(gate.check({'coverage_problem':'unsupported directory'},'repo'))
    def test_patch_is_idempotent(self):
        source=(Path.home()/'.codex/hooks/task-finish/gate.py').read_text()
        self.assertEqual(repair.patch(repair.patch(source)),repair.patch(source))

class TrailingPolls(unittest.TestCase):
    def test_only_empty_polls_after_one_literal_command(self):
        source='text(await tools.exec_command({cmd:"echo check"}));text(await tools.write_stdin({session_id:1,chars:""}));text(await tools.write_stdin({session_id:2,chars:""}));'
        self.assertEqual(len(gate.trailing_poll_batch(source)),3)
        self.assertIsNone(gate.trailing_poll_batch(source.replace('chars:""','chars:"x"')))
        self.assertIsNone(gate.trailing_poll_batch(source+'text(await tools.exec_command({cmd:"echo extra"}));'))

    def receipt(self,version=10,count=3,completed=False,extra=False):
        link={'outer_call_id':'outer','thread_id':'session','transcript_path':'host','turn_id':'turn','source_sha256':'digest'}
        request={'timestamp':'2026-01-01T00:00:01Z'}
        failure='Script error:\nexec_command failed: CreateProcess { message: "Rejected(\\"This action was rejected due to unacceptable risk.'
        reply={'type':'response_item','timestamp':'2026-01-01T00:00:03Z','payload':{'type':'custom_tool_call_output','call_id':'outer','internal_chat_message_metadata_passthrough':{'turn_id':'turn'},'output':[{'type':'input_text','text':f'Script {"completed" if completed else "failed"}\nWall time 2.0 seconds\nOutput:\n'},{'type':'input_text','text':failure}]}}
        call={'prepared_at':1767225602,'dispatch_version':version,'transcript_path':'host','turn_id':'turn','tool_name':'Bash'}
        steps=[('Bash','echo check')]+[('poll',{'session_id':i+1,'chars':''}) for i in range(count-1)]
        calls={'call':call}
        if extra:calls['other']=dict(call)
        with patch.object(gate,'batch_envelope',return_value=(link,steps,request,[reply])):
            return gate.batch_failure_receipt('session','repo','call',call,calls,parser=gate.trailing_poll_batch,binding='trailing_poll_dispatch',introduced=8)

    def test_legacy_unsupported_rejection_is_terminal_but_not_success(self):
        receipt=self.receipt();self.assertEqual(receipt['status'],'declined');self.assertIsNone(receipt['exit_code']);self.assertEqual(receipt['step_index'],0)

    def test_supported_unbound_or_ambiguous_or_success_remains_unresolved(self):
        self.assertIsNone(self.receipt(version=11))
        self.assertIsNone(self.receipt(count=2))
        self.assertIsNone(self.receipt(extra=True))
        self.assertIsNone(self.receipt(completed=True))
if __name__=='__main__':unittest.main()
