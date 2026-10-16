#!/usr/bin/env python3
"""Trusted card-news artifact -> MP4 -> Instagram via the shorts-publish CLI.

No new editorial calls, credential copies, or automatic re-POST after an uncertain
upload. Ledger tags are independent from Telegram. Defaults to render only.
"""
from __future__ import annotations
import argparse
import datetime as dt
import hashlib
import io
import json
import os
from pathlib import Path
import re
import subprocess
import sys
import time
import uuid
from urllib.parse import urlsplit
import zipfile

import requests
from PIL import Image

REPOSITORY = 'hhj4861/commerce-automation-kit'
ROOT = Path(__file__).resolve().parents[3]
KST = dt.timezone(dt.timedelta(hours=9))


def write_json(path, value):
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2), encoding='utf-8')


def github(method, path, **kwargs):
    try:
        result = requests.request(method, f'https://api.github.com/repos/{REPOSITORY}/{path}',
            headers={'Authorization': 'Bearer ' + os.environ['GITHUB_TOKEN'],
                     'Accept': 'application/vnd.github+json'}, timeout=60, **kwargs)
    except requests.RequestException:
        raise RuntimeError('GitHub transport failed') from None
    return result


def require_ok(response):
    if not response.ok:
        raise RuntimeError(f'GitHub HTTP {response.status_code}')
    return response.json()


def fetch_source(run_id, folder):
    if not re.fullmatch(r'[1-9][0-9]*', str(run_id)):
        raise ValueError('A numeric source run ID is required')
    run = require_ok(github('GET', f'actions/runs/{run_id}'))
    if (run.get('head_branch') != 'main' or run.get('conclusion') != 'success'
            or run.get('event') not in ('schedule', 'workflow_dispatch')
            or run.get('head_repository', {}).get('full_name') != REPOSITORY
            or run.get('path') != '.github/workflows/ai-card-news.yml'):
        raise ValueError('Source must be a successful card-news run on this repository main')
    artifacts = require_ok(github('GET', f'actions/runs/{run_id}/artifacts?per_page=100'))['artifacts']
    candidates = [a for a in artifacts if not a['expired'] and
                  re.fullmatch(rf'ai-card-news-{run_id}-[0-9]+', a['name'])]
    if not candidates:
        raise ValueError('Source card-news artifact missing or expired')
    artifact = max(candidates, key=lambda a: int(a['name'].rsplit('-', 1)[1]))
    archive = github('GET', f'actions/artifacts/{artifact["id"]}/zip')
    if not archive.ok:
        raise RuntimeError(f'Artifact download HTTP {archive.status_code}')
    if folder.exists() and any(folder.iterdir()):
        raise ValueError('Source output must be empty; never reuse stale card artifacts')
    folder.mkdir(parents=True, exist_ok=True)
    # Never extract arbitrary ZIP entries, symlinks, credentials or delivery message IDs.
    with zipfile.ZipFile(io.BytesIO(archive.content)) as z:
        for member in z.infolist():
            if member.filename not in ('status.json', 'news.json', 'stories.json', 'script-review.json') and not re.fullmatch(r'stories/story_[0-9]{2}(?:_step_[123])?\.png', member.filename):
                continue
            if member.file_size > 12_000_000:
                raise ValueError('Oversized source artifact entry')
            target = folder / member.filename
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_bytes(z.read(member))
    return run['head_sha']


