import { learnerSession } from "@/lib/learner-auth";
import { authorizeMobile, exchangeMobile, revokeMobileSession, mobileEnabled } from "@/lib/mobile-auth";
import { assertConversationOrigin, conversationFailure, conversationJson, readConversationJson } from "@/lib/conversation-http";
import { assertStudyClientOrigin } from "@/lib/study-client-origin";
import { ConversationError } from "@/lib/conversation";
import { transientStore } from "@/lib/transient-store";
import { createHash } from "node:crypto";
export const runtime = "nodejs";
export async function POST(req: Request) {
  try {
    if (!mobileEnabled()) throw new ConversationError(503, "앱 로그인을 준비 중이에요.");
    const b = await readConversationJson(req) as Record<string, unknown>;
    if (b?.action === "exchange") {
      // No cookie authority here: only a short-lived, one-use PKCE code can issue a learner token.
      if (req.headers.has("origin")) assertConversationOrigin(req);
      const store = transientStore(), ip = createHash("sha256").update(req.headers.get("x-forwarded-for")?.split(",")[0] || "unknown").digest("hex");
      if (!await store.claim(`mobile-exchange-rate:${ip}:${Math.floor(Date.now() / 1000)}`, "used", 2)) throw new ConversationError(429, "잠시 후 다시 시도해 주세요.");
      return conversationJson(await exchangeMobile(b.code, b.verifier, b.state, store));
    }
    if (b?.action === "authorize") {
      assertConversationOrigin(req);
      const account = await learnerSession();
      if (!account) throw new ConversationError(401, "학습자 계정으로 로그인해 주세요.");
      return conversationJson(await authorizeMobile(account, b.challenge, b.state));
    }
    if (b?.action === "logout") {
      await assertStudyClientOrigin(req);
      await revokeMobileSession(req.headers.get("authorization"));
      return conversationJson({ ok: true });
    }
    throw new ConversationError(400, "로그인 요청을 확인해 주세요.");
  } catch (e) { return conversationFailure(e); }
}
