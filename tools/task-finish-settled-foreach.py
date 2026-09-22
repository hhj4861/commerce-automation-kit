"""Verify literal allSettled().forEach(text) refusal receipts; never fabricate completion."""
import argparse
from datetime import datetime, timezone
import hashlib
from pathlib import Path
import shutil

MARKER = '# task-finish: direct settled foreach evidence v16'

def patch(source):
    if MARKER in source:
        return source
    replacements = [
        ("    each = re.fullmatch(\n", "    if re.fullmatch(re.escape(batch) + r'\\.forEach\\(text\\);?', echo):\n        return body, 'direct'\n    each = re.fullmatch(\n"),
        ("        introduced = 10 if syntax[1] == 'loop' else 6", "        introduced = 16 if syntax[1] == 'direct' else 10 if syntax[1] == 'loop' else 6"),
        ("        for index, result in enumerate(results):\n            if (not isinstance(result, dict)", "        for index, result in enumerate(results):\n            if syntax[1] == 'direct':\n                if (not isinstance(result, dict) or result.get('status') not in ('fulfilled', 'rejected')\n                        or set(result) != {'status', 'value' if result['status'] == 'fulfilled' else 'reason'}):\n                    return None\n                result['i'] = index  # Position in the verified, unchanged forEach output.\n            if (not isinstance(result, dict)"),
        ("'dispatch_checked': True, 'dispatch_version': 15}", "'dispatch_checked': True, 'dispatch_version': 16}"),
        ('def settled_syntax(source):', MARKER + '\ndef settled_syntax(source):'),
    ]
    for before, after in replacements:
        if source.count(before) != 1:
            raise ValueError('Unexpected hook version; no changes applied: ' + before[:60])
        source = source.replace(before, after)
    compile(source, '<settled-foreach-candidate>', 'exec')
    return source


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--gate', type=Path, default=Path.home()/'.codex/hooks/task-finish/gate.py')
    parser.add_argument('--apply', action='store_true')
    parser.add_argument('--expect-sha256')
    args = parser.parse_args()
    original = args.gate.read_bytes(); digest = hashlib.sha256(original).hexdigest()
    updated = patch(original.decode()).encode()
    if not args.apply:
        print('Patch validated; installed source SHA-256:', digest)
        return
    if args.expect_sha256 != digest:
        raise ValueError('Expected installed-source SHA-256 required; validate before applying')
    if updated == original:
        print('Already installed; no changes')
        return
    backup = args.gate.parent/'backups'/('settled-foreach-'+datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%S%fZ')+'.py')
    backup.parent.mkdir(parents=True, exist_ok=True); shutil.copy2(args.gate, backup)
    temporary = args.gate.with_name('.settled-foreach-'+digest+'.tmp')
    try:
        with temporary.open('xb') as stream:
            stream.write(updated)
        temporary.chmod(args.gate.stat().st_mode & 0o777)
        if args.gate.read_bytes() != original or backup.read_bytes() != original:
            raise ValueError('Hook changed during installation; no replacement applied')
        temporary.replace(args.gate)
    finally:
        temporary.unlink(missing_ok=True)
    print('Applied; original preserved:', backup)


if __name__ == '__main__':
    main()
