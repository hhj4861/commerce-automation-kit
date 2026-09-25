import importlib.util
from pathlib import Path
import plistlib
import tempfile
import unittest
from types import SimpleNamespace

spec = importlib.util.spec_from_file_location('installer', Path(__file__).parents[1] / 'install-studio-service.py')
installer = importlib.util.module_from_spec(spec)
spec.loader.exec_module(installer)


class InstallStudioServiceTest(unittest.TestCase):
    def test_temporary_and_symlinked_checkout_rejected(self):
        self.assertFalse(installer.persistent_checkout(Path('/tmp/production')))
        self.assertFalse(installer.persistent_checkout(Path('/private/tmp/production')))
        self.assertFalse(installer.persistent_checkout(Path(tempfile.gettempdir()) / 'production'))
        self.assertTrue(installer.persistent_checkout(Path.home() / 'workSpace/shopshorts-production'))
        with tempfile.TemporaryDirectory() as tmp:
            link = Path(tmp) / 'link'
            link.symlink_to('/tmp/production')
            self.assertFalse(installer.persistent_checkout(link))

    def test_both_workers_use_login_agents_and_only_existing_key_path(self):
        with tempfile.TemporaryDirectory() as tmp:
            home = Path(tmp)
            for service in installer.SERVICES:
                calls = []
                config = installer.service_config(Path('/persistent/release'), home, '/bin/node', service, '/bin')
                def run(args, **kwargs):
                    calls.append(args)
                    return SimpleNamespace(returncode=0)
                installer.install(config, home, run)
                path = home / 'Library/LaunchAgents' / f"{config['Label']}.plist"
                self.assertEqual(plistlib.loads(path.read_bytes()), config)
                self.assertEqual(path.stat().st_mode & 0o777, 0o600)
                self.assertTrue(config['RunAtLoad'] and config['KeepAlive'])
                self.assertEqual(set(config['EnvironmentVariables']), {'HOME', 'PATH', 'CAK_RUNNER_KEY_FILE'})
                commands = [c[0:2] for c in calls]
                self.assertLess(commands.index(['plutil', '-lint']), commands.index(['launchctl', 'bootout']))
                self.assertIn(['launchctl', 'bootstrap'], commands)

    def test_invalid_plist_never_stops_running_worker_or_replaces_config(self):
        with tempfile.TemporaryDirectory() as tmp:
            home = Path(tmp)
            config = installer.service_config(Path('/release'), home, '/bin/node', 'accounts', '/bin')
            path = home / 'Library/LaunchAgents/com.cak.llm-accounts.plist'
            path.parent.mkdir(parents=True)
            path.write_bytes(b'previous config')
            def run(args, **kwargs):
                self.assertEqual(args[0], 'plutil')
                raise RuntimeError('invalid')
            with self.assertRaises(RuntimeError):
                installer.install(config, home, run)
            self.assertEqual(path.read_bytes(), b'previous config')
            self.assertFalse(path.with_suffix('.plist.pending').exists())


if __name__ == '__main__':
    unittest.main()
