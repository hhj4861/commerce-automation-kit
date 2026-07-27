#!/usr/bin/env node
/**
 * music-mix 조립 서비스 — @cak 원자들을 순서대로 호출해 롱폼 음악 믹스 채널 영상을 만든다.
 * 원자(packages)는 서로 모르고, 이 앱이 각 원자의 CLI 를 오케스트레이션한다(조합 독립성).
 *
 *   ai-music(트랙 N개 생성) → longform-mix(오디오 concat + 배경 + 챕터 + 썸네일) → youtube-upload(업로드)
 *
 * 사용: cd apps/music-mix && npm run compose
 * 산출물은 out/ (gitignore). 이미 있으면 건너뛴다(재개 + ElevenLabs 크레딧 절약).
 * 자격증명: kit/.env (ELEVENLABS_API_KEY, PEXELS_API_KEY, YOUTUBE_CLIENT_SECRET) 를 자동 로드.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync, mkdirSync, copyFileSync } from 'node:fs';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const KIT = resolve(HERE, '..', '..');
const OUT = join(HERE, 'out');
const TRACKS_DIR = join(OUT, 'tracks');
const BRIEFS_DIR = join(OUT, 'briefs');

function loadEnv() {
  const p = join(KIT, '.env');
  if (!existsSync(p)) return;
  for (const line of readFileSync(p, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}

/** 원자 CLI 실행 → stdout JSON 파싱. 로그(stderr)는 그대로 흘림. */
function cli(pkg, args) {
  const stdout = execFileSync('npm', ['--silent', 'run', 'cli', '-w', `@cak/${pkg}`, '--', ...args], {
    cwd: KIT,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'inherit'],
    maxBuffer: 1 << 27,
  });
  try {
    return JSON.parse(stdout);
  } catch {
    throw new Error(`${pkg} CLI 출력이 JSON 이 아님: ${stdout.slice(0, 200)}`);
  }
}
const step = (msg) => console.log(`\n▶ ${msg}`);
const ok = (msg) => console.log(`  ✓ ${msg}`);
const skip = (msg) => console.log(`  ↳ 건너뜀: ${msg}`);

