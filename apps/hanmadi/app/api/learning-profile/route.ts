import { reserveLearningAssessment } from "@/lib/store";
import { randomUUID } from "node:crypto";
import { isLanguage, getLesson } from "@/lib/courses";
import { ConversationError } from "@/lib/conversation";
import { assertConversationOrigin, conversationActor, conversationJson, conversationFailure, readConversationJson } from "@/lib/conversation-http";
import { readLearningProfile, recordLearningEvent } from "@/lib/learning-profile";
import { localDay, studyPlan, type Difficulty } from "@/lib/adaptive-learning";
import { scoreAssessment } from "@/lib/learning-assessment";
export const runtime = "nodejs";
export async function POST(req: Request) {
  try {
    assertConversationOrigin(req);
    const raw = await readConversationJson(req);
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new ConversationError(400, "학습 정보를 확인해 주세요.");
    const b = raw as Record<string, unknown>;
    if (!isLanguage(b.language)) throw new ConversationError(400, "학습 언어를 선택해 주세요.");
    const language = b.language;
    const actor = await conversationActor(b.studentSlug);
    const now = Date.now();
    let saved = true;
    if (b.action === "assess") {
      if (![10, 15, 20].includes(b.minutes as number) || ![3, 5, 7].includes(b.days as number) || typeof b.timeZone !== "string" || b.timeZone.length > 80)
        throw new ConversationError(400, "학습 시간과 요일 수를 선택해 주세요.");
      let result;
      try { localDay(now, b.timeZone); result = scoreAssessment(language, b.answers); }
      catch (e) { throw new ConversationError(400, e instanceof RangeError ? "시간대를 확인해 주세요." : (e as Error).message); }
      if (!(await reserveLearningAssessment(actor))) throw new ConversationError(429, "오늘 레벨 체크를 여러 번 했어요. 저장된 결과로 연습하고 내일 다시 체크해 주세요.");
      await recordLearningEvent(actor, language, { kind: "assessment", id: randomUUID(), at: now, ...result,
        minutes: b.minutes as 10 | 15 | 20, days: b.days as 3 | 5 | 7, timeZone: b.timeZone });
    } else {
      const profile = await readLearningProfile(actor, language);
      if (!profile) throw new ConversationError(428, "먼저 레벨 체크를 마쳐 주세요.");
      if (b.assessmentId !== profile.assessmentId || b.revision !== profile.revision)
        throw new ConversationError(409, "다른 화면에서 학습 설정이 바뀌었어요. 새로고침해 주세요.");
      if (b.action === "settings") {
        if (![10, 15, 20].includes(b.minutes as number) || ![3, 5, 7].includes(b.days as number))
          throw new ConversationError(400, "학습 시간과 요일 수를 선택해 주세요.");
        await recordLearningEvent(actor, language, { kind: "settings", id: randomUUID(), at: now, assessmentId: profile.assessmentId,
          minutes: b.minutes as 10 | 15 | 20, days: b.days as 3 | 5 | 7 });
      } else if (b.action === "feedback") {
        if (!["easy", "right", "hard"].includes(b.difficulty as string)) throw new ConversationError(400, "체감 난이도를 선택해 주세요.");
        if (profile.todayChatTurns < 2) throw new ConversationError(400, "오늘 AI와 두 번 대화한 뒤 난이도를 알려 주세요.");
        saved = await recordLearningEvent(actor, language, { kind: "feedback", id: `feedback:${profile.assessmentId}:${localDay(now, profile.timeZone)}`, at: now,
          assessmentId: profile.assessmentId, difficulty: b.difficulty as Difficulty });
      } else if (b.action === "quiz") {
        const lesson = typeof b.lessonId === "string" ? getLesson(language, b.lessonId) : null;
        if (!profile.confirmed || !lesson || typeof b.answer !== "number" || !Number.isInteger(b.answer) || b.answer < 0 || b.answer >= lesson.quiz.choices.length)
          throw new ConversationError(400, "확인 문제의 답을 선택해 주세요.");
        saved = await recordLearningEvent(actor, language, { kind: "quiz", id: `quiz:${profile.assessmentId}:${lesson.id}:${localDay(now, profile.timeZone)}`, at: now,
          assessmentId: profile.assessmentId, lessonId: lesson.id, correct: b.answer === lesson.quiz.answer });
      } else throw new ConversationError(400, "지원하지 않는 학습 요청이에요.");
    }
    const profile = (await readLearningProfile(actor, language))!;
    return conversationJson({ profile, plan: studyPlan(language, profile), saved });
  } catch (error) { return error instanceof ConversationError ? conversationFailure(error) : conversationJson({ error: "학습 기록을 저장하지 못했어요. 잠시 후 다시 시도해 주세요." }, 503); }
}