def prepare(folder, out):
    # A same-date skipped Telegram run has no status file; it must not republish yesterday's data.
    if not (folder / 'status.json').is_file():
        return None
    status = json.loads((folder / 'status.json').read_text())
    if not isinstance(status, dict):
        raise ValueError('Invalid source status')
    if status.get('status') not in ('delivered', 'shadow', 'dry_run'):
        return None
    date = status.get('date', '')
    if not re.fullmatch(r'\d{4}-\d{2}-\d{2}', date):
        raise ValueError('Invalid source date')
    dt.date.fromisoformat(date)
    news = json.loads((folder / 'news.json').read_text())
    stories = json.loads((folder / 'stories.json').read_text())
    if stories.get('status') != 'rendered' or stories.get('size') != [1080, 1920]:
        raise ValueError('Validated 9:16 slides are required')
    if news.get('provider') != 'codex-subscription' or not news.get('items') or not news.get('edits'):
        raise ValueError('Verified news and editorial are required')
    slides = stories.get('slides', [])
    if not 3 <= len(slides) <= 7:
        raise ValueError('Expected cover, 1-5 news cards and ending')
    sources = {x['url']: x for x in news['items']}
    edits = {x['url']: x for x in news['edits']}
    plan = []
    discovery = any(x.get('content_kind') for x in news['items'])
    caption = [f'오늘 발견한 AI 도구와 활용법 | {date}' if discovery else f'오늘의 AI 기술 브리핑 | {date}', '']
    seen = set()
    for i, slide in enumerate(slides):
        name = slide.get('file', '')
        if name != f'stories/story_{i+1:02d}.png':
            raise ValueError('Invalid or unordered slide path')
        image = folder / name
        if image.is_symlink() or not image.resolve().is_relative_to(folder.resolve()):
            raise ValueError('Slide escapes source folder')
        with Image.open(image) as im:
            if im.size != (1080, 1920) or im.format != 'PNG':
                raise ValueError('Invalid slide dimensions or encoding')
        if slide.get('image_sha256') and hashlib.sha256(image.read_bytes()).hexdigest() != slide['image_sha256']:
            raise ValueError('Card artwork does not match the reviewed source')
        seconds = 3.0
        if i not in (0, len(slides)-1):
            url = slide.get('url')
            if url not in sources or url not in edits or url in seen:
                raise ValueError('Slide source does not match verified news')
            seen.add(url)
            edit = edits[url]
            # Count all visible explanation, including the "why" field absent from narration.
            text = ' '.join(edit[k] for k in (('headline', 'summary', 'use_case', 'action') if discovery else ('headline', 'summary', 'why')))
            seconds = max(8.0, len(text) / 6.0)
            if seconds > (60 if discovery else 32):
                raise ValueError('Card too dense: revise content rather than accelerate or cut text')
            caption.extend([f'{i}. {edit["headline"]}', url, ''])
            if discovery:
                caption.extend([sources[url]['evidence_label'], sources[url]['date_basis'], ''])
                metric = sources[url].get('popularity')
                if metric:
                    caption.extend([f"관심 지표 조회: {metric['observed_at']}",
                        '집계: GitHub의 진행 중 주간 신규 별 (KST 오늘·최근 7일 집계와 다름)',
                        '비교 후보: ' + ', '.join(metric['scope']), '저장소 관심 지표이며 설치 수가 아닙니다.', ''])
        row = {'file': str(image.resolve()), 'seconds': round(seconds, 2)}
        if slide.get('stages'):
            if len(slide['stages']) != 3:
                raise ValueError('Expected three example stages')
            row['stages'] = []
            for j,stage in enumerate(slide['stages']):
                name = f'stories/story_{i+1:02d}_step_{j+1}.png'
                path = folder/name
                if (stage.get('file') != name or path.is_symlink() or not path.resolve().is_relative_to(folder.resolve())
                        or hashlib.sha256(path.read_bytes()).hexdigest() != stage.get('image_sha256')):
                    raise ValueError('Example artwork source mismatch')
                with Image.open(path) as im:
                    if im.size != (1080,1920) or im.format != 'PNG':
                        raise ValueError('Invalid example artwork')
                row['stages'].append({'file':str(path.resolve()),'start':round(j*seconds/3,3)})
        plan.append(row)
    caption.extend(['공식 문서·저장소를 바탕으로 소개했습니다. 활용 예시는 제안이며 실사용 결과가 아닙니다.' if discovery
                    else '공식 발표를 AI로 요약했습니다. 적용 전 원문과 호환성을 확인하세요.',
                    '#AI플러그인 #AI에이전트 #오픈소스' if discovery else '#AI뉴스 #개발자 #인공지능 #개발도구'])
    caption = '\n'.join(caption)
    if len(caption) > 2200 or sum(x['seconds'] for x in plan) > 180:
        raise ValueError('Reel caption or duration exceeds the supported limit')
    value = {'date': date, 'source_status': status['status'], 'slides': plan,
             'content_mode': 'discovery' if discovery else 'releases',
             'seconds': round(sum(x['seconds'] for x in plan), 2), 'caption': caption}
    write_json(out / 'reel-plan.json', value)
    (out / 'caption.txt').write_text(caption, encoding='utf-8')
    return value


