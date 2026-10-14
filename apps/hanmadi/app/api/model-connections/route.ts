import { assertConversationOrigin, conversationFailure, conversationJson } from "@/lib/conversation-http";
export const runtime = "nodejs";

// Tombstone for cached clients. Never read or forward credentials from the body.
function retired() {
  return conversationJson({ error: "개인 AI 연결은 종료됐어요. 새로고침한 뒤 기본 Gemini로 연습해 주세요." }, 410);
}
export async function GET() { return retired(); }
export async function POST(req: Request) {
  try { assertConversationOrigin(req); return retired(); }
  catch (error) { return conversationFailure(error); }
}
export async function DELETE(req: Request) {
  try { assertConversationOrigin(req); return retired(); }
  catch (error) { return conversationFailure(error); }
}
