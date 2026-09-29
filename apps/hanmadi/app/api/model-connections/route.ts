import {
  accountIdentity,
  accountRequest,
  publicConnections,
} from "@/lib/model-connections";
import {
  assertConversationOrigin,
  conversationFailure,
  conversationJson,
  readConversationJson,
} from "@/lib/conversation-http";
import { ConversationError } from "@/lib/conversation";
export const runtime = "nodejs";
export const maxDuration = 15;

export async function GET() {
  try {
    const identity = await accountIdentity();
    return conversationJson({
      connections: publicConnections(
        await accountRequest(identity, "/connections"),
      ),
    });
  } catch (error) {
    return conversationFailure(error);
  }
}

export async function POST(req: Request) {
  try {
    assertConversationOrigin(req);
    const identity = await accountIdentity();
    const input = (await readConversationJson(req)) as {
      action?: unknown;
      id?: unknown;
      code?: unknown;
      provider?: unknown;
      apiKey?: unknown;
      authMethod?: unknown;
    };
    if (input?.action === "authorize") {
      if (
        typeof input.id !== "string" ||
        !/^[a-f0-9]{32}$/.test(input.id) ||
        typeof input.code !== "string" ||
        !/^[A-Za-z0-9_-]{10,1000}#[A-Za-z0-9_-]{20,200}$/.test(input.code)
      )
        throw new ConversationError(
          400,
          "Claude 인증창에서 받은 승인코드 전체를 붙여넣어 주세요.",
        );
      await accountRequest(
        identity,
        "/connections/" + input.id + "/authorize",
        "POST",
        { code: input.code },
      );
      return conversationJson({ ok: true }, 202);
    }
    if (!input || !["codex", "claude"].includes(String(input.provider)))
      throw new ConversationError(400, "연결할 AI를 선택해 주세요.");
    if (
      input.authMethod !== undefined &&
      !["claude-code", "api-key"].includes(String(input.authMethod))
    )
      throw new ConversationError(400, "지원하지 않는 인증 방식이에요.");
    const native =
      input.provider === "claude" && input.authMethod === "claude-code";
    if (native && input.apiKey !== undefined)
      throw new ConversationError(
        400,
        "Claude 계정 로그인에는 API 키를 보내지 마세요.",
      );
    if (input.provider === "codex" && input.authMethod !== undefined)
      throw new ConversationError(
        400,
        "Codex는 공식 로그인 화면에서 연결해 주세요.",
      );
    if (
      input.provider === "claude" &&
      !native &&
      (typeof input.apiKey !== "string" ||
        !/^sk-ant-api[A-Za-z0-9_-]{20,500}$/.test(input.apiKey))
    )
      throw new ConversationError(
        400,
        "Claude API 키를 입력해 주세요. 구독 토큰은 사용할 수 없어요.",
      );
    if (input.provider === "codex" && input.apiKey !== undefined)
      throw new ConversationError(
        400,
        "Codex는 공식 로그인 화면에서 연결해 주세요.",
      );
    const result = await accountRequest(identity, "/connections", "POST", {
      provider: input.provider,
      ...(native
        ? { authMethod: "claude-code" }
        : input.provider === "claude"
          ? { apiKey: input.apiKey }
          : {}),
    });
    return conversationJson(
      { connection: publicConnections({ connections: [result] })[0] },
      202,
    );
  } catch (error) {
    return conversationFailure(error);
  }
}

export async function DELETE(req: Request) {
  try {
    assertConversationOrigin(req);
    const identity = await accountIdentity();
    const input = (await readConversationJson(req)) as { id?: unknown };
    if (typeof input?.id !== "string" || !/^[a-f0-9]{32}$/.test(input.id))
      throw new ConversationError(400, "연결 정보를 확인해 주세요.");
    await accountRequest(identity, "/connections/" + input.id, "DELETE");
    return conversationJson({ ok: true });
  } catch (error) {
    return conversationFailure(error);
  }
}
