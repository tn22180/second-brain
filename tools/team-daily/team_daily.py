import argparse
import datetime as dt
import json
import os
from pathlib import Path
import re
import sys
import tempfile
import traceback
from urllib.request import Request, urlopen
from zoneinfo import ZoneInfo

import audit_src
import gitlab_src
import grade
import jira_src


ZONE = ZoneInfo('Asia/Ho_Chi_Minh')
CHANNEL = 'C0BGRTWUE8Y'
WINDOW_NOTE = 'prompt-audit chỉ có cửa sổ cuốn 24h kết thúc lúc thu thập, xấp xỉ hôm qua'


def yesterday(now=None):
    return (now or dt.datetime.now(ZONE)).astimezone(ZONE).date() - dt.timedelta(days=1)


def day_path(day, cache_dir=None):
    root = Path(cache_dir) if cache_dir is not None else Path.home() / '.cache/team-daily'
    return root / (day.isoformat() + '.json')


def save(report, cache_dir=None):
    path = day_path(dt.date.fromisoformat(report['date']), cache_dir)
    path.parent.mkdir(parents=True, exist_ok=True)
    name = None
    try:
        with tempfile.NamedTemporaryFile(mode='w', encoding='utf-8', dir=path.parent,
                                         delete=False) as handle:
            name = handle.name
            json.dump(report, handle, ensure_ascii=False, indent=2)
            handle.flush()
            os.fsync(handle.fileno())
        os.replace(name, path)
    finally:
        if name and os.path.exists(name):
            os.unlink(name)


def load(day, cache_dir=None):
    return json.loads(day_path(day, cache_dir).read_text(encoding='utf-8'))


_SECRET = re.compile(r'(Bearer\s+\S+|xox[a-z]-[\w-]+|pau_\w+|glpat-[\w-]+|sk-[\w-]+)')


def short_error(exc):
    # Upstream exception text can contain credentials; the report is posted to Slack.
    return f'{type(exc).__name__}: {_SECRET.sub("<redacted>", str(exc))}'[:160]


def attempt(function, *args):
    try:
        return function(*args)
    except Exception as exc:
        traceback.print_exc(file=sys.stderr)
        return {'error': short_error(exc)}


def failed(value):
    return isinstance(value, dict) and 'error' in value


REDACTED = '<REDACTED>'


def human_prompts(prompts):
    # Background-task results are injected as user turns; they are not what the member typed.
    return [p for p in prompts if not p.get('text', '').lstrip().startswith('<task-notification>')]


def collect(day, *, cache_dir=None, members=None, now=None, jira_collect=None,
            gitlab_collect=None, audit_usage=None, audit_prompts=None, grader=None):
    now = (now or dt.datetime.now(ZONE)).astimezone(ZONE)
    if members is None:
        members = json.loads(Path(__file__).with_name('members.json').read_text(encoding='utf-8'))
    report = {'date': day.isoformat(), 'collected_at': now.isoformat(),
              'window_start': (now - dt.timedelta(hours=24)).isoformat(),
              'window_end': now.isoformat(), 'window_note': WINDOW_NOTE, 'members': members}
    report['jira'] = attempt(jira_collect or jira_src.collect, day, [m['jira'] for m in members])
    report['gitlab'] = attempt(gitlab_collect or gitlab_src.collect, day, [m['gitlab'] for m in members])
    report['usage'] = attempt(audit_usage or audit_src.usage, '24h')
    report['prompts'], report['grades'] = {}, {}
    for member in members:
        name, email = member['name'], member['email']
        prompts = attempt(audit_prompts or audit_src.prompts, email, '24h', 200)
        tokens = None if failed(report['usage']) else report['usage'].get(email)
        report['prompts'][name] = (prompts if prompts is None or failed(prompts) else
                                   {'count': len(prompts), 'capped': audit_src.is_capped(prompts)})
        if failed(prompts) or prompts is None:
            report['grades'][name] = prompts if failed(prompts) else {}
            continue
        typed = human_prompts(prompts)
        # prompt-audit hides some members' text server-side; grading lengths alone is guesswork.
        if typed and all(p.get('text', '').strip() == REDACTED for p in typed):
            report['grades'][name] = {'redacted': True}
            continue
        report['grades'][name] = attempt(grader or grade.grade, name, typed, tokens)
    try:
        previous = load(day, cache_dir)
    except FileNotFoundError:
        previous = {}
    for key in ('posted', 'slack', 'late'):
        if key in previous:
            report[key] = previous[key]
    save(report, cache_dir)
    return report


