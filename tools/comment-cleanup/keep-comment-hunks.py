#!/usr/bin/env python3
"""Keep only the comment changes in a working tree, discarding the rest.

    python3 keep-comment-hunks.py --repo <repoRoot> [--base HEAD]

An editor that reformats on save (a lint hook, an IDE) mixes unrelated code
reformatting into a comment-only edit. For every changed file this rebuilds the
file from the base version, taking the working-tree side of a changed block only
when every line involved on both sides is a comment or blank. Everything else
reverts to the base.

Writes files in place and prints what it kept per file. Run the AST verifier
afterwards — this script does not prove anything on its own.
"""

import argparse
import difflib
import os
import subprocess
import sys

COMMENT_STARTS = ('//', '/*', '*/', '*')
EXTS = ('.js', '.jsx', '.ts', '.tsx')


def is_comment_or_blank(line):
    s = line.strip()
    if not s:
        return True
    return s.startswith(COMMENT_STARTS)


def merge(base_lines, work_lines):
    """Take work's side of a block only when both sides are comments or blanks."""
    out = []
    kept = dropped = 0
    sm = difflib.SequenceMatcher(None, base_lines, work_lines, autojunk=False)
    for tag, i1, i2, j1, j2 in sm.get_opcodes():
        if tag == 'equal':
            out.extend(base_lines[i1:i2])
            continue
        old, new = base_lines[i1:i2], work_lines[j1:j2]
        if all(is_comment_or_blank(l) for l in old + new):
            out.extend(new)
            kept += 1
        else:
            out.extend(old)
            dropped += 1
    return out, kept, dropped


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--repo', required=True)
    ap.add_argument('--base', default='HEAD')
    args = ap.parse_args()
    repo = os.path.abspath(args.repo)

    def git(*a):
        return subprocess.run(['git', '-C', repo, *a], capture_output=True, text=True, check=True).stdout

    changed = [f for f in git('diff', '--name-only', args.base).split('\n') if f.endswith(EXTS)]
    total_kept = total_dropped = touched = 0

    for rel in changed:
        path = os.path.join(repo, rel)
        if not os.path.exists(path):
            continue
        base = git('show', f'{args.base}:{rel}').split('\n')
        work = open(path, encoding='utf-8').read().split('\n')
        merged, kept, dropped = merge(base, work)
        if merged != work:
            open(path, 'w', encoding='utf-8').write('\n'.join(merged))
        total_kept += kept
        total_dropped += dropped
        if dropped:
            touched += 1
            print(f'  {rel}: kept {kept} comment blocks, reverted {dropped} code blocks')

    print(f'{len(changed)} files: kept {total_kept} comment blocks, reverted {total_dropped} '
          f'non-comment blocks across {touched} files')


if __name__ == '__main__':
    sys.exit(main())
