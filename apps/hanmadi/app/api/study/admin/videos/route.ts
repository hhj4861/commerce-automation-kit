import { getConversationTutor } from "@/lib/conversation-access";
import { ConversationError } from "@/lib/conversation";
import {
  assertConversationOrigin,
  conversationFailure,
  conversationJson,
  readConversationJson,
} from "@/lib/conversation-http";
import {
  createVideoBatch,
  getVideoBatch,
  processVideo,
} from "@/lib/video-ingestion";
export const runtime = "nodejs";
export const maxDuration = 150;
export async function POST(req: Request) {
  try {
    assertConversationOrigin(req);
    if ((await getConversationTutor())?.r !== "owner")
      throw new ConversationError(403, "소유자 계정으로 로그인해 주세요.");
    const b = (await readConversationJson(req)) as Record<string, unknown>;
    if (b?.action === "prepare")
      return conversationJson(await createVideoBatch(b));
    if (b?.action !== "process" || typeof b.videoId !== "string")
      throw new ConversationError(400, "영상 분석 작업을 확인해 주세요.");
    const batch = await getVideoBatch(b.batchId);
    if (!batch.ids.includes(b.videoId))
      throw new ConversationError(400, "준비 목록에 없는 영상이에요.");
    const result = await processVideo(b.videoId, batch.settings);
    return conversationJson(result, result.state === "running" ? 202 : 200);
  } catch (e) {
    return conversationFailure(e);
  }
}
