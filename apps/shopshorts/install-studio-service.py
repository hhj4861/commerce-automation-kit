#!/usr/bin/env python3
"""Install the studio-only launch agent after its PR is merged and deployed.
Use --checkout with the production checkout; no token values enter the plist.
"""
import argparse
import os
from pathlib import Path
import plistlib
import shutil
import subprocess

parser = argparse.ArgumentParser()
parser.add_argument('--checkout', required=True, type=Path)
parser.add_argument('--install', action='store_true')
args = parser.parse_args()
root = args.checkout.resolve()
entry = root / 'apps/shopshorts/studio-service.mjs'
node = shutil.which('node')
key = Path.home() / 'Library/Application Support/Shopshorts/credential-runner.jwk'
if not entry.is_file() or not node or not key.is_file():
    parser.error('production entry, node and existing runner key are required')
if key.stat().st_mode & 0o077:
    parser.error('runner key permissions must exclude group and other users')
label = 'com.cak.studio-production'
path = Path.home() / f'Library/LaunchAgents/{label}.plist'
log = Path.home() / 'Library/Logs/Shopshorts/studio-production.log'
config = {'Label': label, 'ProgramArguments': [node, str(entry)],
          'WorkingDirectory': str(root), 'RunAtLoad': True, 'KeepAlive': True,
          'ThrottleInterval': 15, 'ExitTimeOut': 600,
          'StandardOutPath': str(log), 'StandardErrorPath': str(log),
          'EnvironmentVariables': {'HOME': str(Path.home()), 'PATH': os.environ['PATH'],
                                  'CAK_RUNNER_KEY_FILE': str(key)}}
if not args.install:
    print(f'Ready: {path}\nEntry: {entry}\nUse --install after merge and deployment.')
else:
    path.parent.mkdir(parents=True, exist_ok=True)
    log.parent.mkdir(parents=True, exist_ok=True)
    target = f'gui/{os.getuid()}/{label}'
    existing = subprocess.run(['launchctl', 'print', target], capture_output=True)
    if existing.returncode == 0:
        subprocess.run(['launchctl', 'bootout', target], check=True)
    path.write_bytes(plistlib.dumps(config))
    subprocess.run(['plutil', '-lint', str(path)], check=True)
    subprocess.run(['launchctl', 'bootstrap', f'gui/{os.getuid()}', str(path)], check=True)
    subprocess.run(['launchctl', 'print', target], check=True)
