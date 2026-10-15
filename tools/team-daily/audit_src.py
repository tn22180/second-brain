import json
import re
from decimal import Decimal
from pathlib import Path
import time
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen


_TOTAL = re.compile(
    r'^\s*\[\w+\]\s+(\S+@\S+)\s+—\s+avg\s+.*?,\s*total\s+'
    r'(\d+(?:\.\d+)?)([KMB]?)\s*$', re.MULTILINE
)
_ENTRY = re.compile(
    r'^\[\d+\]\s+(\S+)\s+\|\s+session=(\S+)\s+\|\s+len=(\d+)\s*$'
)
_UNITS = {'': 1, 'K': 1000, 'M': 1000000, 'B': 1000000000}


RETRIES = 3


def _read_with_retry(opener, request, sleep=time.sleep):
    # audit.avada.net sits behind Cloudflare and drops a connection now and then
    # (ConnectionResetError seen 2026-10-15); one drop must not cost a member's grade.
    for attempt in range(RETRIES):
        try:
            with opener(request, timeout=60) as response:
                return response.read().decode('utf-8')
        except (ConnectionError, TimeoutError, URLError) as exc:
            if isinstance(exc, HTTPError) or attempt == RETRIES - 1:
                raise
            sleep(2 * (attempt + 1))


def call(tool: str, args: dict, *, urlopen=None) -> str:
    config = json.loads((Path.home() / '.claude.json').read_text())
    authorization = config['mcpServers']['prompt-audit']['headers']['Authorization']
    request = Request('https://audit.avada.net/mcp', headers={
        'Authorization': authorization,
        'Content-Type': 'application/json',
        'Accept': 'application/json, text/event-stream',
        'User-Agent': 'claude-code/2',
    }, data=json.dumps({
        'jsonrpc': '2.0', 'id': 1, 'method': 'tools/call',
        'params': {'name': tool, 'arguments': args},
    }).encode('utf-8'))
    opener = urlopen if urlopen is not None else globals()['urlopen']
    body = _read_with_retry(opener, request)
    if body.lstrip().startswith('{'):
        payload = json.loads(body)
    else:
        payload = None
        for line in body.splitlines():
            if line.startswith('data:'):
                event = json.loads(line[5:].strip())
                if event.get('id') == 1:
                    payload = event
                    break
        if payload is None:
            raise RuntimeError('Missing audit response')
    if 'error' in payload:
        raise RuntimeError('Audit JSON-RPC error')
    result = payload['result']
    text = result.get('content', [{}])[0].get('text', '')
    if 'PERMISSION DENIED' in text:
        raise PermissionError('Audit permission denied')
    if result.get('isError'):
        # The server reports tool failures as text, e.g. "MCP error -32602: Tool x not found".
        raise RuntimeError('Audit tool error: ' + text[:120])
    return text


def usage(window='24h', call=None) -> dict[str, int]:
    invoke = call if call is not None else globals()['call']
    text = invoke('team_usage', {'window': window})
    if 'PERMISSION DENIED' in text:
        raise PermissionError('Audit permission denied')
    # The server's daily average always divides by five, regardless of window.
    return {email: int(Decimal(total) * _UNITS[unit])
            for email, total, unit in _TOTAL.findall(text)}


def _limit(limit):
    if not isinstance(limit, int) or isinstance(limit, bool) or limit < 1:
        raise ValueError('limit must be a positive integer')
    # The server caps results at 200 and offers no pagination.
    return min(limit, 200)


def prompts(email, window='24h', limit=200, call=None) -> list[dict] | None:
    invoke = call if call is not None else globals()['call']
    try:
        text = invoke('member_prompts', {'email': email, 'window': window, 'limit': _limit(limit)})
    except PermissionError:
        return None
    if 'PERMISSION DENIED' in text:
        return None
    result = []
    lines = []
    for line in text.splitlines():
        match = _ENTRY.fullmatch(line)
        if match:
            if result:
                result[-1]['text'] = '\n'.join(lines)
            ts, session, length = match.groups()
            result.append({'ts': ts, 'session': session.removesuffix('…'),
                           'len': int(length), 'text': ''})
            lines = []
        elif result and line.startswith('    '):
            lines.append(line[4:])
    if result:
        result[-1]['text'] = '\n'.join(lines)
    return result


def is_capped(prompts, limit=200):
    return len(prompts) >= _limit(limit)
