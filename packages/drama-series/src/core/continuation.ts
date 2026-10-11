import { createHash } from 'node:crypto';
import type { DramaCut, DramaFinding, DramaLine } from '@cak/contracts';
import type { GateContext } from './gates/types.js';
import { canonical } from './fingerprint.js';
import { isLineCleared } from './line-hash.js';

/** Opt-in only: episodes without a link keep their legacy checks and hashes. */
export function continuationFindings(ctx: GateContext): DramaFinding[] {
  const { episode, series } = ctx;
  const link = episode.continuesFromEpisode;
  const block = (message: string): DramaFinding[] => [{ severity: 'block', message }];
  if (link && episode.startsFresh) return block('continuesFromEpisode와 startsFresh 동시 선언 불가');
  if (!link) return ctx.prev ? block('연결 선언 없이 앞 회차 입력을 사용할 수 없음') : [];
  if (episode.seriesId !== series.id) return block('현재 회차의 seriesId 불일치');
  const prev = ctx.prev?.episode;
  if (!prev) return block('연결 선언에 필요한 --prev-episode 없음');
  if (prev.seriesId !== episode.seriesId || prev.no !== link.no || prev.no !== episode.no - 1)
    return block('앞 회차 시리즈/번호 불일치: 바로 앞 회차만 지원');
  const matches = prev.cuts.filter(c => c.id === link.cutId);
  const cut = matches[0];
  if (!cut || matches.length !== 1) return block('앞 회차 지정 컷 없음 또는 중복');
  // Non-final continuations need an approval contract not implemented in this unit.
  if (prev.cuts.at(-1)?.id !== link.cutId) return block('앞 회차 마지막 컷만 연결 가능(중간 컷 승인 경로 미구현)');
  if (episode.cuts[0]?.locationId !== cut.locationId) return block('회차 연결 첫 컷의 장소가 앞 컷과 다름');
  return [];
}

export function assertContinuation(ctx: GateContext): void {
  const findings = continuationFindings(ctx);
  if (findings.length) throw new Error(findings.map(f => f.message).join('; '));
}

/** Every predecessor lookup goes through here, including cross-episode index zero. */
export function previousCutOf(ctx: GateContext, index: number): DramaCut | undefined {
  assertContinuation(ctx);
  if (!Number.isInteger(index) || index < 0 || index >= ctx.episode.cuts.length) throw new Error('잘못된 컷 index');
  if (index > 0) return ctx.episode.cuts[index - 1];
  const link = ctx.episode.continuesFromEpisode;
  return link ? ctx.prev!.episode.cuts.find(c => c.id === link.cutId) : undefined;
}

const contentOf = (cut: DramaCut) => ({ ...cut, lines: cut.lines.map(({ verification: _v, ...line }) => line) });

/** Explicit review summary; original approval evidence is never copied into context. */
export function continuationSummary(ctx: GateContext): Record<string, unknown> | undefined {
  assertContinuation(ctx);
  if (!ctx.episode.continuesFromEpisode) return undefined;
  return { episodeNo: ctx.prev!.episode.no, cut: contentOf(previousCutOf(ctx, 0)!) };
}

/** Additional full SHA-256 binding; the existing content/line fingerprints stay unchanged. */
export function contextBinding(ctx: GateContext): { reviewContextDigest?: string } {
  assertContinuation(ctx);
  if (!ctx.episode.continuesFromEpisode) return {};
  const value = {
    series: ctx.series,
    episode: { ...ctx.episode, cuts: ctx.episode.cuts.map(contentOf) },
    previous: continuationSummary(ctx),
    genre: ctx.genre,
  };
  return { reviewContextDigest: 'sha256:' + createHash('sha256').update(canonical(value)).digest('hex') };
}

export function isContextLineCleared(ctx: GateContext, cut: DramaCut, line: DramaLine): boolean {
  const binding = contextBinding(ctx);
  return isLineCleared(cut, line) && (!binding.reviewContextDigest || line.verification.reviewContextDigest === binding.reviewContextDigest);
}
