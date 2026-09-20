import copy
import importlib.util
import json
from pathlib import Path
import sys
import types
import unittest
from unittest.mock import patch

sys.dont_write_bytecode = True
spec = importlib.util.spec_from_file_location('repair', Path(__file__).with_name('task-finish-mixed-recovery.py'))
repair = importlib.util.module_from_spec(spec)
spec.loader.exec_module(repair)
source = (Path.home()/'.codex/hooks/task-finish/gate.py').read_text()
gate = types.ModuleType('gate')
exec(compile(repair.patch(source), '<candidate-gate>', 'exec'), gate.__dict__)

PATCH = '''*** Begin Patch
*** Update File: /tmp/example.mjs
@@
-const version = 1;
+const version = 2;
@@
-run();
+setup();
+run();
*** End Patch'''
ITEM = {
    'type': 'FileChange', 'id': 'native-patch', 'status': 'completed',
    'changes': {'/tmp/example.mjs': {
        'type': 'update', 'move_path': None,
        'unified_diff': '@@ -1,2 +1,2 @@\n-const version = 1;\n+const version = 2;\n keep();\n@@ -9,2 +9,3 @@\n before();\n+setup();\n run();\n',
    }},
}


class ExactPatchEvidence(unittest.TestCase):
    def test_completed_updates_match_including_unchanged_replacement_lines(self):
        self.assertTrue(gate.completed_update_patch(PATCH, {}, ITEM))

    def test_repair_is_idempotent_and_preserves_stop_and_ownership_checks(self):
        updated = repair.patch(source)
        self.assertEqual(repair.patch(updated), updated)
        for start, end in [('def stop_event(', '\ndef handle('), ('def check(', '\ndef stop_event('), ('def reconcile_calls(', '\ndef state_digest(')]:
            if start in source and end in source:
                self.assertEqual(source[source.index(start):source.index(end)], updated[updated.index(start):updated.index(end)])

    def test_changed_path_or_content_or_unrequested_edits_cannot_match(self):
        for mutate in [
            lambda i: i['changes'].update({'/tmp/unrequested': dict(i['changes']['/tmp/example.mjs'])}),
            lambda i: i['changes']['/tmp/example.mjs'].update(move_path='/tmp/moved'),
            lambda i: i['changes']['/tmp/example.mjs'].update(type='add'),
            lambda i: i['changes']['/tmp/example.mjs'].update(unified_diff=ITEM['changes']['/tmp/example.mjs']['unified_diff'].replace('+setup();', '+other();')),
            lambda i: i['changes']['/tmp/example.mjs'].update(unified_diff=ITEM['changes']['/tmp/example.mjs']['unified_diff'].replace(' keep();', '-keep();\n+extra();')),
        ]:
            item = copy.deepcopy(ITEM); mutate(item)
            self.assertFalse(gate.completed_update_patch(PATCH, {}, item))

    def test_incomplete_or_ambiguous_or_unsupported_evidence_stays_unresolved(self):
        for patch_text in [PATCH.replace('/tmp/example.mjs', 'example.mjs'), PATCH.replace('*** Update File:', '*** Delete File:'), PATCH.replace('@@\n-run();', '@@\n*** Move to: /tmp/x\n-run();'), PATCH.replace('-run();\n', ''), PATCH+'\nextra']:
            self.assertFalse(gate.completed_update_patch(patch_text, {}, ITEM))
        for fields in [{'status':'failed'}, {'status':'in_progress'}, {'exit_code':0}, {'process_id':12}, {'id':None}]:
            item=copy.deepcopy(ITEM); item.update(fields)
            self.assertFalse(gate.completed_update_patch(PATCH, {}, item))
        self.assertFalse(gate.completed_update_patch(PATCH, {'success':True}, ITEM))
        item=copy.deepcopy(ITEM)
        item['changes']['/tmp/example.mjs']['unified_diff']=item['changes']['/tmp/example.mjs']['unified_diff'].replace('-9,2 +9,3','-9,3 +9,4').replace(' before();',' run();')
        self.assertFalse(gate.completed_update_patch(PATCH, {}, item))

    def test_extra_hunk_and_forged_line_counts_do_not_match(self):
        for diff in [ITEM['changes']['/tmp/example.mjs']['unified_diff']+'@@ -99 +99 @@\n-old\n+new\n', ITEM['changes']['/tmp/example.mjs']['unified_diff'].replace('-1,2','-1,9')]:
            item=copy.deepcopy(ITEM);item['changes']['/tmp/example.mjs']['unified_diff']=diff
            self.assertFalse(gate.completed_update_patch(PATCH, {}, item))


