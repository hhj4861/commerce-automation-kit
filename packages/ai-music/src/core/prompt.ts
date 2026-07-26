/**
 * 음악 브리프 → 백엔드별 생성 프롬프트 (순수 로직, spawn/네트워크 없음).
 *
 * 광고 특색(브리프)을 Suno(수동) / ElevenLabs(API) 각각이 잘 먹는 프롬프트로 변환한다.
 * "동적 매칭" = 프롬프트가 컨셉에서 나오므로, 프롬프트 생성이 곧 매칭이다.
 */
import type { MusicBrief, MusicBackendId, MusicPromptPlan } from '@cak/contracts';

const ENERGY_WORD: Record<MusicBrief['energy'], string> = {
  low: 'restrained',
  medium: 'moderate',
  high: 'powerful',
};

const TEMPO_WORD: Record<MusicBrief['tempo'], string> = {
  slow: 'slow',
  mid: 'mid-tempo',
  up: 'upbeat',
};

const TEMPO_BPM: Record<MusicBrief['tempo'], string> = {
  slow: 'around 70 BPM',
  mid: 'around 100 BPM',
  up: 'around 120 BPM',
};

/** 중복·빈값 제거한 스타일 태그 배열(장르 → 무드 → 에너지 → 템포 순). */
export function buildStyleTags(brief: MusicBrief): string[] {
  const raw = [
    ...brief.genres,
    ...brief.moods,
    ENERGY_WORD[brief.energy],
    TEMPO_WORD[brief.tempo],
  ]
    .map((t) => t.trim())
    .filter((t) => t.length > 0);
  return [...new Set(raw)];
}

/** 브리프를 지정 백엔드의 프롬프트 플랜으로 변환. */
export function briefToPrompt(brief: MusicBrief, backend: MusicBackendId): MusicPromptPlan {
  const tags = buildStyleTags(brief);
  const style = tags.join(', ');
  const lengthSec = brief.durationSec;
  const instrumental = brief.instrumental;

  // Suno 계열(수동/예약된 자동)은 동일한 Suno 스타일 프롬프트를 쓴다.
  const bpmTag = brief.bpm !== undefined ? `, ${brief.bpm} BPM` : '';
  if (backend === 'suno-manual' || backend === 'suno-auto') {
    const styleField = `${style}${bpmTag}${instrumental ? ', instrumental' : ''}`;
    const prompt =
      brief.arc !== undefined && brief.arc.length > 0
        ? brief.arc
        : `${brief.moods.join(', ')} ${brief.genres.join('/')} score for a ${brief.energy}-energy ad`;
    const manualSteps = [
      'Suno(유료 플랜)에서 Create → Custom 모드',
      `Style 칸에 붙여넣기: ${styleField}`,
      instrumental ? 'Instrumental 토글 ON (보컬 없음)' : '보컬 포함',
      `길이 목표 ~${lengthSec}s (광고 길이에 맞춰 자동 트림됨)`,
      '생성 후 mp3/wav 다운로드 → `ai-music mix` 로 광고에 입힘',
    ];
    return { backend, prompt, style: styleField, instrumental, lengthSec, manualSteps };
  }

  // elevenlabs (공식 API 무인) — 자연어 프롬프트 + 길이는 별도 파라미터
  const bpmText = brief.bpm !== undefined ? `${brief.bpm} BPM` : TEMPO_BPM[brief.tempo];
  const parts = [style, bpmText];
  if (instrumental) parts.push('instrumental, no vocals');
  if (brief.arc !== undefined && brief.arc.length > 0) parts.push(brief.arc);
  const prompt = parts.filter((p) => p.length > 0).join('. ');
  return { backend, prompt, style, instrumental, lengthSec };
}
