import { createHash } from 'node:crypto';
import { z } from 'zod';
import type { DramaContinuationBinding, DramaEpisode, DramaReleaseSource, DramaSeries, DramaSourceApproval } from '@cak/contracts';
import { canonical } from './fingerprint.js';
import { ID } from './model.js';
import { contextBinding, previousCutOf } from './continuation.js';
import type { GateContext } from './gates/types.js';

export class ReleaseSourceError extends Error {}
const sha = z.string().regex(/^sha256:[a-f0-9]{64}$/);
const id = ID;
const bytes = z.number().int().positive().max(256 * 1024 * 1024);
const file = z.object({ sha256: sha, bytes }).strict();
const sourceSchema = z.object({
  schemaVersion: z.literal(1), kind: z.literal('drama-release-source'), authorized: z.literal(false),
  seriesId: id, episodeNo: z.number().int().positive(), cutId: id, contentDigest: sha,
  clip: file,
  frame: file.extend({ pixelSha256: sha, frameCount: z.number().int().positive().max(100_000), extraction: z.literal('video-0-rgb24-last-v1') }).strict(),
  subjectDigest: sha,
}).strict();
const text = z.string().trim().min(1).max(2000);
const approvalSchema = z.object({
  schemaVersion: z.literal(1), decision: z.literal('approve-continuation-source'), subjectDigest: sha,
  approvedBy: text, userQuote: text, recordedBy: text, at: z.string().datetime({ offset:true }),
}).strict();
export const contentSha = (value: unknown): string => 'sha256:' + createHash('sha256').update(canonical(value)).digest('hex');
export function releaseContentDigest(series: DramaSeries, episode: DramaEpisode): string {
  return contentSha({ series, episode: { ...episode, cuts: episode.cuts.map(c => ({ ...c, lines:c.lines.map(({verification:_,...l}) => l) })) } });
}
export function parseReleaseSource(raw: unknown): DramaReleaseSource {
  const parsed = sourceSchema.safeParse(raw);
  if (!parsed.success) throw new ReleaseSourceError('잘못된 앞 회차 증거 형식');
  const { subjectDigest, ...body } = parsed.data;
  if (subjectDigest !== contentSha(body)) throw new ReleaseSourceError('앞 회차 증거 지문 불일치');
  return parsed.data;
}
export function parseSourceApproval(raw: unknown): DramaSourceApproval {
  const parsed = approvalSchema.safeParse(raw);
  if (!parsed.success) throw new ReleaseSourceError('사람 승인 기록의 대상·발화·기록자·시각 필수');
  return parsed.data;
}
/** Only semantic linkage. The caller must separately verify actual snapshot bytes. */
export function bindContinuationEvidence(ctx: GateContext, source: DramaReleaseSource, approval: DramaSourceApproval): DramaContinuationBinding {
  source = parseReleaseSource(source);
  approval = parseSourceApproval(approval);
  const prev = previousCutOf(ctx, 0);
  const digest = contextBinding(ctx).reviewContextDigest;
  if (!ctx.prev || !ctx.episode.continuesFromEpisode || !prev || !digest) throw new ReleaseSourceError('회차 연결 선언과 앞 회차 필수');
  if (source.seriesId !== ctx.series.id || source.episodeNo !== ctx.prev.episode.no || source.cutId !== prev.id)
    throw new ReleaseSourceError('앞 회차 증거의 시리즈·회차·컷 불일치');
  if (source.contentDigest !== releaseContentDigest(ctx.series, ctx.prev.episode)) throw new ReleaseSourceError('앞 회차 대본 또는 시리즈 변경 — 증거와 승인 갱신 필요');
  if (source.subjectDigest !== approval.subjectDigest) throw new ReleaseSourceError('승인 기록의 증거 지문 불일치');
  const body = {
    schemaVersion: 1 as const, kind: 'drama-continuation-binding' as const, authorized: false as const,
    reviewContextDigest: digest,
    source: { episodeNo: source.episodeNo, cutId: source.cutId, subjectDigest: source.subjectDigest, clipSha256: source.clip.sha256, frameSha256: source.frame.sha256 },
    target: { seriesId: ctx.series.id, episodeNo: ctx.episode.no, cutId: ctx.episode.cuts[0]!.id },
    approvalDigest: contentSha(approval),
  };
  return { ...body, bindingDigest: contentSha(body) };
}
