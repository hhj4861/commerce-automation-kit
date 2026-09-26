import { createHash } from 'node:crypto';
import { readFile, writeFile, rename, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { narrationAsset, narrationId, narrationScenes } from './public/narration-audio.js';
import { normalizeEdit } from './public/editor-model.js';

export async function narrationFile(job, scene, work, env, io, { runCli, command }) {
  const voice = job.edit.voice;
  const hash = createHash('sha256').update(`${voice}:${scene.narration}`).digest('hex').slice(0, 24);
  const file = join(work, `${hash}.mp3`);
  const cached = narrationAsset(job, scene, voice);
  if (cached) await writeFile(file, await io.readAsset(cached.key));
  let data;
  try { data = await readFile(file); } catch (e) { if (e.code !== 'ENOENT') throw e; }
  if (!data?.length) {
    if (!env.ELEVENLABS_API_KEY) throw Error('대본 음성 서비스를 연결해 주세요. 관리자에게 음성 생성 설정 확인을 요청하세요.');
    const temporary = `${file}.pending.mp3`;
    try {
      await runCli('@cak/tts-narration', ['generate', '--text', scene.narration, '--out', temporary], { ...env, ELEVENLABS_VOICE_ID: voice });
      data = await readFile(temporary);
      if (!data.length) throw Error('empty audio');
      await rename(temporary, file);
    } catch (error) {
      await unlink(temporary).catch(() => {});
      throw Error(narrationFailure(error));
    }
  }
  const duration = Number(await command('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=noprint_wrappers=1:nokey=1', file], env));
  if (!Number.isFinite(duration) || duration <= 0) throw Error('대본 음성 파일의 길이를 확인할 수 없습니다.');
  return { file, data, duration, hash };
}

export async function generateNarration(job, work, env, io, checkpoint, tools) {
  const assets = { ...job.assets }, edit = normalizeEdit(job);
  if (!job.approved || edit.voice === 'none') throw Error('대본을 검수하고 목소리를 선택해 주세요.');
  for (const scene of narrationScenes(job, edit)) {
    if (narrationAsset(job, scene, edit.voice)) continue;
    const { data, duration, hash } = await narrationFile(job, scene, work, env, io, tools);
    const key = `studio/${job.id}/narration-${hash}.mp3`;
    await io.writeAsset(key, data, 'audio/mpeg');
    assets[narrationId(scene.id)] = { key, kind: 'audio', type: 'audio/mpeg', purpose: 'narration', source: 'ai', voice: edit.voice, text: scene.narration, duration, name: scene.id };
    await checkpoint({ assets: structuredClone(assets) });
  }
  return { assets };
}

// Provider details may contain request data. Return only an allowlisted user message.
export function narrationFailure(error) {
 const message=String(error?.message||'');
 if(/quota_exceeded|insufficient_credits|payment_required|\b402\b/i.test(message))return '음성 생성 사용량이 부족해요. 사용 한도를 확인한 뒤 다시 시도해 주세요.';
 if(/voice_not_found|voice_not_allowed|voice_access|\b404\b/i.test(message))return '이 목소리를 사용할 수 없어요. 다른 목소리를 선택한 뒤 음성을 다시 만들어 주세요.';
 if(/too_many_concurrent_requests|rate_limit|\b429\b/i.test(message))return '음성 생성 요청이 몰리고 있어요. 잠시 후 다시 시도해 주세요.';
 if(/invalid_api_key|authentication|\b401\b|\b403\b/i.test(message))return '음성 서비스 인증을 확인해 주세요. 관리자에게 설정 확인을 요청해 주세요.';
 return '대본 음성을 만들지 못했어요. 목소리 선택은 유지됩니다. 잠시 후 다시 시도해 주세요.';
}
