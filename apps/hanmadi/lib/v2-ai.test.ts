import test from "node:test";
import assert from "node:assert/strict";
import {
  parseRoleplay,
  roleplayReply,
  roleplayPrompt,
  roleplayResponseFormat,
} from "./v2-ai";
const good = {
  text: "こんにちは。旅行は初めてですか？",
  reading: "곤니치와. 료코와 하지메테데스카?",
  meaning: "안녕하세요. 여행은 처음인가요?",
};
const messages = [{ role: "user" as const, content: "곤니치와, 현종데스요" }];
test("accepts original target script, Hangul pronunciation and Korean translation in all four languages", () => {
  for (const [language, text] of Object.entries({
    ja: good.text,
    th: "สวัสดี คุณชื่ออะไร",
    en: "Hello. What's your name?",
    es: "Hola. ¿Cómo te llamas?",
  })) {
    assert.equal(
      parseRoleplay(JSON.stringify({ ...good, text }), language as "ja").text,
      text,
    );
    assert.match(
      roleplayPrompt(language as "ja", 1, "smalltalk"),
      /NEVER Korean/,
    );
  }
});
test("rejects reported Korean original, wrong scripts and malformed fields", () => {
  for (const reply of [
    { ...good, text: "안녕하세요! 저는 하나예요. 일본에 처음 오셨어요?" },
    { ...good, text: "こんにちは 안녕하세요" },
    { ...good, reading: "こんにちは" },
    { ...good, meaning: "Hello" },
    { ...good, unexpected: "extra" },
    { ...good, text: "" },
    { ...good, text: "あ".repeat(301) },
  ])
    assert.throws(() => parseRoleplay(JSON.stringify(reply), "ja"));
});
for (const invalid of [
  "not JSON",
  JSON.stringify({ ...good, text: "안녕하세요!" }),
]) {
  test(`repairs ${invalid === "not JSON" ? "malformed JSON" : "Korean original"} once on same selected model`, async () => {
    let calls = 0;
    const reply = await roleplayReply(
      "ja",
      1,
      "smalltalk",
      messages,
      "personal:model",
      async (system, history, selection, format) => {
        calls++;
        assert.equal(selection, "personal:model");
        assert.deepEqual(history, messages);
        assert.deepEqual(format, roleplayResponseFormat("ja"));
        if (calls === 2) assert.match(system, /REPAIR:/);
        return calls === 1 ? invalid : JSON.stringify(good);
      },
    );
    assert.equal(calls, 2);
    assert.deepEqual(reply, good);
  });
}
test("persistent invalid reply is not returned; no third request", async () => {
  let calls = 0;
  await assert.rejects(
    roleplayReply("ja", 1, "smalltalk", messages, "default", async () => {
      calls++;
      return "bad";
    }),
    /선택한 언어/,
  );
  assert.equal(calls, 2);
});
test("transport/auth failures do not regenerate or fall back", async () => {
  let calls = 0;
  await assert.rejects(
    roleplayReply(
      "ja",
      1,
      "smalltalk",
      messages,
      "personal:model",
      async () => {
        calls++;
        throw new Error("authentication failure");
      },
    ),
    /authentication failure/,
  );
  assert.equal(calls, 1);
});
