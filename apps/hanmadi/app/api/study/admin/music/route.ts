import { cachedYoutubeSearch } from "@/lib/youtube-cache";
import { validateYoutubeSearch } from "@/lib/youtube-search";
import { musicYoutubeConfiguration } from "@/lib/youtube-music";
import { collectMusicVideo, readMusicCollection, musicCaptionTracks, importCollectedCaption, saveCollectedSource, removeCollectedMusic } from "@/lib/music-collection";
import { isStudyLanguage } from "@/lib/v2";
import { getConversationTutor } from "@/lib/conversation-access";
import { ConversationError } from "@/lib/conversation";
import { assertConversationOrigin, conversationFailure, conversationJson, readConversationJson } from "@/lib/conversation-http";
import { readMusic, saveMusic, buildMusic, publishMusic } from "@/lib/owned-music-store";
export const runtime = "nodejs";
export const maxDuration = 150;
async function owner() {
  const tutor = await getConversationTutor();
  if (tutor?.r !== "owner") throw new ConversationError(403, "음악 관리는 소유자 계정으로 로그인해 주세요.");
  return tutor.tid ?? tutor.n;
}
export async function GET() {
  try { await owner(); const [songs, collection] = await Promise.all([readMusic(), readMusicCollection()]); return conversationJson({ songs, collection, youtube: musicYoutubeConfiguration() }); }
  catch (error) { return conversationFailure(error); }
}
export async function POST(req: Request) {
  try {
    assertConversationOrigin(req); const actor = await owner();
    const b = await readConversationJson(req) as Record<string, unknown>;
    if (!b || typeof b !== "object") throw new ConversationError(400, "곡을 선택해 주세요.");
    if (b.action === "collection-search") {
      const search = validateYoutubeSearch(b.query, b.pageToken);
      if (!isStudyLanguage(b.language)) throw new ConversationError(400, "학습 언어를 선택해 주세요.");
      if (!process.env.YOUTUBE_API_KEY) throw new ConversationError(503, "YouTube 검색 연결을 먼저 설정해 주세요.");
      return conversationJson(await cachedYoutubeSearch({ ...search, language: b.language, music: true, captionsOnly: b.captionsOnly === true }, process.env.YOUTUBE_API_KEY));
    }
    if (b.action === "collection-add") return conversationJson({ item: await collectMusicVideo(b.video, b.language) });
    if (b.action === "collection-tracks") return conversationJson({ tracks: await musicCaptionTracks(b.id) });
    if (b.action === "collection-import") return conversationJson({ item: await importCollectedCaption(b.id, b.revision, b.trackId) });
    if (b.action === "collection-source") return conversationJson({ item: await saveCollectedSource(b.id, b.revision, b.source) });
    if (b.action === "collection-remove") return conversationJson(await removeCollectedMusic(b.id, b.revision));
    const song = b.action === "save" ? await saveMusic(b) : b.action === "generate" ? await buildMusic(b.id, b.revision) :
      ["publish", "unpublish"].includes(String(b.action)) ? await publishMusic(b, actor) : null;
    if (!song) throw new ConversationError(400, "음악 관리 작업을 선택해 주세요.");
    return conversationJson({ song });
  } catch (error) { return conversationFailure(error); }
}
