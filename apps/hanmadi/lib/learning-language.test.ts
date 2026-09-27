import test from "node:test";
import assert from "node:assert/strict";
import { resolveLearningLanguage, learningDestination, languageSelectionHref } from "./learning-language";
import { courses, koreanReadings } from "./courses";
import { tutorPrompt, parseConversation } from "./conversation";

test("selection has no implicit Korean fallback and survives query-free navigation", () => {
  assert.equal(resolveLearningLanguage(undefined, undefined), undefined);
  assert.equal(resolveLearningLanguage(undefined, "th"), "th");
  assert.equal(resolveLearningLanguage("ja", "th"), "ja");
  assert.equal(resolveLearningLanguage("invalid", "ja"), "ja");
  assert.equal(resolveLearningLanguage("constructor", "unknown"), undefined);
});
test("language selection preserves only valid learning context and cannot redirect off-site", () => {
  assert.equal(learningDestination("/conversation?language=ko&lesson=cafe&s=student-a", "th"), "/conversation?s=student-a&lesson=cafe&language=th");
  for (const path of ["//evil.example", "/\\evil.example", "https://evil.example", "/admin/tutors", "/login", "/api/auth", "/conversation/../../admin", "javascript:alert(1)"])
    assert.equal(learningDestination(path, "ja"), "/learn?language=ja");
  assert.equal(learningDestination("/learn?s=../bad&injected=1", "ja"), "/learn?language=ja");
  assert.equal(new URL(languageSelectionHref("/conversation?s=student-a&lesson=cafe"), "https://test.invalid").searchParams.get("from"), "/conversation?s=student-a&lesson=cafe");
});
test("all Thai and Japanese lesson phrases and quiz options have Hangul reading aids", () => {
  for (const language of ["ja", "th"] as const) for (const lesson of courses[language]) {
    for (const phrase of lesson.phrases) {
      assert.match(phrase.koreanReading ?? "", /[가-힣]/, phrase.text);
      assert.ok(!/[ぁ-ヿ一-龯\u0e00-\u0e7f]/.test(phrase.koreanReading!), phrase.text);
      assert.notEqual(phrase.reading, phrase.koreanReading);
    }
    for (const choice of lesson.quiz.choices) assert.match(koreanReadings[choice] ?? "", /[가-힣]/, choice);
  }
});
test("the direct provider prompts actual target-language turns with pronunciation aids", () => {
  for (const language of ["ja", "th"] as const) {
    const input = parseConversation({ language, lessonId: "cafe", level: "beginner", messages: [{role:"user",content:"안녕"}] });
    const prompt = tutorPrompt(input);
    assert.ok(prompt.includes(courses[language][1].phrases[0].koreanReading!));
    assert.match(prompt, /IN THE TARGET LANGUAGE/);
    assert.match(prompt, /Hangul pronunciation/);
  }
});
