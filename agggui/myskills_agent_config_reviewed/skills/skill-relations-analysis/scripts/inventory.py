#!/usr/bin/env python3
"""Read-only bundle fingerprints. No skill execution, YAML parsing, or semantic claims."""
import argparse
import hashlib
import json
import os
import re
import sys
import stat
from pathlib import Path


def scan(root):
    skills = []
    for directory in sorted(root.iterdir()):
        if directory.is_symlink() or not directory.is_dir():
            continue
        entry = directory / 'SKILL.md'
        if not entry.exists() and not entry.is_symlink():
            continue
        files, gaps = {}, []
        def walk_error(exc):
            gaps.append({'path': str(Path(exc.filename).relative_to(directory)), 'reason': type(exc).__name__})
        for current, dirs, names in os.walk(directory, followlinks=False, onerror=walk_error):
            base = Path(current)
            for name in list(dirs):
                child = base / name
                if child.is_symlink():
                    gaps.append({'path': child.relative_to(directory).as_posix(), 'reason': 'symlink_skipped'})
                    dirs.remove(name)
            for name in sorted(names):
                child = base / name
                relative = child.relative_to(directory).as_posix()
                if child.is_symlink():
                    gaps.append({'path': relative, 'reason': 'symlink_skipped'})
                    continue
                try:
                    if not stat.S_ISREG(child.stat().st_mode):
                        gaps.append({'path': relative, 'reason': 'non_regular_file_skipped'})
                        continue
                    digest = hashlib.sha256()
                    with child.open('rb') as handle:
                        for chunk in iter(lambda: handle.read(1024 * 1024), b''):
                            digest.update(chunk)
                    files[relative] = digest.hexdigest()
                except OSError as exc:
                    gaps.append({'path': relative, 'reason': type(exc).__name__})
        # Partial inventories must never be mistaken for a complete bundle fingerprint.
        fingerprint = None if gaps else hashlib.sha256(
            json.dumps(files, sort_keys=True, separators=(',', ':')).encode()
        ).hexdigest()
        runtime_name = None
        if not entry.is_symlink():
            try:
                raw = entry.read_text(encoding='utf-8')
                header = re.match(r'\A---\s*\n(.*?)\n---(?:\s*\n|$)', raw, re.S)
                match = re.search(r'^name:\s*([a-z0-9]+(?:-[a-z0-9]+)*)\s*$', header[1], re.M) if header else None
                runtime_name = match[1] if match else None
            except (OSError, UnicodeError):
                pass
        skills.append({'id': directory.name, 'path': str(directory),
                       'runtime_name_hint': runtime_name, 'files': files,
                       'bundle_fingerprint': fingerprint, 'complete': not gaps,
                       'gaps': sorted(gaps, key=lambda item: item['path'])})
    return skills


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('root', type=Path)
    parser.add_argument('--previous', type=Path)
    args = parser.parse_args()
    try:
        root = args.root.resolve(strict=True)
        skills = scan(root)
        result = {'schema_version': 1, 'root': str(root), 'enumeration': 'direct_child_SKILL.md',
                  'skills': skills, 'limitations': [
                      'runtime_name_hint only accepts an unquoted simple scalar; not a YAML validator',
                      'does not follow symlinks or compare external dependencies',
                      'changes are byte-level signals, not semantic impact analysis',
                      'read errors and symlink gaps make bundle incomplete',
                  ]}
        if args.previous:
            previous = json.loads(args.previous.read_text(encoding='utf-8'))
            if previous.get('schema_version') != 1 or previous.get('root') != str(root):
                raise ValueError('previous inventory must use schema 1 and the same resolved root')
            old = {item['id']: item for item in previous['skills']}
            new = {item['id']: item for item in skills}
            changes = []
            for identifier in sorted(old.keys() | new.keys()):
                before, after = old.get(identifier), new.get(identifier)
                if before is None:
                    state = 'added'
                elif after is None:
                    state = 'removed'
                elif not before['complete'] or not after['complete']:
                    state = 'unknown'
                else:
                    state = 'unchanged' if before['bundle_fingerprint'] == after['bundle_fingerprint'] else 'changed'
                left, right = (before or {}).get('files', {}), (after or {}).get('files', {})
                changed_files = sorted(key for key in left.keys() | right.keys() if left.get(key) != right.get(key))
                changes.append({'id': identifier, 'state': state, 'changed_files': changed_files})
            result['changes'] = changes
        print(json.dumps(result, ensure_ascii=False, indent=2))
        return 0
    except (OSError, ValueError, KeyError, TypeError) as exc:
        print(json.dumps({'error': type(exc).__name__, 'message': str(exc)}, ensure_ascii=False), file=sys.stderr)
        return 2


if __name__ == '__main__':
    raise SystemExit(main())
