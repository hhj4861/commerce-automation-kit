import { test } from "node:test";
import assert from "node:assert/strict";
import { meaningChoices, vocabularyForStudy, wordPacks } from "./word-study";
import { studyLanguages, type Expression, type StudyLanguage } from "./v2";

test("every supported language has complete five-word lessons and unambiguous quiz options", () => {
  const ids = new Set<string>();
  for (const language of Object.keys(studyLanguages) as StudyLanguage[]) {
    const packs = wordPacks(language), pool = packs.flatMap(pack => pack.words);
    assert.equal(packs.length, 3);
    const positions = new Set<number>();
    for (const pack of packs) {
      assert.equal(pack.words.length, 5);
      for (const word of pack.words) {
        assert(!ids.has(word.id)); ids.add(word.id);
        for (const value of [word.text, word.meaning, word.reading, word.example?.text, word.example?.meaning, word.example?.reading]) assert(value?.trim());
        const choices = meaningChoices(word, pool);
        assert.equal(choices.length, 4);
        assert.equal(new Set(choices).size, 4);
        assert.equal(choices.filter(choice => choice === word.meaning).length, 1);
        positions.add(choices.indexOf(word.meaning));
      }
    }
    assert(positions.size > 1);
  }
});
test("quiz deduplicates equivalent meanings, even in saved vocabulary", () => {
  const word = { id: "own", text: "Coffee", meaning: "커피", reading: "커피" };
  const pool = [word, { ...word, meaning: " 커피 " }, { ...word, meaning: "물" }, { ...word, meaning: "메뉴" }];
  assert.equal(meaningChoices(word, pool).length, 3);
  assert.deepEqual(pool.map(item => item.meaning), ["커피", " 커피 ", "물", "메뉴"]);
});
test("review includes only the chosen language's vocabulary, oldest due first, without mutating source", () => {
  const base: Expression = { id: "future", language: "ja", source: "vocabulary", text: "水", meaning: "물", reading: "미즈", createdAt: 1, dueAt: 200 };
  const words: Expression[] = [base, { ...base, id: "due", dueAt: 100 }, { ...base, id: "foreign", language: "en", dueAt: 0 },
    { ...base, id: "phrase", source: "chat", dueAt: 0 }, { ...base, id: "music-word", source: "music", inVocabulary: true, dueAt: 20 }];
  const result = vocabularyForStudy(words, "ja", 100);
  assert.deepEqual(result.all.map(word => word.id), ["music-word", "due", "future"]);
  assert.deepEqual(result.due.map(word => word.id), ["music-word", "due"]);
  assert.equal(words[0].id, "future");
});