def render(plan, out):
    def quoted(value):
        return "'" + value.replace("'", "'\\''") + "'"
    lines = ['ffconcat version 1.0']
    for slide in plan['slides']:
        frames = slide.get('stages') or [{'file':slide['file'],'start':0}]
        for i,frame in enumerate(frames):
            end = frames[i+1]['start'] if i+1<len(frames) else slide['seconds']
            duration = end-frame['start']
            if duration <= 0:raise ValueError('Example stage timing invalid')
            lines.extend([f"file {quoted(frame['file'])}",f"duration {duration}"])
    last = (plan['slides'][-1].get('stages') or [plan['slides'][-1]])[-1]['file']
    lines.append(f"file {quoted(last)}")
    listing = out / 'slides.ffconcat'
    listing.write_text('\n'.join(lines) + '\n')
    target = out / 'reel.mp4'
    audio = ['-i', plan['audio_file']] if plan.get('narrated') else ['-f', 'lavfi', '-i', 'anullsrc=r=48000:cl=stereo']
    video_filter = 'fps=30,format=yuv420p'
    complex_filter = None
    if plan.get('narrated'):
        # Shared studio SVG artwork preserves the exact bundled font, rounded background and size.
        cues = json.loads(Path(plan['captions_file']).read_text())
        parts = [f'[0:v]{video_filter}[v0]']
        for i,cue in enumerate(cues):
            name = Path(cue['file']).name
            if not re.fullmatch(r'caption-[0-9]{3}\.png', name):
                raise ValueError('Invalid caption artwork path')
            parts.append(f"movie=filename='{name}'[c{i}]")
            parts.append(f"[v{i}][c{i}]overlay=x=(W-w)/2:y=H*0.80-h/2:enable='gte(t,{cue['start']})*lt(t,{cue['end']})'[v{i+1}]")
        complex_filter = ['-filter_complex_threads', '1', '-filter_complex', ';'.join(parts), '-map', f'[v{len(cues)}]', '-map', '1:a']
    command = ['ffmpeg', '-hide_banner', '-loglevel', 'error', '-y', '-f', 'concat', '-safe', '0',
        '-i', str(listing), *audio,
        '-t', str(plan['seconds']), *(complex_filter or ['-vf', video_filter]), '-c:v', 'libx264',
        '-preset', 'fast', '-crf', '21', '-c:a', 'aac', '-b:a', '128k',
        '-movflags', '+faststart', '-threads', '2', str(target)]
    result = subprocess.run(command, cwd=out, capture_output=True, timeout=600)
    if result.returncode:
        raise RuntimeError('FFmpeg render failed')
    probe = subprocess.run(['ffprobe', '-v', 'error', '-select_streams', 'v:0',
        '-show_entries', 'stream=width,height:format=duration', '-of', 'json', str(target)],
        capture_output=True, text=True, timeout=30, check=True)
    info = json.loads(probe.stdout)
    if (info['streams'][0]['width'], info['streams'][0]['height']) != (1080, 1920) or abs(float(info['format']['duration']) - plan['seconds']) > .2:
        raise RuntimeError('Rendered video failed dimensions/duration verification')
    return target


