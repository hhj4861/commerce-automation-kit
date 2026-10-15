import datetime as dt
import ast
import json
import os
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch, Mock
from PIL import Image, ImageDraw
import main as bot
import alert

TODAY = bot.NOW.date()
LIVE = {'OPENAI_API_KEY': 'test', 'TELEGRAM_BOT_TOKEN': 'sensitive-token', 'TELEGRAM_CHAT_ID': 'test',
        'GITHUB_TOKEN': 'test', 'GITHUB_REPOSITORY': 'test/test', 'GITHUB_SHA': 'test',
        'GITHUB_REF': 'refs/heads/main', 'CARD_NEWS_CUTOVER_DATE': TODAY.isoformat()}
SHADOW = {k: v for k, v in LIVE.items() if k != 'CARD_NEWS_CUTOVER_DATE'}


def item(**kw):
    return dict(dict(title='Codex release', body='Verified changes', source='Codex', category='CODEX',
        published=bot.NOW.isoformat(), age_hours=2, score=100,
        url='https://github.com/openai/codex/releases/tag/v1'), **kw)


def edit():
    return dict(index=0, url=item()['url'], headline='한국어 카드뉴스 렌더링 검증',
        summary='개발 도구의 변경 사항을 확인하고 적용 가능성을 검토합니다.',
        changed='원문에 명시된 변경점만 소개하고 확인되지 않은 기능은 제외합니다.',
        why='기존 프로젝트의 호환성을 점검한 뒤 도입 여부를 판단할 수 있습니다.',
        use_case='팀의 샘플 프로젝트에서 변경된 동작을 비교해 보는 방안을 제안합니다.',
        action='원문을 읽고 별도 환경에서 호환성을 검증해 보세요.', importance='높음')


def fetched(items=None, failures=None):
    return {'items': [item()] if items is None else items, 'failures': failures or [], 'checked': 11}


def maximal_edit():
    e = edit()
    for key, limit in bot.FIELDS.items():
        e[key] = ('가나다라마바사 아자차카타파하 '*10)[:limit]
    return e


