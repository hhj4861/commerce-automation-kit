import { createHash } from 'node:crypto';
import type { DramaEpisode, DramaSeries, DramaTopic } from '@cak/contracts';

/** 키 순서와 무관한 직렬화. */
export function canonical(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(canonical).join(',')}]`;
  if (v !== null && typeof v === 'object') {
    const o = v as Record<string, unknown>;
    return `{${Object.keys(o)
      .sort()
      .filter((k) => o[k] !== undefined)
      .map((k) => `${JSON.stringify(k)}:${canonical(o[k])}`)
      .join(',')}}`;
  }
  return JSON.stringify(v) ?? 'null';
}

/**
 * 대본 지문. 대사 검증 상태는 빼고 계산한다 — 판정 결과를 기록해도 다른 관문 기록이
 * 무효가 되지 않고, 대사·장면을 고치면 모든 관문을 다시 돌려야 한다.
 */
const sha16 = (text: string) => createHash('sha256').update(text).digest('hex').slice(0, 16);
const stripTopic = ({ verifiedElements: _v, ...rest }: DramaTopic) => rest;

export function fingerprintOf(series: DramaSeries, episode: DramaEpisode): string {
  const stripped = {
    ...episode,
    cuts: episode.cuts.map((c) => ({ ...c, lines: c.lines.map(({ verification: _v, ...rest }) => rest) })),
  };
  return sha16(canonical({ series: { ...series, topic: stripTopic(series.topic) }, episode: stripped }));
}

/**
 * 주제 지문. 확정 요소(verifiedElements)와 판정한 장르까지 묶는다 — 시리즈로 옮긴 주제의
 * 요소를 지우거나 다른 장르로 바꾸면 주제 관문 기록과 맞지 않게 된다.
 */
export function topicFingerprint(topic: DramaTopic, genreId: string): string {
  return sha16(canonical({ genreId, topic }));
}

export function topicsFingerprint(topics: DramaTopic[], genreId: string): string {
  return sha16(canonical({ genreId, topics }));
}
