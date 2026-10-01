#!/usr/bin/env python3
"""Keep identical completion failures bounded across user turns; never clear evidence."""
import argparse
import hashlib
import importlib.util
import os
from pathlib import Path
import subprocess

SOURCE_PATH = 'tools/task-finish-retry-loop.py'
HELPER_PATH = 'tools/task-finish-interruption-recovery.py'
spec = importlib.util.spec_from_file_location('installer_helpers', Path(__file__).with_name(Path(HELPER_PATH).name))
helpers = importlib.util.module_from_spec(spec)
spec.loader.exec_module(helpers)


def patch(source):
    before = helpers.function(source, 'handle')
    old = "                data.pop('hold', None)\n                data['attempts'] = 0"
    new = ("                data.pop('hold', None)\n"
           "                # Identical failures keep their bounded retry budget across turns.\n"
           "                # stop_event resets it when evidence changes or checks succeed.")
    if before.count(old) != 1:
        raise ValueError('Unrecognized or already updated prompt retry handling')
    result = source.replace(before, before.replace(old, new, 1), 1)
    compile(result, '<task-finish-retry-loop>', 'exec')
    return result


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--gate', type=Path, default=Path.home() / '.codex/hooks/task-finish/gate.py')
    parser.add_argument('--apply', action='store_true')
    parser.add_argument('--expect-sha256')
    args = parser.parse_args()
    original = args.gate.read_bytes()
    updated = patch(original.decode()).encode()
    if not args.apply:
        print('Verified update; installed SHA-256: ' + hashlib.sha256(original).hexdigest())
        return
    root = Path(__file__).resolve().parents[1]
    env = {k: v for k, v in os.environ.items() if not k.startswith('GIT_')}
    env.update(GIT_TERMINAL_PROMPT='0', GIT_OPTIONAL_LOCKS='0')
    for relative in (SOURCE_PATH, HELPER_PATH):
        committed = subprocess.check_output(['git', '-C', str(root), 'show', 'HEAD:' + relative], env=env)
        if (root / relative).read_bytes() != committed:
            raise ValueError('Installer and helper must match committed source: ' + relative)
    backup = helpers.apply_update(args.gate, original, updated, args.expect_sha256)
    print('Applied retry-loop repair; backup: ' + str(backup))


if __name__ == '__main__':
    main()
