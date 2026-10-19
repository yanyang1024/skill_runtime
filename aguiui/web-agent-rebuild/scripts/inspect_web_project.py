#!/usr/bin/env python3
"""Bounded, read-only route/form discovery. Never imports the inspected project."""
import argparse
import ast
from html.parser import HTMLParser
import json
import os
from pathlib import Path
from urllib.parse import urlsplit, urlunsplit

SKIP = {'node_modules', '__pycache__', 'venv', 'env', 'site-packages', 'dist', 'build'}
HTTP = {'get', 'post', 'put', 'patch', 'delete', 'head', 'options'}


def literal(node, default=None):
    try:
        return ast.literal_eval(node)
    except (ValueError, TypeError, SyntaxError):
        return default


def safe_target(value):
    if not isinstance(value, str):
        return '<dynamic>'
    if any(token in value for token in ('{{', '{%', '${')):
        return '<template/dynamic>'
    try:
        parsed = urlsplit(value)
        # Do not emit embedded credentials, queries, or fragments.
        host = parsed.hostname or ''
        if parsed.port:
            host += ':' + str(parsed.port)
        return urlunsplit((parsed.scheme, host, parsed.path, '', ''))
    except ValueError:
        return '<unparsed>'


class Forms(HTMLParser):
    def __init__(self, path):
        super().__init__(convert_charrefs=True)
        self.path, self.forms, self.current = path, [], None

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        if tag == 'form':
            self.current = {'file': self.path, 'line': self.getpos()[0],
                            'action': safe_target(attrs.get('action', '')),
                            'method': attrs.get('method', 'get').upper(), 'fields': []}
            self.forms.append(self.current)
        elif self.current is not None and tag in {'input', 'select', 'textarea', 'button'}:
            self.current['fields'].append({'name': attrs.get('name'),
                                           'type': attrs.get('type', tag)})

    def handle_endtag(self, tag):
        if tag == 'form':
            self.current = None


def python_routes(source, rel):
    tree = ast.parse(source, filename=rel)
    routes, frameworks = [], set()
    for node in ast.walk(tree):
        if isinstance(node, ast.Import):
            frameworks.update(a.name.split('.')[0] for a in node.names)
        elif isinstance(node, ast.ImportFrom) and node.module:
            frameworks.add(node.module.split('.')[0])
        elif isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
            for decorator in node.decorator_list:
                if not isinstance(decorator, ast.Call) or not isinstance(decorator.func, ast.Attribute):
                    continue
                kind = decorator.func.attr
                if kind not in HTTP | {'route', 'api_route'}:
                    continue
                kwargs = {k.arg: k.value for k in decorator.keywords if k.arg}
                path_node = decorator.args[0] if decorator.args else kwargs.get('path', kwargs.get('rule'))
                path = literal(path_node)
                methods = [kind.upper()] if kind in HTTP else literal(kwargs.get('methods'))
                if not isinstance(methods, (list, tuple)) or not all(isinstance(m, str) for m in methods):
                    methods = ['<framework default / dynamic>']
                routes.append({'file': rel, 'line': node.lineno, 'handler': node.name,
                               'path': safe_target(path), 'methods': methods,
                               'decorator': kind})
    return routes, sorted(frameworks & {'flask', 'fastapi', 'starlette'})


def inspect(root, max_files=600, max_bytes=512000):
    result = {'root': str(root), 'framework_hints': [], 'routes': [], 'forms': [],
              'files_scanned': 0, 'files_considered': 0, 'skipped': [], 'truncated': False,
              'limits': {'max_files': max_files, 'max_bytes_per_file': max_bytes},
              'warnings': [
                  'Static candidates only; registration, router prefixes and decorator identity are unresolved.',
                  'Follow template inheritance, JS requests, authentication and business services manually.',
                  'Hidden directories, symlinks and non-Python/HTML files are not scanned.'
              ]}
    frameworks = set()
    for parent, directories, filenames in os.walk(root, followlinks=False):
        directories[:] = sorted(d for d in directories if not d.startswith('.') and d not in SKIP
                                and not (Path(parent) / d).is_symlink())
        for filename in sorted(filenames):
            path = Path(parent) / filename
            if filename.startswith('.') or path.suffix.lower() not in {'.py', '.html', '.htm'}:
                continue
            rel = path.relative_to(root).as_posix()
            if result['files_considered'] >= max_files:
                result['truncated'] = True
                break
            result['files_considered'] += 1
            if path.is_symlink():
                result['skipped'].append({'file': rel, 'reason': 'symlink'})
                continue
            try:
                # A bounded read also handles files that grow after stat().
                with path.open('rb') as stream:
                    raw = stream.read(max_bytes + 1)
                if len(raw) > max_bytes:
                    result['skipped'].append({'file': rel, 'reason': 'size_limit'})
                    continue
                if b'\x00' in raw:
                    result['skipped'].append({'file': rel, 'reason': 'binary'})
                    continue
                source = raw.decode('utf-8-sig')
                result['files_scanned'] += 1
                if path.suffix.lower() == '.py':
                    routes, hints = python_routes(source, rel)
                    result['routes'].extend(routes)
                    frameworks.update(hints)
                else:
                    parser = Forms(rel)
                    parser.feed(source)
                    result['forms'].extend(parser.forms)
            except (OSError, UnicodeError, SyntaxError, RecursionError) as exc:
                result['skipped'].append({'file': rel, 'reason': type(exc).__name__})
        if result['truncated']:
            break
    result['framework_hints'] = sorted(frameworks)
    return result


def positive_int(value):
    parsed = int(value)
    if parsed < 1:
        raise argparse.ArgumentTypeError('must be positive')
    return parsed


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('project_root', type=Path)
    parser.add_argument('--output', type=Path)
    parser.add_argument('--max-files', type=positive_int, default=600)
    parser.add_argument('--max-bytes', type=positive_int, default=512000)
    args = parser.parse_args()
    root = args.project_root.resolve()
    if not root.is_dir():
        parser.error('project_root must be a directory')
    data = json.dumps(inspect(root, args.max_files, args.max_bytes), ensure_ascii=False, indent=2) + '\n'
    if args.output:
        try:
            with args.output.open('x', encoding='utf-8') as stream:
                stream.write(data)
        except OSError as exc:
            parser.error(f'cannot create output ({type(exc).__name__}); use a new path in an existing directory')
    else:
        print(data, end='')


if __name__ == '__main__':
    main()
