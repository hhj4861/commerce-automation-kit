import { createHash } from "node:crypto";
import { ConversationError } from "./conversation";
import { parseMusicSource, type SourceLine } from "./music-source";
import { isStudyLanguage, type StudyLanguage } from "./v2";
import { youtubeMusicId } from "./youtube-music";

export const MEDIA_PARSER = "source-lines-v1";
export type MediaPurpose = "study" | "music";
export type MediaAcquisitionMethod = "file" | "channel";
export type MediaAcquisition = { method: MediaAcquisitionMethod; revision: number; updatedAt: number };
export function isMediaAcquisitionMethod(value: unknown): value is MediaAcquisitionMethod { return value === "file" || value === "channel"; }
export type MediaOriginal = { version: number; hash: string; raw: string; rights: string; savedBy: string; savedAt: number };
export type MediaSource = { id: string; videoId: string; title: string; language: StudyLanguage; purposes: MediaPurpose[];
  origin: "manual" | "music-collection"; legacyId?: string; acquisition?: MediaAcquisition; revision: number; createdAt: number; originals: MediaOriginal[] };
export type MediaCue = SourceLine & { id: string };
export type MediaJob = { id: string; sourceId: string; sourceRevision: number; inputHash: string; requestId: string;
  status: "queued" | "running" | "ready" | "failed" | "cancelled";
  stage: "validate" | "normalize" | "ready"; revision: number; parser: string; createdAt: number; updatedAt: number;
  attempts: { startedAt: number; finishedAt?: number; outcome?: "ready" | "failed" | "interrupted" | "cancelled" }[];
  lease?: { token: string; until: number }; error?: { code: string; message: string };
  output?: { cues: MediaCue[]; timing: "lines" | "timed" }; };
export type MediaState = { schema: 1; sources: MediaSource[]; jobs: MediaJob[] };
export type MediaJobSummary = Pick<MediaJob, "id" | "status" | "stage" | "revision" | "sourceRevision" | "updatedAt" | "error" | "lease">;
export type MediaSummary = Omit<MediaSource, "originals"> & { originalCount: number; job: MediaJobSummary | null };
export type MediaDetail = { source: MediaSource; jobs: MediaJob[] };
export const mediaHash = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
export function mediaRegistration(body: Record<string, unknown>) {
  const videoId = youtubeMusicId(body.video);
  if (!isStudyLanguage(body.language) || typeof body.title !== "string" || !body.title.trim() || body.title.length > 100 ||
    !Array.isArray(body.purposes) || body.purposes.length < 1 || body.purposes.length > 2 ||
    body.purposes.some(p => p !== "study" && p !== "music") || new Set(body.purposes).size !== body.purposes.length)
    throw new ConversationError(400, "제목·원문 언어·학습 용도를 확인해 주세요.");
  if (body.acquisitionMethod !== undefined && !isMediaAcquisitionMethod(body.acquisitionMethod))
    throw new ConversationError(400, "원문 확보 방법은 파일 준비 또는 채널 권한 확인으로 선택해 주세요.");
  return { ...(body.acquisitionMethod !== undefined ? { acquisitionMethod: body.acquisitionMethod as MediaAcquisitionMethod } : {}), id: `youtube-${videoId}`, videoId, title: body.title.trim(), language: body.language,
    purposes: [...body.purposes].sort() as MediaPurpose[] };
}
export function originalInput(body: Record<string, unknown>) {
  if (typeof body.raw !== "string" || !body.raw.trim() || body.raw.length > 12000 ||
    typeof body.rights !== "string" || body.rights.trim().length < 10 || body.rights.length > 800 || body.confirmed !== true ||
    typeof body.requestId !== "string" || !/^[a-zA-Z0-9_-]{8,100}$/.test(body.requestId))
    throw new ConversationError(400, "원문(12,000자 이하)과 보관·학습 이용 근거(10자 이상), 사용권 확인이 필요해요.");
  return { raw: body.raw, rights: body.rights.trim(), requestId: body.requestId };
}
export function normalizeOriginal(original: MediaOriginal): NonNullable<MediaJob["output"]> {
  try {
    const lines = parseMusicSource(original.raw);
    return { cues: lines.map((line, i) => ({ ...line, id: `cue-${original.hash.slice(0, 16)}-${i}` })),
      timing: lines.every(line => line.startSeconds !== undefined && line.endSeconds !== undefined) ? "timed" : "lines" };
  } catch (error) {
    throw new ConversationError(422, error instanceof Error ? error.message : "원문 형식을 확인해 주세요.");
  }
}
