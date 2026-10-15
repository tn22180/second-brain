import datetime
import io
import json
import unittest
from unittest.mock import patch
from urllib.parse import parse_qs, urlsplit

import jira_src


DAY = datetime.date(2026, 10, 14)
STATUSES = ['To Do', 'Doing', 'Waiting To Test', 'Test Staging',
            'Waiting For Review', 'Reviewing', 'Review Done', 'QA/ QC',
            'Waiting To Live', 'Testing Production', 'Done']


def history(author='tuannv', at='2026-10-14T15:03:11.000+0700', items=None):
    return {'author': {'name': author, 'displayName': 'Not a username'},
            'created': at, 'items': items if items is not None else [
                {'field': 'status', 'fromString': 'Doing', 'toString': 'QA/ QC'}]}


def issue(key, owners, status='Doing', histories=()):
    return {'key': key, 'fields': {'summary': 'Summary ' + key,
            'status': {'name': status}, 'assignee': {'name': 'minhpt'},
            'customfield_10700': [{'name': name} for name in owners]},
            'changelog': {'total': len(histories), 'maxResults': 100,
                          'histories': list(histories)}}


class CollectTests(unittest.TestCase):
    def test_transitions_ownership_dates_board_and_encoded_queries(self):
        histories = [history(), history('other'),
                     history(at='2026-10-13T17:00:00.000+0000'),
                     history(at='2026-10-14T17:00:00.000+0000'),
                     history(at='2026-10-13T23:59:59.000+0700'),
                     history(items=[{'field': 'summary', 'fromString': 'a',
                                     'toString': 'b'}])]
        calls = []

        def fetch(path):
            calls.append(path)
            self.assertNotIn(' ', path)
            query = parse_qs(urlsplit(path).query)
            self.assertEqual(query['maxResults'], ['100'])
            self.assertEqual(query['startAt'], ['0'])
            if 'expand' in query:
                self.assertEqual(query['jql'], ['project in (FAL, SB) AND status changed '
                    'DURING ("2026-10-14 00:00","2026-10-14 23:59")'])
                self.assertEqual(query['fields'], ['summary,status,customfield_10700'])
                rows = [issue('FAL-1', ['tunglv', 'tranggt'], histories=histories)]
            else:
                self.assertIn('cf[10700] in (', query['jql'][0])
                self.assertTrue(query['jql'][0].startswith('project in (FAL, SB) AND '))
                self.assertIn('"QA/ QC"', query['jql'][0])
                self.assertNotIn('"Done"', query['jql'][0])
                self.assertNotIn('assignee', query['jql'][0])
                rows = [issue('FAL-2', ['tunglv', 'tranggt'], 'QA/ QC'),
                        issue('FAL-3', ['tunglv'], 'To Do'),
                        issue('FAL-4', ['tunglv'], 'QA/ QC'),
                        issue('FAL-5', [], 'Doing')]
            return {'total': len(rows), 'issues': rows}

        members = ['tuannv', 'tunglv', 'truongnn', 'minhpt', 'dungtt', 'tranggt']
        result = jira_src.collect(DAY, members, fetch)
        self.assertEqual(set(result), set(members))
        self.assertEqual(len(calls), 2)
        self.assertEqual(len(result['tuannv']['moved']), 2)
        self.assertEqual(result['tuannv']['moved'][0], {
            'key': 'FAL-1', 'summary': 'Summary FAL-1', 'from': 'Doing',
            'to': 'QA/ QC', 'at': '2026-10-14T15:03:11.000+0700'})
        self.assertEqual([m['by'] for m in result['tunglv']['owned_moved']],
                         ['tuannv', 'other', 'tuannv'])
        self.assertEqual(result['tranggt']['owned_moved'], result['tunglv']['owned_moved'])
        self.assertEqual(result['tunglv']['board'], {'To Do': 1, 'QA/ QC': 2})
        self.assertEqual(list(result['tunglv']['board']), ['To Do', 'QA/ QC'])
        self.assertEqual(result['minhpt'], {'moved': [], 'owned_moved': [], 'board': {}})
        self.assertEqual(jira_src.STATUS_ORDER, STATUSES)

    def test_pagination_and_truncated_changelog(self):
        calls = []

        def fetch(path):
            calls.append(path)
            if path.startswith('/rest/api/2/issue/'):
                self.assertEqual(path, '/rest/api/2/issue/FAL-1?expand=changelog&fields=summary')
                return {'changelog': {'histories': [history(), history('other')]}}
            query = parse_qs(urlsplit(path).query)
            start = int(query['startAt'][0])
            self.assertIn(start, (0, 1))
            row = issue('FAL-' + str(start + 1), ['tuannv'], histories=[history()])
            if 'expand' in query and start == 0:
                row['changelog'].update(total=101, maxResults=100)
            return {'startAt': start, 'maxResults': 1, 'total': 2, 'issues': [row]}

        result = jira_src.collect(DAY, ['tuannv'], fetch)['tuannv']
        self.assertEqual(len(calls), 5)
        self.assertEqual(len(result['moved']), 2)
        self.assertEqual(len(result['owned_moved']), 3)
        self.assertEqual(result['board'], {'Doing': 2})

    def test_empty_results_and_default_fetch(self):
        with patch.object(jira_src, 'fetch', return_value={'issues': [], 'total': 0}) as fake:
            self.assertEqual(jira_src.collect(DAY, ['tuannv']), {
                'tuannv': {'moved': [], 'owned_moved': [], 'board': {}}})
            self.assertEqual(fake.call_count, 2)


class FetchTests(unittest.TestCase):
    def test_env_token_headers_and_json(self):
        with patch.dict('os.environ', {'JIRA_TOKEN': 'fake-pat'}, clear=True), \
             patch('urllib.request.urlopen', return_value=io.BytesIO(b'{"issues": []}')) as opener, \
             patch('pathlib.Path.read_text') as read:
            self.assertEqual(jira_src.fetch('/rest/api/2/search?jql=x'), {'issues': []})
            request = opener.call_args.args[0]
            self.assertEqual(request.full_url, 'https://space.avada.net/rest/api/2/search?jql=x')
            self.assertEqual(request.get_header('Authorization'), 'Bearer fake-pat')
            self.assertTrue(request.get_header('User-agent').startswith('Mozilla/5.0'))
            self.assertEqual(request.get_method(), 'GET')
            read.assert_not_called()

    def test_file_token_quotes_and_injected_opener(self):
        for value in ['"file-pat"', "'file-pat'", 'file-pat']:
            with self.subTest(value=value), patch.dict('os.environ', {}, clear=True), \
                 patch('pathlib.Path.read_text', return_value='# ignored\nOTHER=x\nJIRA_TOKEN=' + value + '\n'):
                def opener(request, **kwargs):
                    self.assertEqual(request.get_header('Authorization'), 'Bearer file-pat')
                    return io.BytesIO(json.dumps({'ok': True}).encode())
                self.assertEqual(jira_src.fetch('/test', opener=opener), {'ok': True})

    def test_missing_token_fails_before_network(self):
        with patch.dict('os.environ', {}, clear=True), \
             patch('pathlib.Path.read_text', side_effect=FileNotFoundError), \
             patch('urllib.request.urlopen') as opener:
            with self.assertRaisesRegex(RuntimeError, 'JIRA_TOKEN'):
                jira_src.fetch('/test')
            opener.assert_not_called()


if __name__ == '__main__':
    unittest.main()
