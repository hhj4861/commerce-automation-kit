import fcntl
import importlib.util
import json
from pathlib import Path
import subprocess
import tempfile
import unittest

spec = importlib.util.spec_from_file_location('release', Path(__file__).with_name('litellm-release.py'))
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
SHA = 'a' * 40


class ReleaseTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.home = Path(self.temp.name).resolve()
        self.old = self.home / 'repo/services/ai-gateway'
        self.runtime = self.old / '.runtime'
        self.runtime.mkdir(parents=True)
        (self.old / '.env').write_text('DO_NOT_ROTATE=fixture\n')
        (self.runtime / 'subscriptions/alice/auth').mkdir(parents=True)
        (self.runtime / 'subscriptions/alice/auth/auth.json').write_text('private-auth-fixture')
        (self.runtime / 'subscriptions/alice/config.json').write_text('original-account-config')
        (self.runtime / 'litellm.json').write_text('original-config')
        (self.runtime / 'subscriptions.compose.json').write_text(json.dumps({'services': {'gateway': {}, 'codex-alice': {}}}))
        self.source = self.home / 'source'
        self.source.mkdir()
        for name in module.FILES:
            (self.source / name).write_text('fixture-' + name)
        self.calls = []

    def execute(self, args, cwd, stdout=subprocess.DEVNULL):
        self.calls.append((args, cwd))
        if 'pg_dump' in args:
            stdout.write(b'fixture database dump')
        if args[0] == 'python3':
            # The CLI's account lock must stay held while rendering and restarting.
            with (self.runtime / 'subscriptions/.lock').open('a') as lock:
                with self.assertRaises(BlockingIOError):
                    fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
            (self.runtime / 'litellm.json').write_text('new-config')

    def release(self, execute=None, sha=SHA):
        module.release(self.source, sha, self.home, execute or self.execute)

    def test_success_preserves_secrets_and_restarts_only_gateway_and_account_workers(self):
        self.release()
        record = json.loads((self.home / 'gitops/litellm.json').read_text())
        self.assertEqual(record['sha'], SHA)
        destination = Path(record['source'])
        self.assertTrue((destination / '.env').is_symlink())
        self.assertEqual((destination / '.env').read_text(), 'DO_NOT_ROTATE=fixture\n')
        self.assertEqual((destination / '.runtime/subscriptions/alice/auth/auth.json').read_text(), 'private-auth-fixture')
        backup = Path(record['backup']) / 'postgres.sql'
        self.assertEqual(backup.stat().st_mode & 0o777, 0o600)
        self.assertEqual(backup.read_bytes(), b'fixture database dump')
        self.assertIn('pg_dump', self.calls[0][0])
        starts = [args for args, _ in self.calls if 'up' in args]
        self.assertEqual(len(starts), 1)
        self.assertEqual(starts[0][-2:], ['gateway', 'codex-alice'])
        self.assertIn('--no-deps', starts[0])
        for args, _ in self.calls:
            self.assertNotIn('down', args)
            self.assertNotIn('init', args)

    def test_health_failure_restores_previous_config_and_container_revision(self):
        def failing(args, cwd, **kwargs):
            self.execute(args, cwd, **kwargs)
            if args[0] == 'curl':
                raise RuntimeError('fixture readiness failure')
        with self.assertRaisesRegex(RuntimeError, 'previous configuration restored'):
            self.release(failing)
        self.assertEqual((self.runtime / 'litellm.json').read_text(), 'original-config')
        self.assertFalse((self.home / 'gitops/litellm.json').exists())
        self.assertEqual(self.calls[-1][1], self.old)
        self.assertIn('up', self.calls[-1][0])

    def test_failed_backup_never_renders_or_restarts(self):
        def fail_backup(args, cwd, **kwargs):
            self.calls.append((args, cwd))
            raise RuntimeError('backup failed')
        with self.assertRaisesRegex(RuntimeError, 'backup failed'):
            self.release(fail_backup)
        self.assertEqual(len(self.calls), 1)
        self.assertEqual((self.runtime / 'litellm.json').read_text(), 'original-config')

    def test_unexpected_service_is_rejected_before_restart(self):
        def inject(args, cwd, **kwargs):
            self.execute(args, cwd, **kwargs)
            if args[0] == 'python3':
                (self.runtime / 'subscriptions.compose.json').write_text(json.dumps({'services': {'gateway': {}, 'accounts': {}}}))
        with self.assertRaisesRegex(RuntimeError, 'previous configuration restored'):
            self.release(inject)
        self.assertFalse(any('up' in args for args, _ in self.calls))
        self.assertEqual(module.services(self.old), ['gateway', 'codex-alice'])

    def test_account_admin_lock_blocks_release_without_creating_revision(self):
        with (self.runtime / 'subscriptions/.lock').open('a') as lock:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
            with self.assertRaises(BlockingIOError):
                self.release()
        self.assertFalse(self.calls)
        self.assertFalse((self.home / 'releases' / f'gitops-litellm-{SHA}').exists())

    def test_duplicate_revision_and_bad_sha_cannot_overwrite_release(self):
        self.release()
        with self.assertRaisesRegex(ValueError, 'immutable'):
            self.release()
        with self.assertRaisesRegex(ValueError, 'Full commit'):
            self.release(sha='main; rm')

    def test_missing_initial_state_cannot_provision_new_secrets(self):
        (self.old / '.env').unlink()
        with self.assertRaisesRegex(ValueError, 'initial provisioning'):
            self.release()
        self.assertFalse(self.calls)

    def test_rollback_failure_is_reported(self):
        def failing(args, cwd, **kwargs):
            self.execute(args, cwd, **kwargs)
            if args[0] == 'curl' or ('up' in args and cwd == self.old):
                raise RuntimeError('fixture failure')
        with self.assertRaisesRegex(RuntimeError, 'Deployment and rollback failed'):
            self.release(failing)


if __name__ == '__main__':
    unittest.main()
