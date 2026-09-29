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

// Travel translation must follow the same original/reading separation as chat.
import {
  translate,
  translationResponseFormat,
  translationPrompt,
} from "./v2-ai";
const translated = {
  translated: "A cup of hot coffee, please.",
  reading: "어 컵 오브 핫 커피 플리즈",
  practice: null,
};
test("translation repairs IPA and romanization without changing the original input or model", async () => {
  for (const reading of [
    "pliːz ɡɪv miː ə kʌp",
    "kho ka fae",
    "플리즈 coffee",
  ]) {
    let calls = 0;
    const result = await translate(
      "따뜻한 커피 한 잔 주세요.",
      "en",
      "ko",
      async (prompt, messages, selection, format) => {
        calls++;
        assert.equal(selection, "default");
        assert.deepEqual(format, translationResponseFormat("en", "ko"));
        assert.equal(messages[0].content, "따뜻한 커피 한 잔 주세요.");
        if (calls === 2) assert.match(prompt, /REPAIR:/);
        return JSON.stringify(
          calls === 1 ? { ...translated, reading } : translated,
        );
      },
    );
    assert.equal(calls, 2);
    assert.deepEqual(result, translated);
  }
});
test("Thai translation rejects mixed Hangul original and recovers", async () => {
  let calls = 0;
  const correct = {
    translated: "ขอกาแฟร้อนหนึ่งแก้ว",
    reading: "커 까패 론 능 깨우",
    practice: null,
  };
  const result = await translate(
    "따뜻한 커피 한 잔 주세요.",
    "th",
    "ko",
    async () => {
      calls++;
      return JSON.stringify(
        calls === 1
          ? { ...correct, translated: "ขอแฟ소ร้อนหนึ่งแก้วครับ" }
          : correct,
      );
    },
  );
  assert.equal(calls, 2);
  assert.deepEqual(result, correct);
});
test("both translation directions specify pronunciation of the non-Korean sentence", async () => {
  assert.match(translationPrompt("ja", "ko"), /the translated field/);
  assert.match(translationPrompt("ja", "ja"), /the original user input/);
  let calls = 0;
  const result = await translate(
    "コーヒーをください。",
    "ja",
    "ja",
    async () => {
      calls++;
      return JSON.stringify({
        translated: calls === 1 ? "Coffee please" : "커피 주세요.",
        reading: "코히오 쿠다사이",
        practice: null,
      });
    },
  );
  assert.equal(calls, 2);
  assert.equal(result.translated, "커피 주세요.");
});
test("invalid practice is omitted; valid translation still succeeds and privacy filtering remains", async () => {
  for (const practice of [
    { text: "안녕하세요", reading: "안녕하세요", meaning: "안녕하세요" },
    { ...good, reading: "konnichiwa" },
  ]) {
    const result = await translate("안녕하세요", "en", "ko", async () =>
      JSON.stringify({ ...translated, practice }),
    );
    assert.equal(result.practice, null);
  }
  const result = await translate("email@example.com", "ja", "ko", async () =>
    JSON.stringify({
      translated: good.text,
      reading: good.reading,
      practice: good,
    }),
  );
  assert.equal(result.practice, null);
});
test("translation retries malformed JSON once, stops persistent bad output and never retries transport failures", async () => {
  let calls = 0;
  await assert.rejects(
    translate("커피 주세요", "en", "ko", async () => {
      calls++;
      return "bad";
    }),
    /번역과 한글 발음/,
  );
  assert.equal(calls, 2);
  calls = 0;
  await assert.rejects(
    translate("커피 주세요", "en", "ko", async () => {
      calls++;
      throw new Error("upstream failed");
    }),
    /upstream failed/,
  );
  assert.equal(calls, 1);
});

test("translation practice must quote the translated expression, not invent a different order", async () => {
  for (const phrase of ["One iced coffee, please.", "One hot tea, please."]) {
    const result = await translate(
      "따뜻한 커피 한 잔 주세요.",
      "en",
      "ko",
      async () =>
        JSON.stringify({
          ...translated,
          practice: {
            text: phrase,
            reading: "원 핫 티 플리즈",
            meaning: "차 주세요",
          },
        }),
    );
    assert.equal(result.practice, null);
  }
  const practice = {
    text: "hot coffee",
    reading: "핫 커피",
    meaning: "따뜻한 커피",
  };
  const result = await translate(
    "따뜻한 커피 한 잔 주세요.",
    "en",
    "ko",
    async () => JSON.stringify({ ...translated, practice }),
  );
  assert.deepEqual(result.practice, practice);
  const reverse = await translate("Hot coffee, please.", "en", "en", async () =>
    JSON.stringify({
      translated: "따뜻한 커피 주세요.",
      reading: "핫 커피 플리즈",
      practice,
    }),
  );
  assert.deepEqual(reverse.practice, practice);
});

test("club AI missions progress from a short utterance to answers, reasons and negotiating a change", () => {
  const prompts = [1, 2, 3, 4].map((level) =>
    roleplayPrompt("ja", level, "club"),
  );
  assert.match(prompts[0], /one short utterance/);
  assert.match(prompts[1], /question-and-answer pairs/);
  assert.match(prompts[2], /preference plus a reason/);
  assert.match(prompts[3], /unexpected change or misunderstanding/);
  assert.match(prompts[3], /Respect a refusal immediately/);
  assert(
    !roleplayPrompt("ja", 4, "smalltalk").includes(
      "Level-specific club/bar mission",
    ),
  );
});

test("multi-turn roleplay preserves the toast, Korean acceptance and selected model on repair", async () => {
  const toast = {
    text: "こんにちは！一緒に乾杯しませんか？",
    reading: "곤니치와! 잇쇼니 간파이 시마셍카?",
    meaning: "안녕하세요! 같이 건배할래요? (답변 힌트: 좋아요!)",
  };
  const history = [
    { role: "user" as const, content: "대화를 시작해 주세요." },
    { role: "assistant" as const, content: JSON.stringify(toast) },
    { role: "user" as const, content: "좋아! 건배!" },
  ];
  const reaction = {
    text: "乾杯！楽しい夜にしましょう！",
    reading: "간파이! 타노시이 요루니 시마쇼오!",
    meaning: "건배! 즐거운 밤 보내요!",
  };
  const original = JSON.stringify(history);
  let calls = 0;
  const reply = await roleplayReply(
    "ja",
    1,
    "club",
    history,
    "personal:model",
    async (system, sent, selection, format) => {
      calls++;
      assert.deepEqual(sent, history);
      assert.equal(selection, "personal:model");
      assert.deepEqual(format, roleplayResponseFormat("ja"));
      assert.match(system, /Conversation continuity takes priority/);
      assert.match(system, /not events or words the learner said/);
      assert.match(system, /If the learner actually requests water/);
      assert.doesNotMatch(system, /exactly one easy follow-up question/);
      return calls === 1 ? "invalid JSON" : JSON.stringify(reaction);
    },
  );
  assert.equal(calls, 2);
  assert.deepEqual(reply, reaction); // A valid conversational reaction needs no question.
  assert.equal(JSON.stringify(history), original);
});
