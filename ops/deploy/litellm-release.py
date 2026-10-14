#!/usr/bin/env python3
"""Install a reviewed LiteLLM revision on the existing host without rotating secrets."""
import argparse
from contextlib import ExitStack
import fcntl
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import sys
import time

FILES = ('gateway.py', 'compose.yaml')
RENDER = ('python3', 'gateway.py', 'render')
PINNED_IMAGE = re.compile(r'image: ghcr[.]io/berriai/litellm@sha256:[a-f0-9]{64}')


def run(args, cwd, stdout=subprocess.DEVNULL):
    # Compose can include environment values in diagnostics: do not forward its output.
    result = subprocess.run(args, cwd=cwd, stdout=stdout, stderr=subprocess.PIPE)
    if result.returncode:
        raise RuntimeError(f'{args[0]} stage failed (exit {result.returncode}); inspect private host logs')


def compose(root, action):
    # Only the gateway is released. Subscription worker overlays (retired, D5) are ignored.
    return ['docker', 'compose', '-p', 'shared-ai-gateway', '-f', str(root / 'compose.yaml')] + action


def generated(runtime):
    return [runtime / 'litellm.json']


def release(source, sha, home=Path('/opt/shared-ai'), execute=run):
    if not re.fullmatch(r'[a-f0-9]{40}', sha):
        raise ValueError('Full commit SHA required')
    source = source.resolve()
    for name in FILES:
        if not (source / name).is_file() or (source / name).is_symlink():
            raise ValueError('Missing release source')
    if not PINNED_IMAGE.search((source / 'compose.yaml').read_text()):
        raise ValueError('The gateway must use a pinned LiteLLM image.')
    state = home / 'gitops'
    state.mkdir(mode=0o700, exist_ok=True)
    with ExitStack() as stack:
        lock = stack.enter_context((state / 'litellm.lock').open('a'))
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        pointer = state / 'litellm.json'
        previous = json.loads(pointer.read_text()) if pointer.exists() else {'source': str(home / 'repo/services/ai-gateway')}
        old = Path(previous['source']).resolve()
        if not old.is_relative_to(home.resolve()) or not (old / '.env').is_file() or not (old / '.runtime').is_dir():
            raise ValueError('Existing private state is missing; initial provisioning is not a deployment')
        runtime = (old / '.runtime').resolve()
        destination = home / 'releases' / f'gitops-litellm-{sha}'
        if destination.exists():
            raise ValueError('This immutable revision already has a release directory; use a new reviewed commit')
        destination.mkdir(parents=True, mode=0o700)
        for name in FILES:
            shutil.copyfile(source / name, destination / name)
        (destination / '.env').symlink_to((old / '.env').resolve())
        (destination / '.runtime').symlink_to((old / '.runtime').resolve(), target_is_directory=True)
        backup = home / 'backups' / f'gitops-litellm-{sha}-{int(time.time())}'
        backup.mkdir(parents=True, mode=0o700)
        # Back up the live database before a new LiteLLM image can run migrations.
        with (backup / 'postgres.sql').open('xb') as stream:
            os.chmod(stream.name, 0o600)
            execute(compose(old, ['exec', '-T', 'db', 'pg_dump', '-U', 'litellm', '--no-owner', 'litellm']), old, stdout=stream)
        saved = {path: path.read_bytes() if path.exists() else None for path in generated(runtime)}
        for index, (path, value) in enumerate(saved.items()):
            if value is not None:
                item = backup / f'config-{index}'; item.write_bytes(value); item.chmod(0o600)
        started = False
        try:
            # The parent holds gitops/litellm.lock throughout render, restart and rollback.
            execute(list(RENDER), destination)
            execute(compose(destination, ['config', '--quiet']), destination)
            started = True
            execute(compose(destination, ['up', '-d', '--no-deps', '--wait', '--wait-timeout', '300', 'gateway']), destination)
            execute(['curl', '--fail', '--silent', '--max-time', '15', 'http://127.0.0.1:4100/health/readiness'], destination)
        except Exception:
            for path, value in saved.items():
                if value is None:
                    path.unlink(missing_ok=True)
                else:
                    path.write_bytes(value); path.chmod(0o600)
            if started:
                try:
                    execute(compose(old, ['up', '-d', '--no-deps', '--wait', '--wait-timeout', '300', 'gateway']), old)
                except Exception:
                    raise RuntimeError(f'Deployment and rollback failed; database backup: {backup}') from None
            raise RuntimeError(f'Deployment failed; previous configuration restored. Database backup: {backup}') from None
        record = {'sha': sha, 'source': str(destination), 'previous': previous, 'backup': str(backup), 'updated_at': time.time()}
        temporary = pointer.with_suffix('.tmp'); temporary.write_text(json.dumps(record)); temporary.chmod(0o600)
        temporary.replace(pointer)
        print(f'LiteLLM ready: {sha}')


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--source', type=Path, required=True)
    parser.add_argument('--sha', required=True)
    args = parser.parse_args()
    try:
        if os.geteuid() != 0:
            raise ValueError('Run on the deployment host with sudo')
        release(args.source, args.sha)
    except Exception as error:
        print(str(error), file=sys.stderr)
        sys.exit(1)
