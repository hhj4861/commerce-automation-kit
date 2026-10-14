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
  try { await owner(); return conversationJson({ songs: await readMusic() }); }
  catch (error) { return conversationFailure(error); }
}
export async function POST(req: Request) {
  try {
    assertConversationOrigin(req); const actor = await owner();
    const b = await readConversationJson(req) as Record<string, unknown>;
    if (!b || typeof b !== "object") throw new ConversationError(400, "곡을 선택해 주세요.");
    const song = b.action === "save" ? await saveMusic(b) : b.action === "generate" ? await buildMusic(b.id, b.revision) :
      ["publish", "unpublish"].includes(String(b.action)) ? await publishMusic(b, actor) : null;
    if (!song) throw new ConversationError(400, "음악 관리 작업을 선택해 주세요.");
    return conversationJson({ song });
  } catch (error) { return conversationFailure(error); }
}
