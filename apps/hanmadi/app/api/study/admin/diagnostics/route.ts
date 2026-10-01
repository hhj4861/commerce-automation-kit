import { getConversationTutor } from "@/lib/conversation-access";
import { ConversationError } from "@/lib/conversation";
import { assertConversationOrigin, conversationFailure, conversationJson, readConversationJson } from "@/lib/conversation-http";
import { diagnostics, executeDiagnostic } from "@/lib/llm-diagnostics-store";
import { isStudyLanguage } from "@/lib/v2";
export const runtime = "nodejs";
export const maxDuration = 300;
async function owner() {
  if ((await getConversationTutor())?.r !== "owner") throw new ConversationError(403, "소유자 계정으로 로그인해 주세요.");
}
export async function GET() {
  try {
    await owner();
    return conversationJson({ languages: await diagnostics().list(), checkedAt: Date.now(),
      scheduleConfigured: process.env.HANMADI_DIAGNOSTICS_ENABLED === "true" && (process.env.CRON_SECRET?.length ?? 0) >= 32 });
  } catch (e) { return conversationFailure(e); }
}
export async function POST(req: Request) {
  try {
    assertConversationOrigin(req); await owner();
    const body = await readConversationJson(req) as Record<string, unknown>;
    if (!body || !isStudyLanguage(body.language)) throw new ConversationError(400, "진단할 언어를 선택해 주세요.");
    const language = body.language;
    return conversationJson(await diagnostics().run(language, "manual", () => executeDiagnostic(language)));
  } catch (e) { return conversationFailure(e); }
}
