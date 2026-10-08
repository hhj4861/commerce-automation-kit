import test from "node:test";
import assert from "node:assert/strict";
import { musicLesson, musicUnits, pretender } from "./v2-music";
import { lessonPhrases, lessonPlan } from "./v2-lesson";
import { safePractice, starterUnits, emptyStudy, studyQueue } from "./v2";

test("music has four distinct 10-phrase speaking levels with complete pronunciation aids", () => {
  const units = musicUnits("ja");
  assert.deepEqual(units.map(u => u.level), [1, 2, 3, 4]);
  const phrases = units.flatMap(lessonPhrases);
  assert.equal(phrases.length, 40);
  assert.equal(new Set(phrases.map(p => p.text)).size, 40);
  assert.equal(new Set(phrases.map(p => p.meaning)).size, 40);
  for (const unit of units) {
    const lesson = musicLesson(unit)!;
    assert.equal(lesson.steps.length, 10);
    assert.equal(lessonPlan(unit)?.cues.length, 10);
    assert(lesson.steps.every(s => s.cue && safePractice(s.phrase)));
    for (const phrase of lessonPhrases(unit)) {
      assert(/[ぁ-ゖァ-ヺ]/u.test(phrase.text));
      assert(!/[가-힣]/u.test(phrase.text));
      assert(/[가-힣]/u.test(phrase.reading));
      assert(/[가-힣]/u.test(phrase.meaning));
    }
  }
  assert(phrases[30].text.includes("もし") && phrases[30].text.includes("かもしれません"), "advanced level practices conditional uncertainty");
  assert(phrases[32].text.includes("とは限りません"), "advanced level avoids overgeneralization");
});
test("music is Japanese only and does not change the ordinary study queue", () => {
  for (const lang of ["en", "th", "es"] as const) assert.deepEqual(musicUnits(lang), []);
  const units = starterUnits("ja");
  assert.equal(units.length, 32);
  const state = emptyStudy();
  state.profiles.ja = { level: 1, minutes: 5, assessedAt: 1, practiced: {}, completedLessons: { [musicUnits("ja")[0].id]: { at: 1, phrases: 10 } } };
  assert(studyQueue(state, "ja", units).lessons.every(u => u.source === "starter"));
  const music = musicUnits("ja")[0];
  assert.equal(musicLesson({ ...music, language: "es" }), undefined);
  assert.throws(() => lessonPhrases({ ...music, id: "music:ja:unknown:1" }));
  assert.equal(musicLesson({ ...music, level: 5 }), undefined);
});
test("official player uses the verified artist video rather than uploaded song assets", () => {
  assert.equal(pretender.videoId, "TQ8WlA2GXbk");
  assert.equal(new URL(pretender.officialUrl).searchParams.get("v"), pretender.videoId);
});
