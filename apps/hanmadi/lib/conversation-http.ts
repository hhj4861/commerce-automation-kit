import { createHash } from "node:crypto";
import { ConversationError } from "./conversation";
import { getConversationTutor } from "./conversation-access";
import { getStoredStudent, reserveConversationTurn } from "./store";

export function assertConversationOrigin(req: Request) {
  const expected = new URL(req.url);
  // Next dev normalizes req.url to localhost; Host preserves the browser's actual origin.
  if (req.headers.get("host")) expected.host = req.headers.get("host")!;
  if (req.headers.get("origin") !== expected.origin)
    throw new ConversationError(403, "한마디 화면에서 다시 시도해 주세요.");
}
export async function readLimitedBody(
  req: Request | Response,
  limit: number,
): Promise<Uint8Array> {
  const reader = req.body?.getReader();
  if (!reader) throw new ConversationError(400, "내용을 입력해 주세요.");
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > limit) {
        await reader.cancel();
        throw new ConversationError(
          413,
          "내용이 너무 커요. 더 짧게 보내 주세요.",
        );
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  return Buffer.concat(chunks);
}
export async function readConversationJson(req: Request): Promise<unknown> {
  if (!req.headers.get("content-type")?.startsWith("application/json"))
    throw new ConversationError(415, "요청 형식이 올바르지 않아요.");
  const bytes = await readLimitedBody(req, 64000);
  try {
    return JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    throw new ConversationError(400, "요청 형식이 올바르지 않아요.");
  }
}
export async function conversationActor(
  studentSlug?: unknown,
): Promise<string> {
  if (
    studentSlug !== undefined &&
    (typeof studentSlug !== "string" ||
      !/^[a-zA-Z0-9가-힣_-]{1,100}$/.test(studentSlug))
  )
    throw new ConversationError(400, "학생 링크를 확인해 주세요.");
  const tutor = await getConversationTutor();
  const student =
    !tutor && studentSlug
      ? await getStoredStudent(studentSlug as string)
      : null;
  if (!tutor && !student)
    throw new ConversationError(
      401,
      "튜터로 로그인하거나 튜터에게 받은 학생 포털에서 열어 주세요.",
    );
  return createHash("sha256")
    .update(
      tutor ? `tutor:${tutor.tid ?? tutor.n}` : `student:${student!.slug}`,
    )
    .digest("hex");
}
export async function reserveRequest(
  actor: string,
  kind: "chat" | "transcribe" | "speech",
) {
  if (!(await reserveConversationTurn(actor, kind)))
    throw new ConversationError(
      429,
      "오늘의 AI 사용량을 다 썼어요. 내일 다시 연습해 주세요.",
    );
}
export const conversationJson = (data: unknown, status = 200) =>
  Response.json(data, { status, headers: { "Cache-Control": "no-store" } });
export function conversationFailure(error: unknown) {
  if (error instanceof ConversationError)
    return conversationJson({ error: error.message }, error.status);
  return conversationJson(
    { error: "회화를 시작할 수 없어요. 잠시 후 다시 시도해 주세요." },
    503,
  );
}
