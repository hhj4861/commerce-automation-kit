import assert from "node:assert/strict";
import { test } from "node:test";
import { learningProfile, studyPlan, adjustLevel, localDay, learningTask, type LearningEvent } from "./adaptive-learning";
import { assessmentQuestions, scoreAssessment } from "./learning-assessment";
import { difyUser, getConversationProvider, replyToConversation } from "./conversation-provider";
import { parseConversation, tutorPrompt } from "./conversation";

const now = Date.parse("2026-09-28T09:00:00Z");
const assessment: LearningEvent = { kind: "assessment", id: "a", at: now, level: "elementary", score: 4, minutes: 15, days: 5, timeZone: "Asia/Seoul" };
const feedback: LearningEvent = { kind: "feedback", id: "f", at: now + 1, assessmentId: "a", difficulty: "right" };
test("all language assessments score on the server and reject partial or malformed answers", () => {
  for (const language of ["ko", "ja", "th"] as const) {
    const questions = assessmentQuestions(language);
    assert.equal(questions.length, 6);
    assert.ok(questions.every(q => !Object.hasOwn(q, "answer")));
    const answers = Object.fromEntries(questions.map((q, i) => [q.id, i % 3]));
    assert.deepEqual(scoreAssessment(language, answers), { score: 6, level: "intermediate" });
    assert.deepEqual(scoreAssessment(language, Object.fromEntries(questions.map(q => [q.id, -1]))), { score: 0, level: "beginner" });
    assert.equal(scoreAssessment(language, { ...answers, reason: -1, situation: -1 }).level, "elementary");
    for (const bad of [null, [], {}, { ...answers, greeting: "0" }, { ...answers, greeting: 99 }, { ...answers, forged: 1 }]) assert.throws(() => scoreAssessment(language, bad));
  }
});
test("retakes isolate old feedback, chat counts and quiz history; input event order does not matter", () => {
  const events: LearningEvent[] = [assessment, feedback, { kind: "chat", id: "c", assessmentId: "a", at: now + 2, lessonId: "cafe" },
    { kind: "quiz", id: "q", assessmentId: "a", at: now + 3, lessonId: "cafe", correct: false }];
  const profile = learningProfile(events)!;
  assert.deepEqual(learningProfile([...events].reverse()), profile);
  assert.equal(profile.confirmed, true); assert.equal(profile.chatTurns, 1); assert.equal(profile.review[0].correct, false);
  const retaken = learningProfile([...events, { ...assessment, id: "b", at: now + 4, level: "beginner" }])!;
  assert.equal(retaken.confirmed, false); assert.equal(retaken.chatTurns, 0); assert.deepEqual(retaken.review, []);
  assert.equal(adjustLevel("beginner", "hard"), "beginner");
  assert.equal(adjustLevel("intermediate", "easy"), "intermediate");
  assert.equal(adjustLevel("elementary", "hard"), "beginner");
});
test("schedule respects learner time zone, time budget and weekly cadence across month boundaries", () => {
  assert.equal(localDay(Date.parse("2026-09-30T16:00:00Z"), "Asia/Seoul"), "2026-10-01");
  assert.equal(localDay(Date.parse("2026-09-30T16:00:00Z"), "America/Los_Angeles"), "2026-09-30");
  for (const days of [3, 5, 7] as const) for (const minutes of [10, 15, 20] as const) {
    const p = learningProfile([{ ...assessment, days, minutes }, feedback])!;
    const plan = studyPlan("ja", p, Date.parse("2026-09-30T16:00:00Z"));
    assert.equal(plan.length, days); assert.equal(new Set(plan.map(x => x.date)).size, days);
    assert.equal(plan[0].date, "2026-10-01"); assert.ok(plan.every(x => x.minutes === minutes && x.expressionMinutes < minutes));
    assert.ok(plan.at(-1)!.date <= "2026-10-07");
  }
});
test("wrong first attempts become next-day priority, successful practice gets spaced review, missed days create no backlog", () => {
  const p = learningProfile([assessment, feedback, { kind: "quiz", id: "q", assessmentId: "a", at: now, lessonId: "cafe", correct: false }])!;
  assert.equal(studyPlan("th", p, now + 86400000)[0].lessonId, "cafe");
  const recovered = learningProfile([assessment, feedback, { kind: "quiz", id: "q", assessmentId: "a", at: now, lessonId: "cafe", correct: false },
    { kind: "quiz", id: "q2", assessmentId: "a", at: now + 86400000, lessonId: "cafe", correct: true }])!;
  assert.deepEqual(recovered.completed, ["cafe"]); assert.equal(recovered.review[0].correct, true);
  assert.equal(studyPlan("th", recovered, now + 86400000)[0].lessonId, "cafe");
  assert.equal(studyPlan("th", recovered, now + 86400000)[0].done, true);
  assert.equal(studyPlan("th", p, now)[1].lessonId, "cafe");
  const later = studyPlan("th", recovered, now + 30 * 86400000);
  assert.equal(later.length, 5); assert.equal(later[0].date, "2026-10-28");
  assert.notEqual(learningTask("beginner", "cafe"), learningTask("intermediate", "cafe"));
});
test("all three levels reach both providers with matching learning tasks and distinct conversation scopes", async () => {
  const config = getConversationProvider({ CONVERSATION_PROVIDER: "dify", DIFY_BASE_URL: "https://dify.example", DIFY_API_KEY: "test", DIFY_USER_SECRET: "synthetic-secret-with-at-least-32-characters" });
  const users = new Set<string>();
  for (const level of ["beginner", "elementary", "intermediate"] as const) {
    const input = parseConversation({ language: "th", lessonId: "cafe", level, learningRevision: "r1", storageConsent: true, messages: [{ role: "user", content: "hello" }] });
    assert.match(tutorPrompt(input), /Difficulty guidance:/);
    users.add(difyUser("actor", input, "secret"));
    assert.notEqual(difyUser("actor", input, "secret"), difyUser("actor", { ...input, learningRevision: "r2" }, "secret"));
    await replyToConversation(input, "actor", config, async (_, init) => {
      const body = JSON.parse(String(init?.body));
      assert.ok(body.inputs.scenario.length <= 300);
      assert.match(body.inputs.scenario, /한글 발음과 한국어 뜻/);
      return Response.json({ answer: "สวัสดี", conversation_id: "12345678-1234-1234-1234-123456789abc" });
    });
  }
  assert.equal(users.size, 3);
});

test("changing the study budget preserves level, feedback, quiz history and conversation revision", () => {
  const quiz: LearningEvent = { kind: "quiz", id: "q", assessmentId: "a", at: now + 2, lessonId: "cafe", correct: true };
  const before = learningProfile([assessment, feedback, quiz], now + 100)!;
  const settings: LearningEvent = { kind: "settings", id: "s", at: now + 3, assessmentId: "a", minutes: 10, days: 3 };
  const after = learningProfile([assessment, feedback, quiz, settings], now + 100)!;
  assert.deepEqual(after, { ...before, minutes: 10, days: 3 });
  assert.equal(studyPlan("ja", after, now).length, 3);
  const retaken = learningProfile([assessment, feedback, quiz, settings, { ...assessment, id: "new", at: now + 4 }], now + 100)!;
  assert.equal(retaken.minutes, 15); assert.equal(retaken.days, 5);
});
