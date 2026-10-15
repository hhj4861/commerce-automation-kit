#!/usr/bin/env python3
"""Export committed production source, never a copy of the developer's checkout."""
import argparse
import hashlib
import io
import json
from pathlib import Path, PurePosixPath
import platform
import re
import subprocess
import tarfile
import uuid
import zipfile

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[2]
PREFIX = 'Shopshorts-Mac-Worker/'
SUFFIXES = {'.js', '.mjs', '.ts', '.json', '.py', '.html', '.css', '.ttf', '.otf', '.woff2', '.txt'}
EXCLUDED = {'node_modules', 'data', 'storage', 'work', 'output', 'private', 'test', 'tests', '__pycache__', '.git'}


def host_id():
    if platform.system() == 'Darwin':
        identity = subprocess.check_output(['/usr/sbin/ioreg', '-rd1', '-c', 'IOPlatformExpertDevice'], text=True)
        match = re.search(r'"IOPlatformUUID"\s*=\s*"([^"]+)"', identity)
        if not match:
            raise ValueError('Cannot identify the source Mac; no package produced')
        return hashlib.sha256(match[1].encode()).hexdigest()
    return hashlib.sha256(f'{platform.node()}:{uuid.getnode()}'.encode()).hexdigest()


def include(path):
    p = PurePosixPath(path)
    if any(x in EXCLUDED or x.startswith('.') for x in p.parts):
        return False
    if any(x in p.name.lower() for x in ('credential', 'token', 'secret', 'auth.json')):
        # Credential broker source is needed, private credential files are not.
        if p.suffix not in {'.js', '.mjs', '.ts', '.py'}:
            return False
    if path in {'package.json', 'package-lock.json'}:
        return True
    if len(p.parts) == 3 and p.parts[0] == 'apps' and p.name == 'package.json':
        return True  # npm's lockfile includes every workspace's metadata.
    if path.startswith('docs/videos/') and p.suffix == '.py':
        return True  # Registered, source-controlled authored renderers (e.g. Sapporo).
    roots = ('apps/shopshorts/', 'apps/credential-broker/', 'packages/', 'services/topic-discovery/')
    return path.startswith(roots) and p.suffix in SUFFIXES and 'mac-worker' not in p.parts


def build(repo, ref, output):
    revision = subprocess.check_output(['git', '-C', str(repo), 'rev-parse', '--verify', ref + '^{commit}'], text=True).strip()
    listing = subprocess.check_output(['git', '-C', str(repo), 'ls-tree', '-r', '-z', revision])
    paths = []
    for entry in listing.split(b'\0'):
        if not entry:
            continue
        metadata, raw = entry.split(b'\t', 1)
        path = raw.decode()
        if include(path):
            if not metadata.startswith(b'100644 blob ') and not metadata.startswith(b'100755 blob '):
                raise ValueError('Runtime source must be regular tracked files: ' + path)
            paths.append(path)
    required = {'package.json', 'package-lock.json', 'apps/shopshorts/studio-service.mjs', 'apps/credential-broker/runner-client.mjs'}
    if not required.issubset(paths):
        raise ValueError('Source revision is not a Shopshorts production checkout')
    output = Path(output)
    if output.exists():
        raise FileExistsError('Choose a new output file; existing bundles are preserved')
    archive = subprocess.check_output(['git', '-C', str(repo), 'archive', '--format=tar', revision, '--', *paths])
    files = {}
    with tarfile.open(fileobj=io.BytesIO(archive)) as source:
        for member in source:
            if member.isfile():
                files['source/' + member.name] = source.extractfile(member).read()
    for name in ('control.py', 'check-connection.mjs', 'Install.command', 'README.md'):
        files[name] = (HERE / name).read_bytes()
    for action, filename in [('doctor', 'Check.command'), ('start', 'Start.command'), ('stop', 'Stop.command')]:
        files[filename] = (f'#!/bin/bash\nset -euo pipefail\ncd -- "$(dirname -- "$0")"\n'
                           f'exec /usr/bin/python3 control.py {action}\n').encode()
    tooling = subprocess.check_output(['git', '-C', str(ROOT), 'rev-parse', 'HEAD'], text=True).strip()
    manifest = {'format': 1, 'revision': revision, 'packagerRevision': tooling, 'sourceHost': host_id(),
                'files': {p: hashlib.sha256(data).hexdigest() for p, data in files.items()}}
    with zipfile.ZipFile(output, 'x', zipfile.ZIP_DEFLATED) as target:
        for path, data in files.items():
            info = zipfile.ZipInfo(PREFIX + path)
            info.external_attr = (0o100755 if path.endswith('.command') else 0o100644) << 16
            info.compress_type = zipfile.ZIP_DEFLATED
            target.writestr(info, data)
        target.writestr(PREFIX + 'manifest.json', json.dumps(manifest, indent=2) + '\n')
    return manifest


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--ref', default='HEAD')
    parser.add_argument('--out', required=True, type=Path)
    args = parser.parse_args()
    result = build(ROOT, args.ref, args.out)
    print(json.dumps({'bundle': str(args.out), 'revision': result['revision'], 'files': len(result['files']),
                      'sha256': hashlib.sha256(args.out.read_bytes()).hexdigest()}))
