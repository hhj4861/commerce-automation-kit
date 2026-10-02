import { LiteLLMError } from "@cak/litellm-client";
import { ConversationError } from "./conversation";

export type StudyFailure = "unavailable" | "rate-limit" | "authentication" | "timeout";
export class StudyAIError extends ConversationError {
  constructor(public reason: StudyFailure, status: number, message: string) {
    super(status, message);
  }
}
// Only safe categories survive the server boundary; never expose upstream text or credentials.
export function studyAIError(error: unknown): ConversationError {
  if (error instanceof LiteLLMError) {
    if (error.code === "upstream_error" && error.status === 503)
      return new StudyAIError("unavailable", 503, "AI 제공자가 일시적으로 응답하지 못하고 있어요. 잠시 후 다시 시도해 주세요.");
    if (error.code === "quota_exceeded")
      return new StudyAIError("rate-limit", 429, "AI 사용량 제한에 도달했어요. 잠시 후 다시 시도해 주세요.");
    if (error.code === "authentication_failed")
      return new StudyAIError("authentication", 502, "AI 연결 인증을 확인해야 해요. 관리자에게 문의해 주세요.");
    if (error.code === "timeout")
      return new StudyAIError("timeout", 504, "AI 응답 시간이 초과됐어요. 잠시 후 다시 시도해 주세요.");
  }
  return new ConversationError(502, "AI 응답을 받지 못했어요. 내용은 저장되지 않았어요. 다시 시도해 주세요.");
}
// Shares the existing two-call validation budget: never retry auth, quota, cancellation or ambiguous network failures.
export async function studyAttempt(call: () => Promise<string>, attempt: number): Promise<string | null> {
  try { return await call(); }
  catch (error) {
    if (attempt !== 0 || !(error instanceof StudyAIError) || error.reason !== "unavailable") throw error;
    await new Promise(resolve => setTimeout(resolve, 1000));
    return null;
  }
}
