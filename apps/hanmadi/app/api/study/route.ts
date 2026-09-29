import { lessonPhrases } from "@/lib/v2-lesson";
import { studyIdentity } from "@/lib/learner-auth";
import {
  assertConversationOrigin,
  conversationJson,
  conversationFailure,
  readConversationJson,
  reserveRequest,
} from "@/lib/conversation-http";
import { ConversationError } from "@/lib/conversation";
import {
  readStudy,
  changeStudy,
  saveExpression,
  publishedUnits,
} from "@/lib/v2-store";
import {
  isStudyLanguage,
  isLevel,
  detectDirection,
  assessmentLevel,
  starterUnits,
  curriculum,
} from "@/lib/v2";
import { roleplayReply, translate, parsePhrase } from "@/lib/v2-ai";
export const runtime = "nodejs";
export const maxDuration = 90;
export async function GET() {
  try {
    const identity = await studyIdentity();
    const [state, units] = await Promise.all([
      readStudy(identity.actor),
      publishedUnits(),
    ]);
    return conversationJson({ identity, state, units });
  } catch (e) {
    return conversationFailure(e);
  }
}
export async function POST(req: Request) {
  try {
    assertConversationOrigin(req);
    const { actor } = await studyIdentity();
    const b = (await readConversationJson(req)) as Record<string, unknown>;
    if (!b || typeof b.action !== "string")
      throw new ConversationError(400, "요청을 확인해 주세요.");
    if (b.action === "settings") {
      if (
        (b.autoSave !== undefined && typeof b.autoSave !== "boolean") ||
        (b.language !== undefined && !isStudyLanguage(b.language))
      )
        throw new ConversationError(400, "학습 설정을 확인해 주세요.");
      return conversationJson({
        state: await changeStudy(actor, (s) => {
          if (typeof b.autoSave === "boolean") {
            s.autoSave = b.autoSave;
            s.saveEpoch++;
          }
          if (isStudyLanguage(b.language)) s.language = b.language;
        }),
      });
    }
    if (b.action === "delete") {
      if (typeof b.id !== "string")
        throw new ConversationError(400, "삭제할 표현을 선택해 주세요.");
      return conversationJson({
        state: await changeStudy(actor, (s) => {
          s.expressions = s.expressions.filter((e) => e.id !== b.id);
          s.saveEpoch++;
        }),
      });
    }
    if (!isStudyLanguage(b.language))
      throw new ConversationError(400, "학습 언어를 선택해 주세요.");
    const language = b.language;
    if (b.action === "assess") {
      if (
        !Array.isArray(b.answers) ||
        b.answers.length !== 3 ||
        !b.answers.every((a) => Number.isInteger(a) && a >= 0 && a <= 3) ||
        !isLevel(b.confidence) ||
        ![5, 10, 15].includes(Number(b.minutes))
      )
        throw new ConversationError(400, "레벨 체크를 마쳐 주세요.");
      const level = assessmentLevel(
        b.answers as number[],
        Number(b.confidence),
      );
      return conversationJson({
        state: await changeStudy(actor, (s) => {
          s.language = language;
          s.profiles[language] = {
            level,
            minutes: Number(b.minutes),
            assessedAt: Date.now(),
            practiced: s.profiles[language]?.practiced ?? {},
            completedLessons: s.profiles[language]?.completedLessons ?? {},
          };
        }),
      });
    }
    if (b.action === "level") {
      if (!isLevel(b.level) || ![5, 10, 15].includes(Number(b.minutes)))
        throw new ConversationError(400, "연습 난이도와 시간을 선택해 주세요.");
      return conversationJson({
        state: await changeStudy(actor, (s) => {
          const p = s.profiles[language];
          if (!p)
            throw new ConversationError(409, "먼저 레벨 체크를 해 주세요.");
          p.level = Number(b.level);
          p.minutes = Number(b.minutes);
        }),
      });
    }
    if (b.action === "completeLesson") {
      const units = [...starterUnits(language), ...(await publishedUnits())];
      const unit = units.find((u) => u.id === b.id && u.language === language);
      if (!unit)
        throw new ConversationError(404, "학습할 수업을 다시 선택해 주세요.");
      const phrases = lessonPhrases(unit).length;
      return conversationJson({
        state: await changeStudy(actor, (s) => {
          const profile = s.profiles[language];
          if (!profile)
            throw new ConversationError(409, "먼저 레벨 체크를 해 주세요.");
          const completed = profile.completedLessons ?? {};
          if (!completed[unit.id] && Object.keys(completed).length >= 2000)
            throw new ConversationError(409, "학습 기록 한도에 도달했어요.");
          completed[unit.id] = { at: Date.now(), phrases };
          profile.completedLessons = completed;
        }),
      });
    }
    if (b.action === "practice") {
      if (
        typeof b.id !== "string" ||
        !["help", "alone"].includes(String(b.confidence))
      )
        throw new ConversationError(400, "연습한 표현을 선택해 주세요.");
      const units = [...starterUnits(language), ...(await publishedUnits())];
      return conversationJson({
        state: await changeStudy(actor, (s) => {
          const expression = s.expressions.find(
              (e) => e.id === b.id && e.language === language,
            ),
            profile = s.profiles[language];
          const confidence = b.confidence as "help" | "alone",
            at = Date.now();
          if (expression) {
            expression.practicedAt = at;
            expression.confidence = confidence;
            expression.dueAt = at + (confidence === "help" ? 1 : 3) * 86400000;
          } else if (
            profile &&
            units.some((u) => u.id === b.id && u.language === language)
          ) {
            if (
              Object.keys(profile.practiced).length >= 2000 &&
              !profile.practiced[b.id as string]
            )
              throw new ConversationError(409, "연습 기록 한도에 도달했어요.");
            profile.practiced[b.id as string] = { at, confidence };
          } else
            throw new ConversationError(
              404,
              "연습할 표현을 다시 선택해 주세요.",
            );
        }),
      });
    }
    const before = await readStudy(actor);
    if (b.action === "translate") {
      if (
        typeof b.text !== "string" ||
        !b.text.trim() ||
        b.text.length > 1000 ||
        !["auto", "ko", language].includes(String(b.from))
      )
        throw new ConversationError(
          400,
          "번역할 내용을 1~1,000자로 입력해 주세요.",
        );
      const from =
        b.from === "auto"
          ? detectDirection(b.text, language)
          : (b.from as string);
      if (from === "confirm")
        return conversationJson({ needsConfirmation: true });
      await reserveRequest(actor, "chat");
      const result = await translate(b.text.trim(), language, from);
      const saved = result.practice
        ? await saveExpression(
            actor,
            language,
            result.practice,
            "translation",
            before.saveEpoch,
          )
        : { saved: false, state: await readStudy(actor) };
      return conversationJson({ ...result, from, ...saved });
    }
    if (b.action === "save-chat") {
      const phrase = parsePhrase(b.phrase);
      // Explicit selection only; chat history is never silently persisted.
      return conversationJson(
        await saveExpression(actor, language, phrase, "chat", before.saveEpoch),
      );
    }
    if (b.action === "chat") {
      const profile = before.profiles[language];
      if (!profile)
        throw new ConversationError(409, "먼저 레벨 체크를 해 주세요.");
      if (
        !curriculum.scenes.some((s) => s.id === b.scene) ||
        !Array.isArray(b.messages) ||
        b.messages.length < 1 ||
        b.messages.length > 19 ||
        b.messages.length % 2 !== 1
      )
        throw new ConversationError(
          400,
          "상황을 고르거나 새 대화를 시작해 주세요.",
        );
      const messages = b.messages as {
        role: "user" | "assistant";
        content: string;
      }[];
      if (
        messages.some(
          (m, i) =>
            !m ||
            m.role !== (i % 2 ? "assistant" : "user") ||
            typeof m.content !== "string" ||
            !m.content.trim() ||
            m.content.length > 2000,
        ) ||
        JSON.stringify(messages).length > 16000
      )
        throw new ConversationError(
          400,
          "대화가 길어졌어요. 새 대화를 시작해 주세요.",
        );
      const selection = b.selection ?? "default";
      if (
        typeof selection !== "string" ||
        (selection !== "default" &&
          !/^[a-f0-9]{32}:[a-zA-Z0-9.-]{1,100}$/.test(selection))
      )
        throw new ConversationError(400, "AI 모델을 선택해 주세요.");
      await reserveRequest(actor, "chat");
      return conversationJson({
        reply: await roleplayReply(
          language,
          profile.level,
          String(b.scene),
          messages,
          selection,
        ),
      });
    }
    throw new ConversationError(400, "지원하지 않는 요청이에요.");
  } catch (e) {
    return conversationFailure(e);
  }
}
