import { spawn } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateScenes } from './lib/studio.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const GOOGLE = 'https://generativelanguage.googleapis.com/v1beta';
export const capabilities = env => ({ workerAt: new Date().toISOString(), scenario: !!env.GEMINI_API_KEY, image: !!env.GEMINI_API_KEY, video: !!env.GEMINI_API_KEY, voice: !!env.ELEVENLABS_API_KEY, shortsUpload: !!(env.UPLOAD_POST_API_KEY && env.UPLOAD_POST_USER), longUpload: !!env.YOUTUBE_CLIENT_SECRET });
export function command(bin, args, env, timeout = 600000) {
  return new Promise((resolveP, reject) => {
    const child = spawn(bin, args, { cwd: ROOT, env: { ...process.env, ...env }, stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '', err = '';
    const timer = setTimeout(() => { child.kill('SIGKILL'); reject(new Error(`${bin} 실행 시간이 초과되었습니다.`)); }, timeout);
    child.stdout.on('data', d => { out = (out + d).slice(-2000000); });
    child.stderr.on('data', d => { err = (err + d).slice(-2000); });
    child.on('error', e => { clearTimeout(timer); reject(e); });
    child.on('close', code => { clearTimeout(timer); if (code !== 0) reject(new Error(`${bin} 실행 실패(${code}): ${err.slice(-500)}`)); else resolveP(out); });
  });
}
async function cli(workspace, args, env) {
  const result = await command('npm', ['run', '--silent', 'cli', '-w', workspace, '--', ...args], env);
  try { return JSON.parse(result); } catch { throw new Error(`${workspace}: 결과를 읽을 수 없습니다.`); }
}
async function google(path, body, env, fetcher) {
  if (!env.GEMINI_API_KEY) throw new Error('제작 워커에 GEMINI_API_KEY를 설정하세요.');
  const response = await fetcher(`${GOOGLE}/${path}`, { method: body ? 'POST' : 'GET', headers: { 'x-goog-api-key': env.GEMINI_API_KEY, 'content-type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(180000) });
  if (!response.ok) throw new Error(`Google 생성 API 실패(${response.status}). 키·모델 사용 권한·잔액을 확인하세요.`);
  return response.json();
}
export async function generateScenario(brief, env, fetcher = fetch) {
  const prompt = `한국어 영상 시나리오를 JSON으로 작성하세요. 요청 데이터: ${JSON.stringify(brief)}\n기승전결과 구체적인 장면 묘사, 자연스러운 내레이션. 타인 콘텐츠 복제·가짜 사용후기·의학적 효능 단정 금지. 막장드라마는 가상의 성인 인물. 지식 콘텐츠는 검증 가능한 설명. 상품광고는 제공된 사실만 사용. 요청 길이에 맞게 각 장면은 4~8초, narration은 초당 한글 약 4글자. title과 scenes 배열만 반환. 각 scene: id(scene-1 형식), narration, prompt(독창적인 장면의 영문 시각 설명), duration(초), kind(image 기본). 총 길이 ${brief.duration}초. 최대 100장면.`;
  const result = await google(`models/${env.SHOPSHORTS_TEXT_MODEL || 'gemini-2.5-flash'}:generateContent`, { contents: [{ parts: [{ text: prompt }] }], generationConfig: { responseMimeType: 'application/json' } }, env, fetcher);
  const value = JSON.parse((result.candidates?.[0]?.content?.parts || []).filter(p => p.text).map(p => p.text).join(''));
  const scenes = validateScenes(value.scenes);
  const total = scenes.reduce((n, s) => n + s.duration, 0);
  if (total > (brief.format === 'short' ? 180 : 600) || Math.abs(total - brief.duration) > Math.max(8, brief.duration * .2)) throw new Error('생성된 시나리오 길이가 요청과 맞지 않습니다. 다시 생성하세요.');
  return { title: String(value.title || brief.topic).slice(0, 100), scenes };
}
async function lintProject(job, work, env, publication = false) {
  // Reuse the atom via its public CLI; chunking preserves the 12-beat contract for longform.
  for (let offset = 0; offset < job.scenes.length; offset += 12) {
    const brief = { id: job.id, productName: job.brief.topic, category: job.brief.category, appealPoints: [job.brief.direction || job.brief.topic], createdAt: job.createdAt, sponsored: job.brief.category === '상품광고' };
    const description = `${brief.sponsored ? '(광고)\n' : ''}${publication ? job.publication.description : ''}\nAI 생성 콘텐츠`;
    const script = { briefId: job.id, hookType: 'info-tip', title: publication ? job.publication.title : job.title, description, hashtags: [], beats: job.scenes.slice(offset, offset + 12).map((s, i) => ({ index: i, role: i === 0 ? 'hook' : 'body', durationSec: s.duration, narration: s.narration, caption: s.narration, visualPrompt: s.prompt })) };
    const path = join(work, 'lint.json');
    await writeFile(path, JSON.stringify({ brief, script }));
    const result = await cli('@cak/shopping-shorts', ['lint', '--job', path], env);
    if (result.ok !== true) throw new Error('대본 검증에 실패했습니다. 과장·효능·가짜 경험 표현을 수정하세요.');
  }
}
export function sceneFfmpegArgs(source, target, scene, edit, aspect, narration, actualDuration, sponsored) {
  const duration = edit.durations[scene.id];
  const [w, h] = aspect === '9:16' ? [1080, 1920] : [1920, 1080];
  const args = ['-y', '-hide_banner', '-loglevel', 'error', ...(scene.kind === 'image' ? ['-loop', '1'] : ['-stream_loop', '-1']), '-i', source];
  if (narration) args.push('-i', narration);
  else args.push('-f', 'lavfi', '-i', 'anullsrc=r=44100:cl=stereo');
  // Speech is never silently truncated: make the user lengthen a scene instead.
  if (narration && actualDuration > duration + .1) throw new Error(`장면 ${scene.id}: 목소리가 ${actualDuration.toFixed(1)}초입니다. 장면 길이를 늘려주세요.`);
  let vf = `scale=${w}:${h}:force_original_aspect_ratio=decrease,pad=${w}:${h}:(ow-iw)/2:(oh-ih)/2,setsar=1,fps=30`;
  if (sponsored) vf += ",drawtext=text='(광고)':fontsize=36:fontcolor=white:box=1:boxcolor=black@0.7:x=40:y=60";
  args.push('-map', '0:v:0', '-map', '1:a:0', '-vf', vf, '-af', 'apad', '-t', String(duration), '-c:v', 'libx264', '-preset', 'veryfast', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-ar', '44100', '-ac', '2', '-movflags', '+faststart', target);
  return args;
}
async function renderProject(job, work, env, io) {
  const segments = [];
  for (const id of job.edit.order) {
    const scene = job.scenes.find(s => s.id === id), source = join(work, `${id}.source`);
    await writeFile(source, await io.readAsset(job.assets[id].key));
    let vo = null, voDuration = 0;
    if (job.edit.voice !== 'none') {
      if (!env.ELEVENLABS_API_KEY) throw new Error('목소리 생성에는 ELEVENLABS_API_KEY가 필요합니다.');
      // Content-address cache survives retries while changed narration/voice always gets a new file.
      const hash = Buffer.from(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`${job.edit.voice}:${scene.narration}`))).toString('hex').slice(0, 24);
      vo = join(work, `${hash}.mp3`);
      if (!existsSync(vo)) await cli('@cak/tts-narration', ['generate', '--text', scene.narration, '--out', vo], { ...env, ELEVENLABS_VOICE_ID: job.edit.voice });
      voDuration = Number(await command('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=noprint_wrappers=1:nokey=1', vo], env));
      if (!Number.isFinite(voDuration)) throw new Error('음성 길이를 확인할 수 없습니다.');
    }
    const target = join(work, `${id}.mp4`);
    await command('ffmpeg', sceneFfmpegArgs(source, target, scene, job.edit, job.brief.aspect, vo, voDuration, job.brief.category === '상품광고'), env);
    segments.push(target);
  }
  const list = join(work, 'concat.txt'), joined = join(work, 'joined.mp4'), final = join(work, 'final.mp4');
  await writeFile(list, segments.map(s => `file '${s.replaceAll("'", "'\\''")}'`).join('\n'));
  await command('ffmpeg', ['-y', '-hide_banner', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', list, '-c', 'copy', '-movflags', '+faststart', joined], env);
  if (job.edit.music) {
    const music = join(work, 'bgm.source');
    await writeFile(music, await io.readAsset(job.assets[job.edit.music].key));
    await command('ffmpeg', ['-y', '-hide_banner', '-loglevel', 'error', '-i', joined, '-stream_loop', '-1', '-i', music, '-filter_complex', `[1:a]volume=${job.edit.musicVolume}[bg];[0:a][bg]amix=inputs=2:duration=first:normalize=0,alimiter=limit=0.95[a]`, '-map', '0:v', '-map', '[a]', '-c:v', 'copy', '-c:a', 'aac', '-movflags', '+faststart', final], env);
  } else await writeFile(final, await readFile(joined));
  const key = `studio/${job.id}/${job.task.id}-final.mp4`;
  await io.writeAsset(key, await readFile(final), 'video/mp4');
  return { render: { key, type: 'video/mp4', createdAt: new Date().toISOString(), duration: job.edit.order.reduce((n, id) => n + job.edit.durations[id], 0) } };
}
export async function executeStudioTask(job, env, io, checkpoint, { fetcher = fetch, runCli = cli } = {}) {
  const work = join(io.workDir, job.id);
  await mkdir(work, { recursive: true });
  const action = job.task.action;
  if (action === 'scenario') return generateScenario(job.brief, env, fetcher);
  await lintProject(job, work, env, action === 'publish');
  if (action === 'media') {
    const assets = { ...job.assets };
    for (const scene of job.scenes) {
      if (assets[scene.id]) continue;
      let data, type;
      if (scene.kind === 'image') {
        const result = await google(`models/${env.SHOPSHORTS_IMAGE_MODEL || 'gemini-2.5-flash-image'}:generateContent`, { contents: [{ parts: [{ text: `${scene.prompt}\nOriginal visual, no captions or logos. ${job.brief.aspect} composition.` }] }], generationConfig: { responseModalities: ['TEXT', 'IMAGE'], imageConfig: { aspectRatio: job.brief.aspect } } }, env, fetcher);
        const image = result.candidates?.[0]?.content?.parts?.find(p => p.inlineData?.mimeType?.startsWith('image/'))?.inlineData;
        if (!image) throw new Error(`${scene.id}: 이미지가 반환되지 않았습니다. 장면 설명을 수정하세요.`);
        type = image.mimeType; data = Buffer.from(image.data, 'base64');
      } else {
        // Persist the paid operation ID before polling, so a retry does not pay for the same clip again.
        const operationFile = join(work, `${scene.id}-${Buffer.from(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify([scene.prompt, job.brief.aspect, env.SHOPSHORTS_VIDEO_MODEL])))).toString('hex').slice(0, 20)}.operation.json`);
        let operation = existsSync(operationFile) ? JSON.parse(await readFile(operationFile, 'utf8')) : await google(`models/${env.SHOPSHORTS_VIDEO_MODEL || 'veo-3.1-generate-preview'}:predictLongRunning`, { instances: [{ prompt: `${scene.prompt}. No dialogue, no text overlays.` }], parameters: { aspectRatio: job.brief.aspect, durationSeconds: 8, resolution: '1080p' } }, env, fetcher);
        if (!/^models\/[a-zA-Z0-9._-]+\/operations\/[a-zA-Z0-9_-]+$/.test(operation.name || '') && !/^operations\/[a-zA-Z0-9_-]+$/.test(operation.name || '')) throw new Error('영상 생성 요청 ID를 확인할 수 없습니다.');
        await writeFile(operationFile, JSON.stringify(operation));
        const deadline = Date.now() + 20 * 60000;
        while (!operation.done && Date.now() < deadline) { await new Promise(r => setTimeout(r, 10000)); operation = await google(operation.name, null, env, fetcher); }
        if (!operation.done) throw new Error('영상 생성이 아직 진행 중입니다. 잠시 후 다시 요청하면 기존 요청을 확인합니다.');
        if (operation.error) throw new Error(`영상 생성 실패: ${operation.error.code || 'provider'}. 장면 설명을 변경해 다시 시도하세요.`);
        const uri = operation.response?.generateVideoResponse?.generatedSamples?.[0]?.video?.uri;
        const target = new URL(uri);
        if (target.protocol !== 'https:' || target.hostname !== 'generativelanguage.googleapis.com') throw new Error('영상 다운로드 주소를 확인할 수 없습니다.');
        const response = await fetcher(target, { headers: { 'x-goog-api-key': env.GEMINI_API_KEY }, signal: AbortSignal.timeout(180000) });
        if (!response.ok) throw new Error(`영상 다운로드 실패(${response.status})`);
        data = Buffer.from(await response.arrayBuffer()); type = 'video/mp4';
      }
      const key = `studio/${job.id}/${job.task.id}-${scene.id}.${scene.kind === 'video' ? 'mp4' : 'png'}`;
      await io.writeAsset(key, data, type);
      assets[scene.id] = { key, kind: scene.kind, type, source: 'ai', name: scene.id };
      await checkpoint({ assets });
    }
    return { assets };
  }
  if (action === 'render') return renderProject(job, work, env, io);
  if (action === 'publish') {
    const video = join(work, 'publish.mp4');
    await writeFile(video, await io.readAsset(job.render.key));
    const p = job.publication, description = `${job.brief.category === '상품광고' ? '(광고)\n' : ''}${p.description}\nAI 생성 콘텐츠`;
    if (job.brief.format === 'long') {
      if (!env.YOUTUBE_CLIENT_SECRET) throw new Error('YouTube 업로드 계정을 먼저 연결하세요.');
      await checkpoint({ upload: { state: 'submitting', platforms: p.platforms } });
      const result = await runCli('@cak/youtube-upload', ['upload', '--video', video, '--title', p.title, '--description', description, '--privacy', p.privacy, '--synthetic-media'], env);
      if (result.ok !== true) throw new Error('YouTube 업로드 결과를 확인하세요. 자동 재시도하지 않습니다.');
      const upload = { state: 'done', results: [{ platform: 'youtube', success: true, url: result.url || (result.videoId ? `https://www.youtube.com/watch?v=${result.videoId}` : null) }] };
      await checkpoint({ upload }); return { upload };
    }
    if (!env.UPLOAD_POST_API_KEY || !env.UPLOAD_POST_USER) throw new Error('Upload-Post 업로드 계정을 먼저 연결하세요.');
    await checkpoint({ upload: { state: 'submitting', platforms: p.platforms } });
    const receipt = await runCli('@cak/shorts-publish', ['upload', '--video', video, '--title', p.title, '--desc', description, '--platforms', p.platforms.join(','), '--yt-privacy', p.privacy], env);
    if (!receipt.ok || !receipt.requestId) throw new Error('업로드 접수 여부를 플랫폼에서 확인하세요. 자동 재시도하지 않습니다.');
    let upload = { state: 'submitted', requestId: receipt.requestId, platforms: p.platforms };
    await checkpoint({ upload });
    for (let attempt = 0; attempt < 60; attempt++) {
      await new Promise(r => setTimeout(r, 10000));
      const result = await runCli('@cak/shorts-publish', ['poll', '--request-id', receipt.requestId], env);
      if (['completed', 'failed', 'error'].includes(result.body?.status)) {
        const results = (result.body.results || []).map(r => ({ platform: r.platform, success: r.success === true, url: r.post_url || null, error: r.error_message || null }));
        upload = { ...upload, state: result.body.status === 'completed' && results.length === p.platforms.length && results.every(r => r.success) ? 'done' : 'failed', results };
        return { upload };
      }
    }
    return { upload: { ...upload, message: '접수 완료, 플랫폼 처리 중입니다. 요청 ID로 상태를 확인하세요.' } };
  }
  throw new Error('알 수 없는 제작 작업입니다.');
}
