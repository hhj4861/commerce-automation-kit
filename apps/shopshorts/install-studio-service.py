#!/usr/bin/env python3
"""Configure persistent studio launch agents; plist files contain no tokens."""
import argparse
import os
from pathlib import Path
import plistlib
import shutil
import subprocess
import tempfile

SERVICES = {
    'production': ('com.cak.studio-production', 'studio-service.mjs', 'studio-production.log'),
    'accounts': ('com.cak.llm-accounts', 'studio-account-worker.mjs', 'llm-account-worker.log'),
}


def persistent_checkout(root):
    root = root.resolve()
    temporary = [Path('/tmp'), Path('/private/tmp'), Path('/var/tmp'), Path(tempfile.gettempdir())]
    return not any(root == p.resolve() or p.resolve() in root.parents for p in temporary)


def service_config(root, home, node, service, path_env):
    label, entry, logfile = SERVICES[service]
    log = home / 'Library/Logs/Shopshorts' / logfile
    return {'Label': label, 'ProgramArguments': [node, str(root / 'apps/shopshorts' / entry)],
            'WorkingDirectory': str(root), 'RunAtLoad': True, 'KeepAlive': True,
            'ThrottleInterval': 15, 'ExitTimeOut': 600,
            'StandardOutPath': str(log), 'StandardErrorPath': str(log),
            'EnvironmentVariables': {'HOME': str(home), 'PATH': path_env,
                                    'CAK_RUNNER_KEY_FILE': str(home / 'Library/Application Support/Shopshorts/credential-runner.jwk')}}


def install(config, home, run=subprocess.run):
    label = config['Label']
    path = home / 'Library/LaunchAgents' / f'{label}.plist'
    path.parent.mkdir(parents=True, exist_ok=True)
    Path(config['StandardOutPath']).parent.mkdir(parents=True, exist_ok=True)
    domain = f'gui/{os.getuid()}'
    target = f'{domain}/{label}'
    staging = path.with_suffix('.plist.pending')
    staging.write_bytes(plistlib.dumps(config))
    staging.chmod(0o600)
    try:
        run(['plutil', '-lint', str(staging)], check=True)
        existing = run(['launchctl', 'print', target], capture_output=True)
        if existing.returncode == 0:
            run(['launchctl', 'bootout', target], check=True)
        staging.replace(path)
        run(['launchctl', 'bootstrap', domain, str(path)], check=True)
        run(['launchctl', 'print', target], check=True)
    finally:
        staging.unlink(missing_ok=True)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--checkout', required=True, type=Path)
    parser.add_argument('--service', choices=[*SERVICES, 'all'], default='production')
    parser.add_argument('--install', action='store_true')
    args = parser.parse_args()
    root, home = args.checkout.resolve(), Path.home()
    if args.install and not persistent_checkout(root):
        parser.error('운영 실행기는 임시 폴더에 설치할 수 없습니다. ~/workSpace 아래의 영구 checkout을 사용하세요.')
    node = shutil.which('node')
    key = home / 'Library/Application Support/Shopshorts/credential-runner.jwk'
    services = list(SERVICES) if args.service == 'all' else [args.service]
    if not node or not key.is_file() or any(not (root / 'apps/shopshorts' / SERVICES[s][1]).is_file() for s in services):
        parser.error('production entries, node and existing runner key are required')
    if key.stat().st_mode & 0o077:
        parser.error('runner key permissions must exclude group and other users')
    for service in services:
        config = service_config(root, home, node, service, os.environ['PATH'])
        if args.install:
            install(config, home)
        else:
            print(f"Ready: {home}/Library/LaunchAgents/{config['Label']}.plist\nEntry: {config['ProgramArguments'][1]}")
    if not args.install:
        print('Before --install, verify that active account/media jobs have finished.')


if __name__ == '__main__':
    main()
