#!/usr/bin/env python3
"""Preserve unfinished holds/retry limits across wrapped automatic Stop messages.

Never changes completion evidence, file ownership, commit or push checks.
"""
import argparse
from datetime import datetime, timezone
import hashlib
import json
import os
from pathlib import Path
import subprocess
import tempfile

REVIEWED_GATE = "6fe893215a0704192ac7596f686e565c8310845ace3f3c86eb8f8350ee9bcdc5"

HELPER = r'''def task_finish_continuation(event):
    # Codex wraps automatic hook feedback before UserPromptSubmit. Keep holds and
    # retry counters; this predicate never marks a pending call as completed.
    if event.get("stop_hook_active") is True:
        return True
    prompt = event.get("prompt", "")
    if not isinstance(prompt, str):
        return False
    prompt = prompt.strip()
    if prompt.startswith("[codex-task-finish]"):
        return True
    wrapped = re.fullmatch(r'<hook_prompt(?:\s+[^<>]*)?>\s*(.*?)\s*</hook_prompt>', prompt, re.S)
    return bool(wrapped and wrapped.group(1).startswith("[codex-task-finish]"))
'''


def patch(source):
    if hashlib.sha256(source.encode()).hexdigest() != REVIEWED_GATE:
        raise ValueError("Installed gate changed; review required, no changes applied")
    anchor = "def handle(event, store):"
    old = "if name == 'UserPromptSubmit' and not event.get('stop_hook_active') and not str(event.get('prompt', '')).startswith('[codex-task-finish]'):"
    if source.count(anchor) != 1 or source.count(old) != 1:
        raise ValueError("Unexpected hook contract")
    result = source.replace(anchor, HELPER + "\n\n" + anchor).replace(old, "if name == 'UserPromptSubmit' and not task_finish_continuation(event):")
    compile(result, "<hook-continuation-candidate>", "exec")
    return result


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--gate', type=Path, default=Path.home() / '.codex/hooks/task-finish/gate.py')
    parser.add_argument('--apply', action='store_true')
    args = parser.parse_args()
    original = args.gate.read_text(); updated = patch(original)
    if not args.apply:
        print(json.dumps({'validated': True, 'applied': False, 'sha256': hashlib.sha256(updated.encode()).hexdigest()}))
        return
    repo = Path(__file__).resolve().parent.parent
    relative = str(Path(__file__).resolve().relative_to(repo))
    committed = subprocess.check_output(['git', '-C', str(repo), 'show', 'HEAD:' + relative])
    if committed != Path(__file__).read_bytes():
        raise ValueError('Installer must match committed source')
    backup = args.gate.parent / 'backups' / ('hook-continuation-' + datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%S%fZ') + '.py')
    backup.parent.mkdir(parents=True, exist_ok=True)
    with backup.open('xb') as f:
        f.write(original.encode()); f.flush(); os.fsync(f.fileno())
    backup.chmod(0o600)
    temporary = None
    try:
        with tempfile.NamedTemporaryFile(dir=args.gate.parent, prefix='.hook-continuation-', delete=False) as f:
            temporary = Path(f.name); f.write(updated.encode()); f.flush(); os.fsync(f.fileno())
        temporary.chmod(args.gate.stat().st_mode & 0o777)
        if args.gate.read_text() != original:
            raise ValueError('Gate changed during install')
        os.replace(temporary, args.gate)
    finally:
        if temporary and temporary.exists():
            temporary.unlink()
    print(json.dumps({'applied': True, 'backup': str(backup), 'sha256': hashlib.sha256(updated.encode()).hexdigest()}))


if __name__ == '__main__':
    main()
