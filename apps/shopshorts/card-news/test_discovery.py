import base64
import datetime as dt
import unittest
from unittest.mock import Mock, patch
import discovery as d

NOW = dt.datetime(2026, 10, 16, 12, tzinfo=dt.timezone.utc)
REPO = 'owner/tool'


def meta(**changes):
    return dict(dict(full_name=REPO, html_url=f'https://github.com/{REPO}', stargazers_count=100,
        created_at='2026-10-13T00:00:00Z', description='Personal AI agent',
        license={'spdx_id': 'MIT'}), **changes)


def api_for(data, history=None):
    def api(method, path):
        assert method == 'GET'
        if '/readme' in path:
            body = {'encoding': 'base64', 'size': 25, 'content': base64.b64encode(b'How to use an AI agent.').decode()}
        elif '/history?' in path:
            body = history if history is not None else [{'week': int(NOW.timestamp())-86400, 'total': 10, 'days': [1,2,3,4,0,0,0]}]
        elif path.startswith('search/'):
            body = {'items': [data]}
        else: body = data
        return Mock(status_code=200, json=lambda: body)
    return api


class DiscoveryTests(unittest.TestCase):
    def test_plugin_uses_weekly_interest_not_total_or_install_rank(self):
        rows, error = d.plugin(api_for(meta()), REPO, NOW)
        self.assertIsNone(error)
        self.assertEqual(rows[0]['score'], 10)
        self.assertEqual(rows[0]['popularity']['count'], 10)
        self.assertIn('not installs', rows[0]['popularity']['boundary'])
        self.assertIn('출시일 아님', rows[0]['date_basis'])

    def test_invalid_and_stale_history_fails_without_total_star_fallback(self):
        for history in [[], [{'week': 1, 'total': 10, 'days': [1,2,3,4,0,0,0]}],
                        [{'week': int(NOW.timestamp()), 'total': 100, 'days': [0]*7}]]:
            with self.subTest(history=history):
                rows, error = d.plugin(api_for(meta(), history), REPO, NOW)
                self.assertEqual(rows, [])
                self.assertIsNotNone(error)

    def test_new_repository_requires_license_and_actual_creation_window(self):
        items, failures, skipped = d.newcomers(api_for(meta()), NOW)
        self.assertEqual(len(items), 1)
        self.assertIn('정식 출시일 미확인', items[0]['date_basis'])
        self.assertEqual(failures+skipped, [])
        items, failures, skipped = d.newcomers(api_for(meta(license=None)), NOW)
        self.assertEqual(items, [])
        self.assertEqual(skipped[0]['reason'], 'license_not_verified')
        items, failures, skipped = d.newcomers(api_for(meta(created_at='2025-10-13T00:00:00Z')), NOW)
        self.assertEqual(items, [])
        self.assertEqual(skipped[0]['reason'], 'outside_new_repository_window')

    def test_private_wrong_identity_and_paths_refused(self):
        for data in [meta(private=True), meta(html_url='https://attacker.invalid'), meta(full_name='wrong/repo')]:
            with self.subTest(data=data):
                self.assertIsNotNone(d.plugin(api_for(data), REPO, NOW)[1])
        with self.assertRaises(ValueError): d.repo_name('../secret/path')

    def test_lane_diversity_and_quiet_lane_not_filled_with_patch_notes(self):
        rows = [dict(content_kind=kind, score=n, url=f'https://github.com/u/{kind}{n}')
                for kind,n in [('PLUGIN', 1), ('PLUGIN', 10), ('NEW OSS', 5)]]
        chosen = d.select(rows)
        self.assertEqual([x['content_kind'] for x in chosen], ['PLUGIN', 'NEW OSS'])
        self.assertEqual(chosen[0]['score'], 10)

    def test_official_guide_requires_real_publication_and_publisher_url(self):
        entry = {'title': 'How to use Copilot agents', 'summary': 'Use skills and Playwright.',
            'link': 'https://github.blog/ai-and-ml/how-to-test/',
            'published_parsed': NOW.utctimetuple()}
        parsed = Mock(bozo=False, entries=[entry, dict(entry, link='https://evil.invalid/how-to'),
            dict(entry, published_parsed=None), dict(entry, title='Enterprise AI adoption')])
        with patch.object(d.feedparser, 'parse', return_value=parsed):
            items, failure = d.guides(NOW, fetcher=lambda *a,**k: Mock(content=b'feed'))
        self.assertIsNone(failure)
        self.assertEqual(len(items), 1)
        self.assertIn('기능 출시일 아님', items[0]['date_basis'])

    def test_all_failed_and_partial_failure_transparency(self):
        down = ([], {'source': 'plugin', 'reason': 'HTTP 503'})
        with patch.object(d, 'plugin', return_value=down), patch.object(d, 'guides', return_value=down), \
             patch.object(d, 'newcomers', return_value=([], [{'source':'new-oss-search','reason':'HTTP 403'}], [])):
            with self.assertRaisesRegex(RuntimeError, 'All discovery'):d.collect(None, NOW)
        with patch.object(d, 'plugin', return_value=down), patch.object(d, 'guides', return_value=([], None)), \
             patch.object(d, 'newcomers', return_value=([], [], [])):
            result = d.collect(None, NOW)
        self.assertEqual(result['items'], [])
        self.assertEqual(len(result['failures']), len(d.PLUGINS))
