import type { DramaCut } from '@cak/contracts';

/** 2026-10-08 2화 실측·설계 §5/21. 잠정 제작 품질 정책이며 제공자 한도가 아니다. */
export const SHOT_V1 = {
  maxSec: 12, reviewSec: 10, maxLines: 3, reviewLines: 2, maxCast: 3, maxBeats: 2,
  unitsPerSec: 2.2, actionSecPerBeat: 1.5, reviewSpareSec: 1,
} as const;

/** NFC 문자 단위 보수 추정. 한글 음절·영문 문자·숫자 각각 1, 비어휘 발화도 최소 1.
 * 실제 TTS/배우 길이나 정확한 영문 음절 수가 아니며, 후속 음성 판정의 대체가 아니다. */
export function speechSeconds(text: string): number {
  const value = text.normalize('NFC').trim();
  return value ? Math.max(1, value.match(/[\p{L}\p{N}]/gu)?.length ?? 0) / SHOT_V1.unitsPerSec : 0;
}

export interface BeatWindow { index: number; startSec: number; endSec: number; requiredSec: number }
/** 지정 sec는 보존한다. 나머지 시간은 해당 비트 발화량+행동 여유 비례로 배분한다.
 * 음수/과밀 구간도 숨기지 않고 반환하며 shot 관문이 이를 차단한다. 모든 sec 지정 시 잔여 시간은 정지 여유다. */
export function beatWindows(cut: DramaCut): BeatWindow[] {
  const beats = cut.beats ?? [];
  const required = beats.map(b => (b.lines ?? []).reduce((n, i) => n + (cut.lines[i] ? speechSeconds(cut.lines[i]!.text) : 0), SHOT_V1.actionSecPerBeat));
  const explicit = beats.reduce((n, b) => n + (b.sec ?? 0), 0);
  const weight = beats.reduce((n, b, i) => n + (b.sec === undefined ? required[i]! : 0), 0);
  let start = 0;
  return beats.map((b, i) => {
    const sec = b.sec ?? (weight ? (cut.durationSec - explicit) * required[i]! / weight : 0);
    const window = { index: i, startSec: start, endSec: start + sec, requiredSec: required[i]! };
    start += sec;
    return window;
  });
}

export function completeBlocking(cut: DramaCut): boolean {
  const ids = cut.cast.map(c => c.characterId), blocking = cut.blocking ?? [];
  return new Set(ids).size === ids.length && blocking.length === ids.length
    && new Set(blocking.map(b => b.characterId)).size === ids.length
    && blocking.every(b => ids.includes(b.characterId));
}

/** Legacy 前회차 예외는 호출자가 앞 회차 정책을 확인한 경우에만 명시적으로 허용한다. */
export function blockingCompatible(prev: DramaCut, cut: DramaCut, prevIsLegacy = false): boolean {
  if (!completeBlocking(cut)) return false;
  const sameCast = prev.cast.length === cut.cast.length && prev.cast.every(p => cut.cast.some(c => c.characterId === p.characterId));
  if (new Set(prev.cast.map(c => c.characterId)).size !== prev.cast.length) return false;
  if (!prevIsLegacy && !completeBlocking(prev)) return false;
  if (!sameCast) return !!cut.blockingChange;
  if (prevIsLegacy && prev.blocking === undefined) return true;
  if (!completeBlocking(prev)) return false;
  return !!cut.blockingChange || cut.blocking!.every(b => {
    const old = prev.blocking!.find(p => p.characterId === b.characterId)!;
    return old.side === b.side && (old.depth ?? 'mid') === (b.depth ?? 'mid');
  });
}

export function chainsFromV1(prev: DramaCut | undefined, cut: DramaCut, prevIsLegacy = false): boolean {
  return !!prev && cut.continuesFromPrev === true && prev.locationId === cut.locationId
    && (prev.setupId === cut.setupId || (prevIsLegacy && prev.setupId === undefined))
    && (cut.transitionIn ?? 'cut') === 'cut' && blockingCompatible(prev, cut, prevIsLegacy);
}
