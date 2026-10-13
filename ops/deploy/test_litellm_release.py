import fcntl
import importlib.util
import json
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import unittest

spec = importlib.util.spec_from_file_location('release', Path(__file__).with_name('litellm-release.py'))
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
SHA = 'a' * 40
GATEWAY = Path(__file__).resolve().parents[2] / 'services/ai-gateway'
PINNED = 'services:\n  gateway:\n    image: ghcr.io/berriai/litellm@sha256:' + '0' * 64 + '\n'


class ReleaseTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.home = Path(self.temp.name).resolve()
        self.old = self.home / 'repo/services/ai-gateway'
        self.runtime = self.old / '.runtime'
        self.runtime.mkdir(parents=True)
        (self.old / '.env').write_text('DO_NOT_ROTATE=fixture\n')
        (self.runtime / 'litellm.json').write_text('original-config')
        self.source = self.home / 'source'
        self.source.mkdir()
        for name in module.FILES:
            (self.source / name).write_text(PINNED if name == 'compose.yaml' else 'fixture-' + name)
        self.calls = []

    def execute(self, args, cwd, stdout=subprocess.DEVNULL):
        self.calls.append((args, cwd))
        if 'pg_dump' in args:
            stdout.write(b'fixture database dump')
        if args == list(module.RENDER):
            # The release lock must stay held while rendering and restarting.
            with (self.home / 'gitops/litellm.lock').open('a') as lock:
                with self.assertRaises(BlockingIOError):
                    fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
            (self.runtime / 'litellm.json').write_text('new-config')

    def release(self, execute=None, sha=SHA):
        module.release(self.source, sha, self.home, execute or self.execute)

    def test_success_preserves_secrets_renders_then_restarts_only_gateway(self):
        self.release()
        record = json.loads((self.home / 'gitops/litellm.json').read_text())
        self.assertEqual(record['sha'], SHA)
        destination = Path(record['source'])
        self.assertTrue((destination / '.env').is_symlink())
        self.assertEqual((destination / '.env').read_text(), 'DO_NOT_ROTATE=fixture\n')
        self.assertEqual((destination / '.runtime/litellm.json').read_text(), 'new-config')
        backup = Path(record['backup']) / 'postgres.sql'
        self.assertEqual(backup.stat().st_mode & 0o777, 0o600)
        self.assertEqual(backup.read_bytes(), b'fixture database dump')
        self.assertIn('pg_dump', self.calls[0][0])
        commands = [args for args, _ in self.calls]
        starts = [index for index, args in enumerate(commands) if 'up' in args]
        self.assertEqual(len(starts), 1)
        self.assertLess(commands.index(list(module.RENDER)), starts[0])
        self.assertEqual(commands[starts[0]][-1], 'gateway')
        self.assertIn('--no-deps', commands[starts[0]])
        for args in commands:
            self.assertNotIn('down', args)
            self.assertNotIn('init', args)
            self.assertFalse(any('codex-' in part or 'subscriptions' in part for part in args), args)

    def test_leftover_subscription_overlay_is_ignored(self):
        # D5 retired the per-account workers; files an earlier admin CLI wrote can remain on the host.
        overlay = self.runtime / 'subscriptions.compose.json'
        overlay.write_text(json.dumps({'services': {'gateway': {}, 'codex-alice': {}}}))
        (self.runtime / 'subscriptions.env').write_text('')
        self.release()
        for args, _ in self.calls:
            self.assertNotIn(str(overlay), args)
        starts = [args for args, _ in self.calls if 'up' in args]
        self.assertEqual(starts[0][-1], 'gateway')
        self.assertTrue(overlay.exists())

    def test_unpinned_litellm_image_is_rejected_before_any_command(self):
        (self.source / 'compose.yaml').write_text('services:\n  gateway:\n    image: ghcr.io/berriai/litellm:main-stable\n')
        with self.assertRaisesRegex(ValueError, 'pinned'):
            self.release()
        self.assertFalse(self.calls)
        self.assertFalse((self.home / 'releases' / f'gitops-litellm-{SHA}').exists())

    def test_release_files_exist_in_repository(self):
        for name in module.FILES:
            self.assertTrue((GATEWAY / name).is_file(), name)

    def test_release_files_alone_render_the_gateway_config(self):
        destination = self.home / 'render-check'
        (destination / '.runtime').mkdir(parents=True)
        for name in module.FILES:
            shutil.copyfile(GATEWAY / name, destination / name)
        (destination / '.env').write_text(''.join(f'{key}={value}\n' for key, value in (
            ('LITELLM_MASTER_KEY', 'sk-' + '1' * 64), ('LITELLM_SALT_KEY', 'sk-' + '2' * 64),
            ('POSTGRES_PASSWORD', '3' * 64))))
        subprocess.run([sys.executable, *module.RENDER[1:]], cwd=destination, check=True, capture_output=True)
        self.assertEqual(json.loads((destination / '.runtime/litellm.json').read_text())['model_list'], [])

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
        self.assertEqual(self.calls[-1][0][-1], 'gateway')

    def test_failed_backup_never_renders_or_restarts(self):
        def fail_backup(args, cwd, **kwargs):
            self.calls.append((args, cwd))
            raise RuntimeError('backup failed')
        with self.assertRaisesRegex(RuntimeError, 'backup failed'):
            self.release(fail_backup)
        self.assertEqual(len(self.calls), 1)
        self.assertEqual((self.runtime / 'litellm.json').read_text(), 'original-config')

    def test_concurrent_release_is_blocked_without_creating_revision(self):
        state = self.home / 'gitops'
        state.mkdir()
        with (state / 'litellm.lock').open('a') as lock:
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
