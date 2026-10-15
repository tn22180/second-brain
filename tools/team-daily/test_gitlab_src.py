import datetime
import subprocess
import unittest
from urllib.parse import parse_qs, urlsplit

import gitlab_src


class GitLabTests(unittest.TestCase):
    def test_paginated_arrays(self):
        for source, expected in (
            ('[1][2]', [1, 2]),
            ('[1]\n[2]', [1, 2]),
            ('[]', []),
            ('[][1][]', [1]),
        ):
            with self.subTest(source=source):
                self.assertEqual(gitlab_src.parse_paginated(source), expected)

    def test_api_uses_glab(self):
        calls = []

        def run(args, **kwargs):
            calls.append((args, kwargs))
            return subprocess.CompletedProcess(args, 0, '[1]\n[2]', '')

        self.assertEqual(gitlab_src.api('groups/avada/projects', run=run), [1, 2])
        self.assertEqual(calls, [(
            ['glab', 'api', '--hostname', 'git.avada.net', '--paginate',
             'groups/avada/projects'],
            {'capture_output': True, 'text': True},
        )])

    def test_api_failure(self):
        def run(args, **kwargs):
            return subprocess.CompletedProcess(args, 1, '', 'request failed')

        with self.assertRaisesRegex(RuntimeError, 'request failed'):
            gitlab_src.api('projects', run=run)

    def test_collect(self):
        members = ['tuannv', 'tunglv', 'truongnn', 'minhpt', 'dungtt', 'tranggt']
        projects = [
            {'id': 1, 'path_with_namespace': 'avada/one',
             'last_activity_at': '2026-10-15T00:00:00Z'},
            {'id': 2, 'path_with_namespace': 'avada/two',
             'last_activity_at': '2026-10-16T00:00:00Z'},
            {'id': 3, 'path_with_namespace': 'avada/inactive',
             'last_activity_at': '2026-10-14T23:59:59Z'},
        ]

        def commit(sha, email, parents, name='Unrelated Display Name'):
            return {'id': sha, 'author_email': email, 'parent_ids': parents,
                    'author_name': name, 'title': f'title {sha}', 'web_url': f'https://g/{sha}'}

        commits = {
            'projects/1/repository/commits': [
                commit('a', 'tuannv@avada.email', ['p']),
                commit('b', 'TUANNV@avadagroup.com', ['p', 'q']),
                commit('c', 'tunglv@avada.email', []),
                commit('bot', 'ci@avada.io', ['p'], 'tuannv'),
                commit('other', 'other@avada.email', ['p'], 'tunglv'),
            ],
            'projects/2/repository/commits': [
                commit('a', 'tuannv@avadagroup.com', ['p']),
                commit('b', 'tuannv@avada.email', ['p', 'q']),
                commit('d', 'tuannv@avadagroup.com', ['p']),
            ],
        }
        calls = []

        def api(path):
            calls.append(path)
            if len(calls) == 1:
                self.assertEqual(path, 'groups/avada/projects?per_page=100&'
                                 'include_subgroups=true&archived=false')
                return projects
            parsed = urlsplit(path)
            self.assertEqual(parse_qs(parsed.query), {
                'since': ['2026-10-15T00:00:00+07:00'],
                'until': ['2026-10-15T23:59:59+07:00'],
                'all': ['true'], 'per_page': ['100'],
            })
            return commits[parsed.path]

        result = gitlab_src.collect(datetime.date(2026, 10, 15), members, api=api)
        self.assertEqual(len(calls), 3)
        self.assertEqual(set(result), set(members))
        self.assertEqual(result['tuannv'], {
            'commits': 2, 'merges': 1,
            'by_repo': {'avada/one': 2, 'avada/two': 1},
            'items': [
                {'repo': 'avada/one', 'sha': 'a', 'title': 'title a', 'merge': False, 'url': 'https://g/a'},
                {'repo': 'avada/one', 'sha': 'b', 'title': 'title b', 'merge': True, 'url': 'https://g/b'},
                {'repo': 'avada/two', 'sha': 'd', 'title': 'title d', 'merge': False, 'url': 'https://g/d'},
            ],
        })
        self.assertEqual(result['tunglv']['items'],
                         [{'repo': 'avada/one', 'sha': 'c', 'title': 'title c', 'merge': False, 'url': 'https://g/c'}])
        for member in members[2:]:
            self.assertEqual(result[member], {'commits': 0, 'merges': 0, 'by_repo': {}, 'items': []})


if __name__ == '__main__':
    unittest.main()
