import datetime as dt
import json
import os
import shutil
import subprocess
from pathlib import Path
import tempfile
import unittest
from unittest.mock import Mock, patch

from PIL import Image
import reels


class ReelsTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.root = Path(self.tmp.name)
        self.source = self.root / 'source'
        self.source.mkdir()
        self.out = self.root / 'render'
        self.out.mkdir()
        (self.source / 'stories').mkdir()
        url = 'https://github.com/openai/codex/releases/tag/v1'
        (self.source / 'status.json').write_text(json.dumps({'status': 'delivered', 'date': '2026-10-16'}))
        (self.source / 'news.json').write_text(json.dumps({'provider': 'codex-subscription',
            'items': [{'url': url}], 'edits': [{'url': url, 'headline': '코덱스 새 업데이트',
                'summary': '검증된 변경 사항을 소개합니다.', 'why': '적용하기 전 호환성을 확인하세요.'}]}))
        self.stories = {'status': 'rendered', 'size': [1080, 1920], 'slides': []}
        for i in range(1, 4):
            name = f'stories/story_{i:02d}.png'
            Image.new('RGB', (1080, 1920), '#18243a').save(self.source / name)
            self.stories['slides'].append({'file': name, 'narration': '검증된 설명',
                                          **({'url': url} if i == 2 else {})})
        self.save_stories()

    def save_stories(self):
        (self.source / 'stories.json').write_text(json.dumps(self.stories))

    @unittest.skipUnless(shutil.which('ffmpeg') and shutil.which('ffprobe'), 'FFmpeg required')
    def test_real_png_and_caption_renders_have_native_compatible_color_metadata(self):
        audio = self.root/'voice.wav'
        subprocess.run(['ffmpeg','-v','error','-f','lavfi','-i','anullsrc=r=48000:cl=stereo',
            '-t','0.4',str(audio)],check=True,capture_output=True)
        for narrated in (False, True):
            with self.subTest(narrated=narrated):
                out = self.root/str(narrated);out.mkdir()
                plan = {'slides':[{'file':str(self.source/'stories/story_01.png'),'seconds':0.4}], 'seconds':0.4}
                if narrated:
                    caption = out/'caption-000.png'
                    Image.new('RGBA',(240,100),(255,255,255,128)).save(caption)
                    cues = out/'caption-cues.json'
                    cues.write_text(json.dumps([{'file':str(caption),'start':0,'end':0.4}]))
                    plan.update(narrated=True,audio_file=str(audio),captions_file=str(cues))
                video = reels.render(plan,out)  # Real encoder and its post-render compatibility gate.
                subprocess.run(['ffmpeg','-v','error','-i',str(video),'-f','null','-'],
                    check=True,capture_output=True,timeout=30)

    def test_plan_preserves_full_why_and_sources(self):
        plan = reels.prepare(self.source, self.out)
        self.assertGreaterEqual(plan['slides'][1]['seconds'], 8)
        self.assertIn('https://github.com/openai/codex/releases/tag/v1', plan['caption'])
        self.assertIn('#AI뉴스', plan['caption'])
        self.assertEqual(plan['source_status'], 'delivered')

    def test_absent_or_no_news_is_skip(self):
        (self.source / 'status.json').unlink()
        self.assertIsNone(reels.prepare(self.source, self.out))
        (self.source / 'status.json').write_text('{"status":"no_news"}')
        self.assertIsNone(reels.prepare(self.source, self.out))

    def test_failed_stories_or_wrong_size_refused(self):
        for key, value in [('status', 'failed'), ('size', [1920, 1080])]:
            with self.subTest(key=key):
                original = self.stories[key]
                self.stories[key] = value
                self.save_stories()
                with self.assertRaises(ValueError):reels.prepare(self.source, self.out)
                self.stories[key] = original

    def test_path_traversal_or_unverified_source_refused(self):
        for field, value in [('file', '../outside.png'), ('url', 'https://attacker.invalid')]:
            with self.subTest(field=field):
                original = self.stories['slides'][1][field]
                self.stories['slides'][1][field] = value
                self.save_stories()
                with self.assertRaises(ValueError):reels.prepare(self.source, self.out)
                self.stories['slides'][1][field] = original

    def test_dense_card_is_not_sped_up(self):
        path = self.source / 'news.json'
        news = json.loads(path.read_text())
        news['edits'][0]['why'] = '가' * 250
        path.write_text(json.dumps(news))
        with self.assertRaisesRegex(ValueError, 'too dense'):
            reels.prepare(self.source, self.out)

    def test_destination_pin_and_reconnect_guard(self):
        data = {'profiles': [{'username': 'u', 'social_accounts': {'instagram':
            {'username': '123', 'handle': 'test_account'}}}]}
        self.assertEqual(reels.destination(data, 'u', '123'), 'test_account')
        self.assertEqual(reels.destination({'profile': data['profiles'][0]}, 'u', '123'), 'test_account')
        with self.assertRaises(ValueError):reels.destination(data, 'u', 'wrong')
        with self.assertRaises(ValueError):reels.destination({'profile': data['profiles'][0]}, 'other', '123')
        missing_id = {'profile': {'username': 'u', 'social_accounts': {'instagram': {'handle': 'test_account'}}}}
        with self.assertRaises(ValueError):reels.destination(missing_id, 'u', '123')
        data['profiles'][0]['social_accounts']['instagram']['reauth_required'] = True
        with self.assertRaises(ValueError):reels.destination(data, 'u', '123')

    def test_publication_only_success_with_public_instagram_url(self):
        url = 'https://www.instagram.com/reel/abc_123/'
        for results in [[{'platform': 'instagram', 'success': True, 'post_url': url}],
                        {'instagram': {'success': True, 'url': url}}]:
            self.assertEqual(reels.public_url({'results': results}), url)
        for result in [{'success': True, 'url': 'https://attacker.invalid/reel/a/'},
                       {'success': False}, {'success': False, 'skipped': True},
                       {'success': True, 'url': url + '?access_token=secret'}]:
            with self.subTest(result=result), self.assertRaises(RuntimeError):
                reels.public_url({'status': 'completed', 'results': {'instagram': result}})
        self.assertIsNone(reels.public_url({'status': 'processing', 'results': []}))

    def test_discovery_publication_cannot_silently_fall_back_to_mute(self):
        with patch.object(reels, 'cli') as api, self.assertRaisesRegex(ValueError, 'reviewed narration'):
            reels.publish({'content_mode':'discovery'}, self.out/'reel.mp4', self.out)
        api.assert_not_called()

    def test_claimed_retry_polls_without_upload(self):
        plan = reels.prepare(self.source, self.out)
        env = {'GITHUB_REF': 'refs/heads/main', 'UPLOAD_POST_USER': 'u', 'UPLOAD_POST_API_KEY': 'fixture',
               'CARD_NEWS_INSTAGRAM_ACCOUNT_ID': '123'}
        with patch.dict(os.environ, env), patch.object(reels, 'destination', return_value='test'), \
             patch.object(reels, 'cli', return_value={}) as cli, \
             patch.object(reels, 'ledger', side_effect=[False, True, True]) as ledger, \
             patch.object(reels, 'poll', return_value='https://www.instagram.com/reel/existing/'):
            result = reels.publish(plan, self.out/'reel.mp4', self.out)
        self.assertEqual(result['status'], 'published')
        self.assertEqual(cli.call_args_list[0].args, ('profiles', '--user', 'u'))
        self.assertEqual(cli.call_count, 1)
        self.assertEqual(ledger.call_args_list[-1].args[0], 'sent')

    def test_first_publish_claims_before_post_and_marks_after_confirmation(self):
        plan = reels.prepare(self.source, self.out)
        order = []
        def ledger(kind, key, create=False):
            order.append((kind, create))
            return create
        def cli(*args):
            order.append((args[0], False))
            return {'results': {'instagram': {'success': True, 'url': 'https://instagram.com/reel/new/'}}}
        env = {'GITHUB_REF': 'refs/heads/main', 'UPLOAD_POST_USER': 'u', 'UPLOAD_POST_API_KEY': 'fixture',
               'CARD_NEWS_INSTAGRAM_ACCOUNT_ID': '123'}
        with patch.dict(os.environ, env), patch.object(reels, 'destination', return_value='test'), \
             patch.object(reels, 'ledger', side_effect=ledger), patch.object(reels, 'cli', side_effect=cli):
            reels.publish(plan, self.out/'reel.mp4', self.out)
        self.assertLess(order.index(('claimed', True)), order.index(('upload', False)))
        self.assertLess(order.index(('upload', False)), order.index(('sent', True)))

    def test_unconfirmed_post_keeps_claim_and_never_marks_sent(self):
        plan = reels.prepare(self.source, self.out)
        env = {'GITHUB_REF': 'refs/heads/main', 'UPLOAD_POST_USER': 'u', 'UPLOAD_POST_API_KEY': 'fixture',
               'CARD_NEWS_INSTAGRAM_ACCOUNT_ID': '123'}
        with patch.dict(os.environ, env), patch.object(reels, 'destination', return_value='test'), \
             patch.object(reels, 'cli', side_effect=[{}, RuntimeError('transport uncertain')]), \
             patch.object(reels, 'ledger', side_effect=[False, False, True]) as ledger:
            with self.assertRaisesRegex(RuntimeError, 'uncertain'):
                reels.publish(plan, self.out/'reel.mp4', self.out)
        self.assertNotIn('sent', [c.args[0] for c in ledger.call_args_list if c.kwargs.get('create')])

    def test_shadow_or_feature_branch_cannot_publish(self):
        plan = reels.prepare(self.source, self.out)
        with patch.dict(os.environ, {'GITHUB_REF': 'refs/heads/feature'}), self.assertRaises(ValueError):
            reels.publish(plan, self.out/'reel.mp4', self.out)
        plan['source_status'] = 'shadow'
        with patch.dict(os.environ, {'GITHUB_REF': 'refs/heads/main'}), self.assertRaises(ValueError):
            reels.publish(plan, self.out/'reel.mp4', self.out)

    def test_source_run_must_be_trusted_successful_main_digest(self):
        run = {'head_branch': 'main', 'conclusion': 'success', 'event': 'pull_request',
               'head_repository': {'full_name': reels.REPOSITORY}, 'path': '.github/workflows/ai-card-news.yml'}
        response = Mock(ok=True);response.json.return_value = run
        with patch.object(reels, 'github', return_value=response), self.assertRaises(ValueError):
            reels.fetch_source('42', self.source)

    def test_cli_never_inherits_github_or_telegram_credentials(self):
        with patch.dict(os.environ, {'GITHUB_TOKEN': 'private', 'TELEGRAM_BOT_TOKEN': 'private'}), \
             patch.object(reels.subprocess, 'run', return_value=Mock(returncode=0, stdout='{"ok":true,"body":{}}')) as run:
            reels.cli('profiles')
        self.assertNotIn('GITHUB_TOKEN', run.call_args.kwargs['env'])
        self.assertNotIn('TELEGRAM_BOT_TOKEN', run.call_args.kwargs['env'])


if __name__ == '__main__':
    unittest.main()
