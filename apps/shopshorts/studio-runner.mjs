import {captionStyle,captionExtras} from './public/caption-style.js';
import {musicClips, musicFilter} from './public/music-timeline.js';
import { spawn } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { generateHiggsfieldScene } from './studio-higgsfield.mjs';
import { generateNarration, narrationFile } from './studio-narration.mjs';
import { FPS, FONTS, normalizeEdit, frameCount, clipSpans } from './public/editor-model.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const GOOGLE = 'https://generativelanguage.googleapis.com/v1beta';
export const capabilities = env => ({ workerAt: new Date().toISOString(), scenario: false, image: env.SHOPSHORTS_MEDIA_PROVIDER === 'higgsfield' || !!env.GEMINI_API_KEY, video: env.SHOPSHORTS_MEDIA_PROVIDER === 'higgsfield' || !!env.GEMINI_API_KEY, mediaProvider: env.SHOPSHORTS_MEDIA_PROVIDER === 'higgsfield' ? 'higgsfield' : 'google', voice: !!env.ELEVENLABS_API_KEY, shortsUpload: !!(env.UPLOAD_POST_API_KEY && env.UPLOAD_POST_USER), longUpload: !!env.YOUTUBE_CLIENT_SECRET });
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
export async function googleMediaRequest(path, body, env, fetcher) {
  if (!env.GEMINI_API_KEY) throw new Error('미디어 생성 인증이 설정되지 않았습니다. 관리자에게 Google 이미지·영상 API 키 설정을 요청하세요.');
  const response = await fetcher(`${GOOGLE}/${path}`, { method: body ? 'POST' : 'GET', headers: { 'x-goog-api-key': env.GEMINI_API_KEY, 'content-type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(180000) });
  if (!response.ok) {
    if ([401,403].includes(response.status)) throw new Error(`미디어 생성 인증에 실패했습니다(${response.status}). 관리자에게 Google 이미지·영상 API 키와 사용 권한 확인을 요청하세요. AI 대본 계정을 다시 연결할 필요는 없습니다.`);
    if (response.status===429) throw new Error('이미지·영상 생성 한도에 도달했습니다. 서비스 사용 한도를 확인한 뒤 다시 시도하세요.');
    throw new Error(`Google 생성 API 실패(${response.status}). 모델 사용 권한과 서비스 상태를 확인하세요.`);
  }
  return response.json();
}
async function lintProject(job, work, env, publication = false) {
  // Reuse the atom via its public CLI; chunking preserves the 12-beat contract for longform.
  const contentScenes = [...job.scenes, ...(job.edit?.captions || []).map(c=>({narration:c.text,prompt:'Original caption overlay',duration:Math.max(1,(c.endFrame-c.startFrame)/FPS)}))];
  for (let offset = 0; offset < contentScenes.length; offset += 12) {
    const brief = { id: job.id, productName: job.brief.topic, category: job.brief.category, appealPoints: [job.brief.direction || job.brief.topic], createdAt: job.createdAt, sponsored: job.brief.category === '상품광고' };
    const description = `${brief.sponsored ? '(광고)\n' : ''}${publication ? job.publication.description : ''}\nAI 생성 콘텐츠`;
    const script = { briefId: job.id, hookType: 'info-tip', title: publication ? job.publication.title : job.title, description, hashtags: [], beats: contentScenes.slice(offset, offset + 12).map((s, i) => ({ index: i, role: i === 0 ? 'hook' : 'body', durationSec: s.duration, narration: s.narration, caption: s.narration, visualPrompt: s.prompt })) };
    const path = join(work, 'lint.json');
    await writeFile(path, JSON.stringify({ brief, script }));
    const result = await cli('@cak/shopping-shorts', ['lint', '--job', path], env);
    if (result.ok !== true) throw new Error('대본 검증에 실패했습니다. 과장·효능·가짜 경험 표현을 수정하세요.');
  }
}
export function sceneFfmpegArgs(source, target, scene, edit, aspect, narration, actualDuration, sponsored, clip = null, captions = []) {
  const duration = clip ? (clip.outFrame-clip.inFrame)/FPS : edit.durations[scene.id];
  const [w, h] = aspect === '9:16' ? [1080, 1920] : [1920, 1080];
  const args = ['-y', '-hide_banner', '-loglevel', 'error', ...(scene.kind === 'image' ? ['-loop', '1'] : ['-stream_loop', '-1']), '-i', source];
  if (narration) args.push('-i', narration);
  else args.push('-f', 'lavfi', '-i', 'anullsrc=r=44100:cl=stereo');
  // Legacy scenes require full speech; timeline clips deliberately trim speech with video.
  if (!clip && narration && actualDuration > duration + .1) throw new Error(`장면 ${scene.id}: 목소리가 ${actualDuration.toFixed(1)}초입니다. 장면 길이를 늘려주세요.`);
  let vf = `scale=${w}:${h}:force_original_aspect_ratio=decrease,pad=${w}:${h}:(ow-iw)/2:(oh-ih)/2,setsar=1,fps=30`;
  if (clip) vf += `,trim=start_frame=${clip.inFrame}:end_frame=${clip.outFrame},setpts=PTS-STARTPTS`;
  if (captions.length) vf += ',' + captions.join(',');
  if (sponsored) vf += ",drawtext=text='(광고)':fontsize=36:fontcolor=white:box=1:boxcolor=black@0.7:x=40:y=60";
  args.push('-map', '0:v:0', '-map', '1:a:0', '-vf', vf, '-af', clip ? `atrim=start=${clip.inFrame/FPS}:end=${clip.outFrame/FPS},asetpts=PTS-STARTPTS,apad` : 'apad', '-t', String(duration), '-c:v', 'libx264', '-preset', 'veryfast', ...(clip ? ['-bf','0'] : []), '-pix_fmt', 'yuv420p', '-c:a', clip ? 'pcm_s16le' : 'aac', '-ar', '44100', '-ac', '2', '-movflags', '+faststart', target);
  return args;
}
// Text is stored in a file with expansion disabled, never interpolated into filter code.
export function captionFilter(caption, textPath) {
  const font=FONTS.find(f=>f.id===caption.font);
  if(!font)throw new Error('지원하지 않는 자막 폰트입니다.');
  const escapePath=p=>p.replaceAll('\\','/').replaceAll(':','\\:').replaceAll("'", "'\\\\''");
  const fontPath=join(ROOT,'apps/shopshorts/public',font.file);
  captionExtras(caption);caption=captionStyle(caption);
  const x=caption.x===undefined?'(w-text_w)/2':`(w-text_w)*${caption.x/100}`;
  const y=caption.y===undefined?{top:'h*0.08',middle:'(h-text_h)/2',bottom:'h*0.92-text_h'}[caption.position]:`(h-text_h)*${caption.y/100}`;
  return `drawtext=fontfile='${escapePath(fontPath)}':textfile='${escapePath(textPath)}':expansion=none:fontsize=${caption.size}:fontcolor=${caption.color}:borderw=${caption.outlineWidth}:bordercolor=${caption.outlineColor}:box=${caption.background?1:0}:boxcolor=${caption.backgroundColor}@${caption.backgroundOpacity}:boxborderw=8:x=${x}:y=${y}:enable='gte(n,${caption.startFrame})*lt(n,${caption.endFrame})'`;
}
async function renderProject(job, work, env, io) {
  const segments = [];
  const timeline=normalizeEdit(job);
  let cursor=0,gapIndex=0;
  const gap=async frames=>{
    if(frames<=0)return;
    const source=join(work,'gap.png'),target=join(work,`gap-${gapIndex++}.mov`);
    if(gapIndex===1)await command('ffmpeg',['-y','-v','error','-f','lavfi','-i','color=black:s=160x90','-frames:v','1',source],env);
    await command('ffmpeg',sceneFfmpegArgs(source,target,{kind:'image'},timeline,job.brief.aspect,null,0,job.brief.category==='상품광고',{inFrame:0,outFrame:frames}),env);
    segments.push(target);
  };
  for (const {clip,start,end} of clipSpans(timeline).sort((a,b)=>a.start-b.start)) {
    await gap(start-cursor);cursor=end;
    const id=clip.sceneId;
    const scene = job.scenes.find(s => s.id === id), source = join(work, `${id}.source`);
    await writeFile(source, await io.readAsset(job.assets[id].key));
    let vo = null, voDuration = 0;
    if (job.edit.voice !== 'none') {
      const narration = await narrationFile(job, scene, work, env, io, { runCli: cli, command });
      vo = narration.file; voDuration = narration.duration;
    }
    const captionFilters=[];
    for(const [index,caption] of timeline.captions.filter(c=>c.clipId===clip.id).entries()) {
      const textPath=join(work,`${clip.id}-caption-${index}.txt`);
      await writeFile(textPath,caption.text);
      captionFilters.push(captionFilter(caption,textPath));
    }
    // PCM intermediates avoid AAC padding changing frame boundaries during concatenation.
    const target = join(work, `${"segment-"+segments.length}.${job.edit.version===2?'mov':'mp4'}`);
    await command('ffmpeg', sceneFfmpegArgs(source, target, scene, job.edit, job.brief.aspect, vo, voDuration, job.brief.category === '상품광고', job.edit.version===2?clip:null,captionFilters), env);
    segments.push(target);
  }
  await gap(frameCount(timeline)-cursor);
  const list = join(work, 'concat.txt'), joined = join(work, job.edit.version===2?'joined.mov':'joined.mp4'), final = join(work, 'final.mp4');
  await writeFile(list, segments.map(s => `file '${s.replaceAll("'", "'\\''")}'`).join('\n'));
  await command('ffmpeg', ['-y', '-hide_banner', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', list, '-c', 'copy', '-movflags', '+faststart', joined], env);
  const music=musicClips(timeline);
  if (music.length) {
    const inputs=[];
    for(const [i,c] of music.entries()) {
      const source=join(work,`bgm-${i}.source`);
      await writeFile(source,await io.readAsset(job.assets[c.assetId].key));
      inputs.push('-stream_loop','-1','-i',source);
    }
    await command('ffmpeg',['-y','-hide_banner','-loglevel','error','-i',joined,...inputs,'-filter_complex',musicFilter(music),'-map','0:v','-map','[a]','-c:v','copy','-c:a','aac','-t',String(frameCount(timeline)/FPS),'-movflags','+faststart',final],env);
  } else if(job.edit.version===2) await command('ffmpeg', ['-y','-hide_banner','-loglevel','error','-i',joined,'-c:v','copy','-c:a','aac','-movflags','+faststart',final],env);
  else await writeFile(final, await readFile(joined));
  const key = `studio/${job.id}/${job.task.id}-final.mp4`;
  await io.writeAsset(key, await readFile(final), 'video/mp4');
  return { render: { key, type: 'video/mp4', createdAt: new Date().toISOString(), duration: frameCount(timeline)/FPS } };
}
export async function executeStudioTask(job, env, io, checkpoint, { fetcher = fetch, runCli = cli, runHiggsfield } = {}) {
  const action = job.task.action;
  if (action === 'scenario') throw new Error('시나리오는 연결한 Codex·Claude 계정으로 다시 요청하세요.');
  const work = join(io.workDir, job.id);
  await mkdir(work, { recursive: true });
  await lintProject(job, work, env, action === 'publish');
  if (action === 'narration') return generateNarration(job, work, env, io, checkpoint, { runCli, command });
  if (action === 'media') {
    const assets = { ...job.assets };
    for (const scene of job.scenes) {
      if (assets[scene.id]) continue;
      let data, type, providerInfo = {};
      if (env.SHOPSHORTS_MEDIA_PROVIDER === 'higgsfield') {
        const result = await generateHiggsfieldScene(job, scene, env, work, checkpoint, { run: runHiggsfield, fetcher });
        ({ data, type } = result); providerInfo = { provider: result.provider, providerJobId: result.providerJobId };
      } else if (scene.kind === 'image') {
        const result = await googleMediaRequest(`models/${env.SHOPSHORTS_IMAGE_MODEL || 'gemini-2.5-flash-image'}:generateContent`, { contents: [{ parts: [{ text: `${scene.prompt}\nOriginal visual, no captions or logos. ${job.brief.aspect} composition.` }] }], generationConfig: { responseModalities: ['TEXT', 'IMAGE'], imageConfig: { aspectRatio: job.brief.aspect } } }, env, fetcher);
        const image = result.candidates?.[0]?.content?.parts?.find(p => p.inlineData?.mimeType?.startsWith('image/'))?.inlineData;
        if (!image) throw new Error(`${scene.id}: 이미지가 반환되지 않았습니다. 장면 설명을 수정하세요.`);
        type = image.mimeType; data = Buffer.from(image.data, 'base64');
      } else {
        // Persist the paid operation ID before polling, so a retry does not pay for the same clip again.
        const operationFile = join(work, `${scene.id}-${Buffer.from(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify([scene.prompt, job.brief.aspect, env.SHOPSHORTS_VIDEO_MODEL])))).toString('hex').slice(0, 20)}.operation.json`);
        let operation = existsSync(operationFile) ? JSON.parse(await readFile(operationFile, 'utf8')) : await googleMediaRequest(`models/${env.SHOPSHORTS_VIDEO_MODEL || 'veo-3.1-generate-preview'}:predictLongRunning`, { instances: [{ prompt: `${scene.prompt}. No dialogue, no text overlays.` }], parameters: { aspectRatio: job.brief.aspect, durationSeconds: 8, resolution: '1080p' } }, env, fetcher);
        if (!/^models\/[a-zA-Z0-9._-]+\/operations\/[a-zA-Z0-9_-]+$/.test(operation.name || '') && !/^operations\/[a-zA-Z0-9_-]+$/.test(operation.name || '')) throw new Error('영상 생성 요청 ID를 확인할 수 없습니다.');
        await writeFile(operationFile, JSON.stringify(operation));
        const deadline = Date.now() + 20 * 60000;
        while (!operation.done && Date.now() < deadline) { await new Promise(r => setTimeout(r, 10000)); operation = await googleMediaRequest(operation.name, null, env, fetcher); }
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
      assets[scene.id] = { key, kind: scene.kind, type, source: 'ai', name: scene.id, ...providerInfo };
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
