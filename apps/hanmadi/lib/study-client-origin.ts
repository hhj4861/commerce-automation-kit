import { assertConversationOrigin } from "./conversation-http";
import { mobileSession } from "./mobile-auth";
import { ConversationError } from "./conversation";
// Only the three learner endpoints use this boundary. All other browser/admin guards stay unchanged.
const paths = new Set(["/api/study", "/api/study/audio", "/api/study/practice-music", "/api/study/client-auth"]);
export async function assertStudyClientOrigin(req: Request) {
  if (!req.headers.has("origin") && paths.has(new URL(req.url).pathname) && req.headers.has("authorization")) {
    // Verify signature, expiry AND shared-store revocation BEFORE granting access.
    if (!await mobileSession(req.headers.get("authorization"))) throw new ConversationError(401, "앱 로그인이 만료됐어요. 다시 로그인해 주세요.");
    return;
  }
  assertConversationOrigin(req);
}
