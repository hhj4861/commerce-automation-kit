import { ConversationError } from "./conversation";
import { v2Driver } from "./store";
import { isStudyLanguage, type StudyLanguage } from "./v2";
import { parseMusicSource } from "./owned-music";
import { downloadMusicCaption, youtubeMusicCaptions, youtubeMusicDetails, youtubeMusicId, type MusicVideoDetails, type MusicCaptionTrack } from "./youtube-music";
export type MusicCollectedVideo = { id: string; video: MusicVideoDetails; language: StudyLanguage; revision: number; collectedAt: string;
  source?: string; sourceOrigin?: "file" | "youtube"; caption?: MusicCaptionTrack; sourceUpdatedAt?: string };
const KEY = "music-video-collection:v1";
type DB = Pick<ReturnType<typeof v2Driver>, "get" | "cas" | "count">;
export async function readMusicCollection(db: DB = v2Driver()): Promise<MusicCollectedVideo[]> { return JSON.parse(await db.get(KEY) ?? "[]"); }
async function change<T>(db: DB, update: (items: MusicCollectedVideo[]) => T): Promise<T> {
  for (let i = 0; i < 8; i++) {
    const old = await db.get(KEY), items: MusicCollectedVideo[] = JSON.parse(old ?? "[]"), result = update(items);
    if (await db.cas(KEY, old, JSON.stringify(items))) return result;
  }
  throw new ConversationError(409, "다른 창에서 수집함을 바꾸고 있어요. 새로고침 후 다시 시도해 주세요.");
}
async function budget(db: DB, kind: string, limit: number) {
  if (await db.count(`music-youtube:${kind}:${new Date().toISOString().slice(0, 10)}`) > limit)
    throw new ConversationError(429, "오늘의 YouTube 수집 요청 한도에 도달했어요. 저장된 영상과 자막 파일 등록은 계속 이용할 수 있어요.");
}
export async function collectMusicVideo(value: unknown, language: unknown, deps = { db: v2Driver(), details: (id: string) => youtubeMusicDetails(id, process.env.YOUTUBE_API_KEY ?? "") }) {
  const videoId = youtubeMusicId(value);
  if (!isStudyLanguage(language)) throw new ConversationError(400, "학습 언어를 선택해 주세요.");
  const id = `${language}:${videoId}`, existing = (await readMusicCollection(deps.db)).find(v => v.id === id);
  if (existing) return existing;
  await budget(deps.db, "metadata", 100);
  const video = await deps.details(videoId);
  return change(deps.db, items => {
    const found = items.find(v => v.id === id); if (found) return found;
    if (items.length >= 100) throw new ConversationError(409, "수집함이 100개로 가득 찼어요. 사용하지 않는 영상을 수집함에서 지워 주세요.");
    const item: MusicCollectedVideo = { id, video, language, revision: 1, collectedAt: new Date().toISOString() }; items.push(item); return item;
  });
}
function selected(items: MusicCollectedVideo[], id: unknown, revision?: unknown) {
  const item = items.find(v => v.id === id);
  if (!item) throw new ConversationError(404, "수집한 영상을 선택해 주세요.");
  if (revision !== undefined && item.revision !== revision) throw new ConversationError(409, "수집함의 원문이 바뀌었어요. 새로고침 후 다시 확인해 주세요.");
  return item;
}
export async function musicCaptionTracks(id: unknown, deps = { db: v2Driver(), tracks: youtubeMusicCaptions }) {
  const item = selected(await readMusicCollection(deps.db), id); await budget(deps.db, "tracks", 40); return deps.tracks(item.video.id);
}
export async function saveCollectedSource(id: unknown, revision: unknown, source: unknown, db: DB = v2Driver(), caption?: MusicCaptionTrack) {
  if (!Number.isInteger(revision) || typeof source !== "string") throw new ConversationError(400, "수집한 영상과 자막 원문을 확인해 주세요.");
  parseMusicSource(source);
  return change(db, items => {
    const item = selected(items, id, revision);
    Object.assign(item, { source, sourceOrigin: caption ? "youtube" : "file", caption, sourceUpdatedAt: new Date().toISOString(), revision: item.revision + 1 }); return item;
  });
}
export async function importCollectedCaption(id: unknown, revision: unknown, trackId: unknown, deps = { db: v2Driver(), download: downloadMusicCaption }) {
  if (!Number.isInteger(revision)) throw new ConversationError(400, "수집함을 새로고침한 뒤 다시 시도해 주세요.");
  const item = selected(await readMusicCollection(deps.db), id, revision);
  await budget(deps.db, "download", 20);
  const result = await deps.download(item.video.id, trackId);
  return saveCollectedSource(id, revision, result.source, deps.db, result.track);
}
export async function removeCollectedMusic(id: unknown, revision: unknown, db: DB = v2Driver()) {
  if (!Number.isInteger(revision)) throw new ConversationError(400, "수집함을 새로고침한 뒤 다시 시도해 주세요.");
  return change(db, items => { const item = selected(items, id, revision); items.splice(items.indexOf(item), 1); return { removed: true }; });
}
