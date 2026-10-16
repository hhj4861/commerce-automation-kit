import { getConversationTutor } from "@/lib/conversation-access";
import { ConversationError } from "@/lib/conversation";
import { assertConversationOrigin, conversationFailure, conversationJson, readConversationJson } from "@/lib/conversation-http";
import { musicYoutubeConfiguration } from "@/lib/youtube-music";
import { readMusicCollection } from "@/lib/music-collection";
import { collectMedia, saveMediaOriginal, readMedia, runMediaJob, cancelMediaJob, deleteMediaSource } from "@/lib/media-store";
export const runtime = "nodejs";
export const maxDuration = 30;
async function owner() {
  const tutor = await getConversationTutor();
  if (tutor?.r !== "owner") throw new ConversationError(403, "원문 관리는 소유자 계정으로 로그인해 주세요.");
  return tutor.tid ?? tutor.n;
}
export async function GET(req: Request) {
  try {
    await owner(); const id = new URL(req.url).searchParams.get("id");
    if (id) return conversationJson(await readMedia(id));
    const [data, legacy] = await Promise.all([readMedia(), readMusicCollection()]);
    return conversationJson({ ...data, youtube: musicYoutubeConfiguration(), legacyMusic: legacy.map(item => ({ id: item.id, title: item.video.title, videoId: item.video.id, language: item.language })) });
  } catch (error) { return conversationFailure(error); }
}
export async function POST(req: Request) {
  try {
    assertConversationOrigin(req); const actor = await owner(), body = await readConversationJson(req);
    if (!body || typeof body !== "object" || Array.isArray(body)) throw new ConversationError(400, "작업을 확인해 주세요.");
    const b = body as Record<string, unknown>;
    if (b.action === "collect") return conversationJson(await collectMedia(b));
    if (b.action === "import-music") {
      const item = (await readMusicCollection()).find(item => item.id === b.legacyId);
      if (!item) throw new ConversationError(404, "음악 수집함의 영상을 선택해 주세요.");
      return conversationJson(await collectMedia({ video: item.video.id, title: item.video.title, language: item.language, purposes: ["music"] }, undefined, item.id));
    }
    if (b.action === "save-source") return conversationJson(await saveMediaOriginal(b, actor));
    if (b.action === "run") return conversationJson(await runMediaJob(b.jobId));
    if (b.action === "cancel") return conversationJson(await cancelMediaJob(b));
    if (b.action === "delete") return conversationJson(await deleteMediaSource(b));
    throw new ConversationError(400, "원문 처리 작업을 선택해 주세요.");
  } catch (error) { return conversationFailure(error); }
}
