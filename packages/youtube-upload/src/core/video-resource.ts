/**
 * videos.insert 요청 바디 조립 (순수). snippet + status.
 */
import type { YoutubeUploadJob } from '@cak/contracts';

export interface VideoSnippet {
  title: string;
  description: string;
  tags?: string[];
  categoryId?: string;
}
export interface VideoStatus {
  privacyStatus: string;
  selfDeclaredMadeForKids: boolean;
}
export interface VideoRequestBody {
  snippet: VideoSnippet;
  status: VideoStatus;
}

/** 잡 + 최종 설명(챕터 삽입 완료) → videos.insert requestBody. */
export function buildVideoRequestBody(job: YoutubeUploadJob, description: string): VideoRequestBody {
  const snippet: VideoSnippet = { title: job.title, description };
  if (job.tags !== undefined && job.tags.length > 0) snippet.tags = job.tags;
  if (job.categoryId !== undefined && job.categoryId.length > 0) snippet.categoryId = job.categoryId;
  return {
    snippet,
    status: {
      privacyStatus: job.privacyStatus,
      selfDeclaredMadeForKids: job.madeForKids ?? false,
    },
  };
}
