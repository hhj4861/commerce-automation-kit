#!/usr/bin/env python3
"""Repair evidence matching for a completed update patch before a host rejection.

Never edits task state, session transcripts, hook configuration or trust settings.
"""
import argparse
from datetime import datetime, timezone
from pathlib import Path
import shutil

MARKER = '# Completed update-patch prefix evidence (mixed recovery v1).'
HELPER = r'''def completed_update_patch(patch, result, item):
    """Match exact requested updates against native completed unified diffs.

    Only absolute-path Update File patches with one requested chunk per native
    hunk are supported. Moves, additions, deletion, ambiguous contexts, omitted
    changes and unsupported syntax remain unresolved. No current file reads.
    """
    try:
        if (result != {} or item.get('type') != 'FileChange'
                or item.get('status') != 'completed' or not item.get('id')
                or item.get('exit_code') is not None or item.get('process_id') is not None):
            return False
        lines = patch.splitlines()
        if not lines or lines[0] != '*** Begin Patch' or lines[-1] != '*** End Patch':
            return False
        requested, path, chunk = {}, None, None
        for line in lines[1:-1]:
            if line.startswith('*** Update File: '):
                path = line[len('*** Update File: '):]
                if not Path(path).is_absolute() or path in requested:
                    return False
                requested[path] = []
                chunk = None
            elif path is not None and (line == '@@' or line.startswith('@@ ')):
                chunk = []
                requested[path].append(chunk)
            elif path is not None and line[:1] in (' ', '+', '-'):
                if chunk is None:
                    chunk = []
                    requested[path].append(chunk)
                chunk.append(line)
            else:
                return False
        changes = item.get('changes')
        if not requested or not isinstance(changes, dict) or set(requested) != set(changes):
            return False
        for path, chunks in requested.items():
            change = changes[path]
            if (change.get('type') != 'update' or change.get('move_path') is not None
                    or not isinstance(change.get('unified_diff'), str)):
                return False
            native, current = [], None
            for line in change['unified_diff'].splitlines():
                header = re.fullmatch(r'@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@(?: .*)?', line)
                if header:
                    current = {'old_count': int(header[2] or 1), 'new_count': int(header[4] or 1), 'lines': []}
                    native.append(current)
                elif current is not None and line[:1] in (' ', '+', '-'):
                    current['lines'].append(line)
                else:
                    return False
            if not chunks or len(chunks) != len(native):
                return False
            for chunk, hunk in zip(chunks, native):
                old = [s[1:] for s in chunk if s[0] != '+']
                new = [s[1:] for s in chunk if s[0] != '-']
                before = [s[1:] for s in hunk['lines'] if s[0] != '+']
                after = [s[1:] for s in hunk['lines'] if s[0] != '-']
                if not old or old == new or len(before) != hunk['old_count'] or len(after) != hunk['new_count']:
                    return False
                offsets = [i for i in range(len(before) - len(old) + 1) if before[i:i + len(old)] == old]
                if len(offsets) != 1:
                    return False
                at = offsets[0]
                if before[:at] + new + before[at + len(old):] != after:
                    return False
        return True
    except (ValueError, TypeError, AttributeError, IndexError, KeyError):
        return False


'''

OLD = '''            item = row['payload'].get('item', {}); command = item.get('command')
            code = result.get('exit_code')
            if (steps[pos][0] != 'Bash' or not isinstance(code, int) or isinstance(code, bool)'''
NEW = '''            item = row['payload'].get('item', {}); command = item.get('command')
            if steps[pos][0] == 'apply_patch':
                if (row['payload'].get('completed_at_ms', float('inf')) / 1000 > prepared
                        or not completed_update_patch(steps[pos][1], result, item)):
                    return None
                continue
            code = result.get('exit_code')
            if (steps[pos][0] != 'Bash' or not isinstance(code, int) or isinstance(code, bool)'''


def patch(source):
    if MARKER in source:
        if HELPER not in source or NEW not in source:
            raise ValueError('Partial repair; inspect before applying')
        return source
    # Limit replacement to the existing evidence matcher, preserving its binding,
    # unique host reply, session/turn/source/time and sole-outstanding-call checks.
    start = source.index('def batch_failure_receipt(')
    end = source.index('\ndef added_files(', start)
    section = source[start:end]
    if section.count(OLD) != 1:
        raise ValueError('Unexpected hook version; no changes applied')
    source = source[:start] + MARKER + '\n' + HELPER + section.replace(OLD, NEW) + source[end:]
    compile(source, '<mixed-patch-recovery>', 'exec')
    return source


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--apply', action='store_true')
    parser.add_argument('--gate', type=Path, default=Path.home()/'.codex/hooks/task-finish/gate.py')
    args = parser.parse_args()
    original = args.gate.read_text()
    updated = patch(original)
    if not args.apply or updated == original:
        print('Already repaired' if updated == original else 'Patch validates; not applied')
        return
    backup = args.gate.parent/'backups'/('mixed-patch-'+datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%S%fZ')+'.py')
    backup.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(args.gate, backup)
    temporary = args.gate.with_suffix('.mixed-recovery.tmp')
    temporary.write_text(updated)
    temporary.chmod(args.gate.stat().st_mode & 0o777)
    # Refuse to replace another session's intervening change.
    if args.gate.read_text() != original:
        temporary.unlink()
        raise RuntimeError('Hook changed during repair; not applied')
    temporary.replace(args.gate)
    print('Applied; original preserved:', backup)


if __name__ == '__main__':
    main()
