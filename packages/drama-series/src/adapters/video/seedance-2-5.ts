import type { DramaClipMedia, DramaClipSpec, DramaCut, DramaLine } from '@cak/contracts';
import type { GateContext } from '../../core/gates/types.js';

export interface VideoOptions {
  resolution: '480p' | '720p' | '1080p';
  draft: boolean;
  aspectRatio: '16:9' | '9:16';
}

export class PlanError extends Error {
  constructor(message: string, readonly cutId?: string) {
    super(message);
  }
}

/** 2026-10-06 models_explore 조회값. 4~30초, draft 는 480p. */
export const SEEDANCE_2_5 = { backend: 'seedance-2-5', model: 'seedance_2_5', minSec: 4, maxSec: 30 } as const;

function sayLine(ctx: GateContext, line: DramaLine, refs: Map<string, string>): string {
  const ref = refs.get(line.speaker);
  const name = ctx.series.characters.find((c) => c.id === line.speaker)?.name ?? line.speaker;
  const who = ref ? ref.split(' (')[0] : `An off-screen voice of ${name}`;
  return `${who} says in Korean: "${line.text}"`;
}

/**
 * 컷 하나를 Seedance 2.5 omni_reference 요청 명세로 만든다.
 * `@ImageN` 번호는 그 요청의 medias 순서다(시험분 1·2컷에서 확인, 공식 문서 미확인).
 */
export function toSeedanceClip(ctx: GateContext, cut: DramaCut, opts: VideoOptions): Omit<DramaClipSpec, 'estCredits'> {
  if (!Number.isInteger(cut.durationSec) || cut.durationSec < SEEDANCE_2_5.minSec || cut.durationSec > SEEDANCE_2_5.maxSec)
    throw new PlanError(`길이 ${cut.durationSec}초는 Seedance 2.5 범위(${SEEDANCE_2_5.minSec}~${SEEDANCE_2_5.maxSec}초 정수) 밖`, cut.id);
  if (opts.draft && opts.resolution !== '480p') throw new PlanError('draft 는 480p 에서만 가능', cut.id);
  const medias: DramaClipMedia[] = [];
  const refs = new Map<string, string>();
  for (const m of cut.cast) {
    const c = ctx.series.characters.find((x) => x.id === m.characterId);
    const look = c?.looks.find((l) => l.id === m.lookId);
    if (!c || !look) throw new PlanError(`출연진 정보 없음: ${m.characterId}/${m.lookId}`, cut.id);
    if (!look.refAssetId) throw new PlanError(`참조 이미지 미등록: ${c.name}(${look.id})`, cut.id);
    medias.push({ role: 'image_references', assetId: look.refAssetId, label: `${c.name}(${look.id})` });
    refs.set(c.id, `@Image${medias.length} (${look.description})`);
  }
  const loc = ctx.series.locations.find((l) => l.id === cut.locationId);
  if (!loc) throw new PlanError(`장소 없음: ${cut.locationId}`, cut.id);
  if (!loc.refAssetId) throw new PlanError(`장소 참조 이미지 미등록: ${loc.name}`, cut.id);
  medias.push({ role: 'image_references', assetId: loc.refAssetId, label: loc.name });
  refs.set('location', `@Image${medias.length}`);
  const visual = cut.visualEn.replace(/\{([a-z0-9-]+)\}/g, (all: string, tok: string) => refs.get(tok) ?? all);
  if (/\{[a-z0-9-]+\}/.test(visual)) throw new PlanError('visualEn 에 풀리지 않은 토큰', cut.id);
  const spoken = cut.lines.filter((l) => l.kind === 'dialogue');
  const parts = [
    visual,
    spoken.map((l) => sayLine(ctx, l, refs)).join(' '),
    spoken.length ? 'One speaker at a time, accurate Korean lip sync.' : 'No dialogue spoken on screen.',
    cut.sfx ? `Sound: ${cut.sfx}.` : '',
    loc.anchorText,
    ctx.series.styleEn,
  ].filter((p) => p.length > 0);
  return {
    cutId: cut.id,
    backend: SEEDANCE_2_5.backend,
    model: SEEDANCE_2_5.model,
    durationSec: cut.durationSec,
    params: { mode: 'omni_reference', duration: cut.durationSec, resolution: opts.resolution, draft: opts.draft, aspect_ratio: opts.aspectRatio, generate_audio: true },
    medias,
    prompt: parts.join(' '),
    voiceOver: cut.lines.filter((l) => l.kind === 'monologue').map((l) => ({ speaker: l.speaker, text: l.text })),
  };
}
