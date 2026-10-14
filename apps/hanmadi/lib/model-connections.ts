import { ConversationError } from "./conversation";

/** Cached clients must not silently switch a retired personal model to Gemini. */
export function assertDefaultModel(selection: string = "default") {
  if (selection !== "default")
    throw new ConversationError(409, "개인 AI 연결은 종료됐어요. AI 설정에서 기본 Gemini를 선택해 주세요.");
}
