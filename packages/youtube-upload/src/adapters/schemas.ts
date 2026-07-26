/**
 * 입력 검증 스키마(zod) — 업로드 잡을 계약 타입으로 안전 변환.
 */
import { z } from 'zod';
import type { YoutubeUploadJob } from '@cak/contracts';

export const youtubePrivacySchema = z.enum(['private', 'unlisted', 'public']);

export const youtubeUploadJobSchema = z.object({
  video: z.string().min(1),
  title: z.string().min(1),
  description: z.string().default(''),
  tags: z.array(z.string()).optional(),
  categoryId: z.string().optional(),
  privacyStatus: youtubePrivacySchema.default('private'),
  thumbnail: z.string().optional(),
  chapters: z.string().optional(),
  madeForKids: z.boolean().default(false),
});

export function parseYoutubeUploadJob(input: unknown): YoutubeUploadJob {
  const j = youtubeUploadJobSchema.parse(input);
  const job: YoutubeUploadJob = {
    video: j.video,
    title: j.title,
    description: j.description,
    privacyStatus: j.privacyStatus,
    madeForKids: j.madeForKids,
  };
  if (j.tags !== undefined) job.tags = j.tags;
  if (j.categoryId !== undefined) job.categoryId = j.categoryId;
  if (j.thumbnail !== undefined) job.thumbnail = j.thumbnail;
  if (j.chapters !== undefined) job.chapters = j.chapters;
  return job;
}