def format_tokens(value):
    if value is None:
        return '—'
    for unit, size in [('B', 10**9), ('M', 10**6), ('K', 10**3)]:
        if value >= size:
            scaled = value / size
            # Three significant digits keep the table columns narrow: 369M, 1.2B, 12.5M.
            return (f'{scaled:.0f}' if scaled >= 100 else f'{scaled:.1f}'.rstrip('0').rstrip('.')) + unit
    return str(value)


def escape(value):
    return str(value).replace('&', '&amp;').replace('<', '&lt;').replace('>', '&gt;')


def error_line(source, value):
    return f':x: {source} lỗi: {escape(value["error"])}'


def member_source(report, source, identity):
    value = report[source]
    return value if failed(value) else value[identity]


JIRA_BROWSE = 'https://space.avada.net/browse/'
APPS = {'seo': 'SEO', 'blogs': 'Blog', 'llm-ai-search-seo': 'AEO', 'ai-product-copy': 'APC',
        'avada-image-optimizer': 'Image', 'product-feed': 'Feed', 'avachat': 'Avachat', 'joy': 'Joy'}
MAX_COMMIT_TITLES = 10
MAX_MOVES = 8
MAX_ITEMS = 3


LABELS = {'OFF-PURPOSE': 'Sai mục đích', 'WASTEFUL': 'Lãng phí'}


def link(url, label):
    # Slack mrkdwn link; the label is escaped, the url only needs its '|' and '>' kept out.
    if not url:
        return escape(label)
    return f"<{url.replace('|', '%7C').replace('>', '%3E')}|{escape(label)}>"


def clip(text, limit):
    text = ' '.join(str(text).split())
    for raw, label in LABELS.items():
        text = text.replace(raw, label)
    return text if len(text) <= limit else text[:limit - 1] + '…'


def level_cell(report, name):
    prompts, result = report['prompts'][name], report['grades'][name]
    if prompts is None:
        return '—'
    if failed(result):
        return 'lỗi'
    if result.get('redacted'):
        return 'ẩn'
    value = result.get('level')
    return '—' if value is None else f'{value:g}'


def table(report):
    """Fixed-width rows in a code block: the only layout that stays aligned on a phone."""
    usage = report['usage']
    rows = []
    for member in report['members']:
        name = member['name']
        jira = member_source(report, 'jira', member['jira'])
        gitlab = member_source(report, 'gitlab', member['gitlab'])
        token = '!' if failed(usage) else format_tokens(usage.get(member['email']))
        commits = '!' if failed(gitlab) else str(gitlab['commits'])
        moved = '!' if failed(jira) else f"{len({m['key'] for m in jira['moved']})}/{sum(jira['board'].values())}"
        rows.append((level_cell(report, name), name, token, commits, moved))
    # Highest level first; unscored members sink to the bottom.
    rows.sort(key=lambda r: -float(r[0]) if r[0].replace('.', '').isdigit() else 1)
    lines = [f"{'Người':<9} {'Lv':>3} {'Token':>6} {'Commit':>6} {'Jira':>6}"]
    lines += [f'{n:<9} {lv:>3} {t:>6} {c:>6} {j:>6}' for lv, n, t, c, j in rows]
    return '```\n' + '\n'.join(lines) + '\n```'


