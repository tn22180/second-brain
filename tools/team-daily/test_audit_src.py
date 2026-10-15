import io
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import Mock, patch

import audit_src


class ParsingTests(unittest.TestCase):
    def test_usage_totals_and_units(self):
        fake = Mock(return_value='''Team: Falcon | Window: 24h
Summary: ZERO=1, WEAK=1, OK=3 / total=5
Members (sort avg/day ASC):
  [ZERO] hieulm@avadagroup.com — avg 0/day, total 0
  [WEAK] nghiavt@avada.email — avg 17.39M/day, total 86.94M
  [OK] tunglv@avadagroup.com — avg 85.66M/day, total 428.29M
  [OK] small@example.com — avg 1/day, total 1.234K
  [OK] big@example.com — avg 2/day, total 1.234567891B
''')
        self.assertEqual(audit_src.usage(call=fake), {
            'hieulm@avadagroup.com': 0,
            'nghiavt@avada.email': 86940000,
            'tunglv@avadagroup.com': 428290000,
            'small@example.com': 1234,
            'big@example.com': 1234567891,
        })
        self.assertEqual(fake.call_args.args[1]['window'], '24h')

    def test_prompts_preserve_multiline_text(self):
        fake = Mock(return_value='''Prompts for tunglv

[1] 2026-10-15T07:55:27.123Z | session=418fc7c3… | len=22
    first line
    
      nested line  
    [2] this is prompt text

[2] 2026-10-15T07:51:41.867Z | session=abc | len=0
''')
        self.assertEqual(audit_src.prompts('tunglv@avadagroup.com', '7d', 10, fake), [
            {'ts': '2026-10-15T07:55:27.123Z', 'session': '418fc7c3',
             'len': 22, 'text': 'first line\n\n  nested line  \n[2] this is prompt text'},
            {'ts': '2026-10-15T07:51:41.867Z', 'session': 'abc',
             'len': 0, 'text': ''},
        ])
        self.assertEqual(fake.call_args.args[1], {
            'email': 'tunglv@avadagroup.com', 'window': '7d', 'limit': 10})

    def test_empty_results(self):
        self.assertEqual(audit_src.usage(call=lambda *a: 'No usage'), {})
        self.assertEqual(audit_src.prompts('a@b.com', call=lambda *a: 'No prompts'), [])

    def test_permission_denied(self):
        self.assertIsNone(audit_src.prompts('a@b.com', call=lambda *a: 'PERMISSION DENIED: scope'))
        self.assertIsNone(audit_src.prompts('a@b.com', call=Mock(side_effect=PermissionError)))

    def test_cap(self):
        self.assertFalse(audit_src.is_capped([{}] * 199))
        self.assertTrue(audit_src.is_capped([{}] * 200))
        self.assertTrue(audit_src.is_capped([{}] * 201))
        self.assertTrue(audit_src.is_capped([{}] * 2, 2))
        fake = Mock(return_value='No prompts')
        audit_src.prompts('a@b.com', limit=500, call=fake)
        self.assertEqual(fake.call_args.args[1]['limit'], 200)
        self.assertTrue(audit_src.is_capped([{}] * 200, 500))

    def test_invalid_limit_does_not_call_server(self):
        fake = Mock()
        for limit in (0, -1, 1.5, True):
            with self.subTest(limit=limit), self.assertRaises(ValueError):
                audit_src.prompts('a@b.com', limit=limit, call=fake)
        fake.assert_not_called()


class TransportTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.home = Path(self.temp.name)
        (self.home / '.claude.json').write_text(json.dumps({
            'mcpServers': {'prompt-audit': {'headers': {'Authorization': 'Bearer test-secret'}}}
        }))
        self.home_patch = patch.object(Path, 'home', return_value=self.home)
        self.home_patch.start()
        self.addCleanup(self.home_patch.stop)

    def response(self, text='hello', **fields):
        return json.dumps({'jsonrpc': '2.0', 'id': 1, 'result': {
            'content': [{'type': 'text', 'text': text}], **fields}})

    def test_json_and_sse(self):
        for body in (self.response(), ': ping\nevent: message\ndata: ' + self.response() + '\n\n'):
            with self.subTest(body=body), patch('audit_src.urlopen', return_value=io.BytesIO(body.encode())) as opener:
                self.assertEqual(audit_src.call('example', {'window': '24h'}), 'hello')
                req = opener.call_args.args[0]
                self.assertEqual(req.full_url, 'https://audit.avada.net/mcp')
                self.assertEqual(req.get_method(), 'POST')
                headers = {k.lower(): v for k, v in req.header_items()}
                self.assertEqual(headers['authorization'], 'Bearer test-secret')
                self.assertEqual(headers['content-type'], 'application/json')
                self.assertEqual(headers['accept'], 'application/json, text/event-stream')
                self.assertEqual(headers['user-agent'], 'claude-code/2')
                self.assertEqual(json.loads(req.data), {
                    'jsonrpc': '2.0', 'id': 1, 'method': 'tools/call',
                    'params': {'name': 'example', 'arguments': {'window': '24h'}}})

    def test_injectable_transport(self):
        fake = Mock(return_value=io.BytesIO(self.response().encode()))
        self.assertEqual(audit_src.call('example', {}, urlopen=fake), 'hello')

    def test_errors(self):
        for body, error in (
            (self.response('PERMISSION DENIED'), PermissionError),
            (self.response('PERMISSION DENIED', isError=True), PermissionError),
            (self.response('other failure', isError=True), RuntimeError),
            (json.dumps({'error': {'message': 'failure'}}), RuntimeError),
        ):
            with self.subTest(body=body), self.assertRaises(error):
                audit_src.call('example', {}, urlopen=lambda *a, **kw: io.BytesIO(body.encode()))

    def test_default_prompts_permission_denied(self):
        body = self.response('PERMISSION DENIED: outside team', isError=True)
        with patch('audit_src.urlopen', return_value=io.BytesIO(body.encode())):
            self.assertIsNone(audit_src.prompts('outside@example.com'))

    def test_tool_failure_is_not_empty_prompts(self):
        body = self.response('server failure', isError=True)
        with patch('audit_src.urlopen', return_value=io.BytesIO(body.encode())):
            with self.assertRaises(RuntimeError):
                audit_src.prompts('a@b.com')


class ToolNameTest(unittest.TestCase):
    def test_server_tool_names(self):
        seen = []
        audit_src.usage('24h', call=lambda tool, args: seen.append(tool) or '')
        audit_src.prompts('a@b.c', '24h', 200, call=lambda tool, args: seen.append(tool) or 'title\n')
        self.assertEqual(seen, ['team_usage', 'member_prompts'])


class RetryTest(unittest.TestCase):
    def test_retries_connection_reset_then_succeeds(self):
        calls = []
        def opener(request, timeout):
            calls.append(1)
            if len(calls) < 3:
                raise ConnectionResetError(54, 'reset')
            return io.BytesIO(b'ok')
        self.assertEqual(audit_src._read_with_retry(opener, None, sleep=lambda s: None), 'ok')
        self.assertEqual(len(calls), 3)

    def test_gives_up_after_retries(self):
        def opener(request, timeout):
            raise ConnectionResetError(54, 'reset')
        with self.assertRaises(ConnectionResetError):
            audit_src._read_with_retry(opener, None, sleep=lambda s: None)


if __name__ == '__main__':
    unittest.main()
