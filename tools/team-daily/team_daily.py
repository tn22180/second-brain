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
            return f'{value / size:.1f}'.rstrip('0').rstrip('.') + unit
    return str(value)


def escape(value):
    return str(value).replace('&', '&amp;').replace('<', '&lt;').replace('>', '&gt;')


def error_line(source, value):
    return f':x: {source} lỗi: {escape(value["error"])}'


def member_source(report, source, identity):
    value = report[source]
    return value if failed(value) else value[identity]


def render_member(report, member):
    name = member['name']
    prompts, result = report['prompts'][name], report['grades'][name]
    jira = member_source(report, 'jira', member['jira'])
    gitlab = member_source(report, 'gitlab', member['gitlab'])
    if prompts is None:
        level = 'Level —  (ngoài scope prompt-audit)'
    elif failed(result):
        level = error_line('prompt-audit' if failed(prompts) else 'grade', result)
    elif result.get('redacted'):
        level = 'Level — (prompt-audit ẩn nội dung prompt)'
    else:
        value = result.get('level')
        level = f'Level *{value:g}*' if value is not None else 'Level — (chưa có prompt)'
    usage = report['usage']
    token_text = (error_line('prompt-audit usage', usage) if failed(usage) else
                  f":zap: {format_tokens(usage.get(member['email']))} token")
    git_text = (error_line('GitLab', gitlab) if failed(gitlab) else
                f":memo: {gitlab['commits']} commit (+{gitlab['merges']} merge)")
    jira_text = (error_line('Jira', jira) if failed(jira) else
                 f":ticket: kéo {len({move['key'] for move in jira['moved']})} task")
    summary = [f'*{escape(name)}* · {level} · {token_text} · {git_text} · {jira_text}']
    detail = [f'*{escape(name)}* · {level}']
    if not failed(jira):
        board = ' · '.join(f'{escape(status)} {count}' for status, count in jira['board'].items())
        summary.append('  ↳ board: ' + (board or '0'))
    if not failed(result):
        warnings = result.get('warnings', [])
        if warnings:
            summary.append('  :warning: ' + escape(warnings[0]))
        detail.append('Độ tin cậy: ' + escape(result.get('confidence') or '—'))
        detail.extend('• ' + escape(item) for item in result.get('evidence', []))
        detail.extend(':warning: ' + escape(item) for item in warnings)
        if result.get('advice'):
            detail.append('Gợi ý: ' + escape(result['advice']))
    if failed(jira):
        detail.append(error_line('Jira', jira))
    else:
        detail.append(':ticket: Chuyển trạng thái:')
        moves = jira['moved']
        detail.extend(f"{escape(m['key'])} {escape(m['from'])}→{escape(m['to'])}" for m in moves[:15])
        if len(moves) > 15:
            detail.append(f'+{len(moves) - 15}')
        if not moves:
            detail.append('0')
    if failed(gitlab):
        detail.append(error_line('GitLab', gitlab))
    else:
        detail.extend(commit_lines(gitlab))
    return '\n'.join(summary), '\n'.join(detail)


MAX_COMMIT_TITLES = 20


def commit_lines(gitlab):
    # Merge titles are all "Merge branch ...": count them, list only real commits.
    commits = [c for c in gitlab.get('items', []) if not c['merge']]
    lines = [f":memo: Commit ({gitlab['commits']}, +{gitlab['merges']} merge):"]
    if not commits:
        return lines + ['0']
    by_repo = {}
    for c in commits:
        by_repo.setdefault(c['repo'], []).append(c)
    shown = 0
    for repo, items in by_repo.items():
        lines.append(f'_{escape(repo)}_')
        for c in items:
            if shown == MAX_COMMIT_TITLES:
                break
            lines.append(f"• `{c['sha']}` {escape(c['title'][:90])}")
            shown += 1
    if len(commits) > shown:
        lines.append(f'+{len(commits) - shown} commit nữa')
    return lines


def render(report):
    day = dt.date.fromisoformat(report['date'])
    blocks = [f':bar_chart: *SEOOn — báo cáo ngày {day:%d/%m}*']
    replies, outside, capped = [], [], []
    for member in report['members']:
        summary, detail = render_member(report, member)
        blocks.append(summary)
        replies.append(detail)
        prompts = report['prompts'][member['name']]
        if prompts is None:
            outside.append(member['name'])
        elif not failed(prompts) and prompts['capped']:
            capped.append(member['name'])
    start, end = [dt.datetime.fromisoformat(report[key]).astimezone(ZONE)
                  for key in ('window_start', 'window_end')]
    footer = [f'prompt-audit 24h: {start:%H:%M %d/%m} → {end:%H:%M %d/%m} (+07)',
              'Nguồn: Jira FAL+SB · GitLab git.avada.net (commit ở host khác không đếm) · prompt-audit · Claude chấm điểm',
              report['window_note'], 'board Jira tại lúc thu thập; điểm chỉ dựa trên prompt']
    if report.get('late'):
        footer.append('thu thập muộn')
    if outside:
        footer.append(', '.join(outside) + ' ngoài scope prompt-audit')
    if capped:
        footer.append('prompt bị cắt ở 200/người: ' + ', '.join(capped))
    blocks.append(' · '.join(footer))
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
