/**
 * 트랙 목록 → 유튜브 챕터(타임스탬프) 계산 (순수 로직).
 * 유튜브 챕터 규칙: 첫 챕터는 반드시 0:00, 최소 3개, 각 10초 이상.
 */
import type { LongformTrack, ChapterMark } from '@cak/contracts';

/** 초 → 타임스탬프. 1시간 이상이면 H:MM:SS, 아니면 M:SS. */
export function formatTimestamp(totalSec: number): string {
  const t = Math.max(0, Math.floor(totalSec));
  const s = t % 60;
  const m = Math.floor(t / 60) % 60;
  const h = Math.floor(t / 3600);
  const ss = String(s).padStart(2, '0');
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`;
}

/** 트랙 총 길이(초). */
export function totalDuration(tracks: LongformTrack[]): number {
  return tracks.reduce((acc, t) => acc + t.durationSec, 0);
}

/** 누적 시작시간으로 챕터 마크 생성(첫 챕터 0초). */
export function buildChapters(tracks: LongformTrack[]): ChapterMark[] {
  const marks: ChapterMark[] = [];
  let acc = 0;
  for (const tr of tracks) {
    marks.push({ startSec: Math.round(acc), label: tr.title });
    acc += tr.durationSec;
  }
  return marks;
}

/** 유튜브 설명란에 붙일 챕터 텍스트("0:00 제목" 줄들). */
export function formatYouTubeChapters(chapters: ChapterMark[]): string {
  return chapters.map((c) => `${formatTimestamp(c.startSec)} ${c.label}`).join('\n');
}