def render_member(report, member):
    name = member['name']
    prompts, result = report['prompts'][name], report['grades'][name]
    jira = member_source(report, 'jira', member['jira'])
    gitlab = member_source(report, 'gitlab', member['gitlab'])
    cell = level_cell(report, name)
    if prompts is None:
        head = 'Level — (ngoài scope prompt-audit)'
    elif cell == 'lỗi':
        head = error_line('prompt-audit' if failed(prompts) else 'chấm điểm', result)
    elif cell == 'ẩn':
        head = 'Level — (prompt-audit ẩn nội dung prompt)'
    elif cell == '—':
        head = 'Level — (không có prompt)'
    else:
        head = f"Level *{cell}* (tin cậy {escape(result.get('confidence') or '—')})"
    lines = [f'*{escape(name)}* — {head}']
    if not failed(result) and result:
        lines += [':warning: ' + escape(clip(w, 140)) for w in result.get('warnings', [])[:MAX_ITEMS]]
        if result.get('advice'):
            lines.append(':bulb: ' + escape(clip(result['advice'], 160)))
        evidence = result.get('evidence', [])[:MAX_ITEMS]
        if evidence:
            lines.append(':white_check_mark: ' + escape('; '.join(clip(e, 60) for e in evidence)))
    if failed(jira):
        lines.append(error_line('Jira', jira))
    else:
        tasks = {}
        for m in sorted(jira['moved'], key=lambda m: m.get('at') or ''):
            task = tasks.setdefault(m['key'], {'summary': m.get('summary') or '', 'path': [m['from']]})
            task['path'].append(m['to'])
        board = ' · '.join(f'{status} {count}' for status, count in jira['board'].items()) or '0'
        lines.append(f":ticket: Kéo {len(tasks)} task · Đang mở: {escape(board)}")
        for key, task in list(tasks.items())[:MAX_MOVES]:
            lines.append(f"• {link(JIRA_BROWSE + key, key)} {escape(clip(task['summary'], 60))}"
                         f" _{escape('→'.join(task['path']))}_")
        if len(tasks) > MAX_MOVES:
            lines.append(f'+{len(tasks) - MAX_MOVES} task nữa')
    if failed(gitlab):
        lines.append(error_line('GitLab', gitlab))
    else:
        lines.extend(commit_lines(gitlab))
    return '\n'.join(lines)


def commit_lines(gitlab):
    # Merge titles are all "Merge branch ...": count them, list only real commits.
    commits = [c for c in gitlab.get('items', []) if not c['merge']]
    merges = f" (+{gitlab['merges']} merge)" if gitlab['merges'] else ''
    lines = [f":memo: Commit {gitlab['commits']}{merges}" + (':' if commits else '')]
    for c in commits[:MAX_COMMIT_TITLES]:
        repo = c['repo'].rsplit('/', 1)[-1]
        lines.append(f"• {link(c.get('url'), APPS.get(repo, repo))} {escape(clip(c['title'], 70))}")
    if len(commits) > MAX_COMMIT_TITLES:
        lines.append(f'+{len(commits) - MAX_COMMIT_TITLES} commit nữa')
    return lines


def render(report):
    day = dt.date.fromisoformat(report['date'])
    blocks = [f':bar_chart: *Falcon — báo cáo {day:%d/%m}*', table(report)]
    attention, notes = [], []
    for source, label in (('jira', 'Jira'), ('gitlab', 'GitLab'), ('usage', 'prompt-audit')):
        if failed(report[source]):
            attention.append(error_line(label, report[source]))
    for member in report['members']:
        result = report['grades'][member['name']]
        if result and not failed(result) and result.get('warnings'):
            attention.append(f"• *{escape(member['name'])}*: {escape(clip(result['warnings'][0], 110))}")
    if attention:
        blocks.append(':warning: *Cần chú ý*\n' + '\n'.join(attention))
    outside = [m['name'] for m in report['members'] if report['prompts'][m['name']] is None]
    capped = [m['name'] for m in report['members']
              if isinstance(report['prompts'][m['name']], dict) and report['prompts'][m['name']].get('capped')]
    end = dt.datetime.fromisoformat(report['window_end']).astimezone(ZONE)
    notes.append(f'Jira = kéo hôm qua/đang mở · token 24h tới {end:%H:%M %d/%m} · level chấm từ prompt')
    if outside:
        notes.append('ngoài scope prompt-audit: ' + ', '.join(outside))
    if capped:
        notes.append('prompt cắt ở 200: ' + ', '.join(capped))
    if report.get('late'):
        notes.append('thu thập muộn')
    blocks.append('_' + ' · '.join(notes) + ' · chi tiết trong thread_')
    replies = [render_member(report, m) for m in report['members']]
    return '\n\n'.join(blocks), replies


