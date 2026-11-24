#!/usr/bin/env python3
"""Generate byte-fragmented SSE fixtures, not a production SSE parser."""
import argparse
import base64
import itertools
import json
from pathlib import Path


def chunk_pattern(value):
    try:
        values = [int(x) for x in value.split(',')]
    except ValueError:
        raise argparse.ArgumentTypeError('use comma-separated positive byte counts') from None
    if not values or any(n <= 0 for n in values):
        raise argparse.ArgumentTypeError('byte counts must be positive')
    return values


def make_fixture(case, pattern):
    wire = case['wire'].encode('utf-8')
    chunks, offset = [], 0
    for size in itertools.cycle(pattern):
        if offset >= len(wire):
            break
        chunks.append(base64.b64encode(wire[offset:offset + size]).decode('ascii'))
        offset += size
    return {'name': case['name'], 'encoding': 'utf-8', 'chunks_base64': chunks,
            'expected_events': case['expected_events'],
            'expected_application': case['expected_application']}


def main():
    source = Path(__file__).resolve().parent.parent / 'assets/streaming-cases.json'
    cases = json.loads(source.read_text(encoding='utf-8'))['cases']
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--case', choices=[c['name'] for c in cases], required=True)
    parser.add_argument('--chunk-bytes', type=chunk_pattern, default=[1, 2, 5])
    parser.add_argument('--output', type=Path, help='create a new JSON file; default stdout')
    args = parser.parse_args()
    case = next(c for c in cases if c['name'] == args.case)
    result = json.dumps(make_fixture(case, args.chunk_bytes), ensure_ascii=False, indent=2) + '\n'
    if args.output:
        try:
            with args.output.open('x', encoding='utf-8') as stream:
                stream.write(result)
        except OSError as exc:
            parser.error(f'cannot create output ({type(exc).__name__}); choose a new path')
    else:
        print(result, end='')


if __name__ == '__main__':
    main()
