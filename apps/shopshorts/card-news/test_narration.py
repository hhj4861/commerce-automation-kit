import copy
import json
import tempfile
from pathlib import Path
import unittest
from unittest.mock import Mock, patch
import narration as n


def fixture():
    url = 'https://github.com/u/tool'
    story = {'slides': [{'url': url, 'file':'stories/story_02.png', 'narration': '도구의 작동 방식입니다. 실제 예를 보여줍니다.'}]}
    edits = [{'url':url, 'headline':'어떻게 쓰나요?', 'summary':'작동 방식입니다.', 'use_case':'실제 예를 보여줍니다.', 'action':'계정이 필요합니다.'}]
    payload = n.script_payload(story, [{'url':url}], edits)
    check = {'pass':True, 'reason':'실제 설명을 포함합니다.', 'quote':'작동 방식입니다.', 'visual_quote':'작동 방식입니다.'}
    review = {'digest':n.digest(payload), 'reviewer':'codex-subscription-independent',
        'cards':[{'url':url, **{key:copy.deepcopy(check) for key in n.CRITERIA}}]}
    return story, edits, payload, review


class NarrationTests(unittest.TestCase):
    def test_independent_review_binds_every_criterion_and_exact_quotes(self):
        story, edits, payload, review = fixture()
        self.assertEqual(n.validate_review(review, payload), review)
        reviewer = Mock(return_value={'cards':review['cards']})
        result = n.review_script(story, [{'url':edits[0]['url']}], edits, reviewer)
        self.assertEqual(result['digest'], review['digest'])
        reviewer.assert_called_once()
        for key in n.CRITERIA:
            bad = copy.deepcopy(review); bad['cards'][0][key]['pass'] = False
            with self.subTest(key=key), self.assertRaises(ValueError): n.validate_review(bad, payload)
        for field in ['quote', 'visual_quote']:
            bad = copy.deepcopy(review); bad['cards'][0]['focus'][field] = '없는 인용'
            with self.assertRaises(ValueError):n.validate_review(bad, payload)

    def test_changed_script_and_missing_review_block_before_paid_cli(self):
        _, _, payload, review = fixture()
        payload['slides'][0]['narration'] += ' 바뀜'
        with self.assertRaisesRegex(ValueError, 'stale'):n.validate_review(review, payload)
        with self.assertRaises(ValueError):n.validate_review({}, payload)
        story, edits, _, _ = fixture()
        with tempfile.TemporaryDirectory() as temp, patch.object(n, 'tts_cli') as paid:
            folder = Path(temp)
            (folder/'news.json').write_text(json.dumps({'items':[{'url':edits[0]['url']}], 'edits':edits}))
            (folder/'stories.json').write_text(json.dumps(story))
            (folder/'script-review.json').write_text('{}')
            with self.assertRaises(ValueError):n.synthesize({'slides':[]}, folder, folder, folder)
            paid.assert_not_called()

    def test_tts_cli_receives_no_github_telegram_or_upload_credentials(self):
        with patch.dict(n.os.environ, {'GITHUB_TOKEN':'secret','TELEGRAM_BOT_TOKEN':'secret',
                'UPLOAD_POST_API_KEY':'secret','CARD_NEWS_CODEX_HOME':'secret','ELEVENLABS_API_KEY':'voice'}), \
             patch.object(n.subprocess,'run', return_value=Mock(returncode=0,stdout='{}')) as run:
            n.tts_cli(Path('.'), 'policy', '--text', '안녕')
        env = run.call_args.kwargs['env']
        self.assertEqual(env['ELEVENLABS_API_KEY'],'voice')
        self.assertFalse({'GITHUB_TOKEN','TELEGRAM_BOT_TOKEN','UPLOAD_POST_API_KEY','CARD_NEWS_CODEX_HOME'} & env.keys())

    def test_actual_character_timing_preserves_text_for_shared_svg_escaping(self):
        text = '안녕하세요. {\\pos(1,2)} 반갑습니다.'
        alignment = {'characters':list(text), 'character_start_times_seconds':[i/10 for i in range(len(text))],
            'character_end_times_seconds':[(i+1)/10 for i in range(len(text))]}
        cues = n.subtitle_cues(alignment, 5)
        self.assertEqual(cues[0][0], 5)
        self.assertAlmostEqual(cues[-1][1], 5+len(text)/10)
        self.assertEqual(''.join(x[2] for x in cues).replace(' ', ''), text.replace(' ', ''))
        self.assertEqual(n.ass_time(61.23), '0:01:01.23')
        for broken in [dict(alignment, characters=[]), dict(alignment, character_start_times_seconds=[-1]*len(text)),
                       dict(alignment, character_start_times_seconds=[float('nan')]*len(text))]:
            with self.assertRaises(ValueError):n.subtitle_cues(broken)