function main() {
  loadEnv();
  const cfg = JSON.parse(readFileSync(join(HERE, 'mix.config.json'), 'utf8'));
  mkdirSync(TRACKS_DIR, { recursive: true });
  mkdirSync(BRIEFS_DIR, { recursive: true });

  // ── 1) 트랙 생성 (있으면 건너뜀) ─────────────────────────────
  step(`트랙 ${cfg.tracks.length}개 (ai-music, 없는 것만 생성)`);
  const missing = [];
  for (const t of cfg.tracks) {
    const trackPath = join(TRACKS_DIR, `${t.id}.mp3`);
    if (existsSync(trackPath)) {
      skip(`${t.id}.mp3 (이미 있음)`);
      continue;
    }
    const briefPath = join(BRIEFS_DIR, `${t.id}.json`);
    writeFileSync(briefPath, JSON.stringify({ ...t.brief, durationSec: t.brief.durationSec ?? cfg.durationSec }, null, 2));
    try {
      const r = cli('ai-music', ['generate', '--brief', briefPath, '--out', trackPath, '--backend', 'elevenlabs']);
      if (r.ok) ok(`${t.id}.mp3 생성`);
      else missing.push(t.id);
    } catch (e) {
      console.log(`  ✗ ${t.id} 생성 실패: ${String(e.message).split('\n')[0].slice(0, 120)}`);
      missing.push(t.id);
    }
  }
  const present = cfg.tracks.filter((t) => existsSync(join(TRACKS_DIR, `${t.id}.mp3`)));
  if (present.length < cfg.tracks.length) {
    console.log(`\n⚠️  트랙 ${cfg.tracks.length - present.length}개 없음(${missing.join(', ')}) — ElevenLabs 크레딧/키 확인 필요.`);
    console.log('   있는 트랙만 있어도 조립은 진행합니다(최소 3개 권장).');
  }
  if (present.length < 2) throw new Error('트랙이 2개 미만이라 조립 불가');

  // ── 2) tracks.json ──────────────────────────────────────────
  const tracksJson = join(OUT, 'tracks.json');
  writeFileSync(tracksJson, JSON.stringify(present.map((t) => ({ file: join(TRACKS_DIR, `${t.id}.mp3`), title: t.title })), null, 2));
  ok(`tracks.json (${present.length}곡)`);

  // ── 3) 챕터 ─────────────────────────────────────────────────
  step('유튜브 챕터');
  const chaptersTxt = join(OUT, 'chapters.txt');
  const ch = cli('longform-mix', ['chapters', '--tracks', tracksJson]);
  writeFileSync(chaptersTxt, ch.youtube);
  ok(`총 ${ch.total} / ${ch.count}곡`);

  // ── 4) 배경 (video/image 는 Pexels, 없으면 visualizer) ──────
  step(`배경: ${cfg.background?.kind ?? 'visualizer'}`);
  const bg = cfg.background ?? { kind: 'visualizer' };
  const assembleArgs = ['assemble', '--tracks', tracksJson, '--out', join(OUT, 'mix.mp4')];
  if (bg.kind === 'video' || bg.kind === 'image') {
    const ext = bg.kind === 'video' ? 'mp4' : 'jpg';
    const bgPath = join(OUT, `bg.${ext}`);
    if (existsSync(bgPath)) skip(`bg.${ext} (이미 있음)`);
    else {
      const fetchCmd = bg.kind === 'video' ? 'fetch-video' : 'fetch-image';
      const r = cli('longform-mix', [fetchCmd, '--query', bg.query, ...(bg.orientation ? ['--orientation', bg.orientation] : []), '--out', bgPath]);
      ok(`배경 다운로드 (${r.credit ?? 'Pexels'})`);
    }
    assembleArgs.push('--visual', bgPath, ...(bg.kind === 'video' ? ['--visual-kind', 'video'] : []));
  } else {
    assembleArgs.push('--visualizer', '--title', cfg.thumbnail?.title ?? 'MIX', ...(cfg.thumbnail?.subtitle ? ['--subtitle', cfg.thumbnail.subtitle] : []));
  }

  // ── 5) 영상 조립 ────────────────────────────────────────────
  step('영상 조립 (렌더, 수십 초~수 분)');
  const asm = cli('longform-mix', assembleArgs);
  ok(`mix.mp4 (${asm.mode}, ${asm.total})`);

  // ── 6) 썸네일 (Pexels 이미지 + 텍스트) ──────────────────────
  step('썸네일');
  const th = cfg.thumbnail ?? {};
  const thumbSrc = join(OUT, 'thumb-src.jpg');
  if (existsSync(thumbSrc)) skip('thumb-src.jpg (이미 있음)');
  else {
    const r = cli('longform-mix', ['fetch-image', '--query', th.query ?? 'music', ...(th.orientation ? ['--orientation', th.orientation] : []), ...(th.index != null ? ['--index', String(th.index)] : []), '--out', thumbSrc]);
    ok(`이미지 다운로드 (${r.credit ?? 'Pexels'})`);
  }
  const thumbArgs = ['thumbnail', '--image', thumbSrc, '--out', join(OUT, 'thumbnail.jpg'), '--title', th.title ?? 'MIX'];
  if (th.aesthetic) thumbArgs.push('--aesthetic');
  if (th.tag) thumbArgs.push('--tag', th.tag);
  if (th.subtitle) thumbArgs.push('--subtitle', th.subtitle);
  cli('longform-mix', thumbArgs);
  ok('thumbnail.jpg');

  // ── 7) 업로드 (config.upload=true 일 때만) ──────────────────
  if (cfg.upload) {
    step('YouTube 업로드');
    const descFile = join(OUT, 'description.txt');
    writeFileSync(descFile, cfg.description ?? '');
    const upArgs = [
      'upload', '--video', join(OUT, 'mix.mp4'), '--title', cfg.title,
      '--description-file', descFile, '--chapters-file', chaptersTxt,
      '--thumbnail', join(OUT, 'thumbnail.jpg'), '--privacy', cfg.privacy ?? 'private',
    ];
    if (cfg.tags?.length) upArgs.push('--tags', cfg.tags.join(','));
    if (cfg.hashtags?.length) upArgs.push('--hashtags', cfg.hashtags.join(','));
    if (cfg.category) upArgs.push('--category', String(cfg.category));
    const up = cli('youtube-upload', upArgs);
    ok(`업로드 완료: ${up.url ?? up.videoId}`);
  } else {
    console.log('\n(업로드는 config.upload=false — 스킵. out/mix.mp4 + thumbnail.jpg 확인 후 켜세요.)');
  }

  console.log(`\n✅ 완료 — ${OUT}\n   영상: mix.mp4 | 썸네일: thumbnail.jpg | 챕터: chapters.txt`);
  console.log(`   제목: ${cfg.title}`);
}

try {
  main();
} catch (e) {
  console.error(`\n✗ 실패: ${e.message}`);
  process.exit(1);
}
