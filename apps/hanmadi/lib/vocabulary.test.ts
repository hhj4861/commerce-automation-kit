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
