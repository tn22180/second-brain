#!/usr/bin/env python3
"""Đọc bảng `## Progress` của một brief tony-wf, in trạng thái gọn.

Dùng để theo dõi một workflow đang chạy ở session khác — brief trên đĩa là state chung.
Không token, không model. Chạy lặp bằng: watch -n 300 progress.py <brief.md>
"""
import re
import sys
from pathlib import Path

ICON = {'⬜': 'chờ', '🔄': 'đang chạy', '✅': 'xong', '🛑': 'BLOCKED'}


def rows(md):
    for ln in md.splitlines():
        # chỉ nhận dòng dữ liệu: | <số> | ... — bỏ header và dòng gạch
        m = re.match(r'^\|\s*(\d+)\s*\|(.+)\|\s*$', ln)
        if m:
            yield m.group(1), [c.strip() for c in m.group(2).split('|')]


def main():
    if len(sys.argv) != 2:
        sys.exit('dùng: progress.py <brief.md>')
    p = Path(sys.argv[1])
    md = p.read_text(encoding='utf-8')

    started = re.search(r'Started:\s*(\S+).*?Status:\s*\*\*(\w+)\*\*', md)
    tasks = list(rows(md))
    if not tasks:
        sys.exit(f'{p}: không thấy bảng Progress')

    tally, used, cap, late, live = {}, 0, 0, [], []
    for num, cells in tasks:
        # cột: Task | Agent/Model | Status | Rounds | (Sec) | Notes
        name, agent, status = cells[0], cells[1], cells[2]
        rounds = cells[3] if len(cells) > 3 else ''
        icon = next((i for i in ICON if i in status), '?')
        tally[icon] = tally.get(icon, 0) + 1

        r = re.match(r'(\d+)\s*/\s*(\d+)', rounds)
        if r:
            used += int(r.group(1))
            cap += int(r.group(2))
            # 4/5 nghĩa là còn đúng một vòng trước khi cả workflow dừng
            if icon != '✅' and int(r.group(1)) >= int(r.group(2)) - 1:
                late.append((num, name, rounds))
        if icon in ('🔄', '🛑', '⬜'):
            live.append((icon, num, name, agent, rounds))

    if started:
        print(f'{p.name} — bắt đầu {started.group(1)} · {started.group(2)}')
    print('  ' + ' · '.join(f'{ICON[i]} {tally[i]}' for i in ICON if i in tally)
          + f' · vòng {used}/{cap}')

    for icon, num, name, agent, rounds in live:
        print(f'  {icon} {num:>2}. {name[:52]:52} {agent[:22]:22} {rounds}')

    for num, name, rounds in late:
        print(f'  ⚠  task {num} ở {rounds} — sát trần, hết vòng là dừng CẢ workflow')

    if '🛑' in tally:
        sys.exit(2)


if __name__ == '__main__':
    main()
