import { studyIdentity } from "@/lib/learner-auth";
import { assertConversationOrigin, conversationJson, conversationFailure, readConversationJson } from "@/lib/conversation-http";
import { ConversationError } from "@/lib/conversation";
import { loadMusicLyrics } from "@/lib/music-lyrics-provider";
import { readStudy, changeStudy } from "@/lib/v2-store";
export const runtime = "nodejs";
export const maxDuration = 15;

export async function GET() {
  try {
    const { actor } = await studyIdentity();
    const result = await loadMusicLyrics();
    if (result.status !== "ready") return conversationJson(result);
    const state = await readStudy(actor);
    return conversationJson({ ...result, progress: state.musicProgress?.pretender });
  } catch (error) { return conversationFailure(error); }
}
export async function POST(req: Request) {
  try {
    assertConversationOrigin(req);
    const { actor } = await studyIdentity();
    const input = await readConversationJson(req) as Record<string, unknown> | null;
    if (!input || typeof input.revision !== "string" || input.revision.length > 100 ||
        !Number.isInteger(input.index) || Number(input.index) < 0 || Number(input.index) >= 200)
      throw new ConversationError(400, "학습할 가사를 다시 선택해 주세요.");
    const result = await loadMusicLyrics();
    if (result.status !== "ready") throw new ConversationError(503, "지금은 가사 학습을 이용할 수 없어요. 다시 열어 주세요.");
    if (input.revision !== result.lesson.revision || Number(input.index) >= result.lesson.lines.length)
      throw new ConversationError(409, "학습 자료가 바뀌었어요. 가사 학습을 다시 열어 주세요.");
    const progress = { revision: result.lesson.revision, index: Number(input.index) };
    await changeStudy(actor, state => { state.musicProgress = { ...state.musicProgress, pretender: progress }; });
    // Only the cursor is persisted. Lyrics never enter expressions, public knowledge or model training.
    return conversationJson({ progress });
  } catch (error) { return conversationFailure(error); }
}