def cli(*args):
    # Give the upload atom only its own credentials; no GitHub/Telegram/Codex tokens.
    allowed = ('PATH', 'HOME', 'LANG', 'TMPDIR', 'TMP', 'TEMP', 'SYSTEMROOT', 'SSL_CERT_FILE',
               'UPLOAD_POST_API_KEY', 'UPLOAD_POST_USER')
    env = {k: os.environ[k] for k in allowed if k in os.environ}
    result = subprocess.run(['npm', 'run', '--silent', 'cli', '-w', '@cak/shorts-publish', '--', *args],
        cwd=ROOT, env=env, capture_output=True, text=True, timeout=150)
    if result.returncode:
        raise RuntimeError('Upload-Post CLI failed; inspect connection/quota, no automatic re-upload')
    try:
        data = json.loads(result.stdout)
    except ValueError:
        raise RuntimeError('Upload-Post returned invalid data') from None
    if not data.get('ok'):
        raise RuntimeError('Upload-Post request failed')
    return data['body']


def destination(profiles, user, account_id):
    candidates = [profiles['profile']] if isinstance(profiles.get('profile'), dict) else profiles.get('profiles', [])
    for profile in candidates:
        if profile.get('username') == user:
            account = profile.get('social_accounts', {}).get('instagram')
            if not isinstance(account, dict) or account.get('reauth_required'):
                raise ValueError('Instagram connection missing or requires reconnection')
            if str(account.get('username', '')) != account_id:
                raise ValueError('Instagram account ID changed; refusing wrong-account publication')
            return account.get('handle') or account_id
    raise ValueError('Upload-Post profile not found')


def public_url(body):
    results = body.get('results', [])
    if isinstance(results, dict):
        results = [dict(value, platform=key) for key, value in results.items() if isinstance(value, dict)]
    for item in results:
        if item.get('platform') != 'instagram':
            continue
        if item.get('skipped') or item.get('success') is False:
            raise RuntimeError('Instagram publication failed or was skipped')
        url = item.get('post_url') or item.get('url')
        if item.get('success') is True and isinstance(url, str):
            parsed = urlsplit(url)
            if (parsed.scheme == 'https' and parsed.hostname in ('instagram.com', 'www.instagram.com')
                    and re.fullmatch(r'/(reel|p)/[A-Za-z0-9_-]+/?', parsed.path)
                    and not parsed.username and not parsed.password and not parsed.query and not parsed.fragment):
                return url
    if body.get('status') in ('completed', 'failed'):
        raise RuntimeError('Instagram did not confirm a public post URL')
    return None


def poll(request_id, attempts=90):
    for attempt in range(attempts):
        body = cli('poll', '--request-id', request_id)
        url = public_url(body)
        if url:
            return url
        if attempt + 1 < attempts:
            time.sleep(10)
    raise RuntimeError('Publication still pending; keep claim and poll again, do not re-upload')


def ledger(kind, key, create=False):
    path = f'git/ref/tags/ai-reel-{kind}/{key}'
    if create:
        require_ok(github('POST', 'git/refs', json={'ref': f'refs/tags/ai-reel-{kind}/{key}',
                                                    'sha': os.environ['GITHUB_SHA']}))
        return True
    result = github('GET', path)
    if result.status_code == 404:
        return False
    require_ok(result)
    return True


def publish(plan, video, out):
    if plan.get('content_mode') == 'discovery' and not plan.get('narrated'):
        raise ValueError('Discovery publishing requires reviewed narration and synchronized subtitles')
    if os.getenv('GITHUB_REF') != 'refs/heads/main' or plan['source_status'] != 'delivered':
        raise ValueError('Public publishing requires main and a confirmed Telegram delivery')
    user = os.getenv('CARD_NEWS_UPLOAD_POST_USER') or os.getenv('UPLOAD_POST_USER', '')
    account = os.getenv('CARD_NEWS_INSTAGRAM_ACCOUNT_ID', '')
    if not user or not account or not os.getenv('UPLOAD_POST_API_KEY'):
        raise ValueError('Upload-Post credentials and pinned Instagram account ID are required')
    handle = destination(cli('profiles', '--user', user), user, account)
    key = plan['date'] + '-' + hashlib.sha256(account.encode()).hexdigest()[:12]
    request_id = str(uuid.uuid5(uuid.NAMESPACE_URL, f'{REPOSITORY}/instagram/{key}'))
    sent = ledger('sent', key)
    if not sent and not ledger('claimed', key):
        ledger('claimed', key, create=True)
        # One POST only. Any exception leaves the durable claim; recovery polls the known ID.
        body = cli('upload', '--user', user, '--video', str(video), '--title', plan['caption'], '--platforms', 'instagram',
                   '--request-id', request_id, '--idempotency-key', request_id)
        url = public_url(body)
    else:
        url = None
    url = url or poll(request_id)
    value = {'status': 'already_published' if sent else 'published', 'date': plan['date'],
             'handle': handle, 'request_id': request_id, 'url': url}
    write_json(out / 'reels-status.json', value)
    if not sent:
        ledger('sent', key, create=True)
    print(f'Instagram {value["status"]}: {url}')
    return value


