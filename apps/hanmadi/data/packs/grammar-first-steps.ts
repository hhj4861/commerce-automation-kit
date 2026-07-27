/**
 * 문법 첫걸음 — 문법 용어 없이, 여섯 가지 핵심 패턴을 예문 5개 + 빈칸 연습으로 익히는 팩.
 * 색상 블록 대신 **굵게**(주어) / *기울임*(목적어) / `코드`(동사) 서식으로 어순 역할을 구분한다
 * (types.ts에 별도 색상 블록 타입이 없어 마크다운 강조로 대체).
 * 블록 필드 설명은 data/types.ts 주석 참조.
 */
import type { Pack } from "@/data/types";

export const grammarFirstStepsPack: Pack = {
  id: "grammar-first-steps",
  title: {
    en: "Grammar First Steps",
    ko: "문법 첫걸음",
  },
  level: "beginner",
  category: "essential-phrases",
  minutes: 45,
  summary:
    "어순, 조사, 해요체까지 실생활 핵심 패턴 6가지를 빈칸 채우기 예문으로 하나씩 익혀요.",
  learns: [
    "한국어 어순 감각 익히기: 주어 → 목적어 → 동사",
    "조사 제대로 구분하기: 주제/주어는 은/는·이/가, 목적어/장소는 을/를·에·에서",
    "해요체로 공손하게 말하기 — 현재형, 부정형, 과거형 맛보기까지",
  ],
  order: 2,
  tutorGuide:
    "문법 용어(주격 조사, 목적격 조사 등)는 되도록 쓰지 않는다. 대신 색상 블록이 없는 대신 **굵게**(주어)/*기울임*(목적어)/`코드`(동사) 서식으로 어순 역할을 시각적으로 구분해뒀다. 각 섹션은 '패턴 설명(text) → 예문 5개(phrase-cards 또는 drill) → Your turn 빈칸 연습(text)' 순서로 동일하게 구성된다. 예문은 화면공유로 함께 소리 내어 읽고, 빈칸은 학생이 직접 채우게 한 뒤 그 문장을 그대로 /live 노트에 받아쓰듯 남긴다 — 수업 후 링크로 전달하면 복습 자료가 된다. 한 수업에 2~3섹션이 적당하며, 4섹션(활용)과 6섹션(의문문·부정문·과거형)은 개념이 많아 시간이 걸리니 다음 수업으로 나눠도 좋다.",
  blocks: [
    // ══════════════════ 도입 ══════════════════
    {
      type: "heading",
      level: 1,
      en: "Grammar First Steps: Six Patterns, Not a Grammar Book",
      ko: "문법 첫걸음: 문법책이 아니라 여섯 가지 패턴",
    },
    {
      type: "text",
      markdown:
        "You won't memorize grammar terms in this pack — you'll meet six patterns that show up in almost every Korean sentence you'll ever say, one at a time.\n\nEach section works the same way: **one pattern**, **five example sentences**, then **Your turn** — a blank you fill in together on screen share, live. Whatever you say goes straight into your Live Notes, so it's still there after the lesson.",
    },
    {
      type: "tip",
      audience: "tutor",
      markdown:
        "섹션 구조: 패턴 설명 → 예문 5개 → Your turn(빈칸). 예문은 화면공유로 함께 소리 내어 읽고, 빈칸은 학생이 직접 채우게 한 뒤 그대로 라이브 노트에 옮겨 적는다. 문법 용어보다 패턴 반복 노출에 집중.",
    },

    // ══════════════════ Section 1: 어순 ══════════════════
    {
      type: "heading",
      level: 1,
      en: "Korean Word Order: Subject–Object–Verb",
      ko: "어순 (Subject–Object–Verb)",
    },
    {
      type: "text",
      markdown:
        "In English, sentences go Subject → Verb → Object (“I eat an apple”). Korean always saves the verb for last: Subject → Object → Verb (“I an apple eat”).\n\nThink of it as three blocks that snap into place, always in this order:\n\n- **Subject** — who does it (저는 = “I”)\n- *Object* — what it's done to (사과를 = “an apple”)\n- `Verb` — the action, always last (먹어요 = “eat”)\n\nNo matter how long the sentence gets, the verb stays glued to the very end.",
    },
    {
      type: "phrase-cards",
      title: "Example sentences — Subject + Object + Verb",
      cards: [
        {
          ko: "저는 사과를 먹어요",
          rr: "jeoneun sagwareul meogeoyo",
          en: "I eat an apple.",
          note: "저는(S) + 사과를(O) + 먹어요(V)",
        },
        {
          ko: "저는 커피를 마셔요",
          rr: "jeoneun keopireul masyeoyo",
          en: "I drink coffee.",
          note: "저는(S) + 커피를(O) + 마셔요(V)",
        },
        {
          ko: "저는 한국어를 배워요",
          rr: "jeoneun hangugeoreul baewoyo",
          en: "I learn Korean.",
          note: "저는(S) + 한국어를(O) + 배워요(V)",
        },
        {
          ko: "그는 책을 읽어요",
          rr: "geuneun chaegeul ilgeoyo",
          en: "He reads a book.",
          note: "그는(S) + 책을(O) + 읽어요(V)",
        },
        {
          ko: "저는 음악을 좋아해요",
          rr: "jeoneun eumageul joahaeyo",
          en: "I like music.",
          note: "저는(S) + 음악을(O) + 좋아해요(V)",
        },
      ],
    },
    {
      type: "text",
      markdown:
        "**Your turn** — read each pattern out loud together, then fill in the blank with your own word:\n\n- 저는 ___를 마셔요. (“I drink ___.”)\n- 저는 ___를 좋아해요. (“I like ___.”)\n- 그는 ___을 읽어요. (“He reads ___.”)\n\nSay the whole sentence out loud, Subject → Object → Verb, then drop it straight into Live Notes.",
    },
    {
      type: "tip",
      audience: "tutor",
      markdown:
        "이 시점에는 을/를 구분(3섹션)을 아직 안 배웠다. 학생이 헷갈려하면 정답만 알려주고 '이건 3섹션에서 규칙을 배울 거예요'라고 안내하면 충분하다. 지금은 어순 감각만 잡는 단계.",
    },

    // ══════════════════ Section 2: 조사 1 (은/는 vs 이/가) ══════════════════
    {
      type: "heading",
      level: 1,
      en: "Topic & Subject Particles: 은/는 vs 이/가",
      ko: "조사 1 (은/는 vs 이/가)",
    },
    {
      type: "text",
      markdown:
        "은/는 introduces your **topic** — what you're about to talk about (“as for me…”). 이/가 marks the exact **subject** — who or what is doing or being something, often as new information or the answer to a question.\n\nBoth attach directly to a noun, and the choice depends only on the noun's last sound (batchim):\n\n- Ends in a consonant → 은 / 이\n- Ends in a vowel → 는 / 가\n\n저 (I) ends in a vowel, so it becomes 저는. 이것 (this) ends in a consonant (ㅅ), so it becomes 이것은.",
    },
    {
      type: "phrase-cards",
      title: "Example sentences — topic vs. subject",
      cards: [
        {
          ko: "저는 학생이에요",
          rr: "jeoneun haksaeng-ieyo",
          en: "I'm a student.",
          note: "저 ends in a vowel → 는 (topic)",
        },
        {
          ko: "이것은 제 가방이에요",
          rr: "igeoseun je gabang-ieyo",
          en: "This is my bag.",
          note: "이것 ends in a consonant (ㅅ) → 은 (topic)",
        },
        {
          ko: "아이스크림이 맛있어요",
          rr: "aiseukeurimi masisseoyo",
          en: "The ice cream is delicious.",
          note: "아이스크림 ends in a consonant (ㅁ) → 이 (subject)",
        },
        {
          ko: "날씨가 좋아요",
          rr: "nalssiga joayo",
          en: "The weather is nice.",
          note: "날씨 ends in a vowel → 가 (subject)",
        },
        {
          ko: "이 사람이 누구예요?",
          rr: "i sarami nuguyeyo?",
          en: "Who is this person?",
          note: "사람 ends in a consonant (ㅁ) → 이 (subject)",
        },
      ],
    },
    {
      type: "text",
      markdown:
        "**Your turn** — pick 은/는 or 이/가 for each blank (say the batchim rule out loud before answering):\n\n- 저 ___ 커피를 좋아해요. (“As for me, I like coffee.”)\n- 날씨 ___ 좋아요. (“The weather is nice.”)\n- 이 사람 ___ 제 친구예요. (“This person is my friend.”)",
    },

    // ══════════════════ Section 3: 조사 2 (을/를, 에, 에서) ══════════════════
    {
      type: "heading",
      level: 1,
      en: "Object & Place Particles: 을/를, 에, 에서",
      ko: "조사 2 (을/를, 에, 에서)",
    },
    {
      type: "text",
      markdown:
        "을/를 marks the **object** — the thing the verb acts on (like 사과를 in 사과를 먹어요, “eat an apple”). Same consonant/vowel rule as before: 을 after a consonant, 를 after a vowel.\n\n에 and 에서 both can mean “at / in / to”, but they answer different questions:\n\n- **에** — a fixed point: where something *exists* or *goes to* (학교에 가요 = “go to school”, 집에 있어요 = “am at home”)\n- **에서** — where an *action* happens (도서관에서 공부해요 = “study at the library”)\n\nQuick test: if you could replace the verb with “is located” or “go to”, use 에. If the verb is something you actively *do* there, use 에서.",
    },
    {
      type: "phrase-cards",
      title: "Example sentences — object & place",
      cards: [
        {
          ko: "저는 빵을 먹어요",
          rr: "jeoneun ppangeul meogeoyo",
          en: "I eat bread.",
          note: "빵 ends in a consonant → 을 (object)",
        },
        {
          ko: "저는 사과를 사요",
          rr: "jeoneun sagwareul sayo",
          en: "I buy an apple.",
          note: "사과 ends in a vowel → 를 (object)",
        },
        {
          ko: "저는 학교에 가요",
          rr: "jeoneun hakgyoe gayo",
          en: "I go to school.",
          note: "에 — destination",
        },
        {
          ko: "저는 도서관에서 공부해요",
          rr: "jeoneun doseogwaneseo gongbuhaeyo",
          en: "I study at the library.",
          note: "에서 — where the action happens",
        },
        {
          ko: "저는 집에 있어요",
          rr: "jeoneun jibe isseoyo",
          en: "I am at home.",
          note: "에 — fixed location with 있어요",
        },
      ],
    },
    {
      type: "text",
      markdown:
        "**Your turn**:\n\n- 저는 ___을/를 먹어요. (name a food — consonant-final noun → 을, vowel-final noun → 를)\n- 저는 ___에 가요. (name a place you go to)\n- 저는 ___에서 공부해요. (name a place where you study)",
    },
    {
      type: "tip",
      audience: "tutor",
      markdown:
        "을/를 규칙과 에/에서 구분은 초보 학생이 가장 자주 헷갈리는 지점이다. 빈칸에 학생이 직접 장소를 넣게 하고, 왜 에/에서를 골랐는지 이유까지 말로 설명하게 하면 오래 기억한다. 헷갈리면 '거기서 뭘 해요, 아니면 그냥 거기 있어요?'라고 되물어 유도.",
    },

    // ══════════════════ Section 4: 해요체 ══════════════════
    {
      type: "heading",
      level: 1,
      en: "Polite Present Tense: -아요/어요 (해요체)",
      ko: "해요체 (-아요/어요)",
    },
    {
      type: "text",
      markdown:
        "Almost every Korean sentence you'll speak ends in **-아요/어요** — the polite, everyday verb ending (해요체). One rule decides which vowel you add to the verb stem:\n\n- Stem's last vowel is **ㅏ or ㅗ** → add **아요**\n- Anything else → add **어요**\n- 하다 verbs (하다, 공부하다, 좋아하다…) → always **해요**\n\nMany stems contract when the vowels meet: 오다 (stem 오 + 아요) becomes 와요, not “오아요”. 마시다 (stem 마시 + 어요) becomes 마셔요, not “마시어요”.",
    },
    {
      type: "drill",
      instruction:
        "Cover the right half of each pair and try to conjugate the verb yourself before checking. Say the whole pair out loud three times.",
      items: [
        { ko: "가다 → 가요", rr: "gada → gayo", en: "to go → go / going" },
        { ko: "먹다 → 먹어요", rr: "meokda → meogeoyo", en: "to eat → eat / eating" },
        { ko: "하다 → 해요", rr: "hada → haeyo", en: "to do → do / doing" },
        { ko: "오다 → 와요", rr: "oda → wayo", en: "to come → come / coming" },
        { ko: "마시다 → 마셔요", rr: "masida → masyeoyo", en: "to drink → drink / drinking" },
      ],
    },
    {
      type: "text",
      markdown:
        "**Your turn** — conjugate the verb in parentheses:\n\n- 저는 매일 한국어를 ___. (공부하다 → ?)\n- 저는 친구를 ___. (만나다 → ? hint: ㅏ + 아 merges into one syllable)\n- 저는 집에 ___. (있다 → ?)",
    },
    {
      type: "tip",
      audience: "tutor",
      markdown:
        "-아요/어요 규칙은 표로 설명하기보다 드릴처럼 소리로 반복시키는 쪽이 더 잘 붙는다. 학생이 사전형(하다/오다/마시다 등)을 말하면 튜터가 즉석에서 활용형을 물어보는 방식으로 라이브 노트에 활용 표를 함께 만들어가면 좋다.",
    },

    // ══════════════════ Section 5: 높임말 ══════════════════
    {
      type: "heading",
      level: 1,
      en: "Politeness Levels: 존댓말 vs 반말 — When and Why",
      ko: "높임말 (존댓말 vs 반말)",
    },
    {
      type: "text",
      markdown:
        "Korean has speech levels — the ending on a verb changes depending on who you're talking to.\n\n- **해요체** (polite, everyday) — what this whole course uses. Safe with strangers, coworkers, older people, and your Preply tutor.\n- **반말** (casual) — drops -요, used only with close friends or much younger people. Using it with the wrong person can sound rude, even without meaning to.\n- **격식체 / 하십시오체** (formal) — announcements, news, business. You'll recognize it (그렇습니다, 감사합니다) more than you'll need to produce it early on.\n\nRule of thumb as a learner: stay in 해요체 until a Korean friend specifically invites you to speak 반말 (반말 해도 돼요? — “Is it okay to speak casually?”).",
    },
    {
      type: "phrase-cards",
      title: "Same phrase, two levels",
      cards: [
        {
          ko: "고마워요",
          rr: "gomawoyo",
          en: "Thank you (해요체)",
          note: "Casual (반말): 고마워 (gomawo)",
        },
        {
          ko: "안녕하세요",
          rr: "annyeonghaseyo",
          en: "Hello (해요체 — safe with anyone)",
          note: "Casual (반말): 안녕 (annyeong)",
        },
        {
          ko: "맛있어요",
          rr: "masisseoyo",
          en: "It's delicious (해요체)",
          note: "Casual (반말): 맛있어 (masisseo)",
        },
        {
          ko: "뭐 하세요?",
          rr: "mwo haseyo?",
          en: "What are you doing? (해요체, honorific -세요)",
          note: "Casual (반말): 뭐 해? (mwo hae?)",
        },
        {
          ko: "이름이 뭐예요?",
          rr: "ireumi mwoyeyo?",
          en: "What's your name? (해요체)",
          note: "Casual (반말): 이름이 뭐야? (ireumi mwoya?)",
        },
      ],
    },
    {
      type: "text",
      markdown:
        "**Your turn** — decide which level fits, then say the phrase out loud:\n\n- You just met your Preply tutor for the first time. Say hello. (해요체 or 반말?)\n- A same-age Korean friend just made you dinner. Say thanks — then try the 반말 version together.\n- A middle schooler asks if it's okay to speak 반말 with you. What do you say back?",
    },

    // ══════════════════ Section 6: 의문문·부정문·과거형 ══════════════════
    {
      type: "heading",
      level: 1,
      en: "Questions, Negatives & Past Tense Starter",
      ko: "의문문·부정문·과거형 맛보기",
    },
    {
      type: "text",
      markdown:
        "Three small tools finish your beginner toolkit:\n\n- **Questions** — drop a question word (뭐 what, 어디 where, 누구 who, 언제 when, 왜 why) into the same S-O-V slot, or just raise your voice at the end of a statement.\n- **Negatives** — put **안** right before the verb: 안 + 가요 = “don't go”.\n- **Past tense** — swap -아요/어요 for **-았어요/었어요** (하다 verbs → 했어요). Same ㅏ/ㅗ vs. everything-else rule as Section 4, just one tense back.",
    },
    {
      type: "phrase-cards",
      title: "Example sentences — question, negative, past",
      cards: [
        {
          ko: "어디에 가요?",
          rr: "eodie gayo?",
          en: "Where are you going?",
          note: "Question word 어디 slots right in — word order doesn't change",
        },
        {
          ko: "저는 학교에 안 가요",
          rr: "jeoneun hakgyoe an gayo",
          en: "I don't go to school.",
          note: "안 goes directly before the verb",
        },
        {
          ko: "어제 저는 친구를 만났어요",
          rr: "eoje jeoneun chingureul mannasseoyo",
          en: "Yesterday I met a friend.",
          note: "만나다 → 만났어요 (past, ㅏ-stem contracts)",
        },
        {
          ko: "저는 어제 안 바빴어요",
          rr: "jeoneun eoje an bappasseoyo",
          en: "I wasn't busy yesterday.",
          note: "Negative + past together: 안 + 바빴어요",
        },
        {
          ko: "뭐 먹었어요?",
          rr: "mwo meogeosseoyo?",
          en: "What did you eat?",
          note: "Question + past: 먹다 → 먹었어요",
        },
      ],
    },
    {
      type: "text",
      markdown:
        "**Your turn**:\n\n- 저는 ___에 안 가요. (name a place you don't go to)\n- 어제 저는 ___을/를 먹었어요. (name something you ate yesterday)\n- ___ 해요? (ask a question using 뭐, 어디, or 누구)",
    },
    {
      type: "tip",
      audience: "tutor",
      markdown:
        "이 섹션은 세 가지 개념(의문문·부정문·과거형)을 한 번에 다뤄 분량이 많다. 학생이 버거워하면 한 수업에 몰아넣지 말고 다음 수업으로 나눠 복습 겸 이어가는 것을 추천. 과거형 활용은 꼭 소리 내어 반복시킬 것.",
    },

    // ══════════════════ 마무리 ══════════════════
    {
      type: "heading",
      level: 2,
      en: "Put It All Together",
      ko: "정리해 보기",
    },
    {
      type: "quiz",
      questions: [
        {
          prompt: "Which word order is correct for “I eat an apple”?",
          choices: ["저는 먹어요 사과를", "저는 사과를 먹어요", "사과를 저는 먹어요"],
          answerIndex: 1,
          explanation:
            "Korean always ends with the verb: Subject(저는) + Object(사과를) + Verb(먹어요).",
        },
        {
          prompt: "날씨 ___ 좋아요. (The weather is nice.) Which particle?",
          choices: ["은", "는", "가"],
          answerIndex: 2,
          explanation: "날씨 ends in a vowel, and this is the grammatical subject, so it takes 가.",
        },
        {
          prompt: "오다 (to come) in 해요체 is…",
          choices: ["오아요", "와요", "오해요"],
          answerIndex: 1,
          explanation: "오 + 아요 contracts into one syllable: 와요.",
        },
        {
          prompt: "How do you say “I don't eat bread”?",
          choices: ["저는 빵을 먹어요 안", "저는 빵을 안 먹어요", "안 저는 빵을 먹어요"],
          answerIndex: 1,
          explanation: "안 goes directly in front of the verb: 빵을 안 먹어요.",
        },
      ],
    },
    {
      type: "tip",
      audience: "student",
      markdown:
        "Pick one pattern from this pack and use it in a real sentence about your own day, out loud, before your next lesson. Real content sticks better than repeating the example sentences.",
    },
    {
      type: "checklist",
      title: "Before next lesson",
      items: [
        { en: "Say all 6 pattern examples out loud once", ko: "6개 패턴 예문 소리 내어 한 번씩 읽기" },
        { en: "Make one new sentence per section using your own words", ko: "섹션마다 내 단어로 문장 하나씩 만들기" },
        { en: "Redo the quiz until every answer is easy", ko: "퀴즈 다시 풀어보기" },
      ],
    },
  ],
};
