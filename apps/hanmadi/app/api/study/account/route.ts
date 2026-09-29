import { learnerLogin, learnerLogout, studyIdentity } from "@/lib/learner-auth";
import {
  assertConversationOrigin,
  conversationJson,
  conversationFailure,
  readConversationJson,
} from "@/lib/conversation-http";
import { ConversationError } from "@/lib/conversation";
export const runtime = "nodejs";
export async function GET() {
  try {
    return conversationJson(await studyIdentity());
  } catch (e) {
    return conversationFailure(e);
  }
}
export async function POST(req: Request) {
  try {
    assertConversationOrigin(req);
    const b = (await readConversationJson(req)) as Record<string, unknown>;
    if (b?.action === "logout") {
      await learnerLogout();
      return conversationJson({ ok: true });
    }
    if (
      !b ||
      !["signup", "login"].includes(String(b.action)) ||
      typeof b.name !== "string" ||
      typeof b.password !== "string"
    )
      throw new ConversationError(400, "로그인 정보를 확인해 주세요.");
    return conversationJson(
      await learnerLogin(
        b.action as "signup" | "login",
        b.name.trim().toLowerCase(),
        b.password,
      ),
    );
  } catch (e) {
    return conversationFailure(e);
  }
}
