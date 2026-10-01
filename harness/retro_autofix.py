#!/usr/bin/env python3
"""Weekly before/after number for prod-error-autofix's ANALYZE loop.

Reads the headless `claude -p` transcripts the daemon leaves in ~/.claude/projects
(first user message starts `# Round N of M`), so it needs nothing from the daemon.

    python3 harness/retro_autofix.py --since 2026-09-01 --until 2026-10-01

Baseline 2026-09-01..10-01, before the absence-evidence fix in verify.ts:
548 rounds (464 R1, 72 R2, 12 R3); 64 of the round-2+ rejections were "matched
nothing", 52 of those were honest `matched: 0` claims. Re-run after a week of the
patched daemon; the absence share should drop to ~0 and R2+/R1 should fall.
"""
import argparse
import collections
import glob
import json
import os
import re
from datetime import datetime, timezone

ROOT = os.path.expanduser('~/.claude/projects')
ROUND = re.compile(r'^# Round (\d+) of (\d+)')
REJ = re.compile(r'answer was rejected\n(.*?)\nFix these', re.S)


def first_user(path):
    with open(path, errors='ignore') as fh:
        for line in fh:
            if '"type":"user"' not in line:
                continue
            d = json.loads(line)
            c = d['message'].get('content')
            return d.get('timestamp'), c if isinstance(c, str) else None
    return None, None


def bucket(reason):
    r = reason.strip('- ').strip()
    if r.startswith('query:'):
        return None
    if 'matched nothing' in r:
        return 'evidence: matched nothing'
    if 'claimed to match nothing' in r:
        return 'evidence: absence claim false'
    if 'every evidence query is an absence' in r:
        return 'evidence: absence only'
    if 'did not run' in r:
        return 'evidence: query error'
    if r.startswith('citation'):
        return 'citation'
    if 'must be' in r or 'no JSON' in r:
        return 'schema'
    if 'confidence is low' in r:
        return 'low confidence'
    return 'other'


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--since', required=True)
    ap.add_argument('--until', required=True)
    a = ap.parse_args()
    lo = datetime.fromisoformat(a.since).replace(tzinfo=timezone.utc)
    hi = datetime.fromisoformat(a.until).replace(tzinfo=timezone.utc)

    rounds = collections.Counter()
    reasons = collections.Counter()
    for path in glob.glob(f'{ROOT}/*/*.jsonl'):
        try:
            if os.path.getmtime(path) < lo.timestamp():
                continue
            ts, text = first_user(path)
        except OSError:
            continue
        if not text or not ts:
            continue
        m = ROUND.match(text)
        if not m or not lo <= datetime.fromisoformat(ts.replace('Z', '+00:00')) < hi:
            continue
        rounds[int(m.group(1))] += 1
        rej = REJ.search(text)
        for line in rej.group(1).split('\n') if rej else []:
            b = bucket(line)
            if b:
                reasons[b] += 1

    r1 = rounds.get(1, 0)
    r2 = rounds.get(2, 0)
    print(f'# autofix ANALYZE retro {a.since} → {a.until}\n')
    print(f'rounds: {dict(sorted(rounds.items()))}  total={sum(rounds.values())}')
    print(f'alerts that needed a round 2: {r2}/{r1} = {r2 / r1:.0%}' if r1 else 'no runs')
    print('\nrejection reasons that forced another round:')
    for k, v in reasons.most_common():
        print(f'- {k}: {v}')


if __name__ == '__main__':
    main()
