import importlib.util
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
if __name__=='__main__':unittest.main()