class BatchFailureEvidence(unittest.TestCase):
    def fixture(self):
        link={'outer_call_id':'outer','thread_id':'session','transcript_path':'host','turn_id':'turn','source_sha256':'digest'}
        call={'prepared_at':1767225603,'dispatch_version':11,'transcript_path':'host','turn_id':'turn','tool_name':'Bash','batch_dispatch':{**link,'step_index':1}}
        native={'type':'event_msg','timestamp':'2026-01-01T00:00:02Z','payload':{'type':'item_completed','thread_id':'session','turn_id':'turn','completed_at_ms':1767225602000,'item':copy.deepcopy(ITEM)}}
        failure='Script error:\nexec_command failed: CreateProcess { message: "Rejected(\\"This action was rejected due to unacceptable risk.'
        reply={'type':'response_item','timestamp':'2026-01-01T00:00:04Z','payload':{'type':'custom_tool_call_output','call_id':'outer','internal_chat_message_metadata_passthrough':{'turn_id':'turn'},'output':[{'type':'input_text','text':'Script failed\nWall time 3.0 seconds\nOutput:\n'},{'type':'input_text','text':'{}'},{'type':'input_text','text':failure}]}}
        return {'link':link,'steps':[('apply_patch',PATCH),('Bash','echo test')],'request':{'timestamp':'2026-01-01T00:00:01Z'},'records':[native,reply],'calls':{'call':call},'call':call}

    def receipt(self,f):
        with patch.object(gate,'batch_envelope',return_value=(f['link'],f['steps'],f['request'],f['records'])):
            return gate.batch_failure_receipt('session','repo','call',f['call'],f['calls'])

    def test_host_rejection_is_declined_never_exit_zero(self):
        receipt=self.receipt(self.fixture())
        self.assertEqual(receipt['status'],'declined');self.assertIsNone(receipt['exit_code'])
        self.assertEqual(receipt['step_index'],1);self.assertEqual(receipt['source'],'batch-dispatch-failure')

    def test_missing_duplicate_wrong_turn_or_late_native_evidence_is_rejected(self):
        for change in ['missing','duplicate','wrong-turn','wrong-thread','late','unfinished']:
            with self.subTest(change=change):
                f=self.fixture();p=f['records'][0]['payload']
                if change=='missing':f['records'].pop(0)
                elif change=='duplicate':f['records'].insert(0,copy.deepcopy(f['records'][0]))
                elif change=='wrong-turn':p['turn_id']='other'
                elif change=='wrong-thread':p['thread_id']='other'
                elif change=='late':p['completed_at_ms']=1767225603500
                elif change=='unfinished':p['item']['status']='in_progress'
                self.assertIsNone(self.receipt(f))

    def test_wrong_bound_source_step_and_ambiguous_calls_are_rejected(self):
        for change in ['source','step','other-call','unbound','extra-reply']:
            f=self.fixture()
            if change=='source':f['call']['batch_dispatch']['source_sha256']='wrong'
            elif change=='step':f['call']['batch_dispatch']['step_index']=0
            elif change=='other-call':f['calls']['other']=copy.deepcopy(f['call'])
            elif change=='unbound':f['call'].pop('batch_dispatch')
            elif change=='extra-reply':f['records'].append(copy.deepcopy(f['records'][-1]))
            self.assertIsNone(self.receipt(f))

    def test_command_printed_error_or_success_envelope_is_not_host_failure(self):
        for change in ['completed','echo','wrong-turn','before-start']:
            f=self.fixture();r=f['records'][-1]
            if change=='completed':r['payload']['output'][0]['text']=r['payload']['output'][0]['text'].replace('failed','completed')
            elif change=='echo':r['payload']['output'][-1]['text']=json.dumps({'exit_code':0,'output':'This action was rejected due to unacceptable risk.'})
            elif change=='wrong-turn':r['payload']['internal_chat_message_metadata_passthrough']['turn_id']='wrong'
            elif change=='before-start':r['timestamp']='2026-01-01T00:00:02Z'
            self.assertIsNone(self.receipt(f))

    def test_existing_shell_prefix_matching_is_unchanged(self):
        f=self.fixture();f['steps'][0]=('Bash','echo before')
        f['records'][0]['payload']['item']={'type':'CommandExecution','id':'native-command','status':'completed','exit_code':0,'cwd':'/tmp','command':['/bin/zsh','-lc','echo before']}
        f['records'][-1]['payload']['output'][1]['text']=json.dumps({'exit_code':0})
        self.assertEqual(self.receipt(f)['status'],'declined')
        f['records'][0]['payload']['item']['command'][2]='different'
        self.assertIsNone(self.receipt(f))


if __name__=='__main__':
    unittest.main()
