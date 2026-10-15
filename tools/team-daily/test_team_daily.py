import copy
import datetime as dt
import io
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

import team_daily as daily


NOW = dt.datetime(2026, 10, 15, 0, 10, tzinfo=daily.ZONE)
DAY = dt.date(2026, 10, 14)
MEMBERS = [{'name': 'tuannv', 'jira': 'tuannv', 'gitlab': 'tuannv',
            'email': 'tuannv@avadagroup.com'}]
GRADE = {'level': 4.5, 'confidence': 'vừa', 'evidence': ['4a: kiểm chứng'],
         'warnings': ['Lặp 2 lần', 'Thiếu ngữ cảnh'], 'advice': 'Ghi tiêu chí.'}


class DailyTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.cache = Path(self.temp.name)

    def collect(self, **overrides):
        options = dict(cache_dir=self.cache, members=MEMBERS, now=NOW,
                       jira_collect=lambda *a: {'tuannv': {'moved': [
                           {'key': 'FAL-1', 'from': 'To Do', 'to': 'Doing'}],
                           'board': {'To Do': 3, 'Doing': 2}}},
                       gitlab_collect=lambda *a: {'tuannv': {
                           'commits': 12, 'merges': 3, 'by_repo': {'avada/app': 15}}},
                       audit_usage=lambda *a: {MEMBERS[0]['email']: 428000000},
                       audit_prompts=lambda *a: [{}] * 200,
                       grader=lambda *a: copy.deepcopy(GRADE))
        options.update(overrides)
        return daily.collect(DAY, **options)

    def test_full_render(self):
        report = self.collect()
        main, replies = daily.render(report)
        for text in ['*Falcon — báo cáo 14/10*', 'tuannv    4.5   428M     12    1/5',
                     '• *tuannv*: Lặp 2 lần', 'token 24h tới 00:10 15/10',
                     'prompt cắt ở 200: tuannv']:
            self.assertIn(text, main)
        self.assertNotIn('Thiếu ngữ cảnh', main)
        for text in ['Level *4.5* (tin cậy vừa)', '4a: kiểm chứng', ':warning: Thiếu ngữ cảnh',
                     ':bulb: Ghi tiêu chí.', ':ticket: Kéo 1 task · Đang mở: To Do 3 · Doing 2',
                     '• <https://space.avada.net/browse/FAL-1|FAL-1>  _To Do→Doing_',
                     ':memo: Commit 12 (+3 merge)']:
            self.assertIn(text, replies[0])
        self.assertEqual(report['collected_at'], NOW.isoformat())
        self.assertTrue((self.cache / '2026-10-14.json').exists())

    def test_missing_audit(self):
        report = self.collect(audit_prompts=lambda *a: None)
        main, replies = daily.render(report)
        self.assertIn('ngoài scope prompt-audit: tuannv', main)
        self.assertIn('Level — (ngoài scope prompt-audit)', replies[0])

    def test_isolation_and_safe_error(self):
        def fail(*args):
            raise RuntimeError('401 for Bearer pau_abc123 xoxb-1-2-secret')
        for failing in ['jira_collect', 'gitlab_collect', 'audit_usage', 'audit_prompts', 'grader']:
            with self.subTest(failing=failing):
                report = self.collect(**{failing: fail})
                main, replies = daily.render(report)
                self.assertIn(':x:', main + replies[0])
                text = json.dumps(report, ensure_ascii=False) + main + str(replies)
                self.assertNotIn('pau_abc123', text)
                self.assertNotIn('xoxb-1-2-secret', text)
                self.assertIn('RuntimeError: 401 for', text)
                row = next(line for line in main.splitlines() if line.startswith('tuannv'))
                if failing != 'gitlab_collect':
                    self.assertIn(' 12 ', row)
                if failing != 'jira_collect':
                    self.assertIn('1/5', row)

    def test_redacted_prompts_not_graded(self):
        called = []
        report = self.collect(audit_prompts=lambda *a: [{'text': '<REDACTED>'}] * 3,
                              grader=lambda *a: called.append(a) or copy.deepcopy(GRADE))
        self.assertEqual(called, [])
        main, replies = daily.render(report)
        self.assertIn('tuannv     ẩn', main)
        self.assertIn('Level — (prompt-audit ẩn nội dung prompt)', replies[0])

    def test_task_notifications_not_graded(self):
        seen = []
        self.collect(audit_prompts=lambda *a: [{'text': '<task-notification>x'}, {'text': 'fix bug'}],
                     grader=lambda name, prompts, tokens: seen.append(prompts) or copy.deepcopy(GRADE))
        self.assertEqual(seen[0], [{'text': 'fix bug'}])

    def test_warning_labels_localized(self):
        grade = dict(GRADE, warnings=['WASTEFUL: lặp', 'OFF-PURPOSE: game'])
        report = self.collect(grader=lambda *a: copy.deepcopy(grade))
        main, replies = daily.render(report)
        self.assertIn('Lãng phí: lặp', main)
        self.assertIn('Sai mục đích: game', replies[0])

    def test_tokens(self):
        for value, expected in [(1200000000, '1.2B'), (428000000, '428M'),
                                (950000, '950K'), (0, '0'), (12, '12'), (None, '—'),
                                (369400000, '369M'), (12540000, '12.5M')]:
            self.assertEqual(daily.format_tokens(value), expected)

    def test_yesterday(self):
        for hour, minute in [(0, 10), (23, 50)]:
            local = NOW.replace(hour=hour, minute=minute)
            self.assertEqual(daily.yesterday(local.astimezone(dt.timezone.utc)), DAY)

    def test_post_bot_threads_and_guard(self):
        self.collect()
        requests = []
        paths = []
        def read(path):
            paths.append(path)
            return 'fake-bot-token\n'
        def slack(payload, token):
            requests.append((payload, token))
            return {'ok': True, 'ts': str(len(requests))}
        with patch.object(daily.Path, 'home', return_value=self.cache):
            self.assertTrue(daily.post(DAY, cache_dir=self.cache, send=slack, read_token=read))
        self.assertEqual(paths, [self.cache / 'Projects/falcon-fix-bot/secrets/slack-bot.token'])
        self.assertEqual(len(requests), 2)
        self.assertEqual(requests[0][1], 'fake-bot-token')
        self.assertEqual(requests[0][0]['channel'], 'C0BGRTWUE8Y')
        self.assertEqual(requests[1][0]['thread_ts'], '1')
        self.assertFalse(daily.post(DAY, cache_dir=self.cache, send=slack, read_token=read))
        self.assertEqual(len(requests), 2)
        daily.post(DAY, cache_dir=self.cache, send=slack, read_token=read, force=True)
        self.assertEqual(len(requests), 4)

    def test_dry_run(self):
        self.collect()
        def forbidden(*args):
            self.fail('dry-run accessed Slack or token')
        output = io.StringIO()
        daily.post(DAY, cache_dir=self.cache, dry_run=True, send=forbidden,
                   read_token=forbidden, output=output)
        self.assertIn('Falcon — báo cáo', output.getvalue())
        self.assertNotIn('posted', daily.load(DAY, self.cache))

    def test_late_collection(self):
        def collect_late(day, **kwargs):
            self.assertEqual(day, DAY)
            return self.collect()
        output = io.StringIO()
        daily.post(DAY, cache_dir=self.cache, dry_run=True, collector=collect_late, output=output)
        self.assertIn('thu thập muộn', output.getvalue())
        self.assertTrue(daily.load(DAY, self.cache)['late'])

    def test_resume_partial_post(self):
        self.collect()
        def fail_reply(payload, token):
            if 'thread_ts' in payload:
                raise RuntimeError('failed')
            return {'ok': True, 'ts': 'main-ts'}
        with self.assertRaises(RuntimeError):
            daily.post(DAY, cache_dir=self.cache, send=fail_reply, read_token=lambda p: 'fake')
        calls = []
        def resume(payload, token):
            calls.append(payload)
            return {'ok': True, 'ts': 'reply-ts'}
        daily.post(DAY, cache_dir=self.cache, send=resume, read_token=lambda p: 'fake')
        self.assertEqual(len(calls), 1)
        self.assertEqual(calls[0]['thread_ts'], 'main-ts')

    def test_slack_transport(self):
        calls = []
        def opener(request, timeout):
            calls.append((request, timeout))
            return io.StringIO('{"ok": true, "ts": "123"}')
        payload = {'channel': daily.CHANNEL, 'text': 'Báo cáo', 'thread_ts': 'main'}
        self.assertEqual(daily.slack_send(payload, 'fake-bot', opener=opener)['ts'], '123')
        request, timeout = calls[0]
        self.assertEqual(request.full_url, 'https://slack.com/api/chat.postMessage')
        self.assertEqual(request.get_header('Authorization'), 'Bearer fake-bot')
        self.assertEqual(json.loads(request.data), payload)
        self.assertEqual(timeout, 30)

    def test_cli_run(self):
        with patch.object(daily, 'collect') as collect, patch.object(daily, 'post') as post:
            self.assertEqual(daily.main(['run', '--date', '2026-10-14', '--dry-run']), 0)
        collect.assert_called_once_with(DAY)
        post.assert_called_once_with(DAY, dry_run=True, force=False)

    def test_slack_rejection_is_not_posted(self):
        self.collect()
        with self.assertRaisesRegex(RuntimeError, 'Slack chat.postMessage failed'):
            daily.post(DAY, cache_dir=self.cache, read_token=lambda p: 'fake',
                       send=lambda *a: {'ok': False, 'error': 'secret'})
        self.assertNotIn('posted', daily.load(DAY, self.cache))

    def test_commit_titles_grouped_and_capped(self):
        items = ([{'repo': 'avada/seo', 'sha': f'{i:08x}', 'title': f'fix {i} <b>', 'merge': False,
                   'url': f'https://git.avada.net/avada/seo/-/commit/{i}'}
                  for i in range(22)] +
                 [{'repo': 'avada/seo', 'sha': 'm0000000', 'title': 'Merge branch x', 'merge': True}])
        report = self.collect(gitlab_collect=lambda *a: {'tuannv': {
            'commits': 22, 'merges': 1, 'by_repo': {'avada/seo': 23}, 'items': items}})
        reply = daily.render(report)[1][0]
        self.assertIn(':memo: Commit 22 (+1 merge):', reply)
        self.assertIn('• <https://git.avada.net/avada/seo/-/commit/0|SEO> fix 0 &lt;b&gt;', reply)
        self.assertEqual(reply.count('|SEO>'), 10)
        self.assertIn('+12 commit nữa', reply)
        self.assertNotIn('Merge branch', reply)

    def test_transition_limit(self):
        report = self.collect()
        report['jira']['tuannv']['moved'] = [
            {'key': f'FAL-{i}', 'summary': f'Task {i}', 'from': 'To Do', 'to': 'Doing', 'at': f'2026-10-14T0{i % 10}'}
            for i in range(17)] + [
            {'key': 'FAL-0', 'summary': 'Task 0', 'from': 'Doing', 'to': 'Waiting To Test', 'at': '2026-10-14T23'}]
        reply = daily.render(report)[1][0]
        self.assertIn('Kéo 17 task', reply)
        self.assertEqual(reply.count('|FAL-'), 8)
        self.assertIn('_To Do→Doing→Waiting To Test_', reply)
        self.assertIn('+9 task nữa', reply)


if __name__ == '__main__':
    unittest.main()