def notify(out):
    status_path = out / 'reels-status.json'
    value = json.loads(status_path.read_text()) if status_path.is_file() else {}
    if value.get('status') in ('skipped', 'already_published'):
        return
    if os.getenv('JOB_STATUS') == 'success' and value.get('status') == 'published':
        text = 'AI 카드뉴스 릴스 게시 완료\n' + value['url']
    else:
        text = ('AI 카드뉴스 릴스 처리 실패. 업로드 claim은 지우지 말고 실행 기록을 확인하세요.\n'
                f'https://github.com/{REPOSITORY}/actions/runs/' + os.getenv('GITHUB_RUN_ID', ''))
    try:
        response = requests.post('https://api.telegram.org/bot' + os.environ['TELEGRAM_BOT_TOKEN'] + '/sendMessage',
            data={'chat_id': os.environ['TELEGRAM_CHAT_ID'], 'text': text}, timeout=30)
        if not response.ok or not response.json().get('ok'):
            raise RuntimeError('Reels notification was not confirmed')
    except requests.RequestException:
        raise RuntimeError('Reels notification transport failed') from None


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--source-run')
    parser.add_argument('--source-dir', type=Path)
    parser.add_argument('--out', type=Path, required=True)
    parser.add_argument('--execute', action='store_true')
    parser.add_argument('--narrate', action='store_true', help='Reviewed Korean TTS and synchronized subtitles; paid provider usage')
    parser.add_argument('--notify', action='store_true')
    args = parser.parse_args()
    args.out = args.out.resolve()
    args.out.mkdir(parents=True, exist_ok=True)
    if args.notify:
        notify(args.out)
        return
    if bool(args.source_run) == bool(args.source_dir):
        raise ValueError('Provide one source run or source directory')
    source = args.source_dir.resolve() if args.source_dir else args.out / 'source'
    source_sha = None
    if args.source_run:
        source_sha = fetch_source(args.source_run, source)
    plan = prepare(source, args.out)
    if plan is None:
        write_json(args.out / 'reels-status.json', {'status': 'skipped', 'reason': 'no_new_verified_cards'})
        print('No new verified cards; no Reel published')
        return
    if args.source_run:
        plan.update(source_run=str(args.source_run), source_sha=source_sha)
        write_json(args.out / 'reel-plan.json', plan)
    if args.narrate:
        from narration import synthesize
        synthesize(plan, source, args.out, ROOT)
        write_json(args.out/'reel-plan.json', plan)
    video = render(plan, args.out)
    if args.execute:
        publish(plan, video, args.out)
    else:
        write_json(args.out / 'reels-status.json', {'status': 'rendered', 'date': plan['date'],
                                                  'seconds': plan['seconds'], 'narrated': bool(plan.get('narrated'))})
        print(f'Rendered {plan["seconds"]}s, 1080x1920; no upload')


if __name__ == '__main__':
    try:
        main()
    except Exception as exc:
        # Never expose provider payloads or exception URLs containing credentials.
        message = str(exc) if isinstance(exc, (ValueError, RuntimeError)) else type(exc).__name__
        for name in ('GITHUB_TOKEN', 'UPLOAD_POST_API_KEY', 'TELEGRAM_BOT_TOKEN'):
            secret = os.getenv(name)
            if secret:
                message = message.replace(secret, '<REDACTED>')
        print('::error::' + message)
        sys.exit(1)
