import datetime
import json
import os
from pathlib import Path
import urllib.parse
import urllib.request


STATUS_ORDER = ['To Do', 'Doing', 'Waiting To Test', 'Test Staging',
                'Waiting For Review', 'Reviewing', 'Review Done', 'QA/ QC',
                'Waiting To Live', 'Testing Production', 'Done']
DAY_ZONE = datetime.timezone(datetime.timedelta(hours=7))


def _token():
    token = os.environ.get('JIRA_TOKEN', '').strip()
    if token:
        return token
    try:
        contents = Path('~/.claude/skills/jira-create/.env').expanduser().read_text(
            encoding='utf-8')
    except FileNotFoundError:
        contents = ''
    for line in contents.splitlines():
        name, separator, value = line.partition('=')
        if separator and name.strip() == 'JIRA_TOKEN':
            token = value.strip().strip('\"\'')
            if token:
                return token
    raise RuntimeError('JIRA_TOKEN is not configured')


def fetch(path: str, opener=None) -> dict:
    if opener is None:
        opener = urllib.request.urlopen
    request = urllib.request.Request('https://space.avada.net' + path, headers={
        'Authorization': 'Bearer ' + _token(),
        # Jira rejects urllib's default user agent with HTTP 403.
        'User-Agent': 'Mozilla/5.0 (Macintosh) team-daily',
        'Accept': 'application/json',
    })
    with opener(request, timeout=30) as response:
        return json.load(response)


def _issues(fetch, jql, fields, expand=None):
    start = 0
    while True:
        params = {'jql': jql, 'fields': fields, 'maxResults': 100, 'startAt': start}
        if expand:
            params['expand'] = expand
        page = fetch('/rest/api/2/search?' + urllib.parse.urlencode(params))
        issues = page.get('issues', [])
        yield from issues
        start += len(issues)
        if not issues or start >= page.get('total', start):
            break


def _owners(issue):
    return {user['name'] for user in issue['fields'].get('customfield_10700') or []}


def _quote(value):
    return '"' + value.replace('\\', '\\\\').replace('"', '\\"') + '"'


# Falcon's devs split across two boards with the same workflow: FAL and SB.
PROJECTS = 'FAL, SB'


def collect(day: datetime.date, members: list[str], fetch=None) -> dict[str, dict]:
    if fetch is None:
        fetch = globals()['fetch']
    result = {member: {'moved': [], 'owned_moved': [], 'board': {}} for member in members}
    if not result:
        return result
    jql = (f'project in ({PROJECTS}) AND status changed DURING '
           f'("{day.isoformat()} 00:00","{day.isoformat()} 23:59")')
    for issue in _issues(fetch, jql, 'summary,status,customfield_10700', 'changelog'):
        owners = _owners(issue) & result.keys()
        changelog = issue.get('changelog', {})
        if changelog.get('total', 0) > changelog.get('maxResults', len(changelog.get('histories', []))):
            # Search can truncate histories even when all issue pages are fetched.
            key = urllib.parse.quote(issue['key'], safe='')
            changelog = fetch(f'/rest/api/2/issue/{key}?expand=changelog&fields=summary')['changelog']
        for history in changelog.get('histories', []):
            at = history['created']
            if datetime.datetime.fromisoformat(at).astimezone(DAY_ZONE).date() != day:
                continue
            author = history.get('author', {}).get('name')
            for item in history.get('items', []):
                if item.get('field') != 'status':
                    continue
                move = {'key': issue['key'], 'summary': issue['fields']['summary'],
                        'from': item.get('fromString'), 'to': item.get('toString'), 'at': at}
                if author in result:
                    result[author]['moved'].append(move.copy())
                for owner in owners:
                    result[owner]['owned_moved'].append({**move, 'by': author})
    jql = (f'project in ({PROJECTS}) AND cf[10700] in (' + ','.join(map(_quote, result))
           + ') AND status in (' + ','.join(map(_quote, STATUS_ORDER[:-1])) + ')')
    for issue in _issues(fetch, jql, 'status,customfield_10700'):
        status = issue['fields']['status']['name']
        if status not in STATUS_ORDER[:-1]:
            continue
        for owner in _owners(issue) & result.keys():
            board = result[owner]['board']
            board[status] = board.get(status, 0) + 1
    for data in result.values():
        data['board'] = {status: data['board'][status] for status in STATUS_ORDER[:-1]
                         if status in data['board']}
    return result
