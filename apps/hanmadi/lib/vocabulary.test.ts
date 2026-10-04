import test from "node:test";
import assert from "node:assert/strict";
import { wordSegments } from "./word-segments";
import { lookupVocabulary } from "./vocabulary";

test("four languages retain the exact sentence and expose words without whitespace", () => {
  for (const [language, text] of [["ja", "韓国から来ました。"], ["th", "ผมมาจากเกาหลีครับ"], ["en", "I'd like coffee."], ["es", "Un café, por favor."]] as const) {
    const parts = wordSegments(text, language);
    assert.equal(parts.map(p => p.text).join(""), text);
    assert(parts.filter(p => p.word).length >= 2);
  }
});
test("lookup preserves the selection, uses context and does not add Thai male endings", async () => {
  const phrase = await lookupVocabulary("กาแฟ", "ขอกาแฟครับ", "th", async (prompt, messages, model) => {
    assert.match(prompt, /Do not rewrite/); assert.match(messages[0].content, /ขอกาแฟครับ/); assert.equal(model, "default");
    return JSON.stringify({ meaning: "커피", reading: "까패" });
  });
  assert.deepEqual(phrase, { text: "กาแฟ", meaning: "커피", reading: "까패" });
});
test("invalid selection never reaches AI", async () => {
  let calls = 0;
  for (const text of ["", "unrelated", "a".repeat(81)])
    await assert.rejects(lookupVocabulary(text, "Coffee", "en", async () => { calls++; return "{}"; }));
  assert.equal(calls, 0);
});
test("malformed or romanized results retry once, transport errors do not retry", async () => {
  let calls = 0;
  await assert.rejects(lookupVocabulary("café", "Un café", "es", async () => { calls++; return '{"meaning":"커피","reading":"cafe"}'; }));
  assert.equal(calls, 2);
  calls = 0;
  await assert.rejects(lookupVocabulary("café", "Un café", "es", async () => { calls++; throw new Error("offline"); }), /offline/);
  assert.equal(calls, 1);
});

import { isVocabulary, type Expression } from "./v2";
test("wordbook recognizes earlier saved words and shared expressions without including ordinary chat", () => {
  const expression = { text: "coffee", reading: "커피", meaning: "커피", source: "chat", id: "one", language: "en", createdAt: 1, dueAt: 1 } as Expression;
  assert.equal(isVocabulary(expression), false);
  assert.equal(isVocabulary({ ...expression, source: "vocabulary" }), true);
  assert.equal(isVocabulary({ ...expression, inVocabulary: true }), true);
  assert.equal(isVocabulary({ ...expression, inVocabulary: false }), false);
});

import { alignMeaning } from "./vocabulary";
test("Korean selection aligns an exact original span in four languages", async () => {
  for (const [language, sentence, text] of [["ja", "今日、この街に到着しました。", "今日"], ["th", "วันนี้ผมมาถึงเมืองนี้ครับ", "วันนี้"], ["en", "I arrived in this city today.", "today"], ["es", "Hoy llegué a esta ciudad.", "Hoy"]] as const) {
    const match = await alignMeaning("오늘", 0, "오늘 이 도시에 도착했어요.", sentence, language, async (prompt, messages, model) => {
      assert.match(prompt, /EXACT substring/); assert.equal(model, "default");
      assert.equal(JSON.parse(messages[0].content).selectedStart, 0);
      return JSON.stringify({ text, occurrence: 0 });
    });
    assert.deepEqual(match, { text, start: sentence.indexOf(text), end: sentence.indexOf(text) + text.length });
  }
});
test("repeated words select the requested occurrence, including UTF-16 offsets", async () => {
  const sentence = "😊今日も今日も";
  assert.deepEqual(await alignMeaning("오늘", 4, "오늘도 오늘도", sentence, "ja", async () => '{"text":"今日","occurrence":1}'),
    { text: "今日", start: 5, end: 7 });
});
test("invalid Korean ranges never call a provider", async () => {
  let calls = 0; const complete = async () => { calls++; return "{}"; };
  for (const [text, start] of [["", 0], ["오늘", -1], ["오늘", 1], ["오늘", 0.5], ["내일", 0], [" 오늘", 0]] as const)
    await assert.rejects(alignMeaning(text, start, "오늘 도착", "今日到着", "ja", complete));
  assert.equal(calls, 0);
});
test("alignment rejects invented spans and bad occurrences, returns uncertain null, bounds retries", async () => {
  for (const result of [{ text: "明日", occurrence: 0 }, { text: "今日", occurrence: 3 }, { text: "今日", occurrence: -1 }, { text: "", occurrence: 0 }, { text: "今日", occurrence: 0.5 }]) {
    let calls = 0;
    await assert.rejects(alignMeaning("오늘", 0, "오늘", "今日", "ja", async () => { calls++; return JSON.stringify(result); }));
    assert.equal(calls, 2);
  }
  assert.equal(await alignMeaning("오늘", 0, "오늘", "今日", "ja", async () => '{"text":null,"occurrence":0}'), null);
  let calls = 0;
  await assert.rejects(alignMeaning("오늘", 0, "오늘", "今日", "ja", async () => { calls++; throw new Error("offline"); }), /offline/);
  assert.equal(calls, 1);
});
