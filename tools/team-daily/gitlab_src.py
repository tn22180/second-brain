import datetime
import json
import subprocess
from urllib.parse import urlencode


def parse_paginated(source: str) -> list:
    # glab concatenates page arrays; decoding boundaries preserves brackets in strings.
    decoder = json.JSONDecoder()
    parts = []
    remaining = source.strip()
    while remaining:
        page, end = decoder.raw_decode(remaining)
        if not isinstance(page, list):
            raise ValueError('Expected a GitLab API array')
        if page:
            parts.append(remaining[1:end - 1])
        remaining = remaining[end:].lstrip()
    return json.loads('[' + ','.join(parts) + ']')


def api(path: str, run=None) -> list:
    if run is None:
        run = subprocess.run
    result = run(
        ['glab', 'api', '--hostname', 'git.avada.net', '--paginate', path],
        capture_output=True, text=True,
    )
    if result.returncode:
        raise RuntimeError(result.stderr)
    return parse_paginated(result.stdout)


_default_api = api


def collect(day: datetime.date, members: list[str], api=None) -> dict[str, dict]:
    if api is None:
        api = _default_api
    result = {member: {'commits': 0, 'merges': 0, 'by_repo': {}}
              for member in members}
    identities = {member.lower(): member for member in members}
    date = day.isoformat()
    query = urlencode({
        'since': f'{date}T00:00:00+07:00',
        'until': f'{date}T23:59:59+07:00',
        'all': 'true',
        'per_page': 100,
    })
    projects = api('groups/avada/projects?per_page=100&include_subgroups=true&archived=false')
    seen = set()
    for project in projects:
        if project['last_activity_at'][:10] < date:
            continue
        commits = api(f"projects/{project['id']}/repository/commits?{query}")
        for commit in commits:
            sha = commit['id']
            if sha in seen:
                continue
            seen.add(sha)
            member = identities.get(commit['author_email'].split('@', 1)[0].lower())
            if member is None:
                continue
            counts = result[member]
            kind = 'merges' if len(commit['parent_ids']) > 1 else 'commits'
            counts[kind] += 1
            repo = project['path_with_namespace']
            counts['by_repo'][repo] = counts['by_repo'].get(repo, 0) + 1
    return result
