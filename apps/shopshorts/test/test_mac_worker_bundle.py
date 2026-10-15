import hashlib
import importlib.util
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
import zipfile

HERE = Path(__file__).resolve().parents[1] / 'mac-worker'


def load(name, file):
    spec = importlib.util.spec_from_file_location(name, HERE / file)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


builder = load('mac_builder', 'build-bundle.py')
control = load('mac_control', 'control.py')


class MacMigrationTests(unittest.TestCase):
    def test_excludes_credentials_caches_other_apps_and_media(self):
        for path in ['.env', 'apps/shopshorts/.env.production', 'apps/shopshorts/data/credential-runner.jwk',
                     'apps/credential-broker/secret.json', 'apps/shopshorts/token.json',
                     'packages/tts-narration/node_modules/key.js', 'apps/shopshorts/work/f.mp4',
                     'apps/shopshorts/private/key.json', 'apps/hanmadi/server.mjs', 'output/a.json']:
            self.assertFalse(builder.include(path), path)
        for path in ['package-lock.json', 'apps/hanmadi/package.json', 'apps/shopshorts/studio-service.mjs',
                     'apps/credential-broker/runner-client.mjs', 'packages/tts-narration/src/cli/index.ts',
                     'docs/videos/20261010-sapporo/render.py', 'apps/shopshorts/public/Pretendard-SemiBold.otf']:
            self.assertTrue(builder.include(path), path)

    def test_real_committed_source_bundle_roundtrip_and_tamper(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            out = root / 'worker.zip'
            manifest = builder.build(builder.ROOT, 'HEAD', out)
            with zipfile.ZipFile(out) as z:
                self.assertEqual(len(z.namelist()), len(set(z.namelist())))
                self.assertTrue(all(x.startswith(builder.PREFIX) for x in z.namelist()))
                self.assertTrue(z.getinfo(builder.PREFIX + 'Install.command').external_attr >> 16 & 0o111)
                z.extractall(root / 'unpacked')
            package = root / 'unpacked' / 'Shopshorts-Mac-Worker'
            self.assertEqual(control.verify_bundle(package)['revision'], manifest['revision'])
            with self.assertRaises(FileExistsError):
                builder.build(builder.ROOT, 'HEAD', out)
            file = package / 'source/apps/shopshorts/studio-service.mjs'
            file.write_text(file.read_text() + '\n// changed\n')
            with self.assertRaisesRegex(ValueError, '변경'):
                control.verify_bundle(package)

    def test_manifest_rejects_traversal_symlink_and_extra_secret(self):
        for mode in ['traversal', 'symlink', 'extra']:
            with self.subTest(mode=mode), tempfile.TemporaryDirectory() as tmp:
                root = Path(tmp)
                (root / 'a').write_bytes(b'hello')
                files = {'a': hashlib.sha256(b'hello').hexdigest()}
                if mode == 'traversal':
                    files['../outside'] = files.pop('a')
                elif mode == 'symlink':
                    (root / 'a').unlink()
                    (root / 'a').symlink_to('/etc/hosts')
                else:
                    (root / 'secret.json').write_text('{"private":"test"}')
                (root / 'manifest.json').write_text(json.dumps({'format': 1, 'revision': 'a' * 40, 'files': files}))
                with self.assertRaises(ValueError):
                    control.verify_bundle(root)

    def test_company_mac_guard_fails_before_any_install(self):
        with patch.object(control.platform, 'system', return_value='Darwin'), \
             patch.object(control, 'host_id', return_value='source-mac'), \
             patch.object(control, 'verify_bundle', return_value={'sourceHost': 'source-mac'}), \
             patch.object(control.subprocess, 'run') as execute:
            with self.assertRaisesRegex(ValueError, '회사 Mac'):
                control.prepare_check()
            execute.assert_not_called()

    def test_native_service_paths_and_readonly_doctor_do_not_activate(self):
        home = Path('/Users/target user')
        cfg = control.service_config(home / 'workSpace/source', Path('/opt/homebrew/opt/node@22/bin/node'),
                                     home / 'private/venv/bin/python', home / 'iCloud/render', home, '/opt/homebrew/bin')
        self.assertIn('Library/Application Support', cfg['EnvironmentVariables']['TMPDIR'])
        self.assertNotIn('iCloud', cfg['EnvironmentVariables']['TMPDIR'])
        self.assertIn('iCloud', cfg['EnvironmentVariables']['SHOPSHORTS_WORK_DIR'])
        commands = []
        control.doctor(cfg, home, command=lambda args, **kw: commands.append([str(x) for x in args]))
        self.assertEqual(len(commands), 6)
        self.assertFalse(any('launchctl' in x for cmd in commands for x in cmd))
        self.assertTrue(any('check-connection.mjs' in x for cmd in commands for x in cmd))
        self.assertFalse(any('render.py' in x for cmd in commands for x in cmd))

    def test_key_validation_never_accepts_public_only_or_links(self):
        with tempfile.TemporaryDirectory() as tmp:
            p = Path(tmp) / 'key.jwk'
            p.write_text(json.dumps({'kty': 'OKP', 'crv': 'Ed25519', 'x': 'A' * 43}))
            with self.assertRaises(ValueError):
                control.validate_key(p)
            link = p.with_name('link.jwk')
            link.symlink_to(p)
            with self.assertRaises(ValueError):
                control.validate_key(link)

    def test_failed_connection_check_never_bootstraps_worker(self):
        with tempfile.TemporaryDirectory() as tmp:
            home = Path(tmp)
            cfg = control.service_config(home / 'src', Path('/node/bin/node'), home / 'python', home / 'work', home, '/bin')
            control.config_path(home).parent.mkdir(parents=True)
            control.config_path(home).write_text(json.dumps(cfg))
            commands = []
            with patch.object(control.Path, 'home', return_value=home), \
                 patch.object(control, 'run', side_effect=lambda args, **kw: commands.append(args)), \
                 patch.object(control.subprocess, 'run', return_value=type('Result', (), {'returncode': 1})()), \
                 patch.object(control, 'doctor', side_effect=ValueError('TLS failed')):
                with self.assertRaisesRegex(ValueError, 'TLS failed'):
                    control.manage('start')
            self.assertFalse(any('bootstrap' in cmd for cmd in commands))
            self.assertFalse((home / 'Library/LaunchAgents').exists())


if __name__ == '__main__':
    unittest.main()