class OutputDir(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.out = Path(self.tmp.name)
        patcher = patch.object(bot, 'OUT', self.out)
        patcher.start()
        self.addCleanup(patcher.stop)
        self.addCleanup(self.tmp.cleanup)

    def status(self):
        return json.loads((self.out/'status.json').read_text())


class SourceTests(unittest.TestCase):
    def test_recent_and_dedup(self):
        rows = [item(age_hours=40, score=1000), item(title='new', url='https://github.com/openai/codex/releases/tag/v2')]
        self.assertEqual(bot.select_news(rows), [rows[1]])
        self.assertEqual(len(bot.select_news([item(), item(title='different')])), 1)

    def test_release_dates_and_stable_only(self):
        valid = dict(published_at=(bot.NOW-dt.timedelta(hours=1)).isoformat(), body='Changes',
                     html_url=item()['url'], name='v1', tag_name='v1')
        releases = [valid, dict(valid, published_at=(bot.NOW+dt.timedelta(hours=1)).isoformat()),
                    dict(valid, published_at=(bot.NOW-dt.timedelta(hours=73)).isoformat()),
                    dict(valid, prerelease=True), dict(valid, draft=True), dict(valid, body='')]
        with patch.object(bot, 'github', return_value=Mock(status_code=200, json=lambda: releases)):
            items, failure = bot.fetch_source(bot.SOURCES[0])
        self.assertEqual(len(items), 1)
        self.assertIsNone(failure)

    def test_source_failure_is_reported_not_dropped(self):
        with patch.object(bot, 'github', return_value=Mock(status_code=403)):
            self.assertEqual(bot.fetch_source(bot.SOURCES[0]), ([], {'source': 'Claude Code', 'reason': 'HTTP 403'}))
        with patch.object(bot, 'github', side_effect=bot.requests.ConnectionError('https://secret.example')):
            items, failure = bot.fetch_source(bot.SOURCES[0])
        self.assertEqual(failure['reason'], 'ConnectionError')

    def test_all_sources_failed_is_an_error(self):
        down = ([], {'source': 'x', 'reason': 'HTTP 503'})
        with patch.object(bot, 'fetch_source', return_value=down), patch.object(bot, 'fetch_blog', return_value=down):
            with self.assertRaisesRegex(RuntimeError, 'All 11 sources failed'):
                bot.fetch()

    def test_partial_failures_are_returned(self):
        def source(s):
            return ([item()], None) if s is bot.SOURCES[1] else ([], {'source': s[0], 'reason': 'HTTP 500'})
        with patch.object(bot, 'fetch_source', side_effect=source), patch.object(bot, 'fetch_blog', return_value=([], None)):
            result = bot.fetch()
        self.assertEqual((len(result['items']), len(result['failures']), result['checked']), (1, 9, 11))

    def test_blog_excludes_marketing(self):
        self.assertFalse(bot.technical_blog('The next chapter is agentic', 'New analysis shows enterprise adoption'))
        self.assertFalse(bot.technical_blog('Amp puts AI agents to work', 'See how Amp uses models'))
        self.assertTrue(bot.technical_blog('Introducing Codex SDK', 'New API features for developers'))


class EditorialTests(unittest.TestCase):
    def test_editorial_mapping_and_limits(self):
        bot.validate_edits([edit()], [item()])
        for changes in [dict(url='https://wrong.example'), dict(index=1), dict(summary='x'*120), dict(importance='critical')]:
            with self.assertRaises(ValueError): bot.validate_edits([dict(edit(), **changes)], [item()])

    @patch.dict(os.environ, {'OPENAI_API_KEY':'test', 'GOOGLE_AI_API_KEY':'test'})
    def test_existing_provider_fallback_is_recorded(self):
        limited = Mock(status_code=429, json=lambda: {'error': {'code':'insufficient_quota'}})
        success = Mock(status_code=200, json=lambda: {'candidates':[{'content':{'parts':[{'text':json.dumps({'cards':[edit()]})}]}}]})
        with patch.object(bot.session, 'post', side_effect=[limited, success]) as post:
            self.assertEqual(bot.editorial([item()]), ([edit()], 'gemini-fallback'))
            self.assertEqual(post.call_count, 2)
            self.assertNotIn('key=', post.call_args.args[0])
        with patch.object(bot.session, 'post', side_effect=[limited, Mock(status_code=403)]):
            with self.assertRaisesRegex(RuntimeError, 'Gemini fallback HTTP 403'):
                bot.editorial([item()])

    @patch.dict(os.environ, {'OPENAI_API_KEY':'test', 'GOOGLE_AI_API_KEY':'test'})
    def test_fallback_on_any_5xx_even_with_html_body(self):
        success = Mock(status_code=200, json=lambda: {'candidates':[{'content':{'parts':[{'text':json.dumps([edit()])}]}}]})
        for status in (502, 504):
            html_error = Mock(status_code=status, json=Mock(side_effect=ValueError('Expecting value')))
            with patch.object(bot.session, 'post', side_effect=[html_error, success]):
                self.assertEqual(bot.editorial([item()]), ([edit()], 'gemini-fallback'))
        with patch.object(bot.session, 'post', return_value=Mock(status_code=400, json=lambda: {'error': {'code': 'bad_request'}})):
            with self.assertRaisesRegex(RuntimeError, 'OpenAI HTTP 400 code=bad_request'):
                bot.editorial([item()])

    @patch.dict(os.environ, {'OPENAI_API_KEY':'sk-secret\n'})
    def test_transport_and_header_errors_hide_details_and_do_not_retry(self):
        for error in (ValueError("Invalid header value b'Bearer sk-secret\\n'"), bot.requests.ConnectionError('https://api.openai.com sk-secret')):
            with patch.object(bot.session, 'post', side_effect=error) as post:
                with self.assertRaises(RuntimeError) as raised:
                    bot.editorial([item()])
            self.assertEqual(post.call_count, 1)
            self.assertNotIn('sk-secret', str(raised.exception))

    @patch.dict(os.environ, {'GOOGLE_AI_API_KEY':'test'}, clear=True)
    def test_forced_gemini_skips_openai(self):
        success = Mock(status_code=200, json=lambda: {'candidates':[{'content':{'parts':[{'text':json.dumps([edit()])}]}}]})
        with patch.object(bot.session, 'post', return_value=success) as post:
            self.assertEqual(bot.editorial([item()], 'gemini'), ([edit()], 'gemini'))
        self.assertEqual(post.call_count, 1)
        self.assertIn('generativelanguage.googleapis.com', post.call_args.args[0])

    def test_model_envelopes_and_product_only_headline(self):
        for envelope in ([edit()], {'cards':[edit()]}):
            self.assertEqual(bot.parse_cards(json.dumps(envelope)), [edit()])
        card = dict(edit(), headline='Codex v1.0')
        self.assertEqual(bot.validate_edits([card], [item()])[0]['headline'], 'Codex v1.0 업데이트')
        with self.assertRaises(ValueError): bot.validate_edits([None], [item()])

    def test_editorial_retry_is_bounded(self):
        with patch.object(bot, 'editorial_once', side_effect=[ValueError('length'), ([edit()], 'openai')]) as call:
            self.assertEqual(bot.editorial([item()]), ([edit()], 'openai'))
            self.assertEqual(call.call_count, 2)
        with patch.object(bot, 'editorial_once', side_effect=ValueError('length')) as call:
            with self.assertRaises(ValueError): bot.editorial([item()])
            self.assertEqual(call.call_count, 2)


class RenderTests(OutputDir):
    def test_wrap_long_tokens(self):
        d = ImageDraw.Draw(Image.new('RGB', (1080, 1350)))
        f = bot.font(35)
        lines = bot.wrap(d, '긴문자열'+'A'*200+'\n두 번째 줄', f, 400, 100)
        self.assertTrue(all(d.textlength(line, font=f) <= 400 for line in lines))
        self.assertGreater(len(lines), 2)

    def test_render_maximum_content(self):
        paths = bot.render([item()]*7, [maximal_edit()]*7)
        self.assertEqual(len(paths), 10)
        for p in paths:
            with Image.open(p) as im: self.assertEqual(im.size, (1080, 1350))

    def test_story_slides_keep_platform_safe_zones(self):
        items = [item(source=f'S{i}', url=f'https://github.com/x/y/releases/tag/v{i}') for i in range(7)]
        paths = bot.render_stories(items, [maximal_edit()]*7)
        self.assertEqual(len(paths), 7)  # cover + top 5 + closing
        background = Image.new('RGB', (1, 1), bot.BG).getpixel((0, 0))
        for p in paths:
            with Image.open(p) as im:
                self.assertEqual(im.size, bot.STORY_SIZE)
                rgb = im.convert('RGB')
                panel = Image.new('RGB', (1, 1), bot.STORY_PANEL).getpixel((0, 0))
                # Only background and the panel edge may appear above STORY_TOP and below STORY_BOTTOM.
                for box in ((0, 0, 1080, bot.STORY_TOP), (0, bot.STORY_BOTTOM, 1080, 1920)):
                    self.assertLessEqual({color for _, color in rgb.crop(box).getcolors()}, {background, panel})
                self.assertEqual(rgb.crop((0, 0, 1080, bot.STORY_TOP-45)).getcolors(), [(1080*(bot.STORY_TOP-45), background)])
        manifest = json.loads((self.out/'stories.json').read_text())
        self.assertEqual(len(manifest['slides']), 7)
        self.assertTrue(all(slide['narration'] for slide in manifest['slides']))
        self.assertEqual(manifest['slides'][1]['url'], items[0]['url'])

    def test_story_failure_never_fails_the_briefing(self):
        with patch.object(bot, 'render_stories', side_effect=ValueError('Text cannot fit card')):
            bot.write_stories([item()], [edit()])
        self.assertEqual(json.loads((self.out/'stories.json').read_text()), {'status': 'failed', 'reason': 'Text cannot fit card'})


class ModeTests(unittest.TestCase):
    def mode(self, **env):
        with patch.dict(os.environ, env, clear=True):
            return bot.run_mode()

    def test_modes(self):
        self.assertEqual(self.mode(DRY_RUN='1', CARD_NEWS_CUTOVER_DATE=TODAY.isoformat())[0], 'dry_run')
        self.assertEqual(self.mode(), ('shadow', None))
        self.assertEqual(self.mode(CARD_NEWS_CUTOVER_DATE=(TODAY+dt.timedelta(days=1)).isoformat())[0], 'shadow')
        self.assertEqual(self.mode(CARD_NEWS_CUTOVER_DATE=TODAY.isoformat())[0], 'live')
        self.assertEqual(self.mode(CARD_NEWS_CUTOVER_DATE=(TODAY-dt.timedelta(days=3)).isoformat())[0], 'live')
        for bad in ('2026/10/20', '20261020', '2026-13-01'):
            with self.assertRaisesRegex(ValueError, 'YYYY-MM-DD'):
                self.mode(CARD_NEWS_CUTOVER_DATE=bad)

    @patch.dict(os.environ, {}, clear=True)
    def test_missing_config_names_only(self):
        with self.assertRaisesRegex(ValueError, 'Missing required configuration: OPENAI_API_KEY, TELEGRAM_BOT_TOKEN'):
            bot.main()
        with patch.dict(os.environ, {'DRY_RUN': '1'}):
            with self.assertRaisesRegex(ValueError, 'Missing required configuration: OPENAI_API_KEY$'):
                bot.main()

    @patch.dict(os.environ, LIVE, clear=True)
    def test_forced_provider_is_verification_only(self):
        with patch.dict(os.environ, {'FORCE_PROVIDER': 'gemini'}):
            with self.assertRaisesRegex(ValueError, 'only for dry-run or shadow'):
                bot.main()
        with patch.dict(os.environ, {'FORCE_PROVIDER': 'claude'}):
            with self.assertRaisesRegex(ValueError, 'auto or gemini'):
                bot.main()


class LegacyLedgerTests(unittest.TestCase):
    def ledger(self, *codes, repo=None):
        repo = repo or Mock(status_code=200, json=lambda: {'full_name': bot.LEGACY_REPOSITORY})
        with patch.object(bot, 'github', side_effect=[repo] + [Mock(status_code=c) for c in codes]) as github:
            result = bot.legacy_status()
        self.assertTrue(all(bot.LEGACY_REPOSITORY in c.args[1] for c in github.call_args_list))
        return result

    def test_states(self):
        self.assertEqual(self.ledger(404, 404), 'none')
        self.assertEqual(self.ledger(200, 404), 'sent')
        self.assertEqual(self.ledger(200, 200), 'sent')
        with self.assertRaisesRegex(RuntimeError, 'claimed but unconfirmed'):
            self.ledger(404, 200)
        for code in (401, 403, 500):
            with self.assertRaisesRegex(RuntimeError, f'HTTP {code}; not sending'):
                self.ledger(code)
        with patch.object(bot, 'LEGACY_REPOSITORY', 'off'), patch.object(bot, 'github') as github:
            self.assertEqual(bot.legacy_status(), 'disabled')
            github.assert_not_called()

    def test_unreadable_repository_is_not_treated_as_no_delivery(self):
        for repo in (Mock(status_code=404, json=lambda: {}), Mock(status_code=200, json=lambda: {'full_name': 'someone/else'}),
                     Mock(status_code=200, json=Mock(side_effect=ValueError('html')))):
            with self.assertRaisesRegex(RuntimeError, 'unreadable'):
                self.ledger(404, 404, repo=repo)

    def test_empty_variable_keeps_default_repository(self):
        with patch.dict(os.environ, {'CARD_NEWS_LEGACY_REPOSITORY': ''}):
            self.assertEqual(os.getenv('CARD_NEWS_LEGACY_REPOSITORY', '').strip() or 'hhj4861/wp-auto-blog', 'hhj4861/wp-auto-blog')
        self.assertEqual(bot.LEGACY_REPOSITORY, 'hhj4861/wp-auto-blog')


@patch.dict(os.environ, LIVE, clear=True)
class LiveTests(OutputDir):
    def test_duplicate_and_uncertain_stop(self):
        with patch.object(bot, 'delivery_exists', return_value=True), patch.object(bot, 'fetch') as fetch:
            bot.main(); fetch.assert_not_called()
        with patch.object(bot, 'delivery_exists', side_effect=[False, True]), patch.object(bot, 'fetch') as fetch:
            with self.assertRaises(RuntimeError): bot.main()
            fetch.assert_not_called()

    def test_live_requires_main(self):
        with patch.dict(os.environ, {'GITHUB_REF': 'refs/heads/feat/common-video-generator'}), \
                patch.object(bot, 'delivery_exists') as ledger:
            with self.assertRaisesRegex(RuntimeError, 'only from refs/heads/main'): bot.main()
            ledger.assert_not_called()

    def test_skips_when_legacy_already_delivered(self):
        with patch.object(bot, 'delivery_exists', return_value=False), patch.object(bot, 'legacy_status', return_value='sent'), \
                patch.object(bot, 'fetch') as fetch:
            bot.main()
        fetch.assert_not_called()
        self.assertEqual(self.status()['status'], 'legacy_delivered')

    def test_rechecks_legacy_immediately_before_claim(self):
        with patch.object(bot, 'delivery_exists', return_value=False), \
                patch.object(bot, 'legacy_status', side_effect=['none', 'sent']), \
                patch.object(bot, 'fetch', return_value=fetched()), patch.object(bot, 'editorial', return_value=([edit()], 'openai')), \
                patch.object(bot, 'render', return_value=[]), patch.object(bot, 'send_telegram') as send, \
                patch.object(bot, 'mark_delivery') as mark:
            bot.main()
        send.assert_not_called(); mark.assert_not_called()
        self.assertEqual(self.status()['status'], 'legacy_delivered')

    def test_delivery_records_provider_then_renders_stories(self):
        receipt = {'date': 'd', 'message_ids': [1, 2, 3], 'cards': 3, 'status': 'delivered'}
        order = []
        with patch.object(bot, 'delivery_exists', return_value=False), patch.object(bot, 'legacy_status', return_value='none'), \
                patch.object(bot, 'fetch', return_value=fetched()), patch.object(bot, 'editorial', return_value=([edit()], 'gemini-fallback')), \
                patch.object(bot, 'render', return_value=['a', 'b', 'c']), \
                patch.object(bot, 'send_telegram', side_effect=lambda *a: order.append('send') or dict(receipt)), \
                patch.object(bot, 'write_stories', side_effect=lambda *a: order.append('stories')):
            bot.main()
        self.assertEqual(order, ['send', 'stories'])
        self.assertEqual(json.loads((self.out/'delivery.json').read_text())['provider'], 'gemini-fallback')
        self.assertEqual(self.status()['status'], 'delivered')

    def test_album_and_uncertain_delivery(self):
        paths = [self.out/f'{i}.jpg' for i in range(4)]
        for p in paths: p.write_bytes(b'image')
        response = Mock(status_code=200, json=lambda: {'ok': True, 'result': [{'message_id':i} for i in range(4)]})
        with patch.object(bot, 'mark_delivery') as mark, patch.object(bot.session, 'post', return_value=response) as post:
            bot.send_telegram(paths, [item()], [edit()])
            self.assertEqual(post.call_count, 1)
            self.assertIn(item()['url'], json.loads(post.call_args.kwargs['data']['media'])[2]['caption'])
            self.assertEqual([c.args[0] for c in mark.call_args_list], ['claimed', 'sent'])
        with patch.object(bot, 'mark_delivery') as mark, patch.object(bot.session, 'post', side_effect=bot.requests.Timeout('sensitive')):
            with self.assertRaisesRegex(RuntimeError, 'uncertain'): bot.send_telegram(paths, [item()], [edit()])
            mark.assert_called_once_with('claimed')

    def test_claim_conflict(self):
        with patch.object(bot, 'github', return_value=Mock(status_code=422)):
            with self.assertRaises(RuntimeError): bot.mark_delivery('claimed')


@patch.dict(os.environ, SHADOW, clear=True)
class ShadowTests(OutputDir):
    def test_shadow_never_claims_or_sends(self):
        with patch.object(bot, 'legacy_status', return_value='none') as legacy, \
                patch.object(bot, 'telegram_access_check', return_value='private'), \
                patch.object(bot, 'fetch', return_value=fetched()), patch.object(bot, 'editorial', return_value=([edit()], 'openai')), \
                patch.object(bot, 'render', return_value=['a', 'b', 'c']), patch.object(bot, 'write_stories') as stories, \
                patch.object(bot, 'delivery_exists') as ledger, patch.object(bot, 'mark_delivery') as mark, \
                patch.object(bot, 'send_telegram') as send, patch.object(bot.session, 'post') as post:
            bot.main()
        for never in (ledger, mark, send, post):
            never.assert_not_called()
        legacy.assert_called_once(); stories.assert_called_once()
        self.assertEqual(self.status(), dict(self.status(), status='shadow', chat_type='private', provider='openai'))

    def test_no_news_does_not_fabricate(self):
        with patch.object(bot, 'legacy_status', return_value='none'), patch.object(bot, 'telegram_access_check'), \
                patch.object(bot, 'fetch', return_value=fetched([], [{'source': 'Ollama', 'reason': 'HTTP 502'}])), \
                patch.object(bot, 'editorial') as editorial:
            bot.main()
        editorial.assert_not_called()
        self.assertEqual(self.status()['status'], 'no_news')
        self.assertEqual(self.status()['failures'], [{'source': 'Ollama', 'reason': 'HTTP 502'}])

    def test_telegram_access_check_is_read_only(self):
        ok = Mock(status_code=200, headers={'content-type': 'application/json'},
                  json=lambda: {'ok': True, 'result': {'type': 'private'}})
        with patch.object(bot.session, 'get', return_value=ok) as get, patch.object(bot.session, 'post') as post:
            self.assertEqual(bot.telegram_access_check(), 'private')
        self.assertEqual([c.args[0].rsplit('/', 1)[1] for c in get.call_args_list], ['getMe', 'getChat'])
        post.assert_not_called()
        denied = Mock(status_code=401, headers={'content-type': 'application/json'}, json=lambda: {'ok': False})
        with patch.object(bot.session, 'get', return_value=denied):
            with self.assertRaises(RuntimeError) as error: bot.telegram_access_check()
        self.assertNotIn('sensitive-token', str(error.exception))

    def test_bot_never_consumes_updates(self):
        source = Path(bot.__file__).read_text()
        for method in ('getUpdates', 'setWebhook', 'deleteWebhook'):
            self.assertNotIn(method, source)


class AlertTests(unittest.TestCase):
    NOW = dt.datetime(2026, 10, 20, 7, 50, tzinfo=bot.KST)

    def send(self, env, now=None):
        with patch.dict(os.environ, env, clear=True), patch.object(alert.urllib.request, 'urlopen') as urlopen:
            urlopen.return_value.__enter__.return_value.status = 200
            code = alert.main(now or self.NOW)
        return code, urlopen

    def test_skipped_outside_live(self):
        for env in ({'DRY_RUN': '1', 'CARD_NEWS_CUTOVER_DATE': '2026-10-20'}, {}, {'CARD_NEWS_CUTOVER_DATE': '2026-10-21'}):
            code, urlopen = self.send(dict(env, TELEGRAM_BOT_TOKEN='sensitive-token', TELEGRAM_CHAT_ID='1'))
            self.assertEqual(code, 0); urlopen.assert_not_called()

    def test_live_alert_text_has_no_secrets_and_validated_link(self):
        env = {'CARD_NEWS_CUTOVER_DATE': '2026-10-20', 'TELEGRAM_BOT_TOKEN': 'sensitive-token', 'TELEGRAM_CHAT_ID': '1',
               'RUN_URL': 'https://github.com/hhj4861/commerce-automation-kit/actions/runs/1'}
        with tempfile.TemporaryDirectory() as tmp, patch.object(alert, 'OUT', Path(tmp)):
            code, urlopen = self.send(env)
            request = urlopen.call_args.args[0]
            text = alert.urllib.parse.parse_qs(request.data.decode())['text'][0]
            self.assertEqual(code, 0)
            self.assertTrue(request.full_url.endswith('/sendMessage'))
            self.assertIn(env['RUN_URL'], text); self.assertIn('보내지 못했습니다', text)
            self.assertNotIn('sensitive-token', text)
            (Path(tmp)/'delivery.json').write_text(json.dumps({'status': 'delivered', 'date': '2026-10-20'}))
            _, urlopen = self.send(dict(env, RUN_URL='javascript:alert(1)'))
            text = alert.urllib.parse.parse_qs(urlopen.call_args.args[0].data.decode())['text'][0]
            self.assertIn('앨범은 발송됐지만', text); self.assertNotIn('javascript', text)

    def test_bad_cutover_is_reported_as_configuration_error(self):
        env = {'CARD_NEWS_CUTOVER_DATE': '2026/10/20', 'TELEGRAM_BOT_TOKEN': 't', 'TELEGRAM_CHAT_ID': '1'}
        code, urlopen = self.send(env)
        text = alert.urllib.parse.parse_qs(urlopen.call_args.args[0].data.decode())['text'][0]
        self.assertEqual(code, 0); self.assertIn('설정 오류', text)

    def test_alert_runs_without_third_party_packages(self):
        tree = ast.parse(Path(alert.__file__).read_text())
        modules = {alias.name.split('.')[0] for node in ast.walk(tree) if isinstance(node, ast.Import) for alias in node.names}
        modules |= {node.module.split('.')[0] for node in ast.walk(tree) if isinstance(node, ast.ImportFrom) and node.module}
        self.assertLessEqual(modules, set(sys.stdlib_module_names) | {'__future__'})
        result = subprocess.run([sys.executable, '-S', alert.__file__], env={'DRY_RUN': '1'},
                                capture_output=True, text=True, timeout=30)
        self.assertEqual((result.returncode, result.stdout.strip()), (0, 'Failure alert skipped in dry_run mode'))


if __name__ == '__main__': unittest.main()
