import test from "node:test";
import assert from "node:assert/strict";
import { starterUnits } from "./v2";
import { lessonPlan } from "./v2-lesson";
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
test("AI missions use the selected scene and level's actual lesson plan without overriding conversation", () => {
  for (const unit of starterUnits("ja")) {
    const prompt = roleplayPrompt(unit.language, unit.level, unit.scene);
    assert(prompt.includes(lessonPlan(unit)!.instruction), unit.id);
    assert.match(prompt, /Conversation continuity takes priority/);
  }
});
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
test("repairs the production Spanish reading with isolated jamo, without publishing persistent failures", async () => {
  const correct = { translated: "Un café sin hielo, por favor.", reading: "운 카페 신 이에로, 포르 파보르.", practice: null };
  const invalid = { ...correct, reading: "운 까페 씨ㄴ 이에로, 뽀ㄹ 바호ㄹ." };
  let calls = 0;
  const result = await translate("얼음 없이 커피 한 잔 주세요.", "es", "ko", async (prompt) => {
    calls++;
    assert.match(prompt, /complete Hangul syllables/);
    return JSON.stringify(calls === 1 ? invalid : correct);
  });
  assert.equal(calls, 2);
  assert.deepEqual(result, correct);
  calls = 0;
  await assert.rejects(translate("얼음 없이 커피 한 잔 주세요.", "es", "ko", async () => {
    calls++;
    return JSON.stringify(invalid);
  }));
  assert.equal(calls, 2);
});
test("chat rejects isolated Hangul letters but accepts canonically decomposed syllables", () => {
  for (const reading of ["씨ㄴ 이에로", "뽀ㄹ 바호ㄹ", "안녕 ᄀ", "안녕 ㅏ"])
    assert.throws(() => parseRoleplay(JSON.stringify({ ...good, reading }), "ja"));
  assert.equal(parseRoleplay(JSON.stringify({ ...good, reading: good.reading.normalize("NFD") }), "ja").text, good.text);
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

import { learnerTurn } from "./v2-ai";
test("recasts the learner intent in all four languages with the same selected model and contextual history", async () => {
  for (const [language, text] of Object.entries({
    ja: "甘さを控えめにしてください。",
    th: "ขอหวานน้อย",
    en: "Please make it less sweet.",
    es: "Menos dulce, por favor.",
  })) {
    const phrase = {
      text,
      reading: "아마사오 히카에메니 시테 쿠다사이",
      meaning: "덜 달게 해 주세요.",
    };
    const history = [
      { role: "user" as const, content: "덜 달게 해 달라고 말하고 싶어" },
    ];
    const result = await learnerTurn(
      language as "ja",
      history,
      "own-model",
      async (system, messages, selection, format) => {
        assert.match(system, /NOT the conversation partner/);
        assert.match(system, /help-request wrapper/);
        assert.deepEqual(messages, history);
        assert.equal(selection, "own-model");
        assert.equal(
          (format as { json_schema: { name: string } }).json_schema.name,
          "hanmadi_learner_turn",
        );
        return JSON.stringify({ phrase, reusable: true });
      },
    );
    assert.deepEqual(result, { phrase, reusable: true });
  }
});
test("does not fabricate a learner phrase for a control request or call the model for non-Korean text", async () => {
  assert.deepEqual(
    await learnerTurn(
      "ja",
      [{ role: "user", content: "こんにちは" }],
      "default",
      async () => {
        throw new Error("must not call");
      },
    ),
    { phrase: null, reusable: false },
  );
  assert.deepEqual(
    await learnerTurn(
      "ja",
      [{ role: "user", content: "AI가 먼저 말해줘" }],
      "default",
      async () => JSON.stringify({ phrase: null, reusable: false }),
    ),
    { phrase: null, reusable: false },
  );
});
test("private learner text is displayable but never automatically reusable", async () => {
  for (const [input, reusable] of [
    ["제 이름은 현종이에요", false],
    ["전화번호는 01012345678이에요", true],
  ] as const) {
    const result = await learnerTurn(
      "ja",
      [{ role: "user", content: input }],
      "default",
      async () => JSON.stringify({ phrase: good, reusable }),
    );
    assert.deepEqual(result, { phrase: good, reusable: false });
  }
  const contact = { ...good, text: "電話は01012345678です。" };
  const result = await learnerTurn(
    "ja",
    [{ role: "user", content: "제 전화번호예요" }],
    "default",
    async () => JSON.stringify({ phrase: contact, reusable: true }),
  );
  assert.deepEqual(result, { phrase: contact, reusable: false });
});
test("invalid learner output is repaired once and transport errors never change provider", async () => {
  let calls = 0;
  const result = await learnerTurn(
    "ja",
    messages,
    "own-model",
    async (_system, _messages, selection) => {
      assert.equal(selection, "own-model");
      return JSON.stringify({
        phrase: ++calls === 1 ? { ...good, text: "한국어예요" } : good,
        reusable: true,
      });
    },
  );
  assert.equal(calls, 2);
  assert.deepEqual(result.phrase, good);
  calls = 0;
  await assert.rejects(
    learnerTurn("ja", messages, "own-model", async () => {
      calls++;
      return "bad JSON";
    }),
  );
  assert.equal(calls, 2);
  calls = 0;
  await assert.rejects(
    learnerTurn("ja", messages, "own-model", async () => {
      calls++;
      throw new Error("auth failure");
    }),
    /auth failure/,
  );
  assert.equal(calls, 1);
});

test("accepts a valid kanji-only Japanese utterance such as a toast", async () => {
  const phrase = { text: "乾杯！", reading: "간파이!", meaning: "건배!" };
  assert.deepEqual(parseRoleplay(JSON.stringify(phrase), "ja"), phrase);
  const result = await learnerTurn(
    "ja",
    [{ role: "user", content: "건배!" }],
    "default",
    async () => JSON.stringify({ phrase, reusable: true }),
  );
  assert.deepEqual(result, { phrase, reusable: true });
});


test("reported Thai no-ice coffee misspelling/added temperature is repaired once", async () => {
  const good = {translated:"ขอกาแฟหนึ่งแก้ว ไม่ใส่น้ำแข็ง",reading:"커 까패 능 깨우 마이 싸이 남캥",practice:null};
  for (const bad of ["ขอแฟเย็นไม่ใส่น้ำแข็งค่ะ", "ขอกาแฟเย็นไม่ใส่น้ำแข็ง", "ขอกาแฟหนึ่งแก้ว"]) {
    let calls=0;
    const result=await translate("얼음 없이 커피 한 잔 주세요.","th","ko",async (prompt) => {
      calls++; if(calls===2) assert.match(prompt,/REPAIR:/);
      return JSON.stringify(calls===1 ? {...good,translated:bad} : good);
    });
    assert.equal(calls,2); assert.equal(result.translated,good.translated);
  }
  let calls=0;
  await assert.rejects(translate("얼음 없이 커피 한 잔 주세요.","th","ko",async () => {
    calls++; return JSON.stringify({...good,translated:"ขอแฟเย็นไม่ใส่น้ำแข็งค่ะ"});
  }),/번역/); assert.equal(calls,2);
  assert.match(translationPrompt("th","ko"),/without ice.*does NOT mean/);
});

test("explicit iced coffee remains valid and common Thai no-ice wording is accepted", async () => {
  for (const phrase of ["ขอกาแฟหนึ่งแก้ว ไม่ต้องใส่น้ำแข็ง", "ขอกาแฟเย็นหนึ่งแก้ว งดน้ำแข็ง"]) {
    const result = await translate("아이스 커피 한 잔, 얼음 빼 주세요.", "th", "ko", async () =>
      JSON.stringify({translated:phrase,reading:"커 까패 능 깨우 마이 싸이 남캥",practice:null}));
    assert.equal(result.translated,phrase);
  }
});


const spanishBill = {
  text: "La cuenta, por favor.",
  reading: "라 꾸엔따, 포르 파보르.",
  meaning: "계산서 주세요.",
};
test("reported Spanish bill pronunciation is regenerated once with a targeted instruction", async () => {
  let calls = 0;
  const result = await translate("계산서 주세요.", "es", "ko", async system => {
    calls++;
    assert.match(system, /Spanish pronunciation and meaning/);
    if (calls === 2) assert.match(system, /REPAIR:[\s\S]*preserving ue/);
    return JSON.stringify({ translated: spanishBill.text,
      reading: calls === 1 ? "라 꿰운따, 포르 파보르." : spanishBill.reading, practice: spanishBill });
  });
  assert.equal(calls, 2);
  assert.equal(result.reading, spanishBill.reading);
  assert.deepEqual(result.practice, spanishBill);
});
test("reverse Spanish translation repairs phonetic leakage and persistent failures never return practice", async () => {
  for (const persistent of [false, true]) {
    let calls = 0;
    const run = translate("Un café sin hielo, por favor.", "es", "es", async system => {
      calls++;
      if (calls === 2) assert.match(system, /REPAIR:[\s\S]*do not copy its sounds/);
      return JSON.stringify({ translated: calls === 1 || persistent
        ? "얼음 없는 커피 한 잔 주세요, 포르 파보르." : "얼음 없는 커피 한 잔 주세요.",
        reading: "운 까페 신 이에로, 포르 파보르.", practice: null });
    });
    if (persistent) await assert.rejects(run, /번역/);
    else assert.equal((await run).translated, "얼음 없는 커피 한 잔 주세요.");
    assert.equal(calls, 2);
  }
});
test("Spanish reply and learner recast share pronunciation guidance and retain the selected model on repair", async () => {
  for (const learner of [false, true]) {
    let calls = 0;
    const complete = async (system: string, _messages: unknown, selection?: string) => {
      calls++;
      assert.match(system, /Spanish pronunciation and meaning/);
      assert.equal(selection, "own-model");
      const phrase = calls === 1 ? { ...spanishBill, reading: "라 꾸엔따, 뽀르 바뽀르." } : spanishBill;
      return JSON.stringify(learner ? { phrase, reusable: true } : phrase);
    };
    const result = learner
      ? (await learnerTurn("es", messages, "own-model", complete)).phrase
      : await roleplayReply("es", 1, "cafe", messages, "own-model", complete);
    assert.equal(calls, 2);
    assert.deepEqual(result, spanishBill);
  }
});
test("Spanish practice with leaked phonetics is excluded without retrying a valid translation", async () => {
  let calls = 0;
  const result = await translate("계산서 주세요.", "es", "ko", async () => {
    calls++;
    return JSON.stringify({translated: spanishBill.text, reading: spanishBill.reading,
      practice: {...spanishBill, meaning: "계산서 주세요, 포르 파보르."}});
  });
  assert.equal(calls, 1);
  assert.equal(result.practice, null);
});
test("valid Spanish reading variants and quoted/name meanings remain usable without regeneration", async () => {
  for (const phrase of [
    spanishBill,
    {...spanishBill, reading: "라 쿠엔타, 뽀르 파보르."},
    {text: 'El restaurante se llama Por Favor.', reading: "엘 레스타우란테 세 야마 포르 파보르.", meaning: "식당 이름은 포르 파보르예요."},
    {text: 'La expresión «por favor» significa una petición cortés.', reading: "라 엑스프레시온 포르 파보르 시그니피카 우나 페티시온 코르테스.", meaning: "포르 파보르는 정중한 부탁을 뜻해요."},
    {text: 'Se encuentra aquí.', reading: "세 엔쿠엔트라 아키.", meaning: "여기에 있어요."},
  ]) {
    assert.deepEqual(parseRoleplay(JSON.stringify(phrase), "es"), phrase);
    let calls = 0;
    const result = await translate(phrase.text, "es", "es", async () => {
      calls++;
      return JSON.stringify({translated: phrase.meaning, reading: phrase.reading, practice: null});
    });
    assert.equal(calls, 1);
    assert.equal(result.translated, phrase.meaning);
  }
});
