import copy
import importlib.util
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import types
import unittest
from unittest.mock import patch

sys.dont_write_bytecode = True
spec = importlib.util.spec_from_file_location('local_config_patch', Path(__file__).with_name('task-finish-local-config.py'))
installer = importlib.util.module_from_spec(spec)
spec.loader.exec_module(installer)
source = (Path.home()/'.codex/hooks/task-finish/gate.py').read_text()
gate = types.ModuleType('gate')
exec(compile(installer.patch(source), '<patched-gate>', 'exec'), gate.__dict__)


class LocalConfig(unittest.TestCase):
    def git(self, *args):
        return subprocess.check_output(['git', '-C', self.root, *args], stderr=subprocess.DEVNULL).decode().strip()

    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = str((Path(self.temp.name)/'repo').resolve())
        Path(self.root).mkdir()
        self.git('init', '-b', 'task')
        self.git('config', 'user.name', 'Test')
        self.git('config', 'user.email', 'test@example.invalid')
        (Path(self.root)/'.gitignore').write_text('.env*\nignored.py\n')
        (Path(self.root)/'app.py').write_text('original\n')
        self.git('add', '.gitignore', 'app.py')
        self.git('commit', '-m', 'base')
        self.secret = Path(self.root)/'.env'
        self.secret.write_text('TOKEN=synthetic-test-only\n')
        self.secret.chmod(0o600)
        self.store = gate.Store(Path(self.temp.name)/'state')
        self.addCleanup(self.store.db.close)
        self.sid = 'test-session'
        data = self.store.get(self.sid, self.root)
        gate.track_file(data, self.root, '.env')
        data['files']['.env']['edited'] = True
        self.save(data)

    def save(self, data):
        self.store.save(self.sid, self.root, data)
        self.store.db.commit()

    def approve(self):
        plan = gate.local_config_plan(self.store, self.sid, self.root, ['.env'])
        result = gate.approve_local_config(self.store, self.sid, self.root, ['.env'], plan['source_digest'], 'User explicitly approved retaining this local secret configuration')
        return plan, result

    def test_explicit_receipt_preserves_ownership_and_never_contains_values(self):
        before = self.store.get(self.sid, self.root)
        self.assertIn('미커밋', gate.check(before, self.root)[0])
        plan, result = self.approve()
        after = self.store.get(self.sid, self.root)
        self.assertEqual(after['files'], before['files'])
        self.assertEqual(after['calls'], before['calls'])
        self.assertEqual(after['status'], before['status'])
        self.assertEqual(result['completion'], 'not-evaluated')
        self.assertNotIn('synthetic-test-only', json.dumps([plan, result, after]))
        self.assertEqual(gate.check(after, self.root), [])

    def test_content_change_invalidates_even_without_observation_update(self):
        self.approve()
        self.secret.write_text('TOKEN=changed\n')
        self.assertTrue(gate.check(self.store.get(self.sid, self.root), self.root))

    def test_changed_blob_after_reconcile_requires_new_approval(self):
        self.approve()
        self.secret.write_text('TOKEN=changed\n')
        data = self.store.get(self.sid, self.root)
        data['files']['.env']['after'] = gate.blob(self.root, '.env')
        self.save(data)
        self.assertTrue(gate.check(data, self.root))
        self.approve()
        self.assertEqual(gate.check(self.store.get(self.sid, self.root), self.root), [])

    def test_stale_plan_and_missing_explicit_reason_are_rejected(self):
        plan = gate.local_config_plan(self.store, self.sid, self.root, ['.env'])
        for digest, reason in [('', 'reason'), (plan['source_digest'], ''), ('bad-digest', 'reason')]:
            with self.subTest(digest=digest), self.assertRaises(gate.GuardError):
                gate.approve_local_config(self.store, self.sid, self.root, ['.env'], digest, reason)
        self.secret.write_text('changed\n')
        with self.assertRaises(gate.GuardError):
            gate.approve_local_config(self.store, self.sid, self.root, ['.env'], plan['source_digest'], 'reason')
        self.assertNotIn('local_config_approvals', self.store.get(self.sid, self.root))

    def test_staged_secret_is_never_exempt(self):
        self.approve()
        self.git('add', '-f', '.env')
        self.assertTrue(gate.check(self.store.get(self.sid, self.root), self.root))
        with self.assertRaises(gate.GuardError):
            gate.local_config_plan(self.store, self.sid, self.root, ['.env'])

    def test_committed_or_previously_tracked_secret_is_rejected(self):
        self.git('add', '-f', '.env')
        self.git('commit', '-m', 'test-only dummy tracked file')
        with self.assertRaises(gate.GuardError):
            self.approve()
        self.git('rm', '--cached', '.env')
        with self.assertRaises(gate.GuardError):
            self.approve()

    def test_ignore_removed_invalidates_receipt(self):
        self.approve()
        (Path(self.root)/'.gitignore').write_text('ignored.py\n')
        self.assertTrue(gate.check(self.store.get(self.sid, self.root), self.root))

    def test_permissions_missing_file_symlink_and_hardlink_rejected(self):
        self.approve()
        self.secret.chmod(0o644)
        self.assertTrue(gate.check(self.store.get(self.sid, self.root), self.root))
        self.secret.unlink()
        self.assertTrue(gate.check(self.store.get(self.sid, self.root), self.root))
        external = Path(self.temp.name)/'external'
        external.write_text('value'); external.chmod(0o600)
        self.secret.symlink_to(external)
        self.assertTrue(gate.check(self.store.get(self.sid, self.root), self.root))
        self.secret.unlink()
        os.link(external, self.secret)
        with self.assertRaises(gate.GuardError):
            self.approve()

    def test_code_and_templates_cannot_use_exception(self):
        for name in ['ignored.py', '.env.py', '.env.example']:
            f = Path(self.root)/name; f.write_text('content'); f.chmod(0o600)
            data = self.store.get(self.sid, self.root)
            gate.track_file(data, self.root, name); data['files'][name]['edited'] = True; self.save(data)
            with self.subTest(name=name), self.assertRaises(gate.GuardError):
                gate.local_config_plan(self.store, self.sid, self.root, [name])

    def test_no_ownership_unknown_and_inflight_edits_rejected(self):
        initial = self.store.get(self.sid, self.root)
        for mutate in [lambda d: d['files'].clear(),
                       lambda d: d['unknown'].update({'.env': {}}),
                       lambda d: d['calls'].update({'pending': {'paths': ['.env']}}),
                       lambda d: d.update(coverage_problem='incomplete')]:
            data = copy.deepcopy(initial); mutate(data); self.save(data)
            with self.assertRaises(gate.GuardError): self.approve()

    def test_other_owner_rejected_and_existing_hold_preserved(self):
        initial = self.store.get(self.sid, self.root)
        self.store.save('other', self.root, copy.deepcopy(initial)); self.store.db.commit()
        with self.assertRaises(gate.GuardError): self.approve()
        other = copy.deepcopy(initial); other['status'] = 'complete'
        self.store.save('other', self.root, other); self.store.db.commit()
        initial['hold'] = 'real unresolved blocker'; self.save(initial)
        self.approve()
        after = self.store.get(self.sid, self.root)
        self.assertEqual(after['hold'], 'real unresolved blocker')
        with patch.object(gate, 'reconcile_calls', return_value=after):
            self.assertIn('real unresolved blocker', gate.stop_event(self.store, self.sid, self.root, {})['stopReason'])

    def test_normal_code_still_needs_commit_and_upstream_push(self):
        self.approve()
        data = self.store.get(self.sid, self.root)
        gate.track_file(data, self.root, 'app.py')
        (Path(self.root)/'app.py').write_text('changed\n')
        data['files']['app.py']['after'] = gate.blob(self.root, 'app.py')
        data['files']['app.py']['edited'] = True; self.save(data)
        self.assertTrue(any('app.py' in x for x in gate.check(data, self.root)))
        self.git('add', 'app.py'); self.git('commit', '-m', 'own code')
        self.assertTrue(any('upstream' in x for x in gate.check(data, self.root)))
        remote = str(Path(self.temp.name)/'remote.git')
        subprocess.check_call(['git', 'init', '--bare', remote], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        self.git('remote', 'add', 'origin', remote)
        self.git('push', '-u', 'origin', 'task')
        self.assertEqual(gate.check(data, self.root), [])
        (Path(self.root)/'app.py').write_text('unpushed\n')
        data['files']['app.py']['after'] = gate.blob(self.root, 'app.py')
        self.git('add', 'app.py'); self.git('commit', '-m', 'not pushed')
        self.assertTrue(any('원격 반영' in x for x in gate.check(data, self.root)))

    def test_unknown_paths_and_bad_receipts_remain_blocking(self):
        self.approve()
        data = self.store.get(self.sid, self.root)
        data['unknown']['other.txt'] = {}
        self.assertTrue(any('other.txt' in x for x in gate.check(data, self.root)))
        data['unknown'].clear()
        data['local_config_approvals'][-1]['source_digest'] = 'tampered'
        self.assertTrue(gate.check(data, self.root))

    def test_patch_idempotent_and_partial_patch_refused(self):
        updated = installer.patch(source)
        self.assertEqual(installer.patch(updated), updated)
        with self.assertRaises(ValueError): installer.patch(updated.replace(installer.CLI, ''))


if __name__ == '__main__':
    unittest.main()
