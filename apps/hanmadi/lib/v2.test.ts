import test from "node:test";
import assert from "node:assert/strict";
import {
  isStudyLanguage,
  starterUnits,
  detectDirection,
  assessmentLevel,
  safePractice,
  emptyStudy,
  studyQueue,
} from "./v2";
import { expressionId } from "./v2-store";
for (const language of ["en", "ja", "th", "es"] as const) {
  test(`${language}: four levels and eight distinct situations with pronunciation aids`, () => {
    const units = starterUnits(language);
    assert.equal(units.length, 32);
    assert.equal(new Set(units.map((u) => u.id)).size, 32);
    for (const scene of new Set(units.map((u) => u.scene)))
      assert.deepEqual(
        units.filter((u) => u.scene === scene).map((u) => u.level),
        [1, 2, 3, 4],
      );
    assert(units.every((u) => safePractice(u.phrase)));
    assert.equal(new Set(units.map((u) => u.phrase.text)).size, 32);
  });
}
test("legacy Korean does not leak into four-language onboarding", () => {
  assert.equal(isStudyLanguage("ko"), false);
  assert.equal(isStudyLanguage("__proto__"), false);
});
test("mixed, short, unsupported and empty inputs require explicit direction", () => {
  for (const text of ["はい 네", "OK", "", "12345", "hello"])
    assert.equal(detectDirection(text, "ja"), "confirm");
  assert.equal(detectDirection("한국에서 왔어요", "ja"), "ko");
  assert.equal(detectDirection("韓国から来ました", "ja"), "ja");
  assert.equal(detectDirection("สวัสดีค่ะ", "th"), "th");
  assert.equal(detectDirection("Hola, gracias", "es"), "es");
});
test("practice recommendation is conservative for a novice regardless of quiz guessing", () => {
  assert.equal(assessmentLevel([0, 1, 2], 1), 1);
  assert.equal(assessmentLevel([0, 1, 2], 4), 4);
  assert.equal(assessmentLevel([3, 3, 3], 4), 1);
});
test("saved expressions start as due, never learned; queue isolates languages and matches level", () => {
  const state = emptyStudy();
  state.profiles.ja = { level: 2, minutes: 10, assessedAt: 0, practiced: {} };
  state.expressions = [
    {
      id: "a",
      language: "ja",
      text: "ありがとう",
      reading: "아리가토",
      meaning: "고마워요",
      source: "translation",
      createdAt: 1,
      dueAt: 1,
    },
    {
      id: "b",
      language: "es",
      text: "Hola",
      reading: "올라",
      meaning: "안녕",
      source: "chat",
      createdAt: 1,
      dueAt: 1,
    },
  ];
  const queue = studyQueue(state, "ja", starterUnits("ja"), 2);
  assert.deepEqual(
    queue.due.map((e) => e.id),
    ["a"],
  );
  assert.equal(queue.lessons.length, 2);
  assert(queue.lessons.every((u) => u.level === 2));
  assert.equal(state.expressions[0].practicedAt, undefined);
});
test("deduplication normalizes punctuation and width, but never crosses language", () => {
  const phrase = { text: "Hello!", meaning: "안녕", reading: "헬로" };
  assert.equal(
    expressionId("en", phrase),
    expressionId("en", { ...phrase, text: "Ｈｅｌｌｏ" }),
  );
  assert.notEqual(expressionId("en", phrase), expressionId("es", phrase));
});
test("private/contact-like material and malformed generated phrases are rejected", () => {
  for (const text of [
    "mail@example.com",
    "01012345678",
    "https://example.com",
    "www.example.com",
  ])
    assert.equal(safePractice({ text, reading: "발음", meaning: "뜻" }), false);
  assert.equal(
    safePractice({ text: "", reading: "발음", meaning: "뜻" }),
    false,
  );
});

test("help-needed lessons become next-day priority before unseen lessons", () => {
  const state = emptyStudy(),
    units = starterUnits("ja"),
    now = 10 * 86400000;
  state.profiles.ja = {
    level: 1,
    minutes: 5,
    assessedAt: 0,
    practiced: {
      [units[4].id]: { at: now - 2 * 86400000, confidence: "help" },
      [units[0].id]: { at: now, confidence: "alone" },
    },
  };
  assert.equal(studyQueue(state, "ja", units, now).lessons[0].id, units[4].id);
});
