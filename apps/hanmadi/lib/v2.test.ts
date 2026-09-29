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

test("each language, scene and level has ten distinct lesson phrases", async () => {
  const { lessonPhrases } = await import("./v2-lesson");
  for (const language of ["ja", "th", "en", "es"] as const) {
    for (const unit of starterUnits(language)) {
      const phrases = lessonPhrases(unit);
      assert.equal(phrases.length, 10, unit.id);
      assert.deepEqual(phrases[0], unit.phrase);
      assert.equal(new Set(phrases.map((p) => p.text)).size, 10);
      for (const phrase of phrases)
        assert.ok(phrase.text && phrase.reading && phrase.meaning);
    }
  }
});

test("lesson completion schedules review without claiming speaking proficiency", () => {
  const state = emptyStudy(),
    units = starterUnits("ja"),
    now = 10 * 86400000;
  state.profiles.ja = {
    level: 1,
    minutes: 5,
    assessedAt: 0,
    practiced: {},
    completedLessons: { [units[0].id]: { at: now, phrases: 10 } },
  };
  assert.notEqual(
    studyQueue(state, "ja", units, now).lessons[0].id,
    units[0].id,
  );
  assert.deepEqual(state.profiles.ja.practiced, {});
});

test("club levels have forty different speaking expressions per language, with distinct goals and stable lesson IDs", async () => {
  const { lessonPhrases, lessonPlan } = await import("./v2-lesson");
  const normalize = (value: string) =>
    value
      .normalize("NFKC")
      .replace(/[\s\p{P}]/gu, "")
      .toLowerCase();
  for (const language of ["ja", "th", "en", "es"] as const) {
    const units = starterUnits(language).filter(
      (unit) => unit.scene === "club",
    );
    const phrases = units.flatMap(lessonPhrases);
    assert.deepEqual(
      units.map((u) => u.id),
      [1, 2, 3, 4].map((n) => `starter:${language}:club:${n}`),
    );
    assert.equal(phrases.length, 40);
    assert.equal(
      new Set(phrases.map((p) => normalize(p.text))).size,
      40,
      `${language}: cross-level reuse`,
    );
    assert.equal(new Set(phrases.map((p) => normalize(p.meaning))).size, 40);
    assert.equal(new Set(units.map((u) => lessonPlan(u)?.goal)).size, 4);
    for (const unit of units) {
      const plan = lessonPlan(unit)!;
      assert.equal(plan.cues.length, 10);
      assert.equal(plan.title, unit.title);
      for (const phrase of lessonPhrases(unit)) {
        assert(safePractice(phrase), `${unit.id}: invalid phrase`);
        assert.match(phrase.reading, /[가-힣]/);
        assert(!/[a-zぁ-ゖァ-ヺ一-龯ก-๛]/i.test(phrase.reading));
      }
    }
    const meanings = units.map((u) =>
      lessonPhrases(u)
        .map((p) => p.meaning)
        .join(" "),
    );
    assert.match(meanings[0], /물 한 잔/);
    assert.match(meanings[1], /어떤 음악.*댄스 음악/);
    assert.match(meanings[2], /있어서|이유|하지만/);
    assert.match(meanings[3], /고맙지만|다시 확인|안 오면/);
  }
  const units = starterUnits("en").filter((u) => u.scene === "club");
  const averageWords = units.map(
    (u) =>
      lessonPhrases(u).reduce((n, p) => n + p.text.split(/\s+/).length, 0) / 10,
  );
  assert(averageWords[2] > averageWords[0] * 1.5);
  assert(averageWords[3] > averageWords[2]);
  assert.equal(lessonPlan({ ...units[3], source: "admin" }), undefined);
});
