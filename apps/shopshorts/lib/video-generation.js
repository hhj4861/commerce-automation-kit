/** Pages와 로컬 서버가 공유하는 입력 매핑/신선도 검사. 광고 품질 로직은 원자 CLI가 소유한다. */
import { VIDEO_QUALITY_PROFILES, generationDuration, STANDARD_DURATION_LIMITS } from '../../../packages/ad-video-gen/src/core/video-policy.js';
export function shortsGenerationRequest(job) {
  if (job.status !== 'script-approved') throw new Error('기획 승인 후에만 영상 생성 계획을 만들 수 있습니다.');
  const direction = job.videoDirection;
  if (!direction || typeof direction !== 'object' || Array.isArray(direction)) {
    throw new Error('영상 기획 근거(videoDirection)가 없습니다. 초안에 근거·고유성·서사 검토를 추가하세요.');
  }
  if (!job.brief?.id || job.script?.briefId !== job.brief.id) throw new Error('브리프와 대본의 id가 다릅니다.');
  if (!Array.isArray(job.script.beats) || !job.script.beats.length) throw new Error('대본 장면이 없습니다.');
  if (job.script.beats.some((b, i) => b.index !== i)) throw new Error('대본 장면은 index 0부터 순서대로 등록해야 합니다.');
  for (const key of Object.keys(direction.emphasis ?? {})) {
    if (!job.script.beats.some((b) => String(b.index) === key)) throw new Error(`연출 강조의 장면 번호가 잘못됐습니다: ${key}`);
  }
  return {
    target: 'shorts',
    tier: job.videoTier ?? 'standard',
    concept: {
      subject: job.brief.productName,
      ...(job.brief.category !== undefined ? { category: job.brief.category } : {}),
      sellingPoints: job.brief.appealPoints,
      evidence: direction.evidence,
      uniqueness: direction.uniqueness,
      narrativeComplete: direction.narrativeComplete,
      humanApproved: true, // 입력 플래그를 신뢰하지 않고 위의 서버 승인 상태에서만 도출한다.
      aspectRatio: '9:16',
      beats: job.script.beats.map((b) => ({
        index: b.index, durationSec: b.durationSec, description: b.visualPrompt,
        ...(direction.emphasis?.[b.index] !== undefined ? { emphasis: direction.emphasis[b.index] } : {}),
      })),
    },
    ...(direction.extraStyle !== undefined ? { extraStyle: direction.extraStyle } : {}),
  };
}

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])]));
  }
  return value;
}

async function fingerprint(input) {
  const source = canonical(input);
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(source)));
  return Array.from(new Uint8Array(digest), (n) => n.toString(16).padStart(2, '0')).join('');
}

/** 승인된 표현/고지까지 보호하는 지문. 영상 캐시 지문과 분리한다. */
export function approvedInputFingerprint(job) {
  return fingerprint({ brief: job.brief, script: job.script, videoDirection: job.videoDirection, videoTier: job.videoTier ?? 'standard' });
}

export function videoInputFingerprint(job) {
  return fingerprint({
    brief: { id: job.brief?.id, productName: job.brief?.productName, category: job.brief?.category, appealPoints: job.brief?.appealPoints },
    script: { briefId: job.script?.briefId, beats: job.script?.beats?.map((b) => ({ index: b.index, durationSec: b.durationSec, visualPrompt: b.visualPrompt })) },
    videoDirection: job.videoDirection, videoTier: job.videoTier ?? 'standard',
  });
}

export function clearVideoGeneration(job) {
  delete job.videoGeneration;
  delete job.videoGenerationError;
}

/** 생성 시작/완료 기록 전에 대본과 공통 계획이 일치하는지 확인한다. */
export async function videoGenerationProblem(job, clipPaths) {
  const prepared = job.videoGeneration;
  const plan = prepared?.plan;
  if (plan?.engine !== 'ad-cinematic-v1' || plan.target !== 'shorts' || plan.splitByBeat !== true) {
    return '공통 영상 생성 계획이 준비되지 않았습니다.';
  }
  if (prepared.sourceFingerprint !== await videoInputFingerprint(job)) return '영상 기획이 변경되어 생성 계획을 다시 만들어야 합니다.';
  const beats = job.script?.beats;
  if (!Array.isArray(beats) || !Array.isArray(plan.clips) || !beats.length || beats.length !== plan.clips.length) {
    return '대본과 생성 계획의 장면 수가 다릅니다.';
  }
  if (plan.subject !== job.brief.productName || plan.tier !== (job.videoTier ?? 'standard')) return '생성 계획의 상품·품질 설정이 다릅니다.';
  const quality = VIDEO_QUALITY_PROFILES[plan.tier];
  if (!Object.hasOwn(VIDEO_QUALITY_PROFILES, plan.tier) || !quality || plan.costPreflightRequired !== true) return '생성 계획의 품질·비용 확인 설정이 잘못됐습니다.';
  for (const [i, clip] of plan.clips.entries()) {
    if (clip?.model !== quality.model || clip?.resolution !== quality.resolution || clip?.generateAudio !== false) {
      return '생성 계획의 모델·해상도·오디오가 공통 품질 정책과 다릅니다.';
    }
    if (!clip || !beats[i] || clip.index !== i || clip.beatIndices?.length !== 1 || clip.beatIndices[0] !== beats[i].index
      || clip.durationSec !== beats[i].durationSec || clip.aspectRatio !== '9:16'
      || typeof clip.prompt !== 'string' || !clip.prompt.trim()) {
      return '생성 계획의 장면·길이·구도가 대본과 다릅니다.';
    }
    if ((clip.generationDurationSec ?? clip.durationSec) !== generationDuration(plan.tier, clip.durationSec)
      || (plan.tier === 'standard' && clip.durationSec > STANDARD_DURATION_LIMITS.max)) return '모델 지원 길이에 맞는 생성 계획을 다시 만들어야 합니다.';
  }
  if (clipPaths !== undefined && (!Array.isArray(clipPaths) || clipPaths.length !== plan.clips.length
    || clipPaths.some((p) => typeof p !== 'string' || !p.trim()))) return '계획의 장면 수와 생성 클립 파일 수가 다릅니다.';
  return null;
}