def slack_send(payload, token, opener=None):
    request = Request('https://slack.com/api/chat.postMessage',
                      data=json.dumps(payload).encode('utf-8'), headers={
                          'Authorization': 'Bearer ' + token,
                          'Content-Type': 'application/json; charset=utf-8'})
    with (opener or urlopen)(request, timeout=30) as response:
        return json.load(response)


def post(day, *, cache_dir=None, dry_run=False, force=False, send=None,
         read_token=None, collector=None, output=None):
    try:
        report = load(day, cache_dir)
    except FileNotFoundError:
        report = (collector or collect)(day, cache_dir=cache_dir)
        report['late'] = True
        save(report, cache_dir)
    if report.get('posted') and not force and not dry_run:
        return False
    main, replies = render(report)
    if dry_run:
        print(main, *replies, sep='\n\n', file=output or sys.stdout)
        return False
    # slack-thread-watch ignores only this bot; a personal token spawns support sessions.
    token_path = Path.home() / 'Projects/falcon-fix-bot/secrets/slack-bot.token'
    token = (read_token or (lambda path: path.read_text(encoding='utf-8')))(token_path).strip()
    if not token:
        raise ValueError('Empty bot token file')
    if force:
        report.pop('posted', None)
        report.pop('slack', None)
    progress = report.setdefault('slack', {'replies': []})

    def deliver(text, thread_ts=None):
        payload = {'channel': CHANNEL, 'text': text, 'mrkdwn': True,
                   'unfurl_links': False, 'unfurl_media': False}
        if thread_ts:
            payload['thread_ts'] = thread_ts
        response = (send or slack_send)(payload, token)
        if not response.get('ok') or not response.get('ts'):
            raise RuntimeError('Slack chat.postMessage failed')
        return response['ts']

    if not progress.get('main_ts'):
        progress['main_ts'] = deliver(main)
        save(report, cache_dir)
    for member, reply in zip(report['members'], replies):
        if member['name'] not in progress['replies']:
            deliver(reply, progress['main_ts'])
            progress['replies'].append(member['name'])
            save(report, cache_dir)
    report['posted'] = dt.datetime.now(ZONE).isoformat()
    save(report, cache_dir)
    return True


def main(argv=None):
    parser = argparse.ArgumentParser(description='Báo cáo SEOOn hằng ngày')
    commands = parser.add_subparsers(dest='command', required=True)
    for command in ('collect', 'post', 'run'):
        sub = commands.add_parser(command)
        sub.add_argument('--date', type=dt.date.fromisoformat, default=None)
        if command != 'collect':
            sub.add_argument('--dry-run', action='store_true')
            sub.add_argument('--force', action='store_true')
    args = parser.parse_args(argv)
    day = args.date or yesterday()
    try:
        if args.command in ('collect', 'run'):
            collect(day)
        if args.command in ('post', 'run'):
            post(day, dry_run=args.dry_run, force=args.force)
    except Exception as exc:
        traceback.print_exc(file=sys.stderr)
        print('team-daily lỗi: ' + short_error(exc), file=sys.stderr)
        return 1
    return 0


if __name__ == '__main__':
    sys.exit(main())
