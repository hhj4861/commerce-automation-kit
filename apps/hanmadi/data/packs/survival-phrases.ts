/**
 * 생존 표현 팩 — 한글을 못 읽어도 시작 가능한 음성 우선(audio-first) 팩.
 * 모든 표현을 [한국어 / RR 로마자 / 영어 뜻] 3단 카드로 제공한다.
 * 체험수업에서 "오늘 5문장 말했어요" 성취감을 주는 용도로 설계.
 * 블록 필드 설명은 data/types.ts 주석 참조.
 */
import type { Pack } from "@/data/types";

export const pack: Pack = {
  id: "survival-phrases",
  title: {
    en: "Essential Survival Phrases",
    ko: "필수 생존 표현",
  },
  level: "absolute-beginner",
  category: "essential-phrases",
  minutes: 30,
  summary:
    "한글을 몰라도 오늘 바로 한국어로 말해요. 로마자 발음만 보고 소리 내어 따라 하면 끝.",
  order: 3,
  learns: [
    "인사하기, 자기소개하기, 작별 인사하기",
    "네/아니요, 부탁, 감사, 사과 표현 제대로 쓰기",
    "도움 요청하기, 1~10 숫자 세기, 가격·나이 말하기",
  ],
  tutorGuide:
    "체험수업 최우선 팩. 학생이 한글을 전혀 못 읽어도 로마자만 보고 따라 말하게 한다. " +
    "시간이 짧으면 Greetings + Yes/No/Please 두 섹션만 화면공유로 함께 읽고, 나머지는 " +
    "재수강 유도용 자습 숙제로 남겨둔다. 목표는 완벽한 발음이 아니라 '오늘 5문장 말했어요'라는 " +
    "성취감 — 수업 마무리에 이 문구를 그대로 언급하면 좋다.",
  blocks: [
    // ── heading (level 1): 팩 전체 인트로
    {
      type: "heading",
      level: 1,
      en: "Speak Your First Korean in 5 Minutes",
      ko: "5분 안에 첫 한국어",
    },

    {
      type: "text",
      markdown:
        "You do **not** need to read Hangul to use this pack. Every phrase comes with a romanization " +
        "(the Korean written in English letters) — just sound it out.\n\n" +
        "A quick key: **eo** sounds like the \"aw\" in \"saw\", **eu** sounds like the \"oo\" in \"good\" " +
        "said with flat lips, and double letters like **kk**, **tt**, **ss** are tense/sharp versions of " +
        "k, t, s. Don't worry about being perfect — say it, and keep going.",
    },

    {
      type: "tip",
      audience: "tutor",
      markdown:
        "체험수업 도입부(첫 5분)에 이 팁을 활용. 로마자만 보고 소리 내어 읽게 하고, 튜터가 먼저 1번 " +
        "시범 → 학생 2~3번 따라 읽기. 한글은 전혀 언급하지 않아도 된다 — 이 팩의 목표는 '읽기'가 아니라 " +
        "'말하기' 성공 경험이다.",
    },

    // ══════════════════════════ Section 1: Greetings & Goodbyes ══════════════════════════
    {
      type: "heading",
      level: 2,
      en: "Greetings & Goodbyes",
      ko: "인사",
    },
    {
      type: "phrase-cards",
      title: "Say hello and goodbye",
      cards: [
        {
          ko: "안녕하세요",
          rr: "annyeonghaseyo",
          en: "Hello / Hi",
          note: "Works any time of day, to anyone — your one all-purpose greeting.",
        },
        {
          ko: "안녕히 가세요",
          rr: "annyeonghi gaseyo",
          en: "Goodbye",
          note: "Say this to someone who is leaving while you stay behind.",
        },
        {
          ko: "안녕히 계세요",
          rr: "annyeonghi gyeseyo",
          en: "Goodbye",
          note: "Say this when you are the one leaving and they stay behind.",
        },
        {
          ko: "또 만나요",
          rr: "tto mannayo",
          en: "See you again",
        },
        {
          ko: "다음에 봐요",
          rr: "daeume bwayo",
          en: "See you next time",
          note: "A friendly way to end a lesson — great line for your tutor to hear.",
        },
        {
          ko: "안녕히 주무세요",
          rr: "annyeonghi jumuseyo",
          en: "Good night",
          note: "Extra-polite version — safe to use with a teacher or someone older.",
        },
      ],
    },
    {
      type: "drill",
      instruction: "Read each greeting out loud 3 times before moving on.",
      items: [
        { ko: "안녕하세요", rr: "annyeonghaseyo", en: "Hello" },
        { ko: "안녕히 가세요", rr: "annyeonghi gaseyo", en: "Goodbye (to the one leaving)" },
        { ko: "안녕히 계세요", rr: "annyeonghi gyeseyo", en: "Goodbye (from the one leaving)" },
        { ko: "다음에 봐요", rr: "daeume bwayo", en: "See you next time" },
      ],
    },

    // ══════════════════════════ Section 2: Introducing Yourself ══════════════════════════
    {
      type: "heading",
      level: 2,
      en: "Introducing Yourself",
      ko: "자기소개",
    },
    {
      type: "phrase-cards",
      title: "Say who you are",
      cards: [
        {
          ko: "저는 사라예요",
          rr: "jeoneun sarayeyo",
          en: "I'm Sarah",
          note: "Swap 사라 (Sarah) for your own name.",
        },
        {
          ko: "만나서 반가워요",
          rr: "mannaseo bangawoyo",
          en: "Nice to meet you",
        },
        {
          ko: "이름이 뭐예요?",
          rr: "ireumi mwoyeyo?",
          en: "What's your name?",
        },
        {
          ko: "저는 미국에서 왔어요",
          rr: "jeoneun migugeseo wasseoyo",
          en: "I'm from the U.S.",
          note: "Swap 미국 (U.S.) for your own country's name.",
        },
        {
          ko: "한국어를 배우고 있어요",
          rr: "hangugeoreul baeugo isseoyo",
          en: "I'm learning Korean",
        },
        {
          ko: "잘 부탁드립니다",
          rr: "jal butakdeurimnida",
          en: "Nice to meet you — let's get along",
          note: "A polite closing line after introducing yourself. Very commonly heard.",
        },
      ],
    },
    {
      type: "dialogue",
      speakers: { a: "Tutor", b: "You" },
      lines: [
        { speaker: "A", ko: "안녕하세요! 이름이 뭐예요?", rr: "annyeonghaseyo! ireumi mwoyeyo?", en: "Hello! What's your name?" },
        { speaker: "B", ko: "저는 사라예요. 만나서 반가워요.", rr: "jeoneun sarayeyo. mannaseo bangawoyo.", en: "I'm Sarah. Nice to meet you." },
        { speaker: "A", ko: "어디에서 왔어요?", rr: "eodieseo wasseoyo?", en: "Where are you from?" },
        { speaker: "B", ko: "미국에서 왔어요.", rr: "migugeseo wasseoyo.", en: "I'm from the U.S." },
      ],
    },

    // ══════════════════════════ Section 3: Yes / No / Please / Thank You / Sorry ══════════════════════════
    {
      type: "heading",
      level: 2,
      en: "Yes, No, Please, Thank You & Sorry",
      ko: "기본 응답",
    },
    {
      type: "phrase-cards",
      title: "The four words you'll use constantly",
      cards: [
        { ko: "네", rr: "ne", en: "Yes" },
        { ko: "아니요", rr: "aniyo", en: "No" },
        {
          ko: "주세요",
          rr: "juseyo",
          en: "Please give me ~",
          note: "Point at anything + 주세요 = instant shopping/ordering skill.",
        },
        {
          ko: "감사합니다",
          rr: "gamsahamnida",
          en: "Thank you (formal)",
          note: "Safe in any situation — strangers, shops, your tutor.",
        },
      ],
    },
    {
      type: "phrase-cards",
      title: "Apologies & \"no problem\"",
      cards: [
        {
          ko: "고마워요",
          rr: "gomawoyo",
          en: "Thanks",
          note: "A warmer, everyday version of 감사합니다 — good with friends.",
        },
        {
          ko: "죄송합니다",
          rr: "joesonghamnida",
          en: "I'm sorry (formal)",
        },
        {
          ko: "괜찮아요",
          rr: "gwaenchanayo",
          en: "It's okay / No problem",
          note: "Use it to accept someone's apology, or to say you're fine.",
        },
      ],
    },
    {
      type: "tip",
      audience: "student",
      markdown:
        "감사합니다 (gamsahamnida) and 고마워요 (gomawoyo) both mean \"thank you\" — the first is a little " +
        "more formal, the second a little friendlier. When in doubt in a new situation, start formal " +
        "with 감사합니다; you can always warm up to 고마워요 later.",
    },
    {
      type: "drill",
      instruction: "Say each word out loud 3 times. These four will carry you through almost any interaction.",
      items: [
        { ko: "네", rr: "ne", en: "Yes" },
        { ko: "아니요", rr: "aniyo", en: "No" },
        { ko: "주세요", rr: "juseyo", en: "Please give me" },
        { ko: "감사합니다", rr: "gamsahamnida", en: "Thank you" },
      ],
    },

    // ══════════════════════════ Section 4: "I Don't Understand" — Asking for Help ══════════════════════════
    {
      type: "heading",
      level: 2,
      en: "\"I Don't Understand\" — Asking for Help",
      ko: "도움 요청 표현",
    },
    {
      type: "phrase-cards",
      title: "When you get stuck, say this",
      cards: [
        {
          ko: "잘 모르겠어요",
          rr: "jal moreugesseoyo",
          en: "I'm not sure / I don't really know",
        },
        {
          ko: "이해가 안 돼요",
          rr: "ihaega an dwaeyo",
          en: "I don't understand",
        },
        {
          ko: "다시 한번 말해 주세요",
          rr: "dasi hanbeon malhae juseyo",
          en: "Please say that again",
        },
        {
          ko: "천천히 말해 주세요",
          rr: "cheoncheonhi malhae juseyo",
          en: "Please speak slowly",
        },
        {
          ko: "한국어로 어떻게 말해요?",
          rr: "hangugeoro eotteoke malhaeyo?",
          en: "How do you say that in Korean?",
        },
        {
          ko: "영어로 뭐예요?",
          rr: "yeongeoro mwoyeyo?",
          en: "What is that in English?",
        },
        {
          ko: "써 주세요",
          rr: "sseo juseyo",
          en: "Please write it down",
          note: "Great in a lesson — point at the chat box and say this.",
        },
      ],
    },
    {
      type: "dialogue",
      speakers: { a: "Tutor", b: "You" },
      lines: [
        { speaker: "B", ko: "이거 이해가 안 돼요.", rr: "igeo ihaega an dwaeyo.", en: "I don't understand this." },
        { speaker: "A", ko: "괜찮아요! 다시 설명할게요.", rr: "gwaenchanayo! dasi seolmyeonghalgeyo.", en: "That's okay! I'll explain again." },
        { speaker: "B", ko: "천천히 말해 주세요.", rr: "cheoncheonhi malhae juseyo.", en: "Please speak slowly." },
        { speaker: "A", ko: "네, 알겠어요.", rr: "ne, algesseoyo.", en: "Yes, got it." },
      ],
    },

    // ══════════════════════════ Section 5: Numbers, Money & Age Basics ══════════════════════════
    {
      type: "heading",
      level: 2,
      en: "Numbers, Money & Age Basics",
      ko: "숫자·돈·나이",
    },
    {
      type: "text",
      markdown:
        "Korean has **two number systems**. Don't worry about mastering both today — for now, just meet " +
        "the one used for money, phone numbers, and dates: **Sino-Korean numbers**. (The other system, " +
        "Native Korean numbers, is used for counting objects and telling age — you'll only need a couple " +
        "of those below.)",
    },
    {
      type: "phrase-cards",
      title: "Sino-Korean numbers 1–10 (money, phone numbers)",
      cards: [
        { ko: "일", rr: "il", en: "1" },
        { ko: "이", rr: "i", en: "2" },
        { ko: "삼", rr: "sam", en: "3" },
        { ko: "사", rr: "sa", en: "4" },
        { ko: "오", rr: "o", en: "5" },
        { ko: "육", rr: "yuk", en: "6" },
        { ko: "칠", rr: "chil", en: "7" },
        { ko: "팔", rr: "pal", en: "8" },
        { ko: "구", rr: "gu", en: "9" },
        { ko: "십", rr: "sip", en: "10" },
      ],
    },
    {
      type: "phrase-cards",
      title: "Talking about price",
      cards: [
        { ko: "얼마예요?", rr: "eolmayeyo?", en: "How much is it?" },
        { ko: "비싸요", rr: "bissayo", en: "It's expensive" },
        { ko: "싸요", rr: "ssayo", en: "It's cheap" },
        {
          ko: "카드 돼요?",
          rr: "kadeu dwaeyo?",
          en: "Can I pay by card?",
        },
        {
          ko: "현금만 돼요",
          rr: "hyeongeumman dwaeyo",
          en: "Cash only",
          note: "This is what a cashier might tell you.",
        },
      ],
    },
    {
      type: "phrase-cards",
      title: "Talking about age",
      cards: [
        {
          ko: "저는 서른 살이에요",
          rr: "jeoneun seoreun sarieyo",
          en: "I'm 30 years old",
          note: "Age uses Native Korean numbers + 살 (sal) — swap 서른 (30) for your own age.",
        },
        {
          ko: "나이가 어떻게 되세요?",
          rr: "naiga eotteoke doeseyo?",
          en: "How old are you?",
          note: "The polite way to ask an adult's age.",
        },
      ],
    },
    {
      type: "tip",
      audience: "tutor",
      markdown:
        "두 숫자 체계를 한 번에 다 가르치려 하지 말 것. 체험수업에서는 Sino-Korean 1~10과 " +
        "'얼마예요?'만 확실히 익히게 하고, 나이 표현은 예시 하나만 보여준 뒤 다음 수업 주제로 남겨둔다.",
    },
    {
      type: "quiz",
      questions: [
        {
          prompt: "You want to ask the price of a necklace at a market. What do you say?",
          choices: ["비싸요", "얼마예요?", "싸요"],
          answerIndex: 1,
          explanation: "얼마예요? (eolmayeyo?) = \"How much is it?\" — the question that starts every purchase.",
        },
        {
          prompt: "Which is the Sino-Korean number \"7\", used for phone numbers?",
          choices: ["칠", "일곱", "구"],
          answerIndex: 0,
          explanation:
            "칠 (chil) is the Sino-Korean 7, used for phone numbers, math, and money. 일곱 (ilgop) is the Native Korean 7, used for counting objects and age.",
        },
      ],
    },

    // ══════════════════════════ Section 6: Classroom Korean ══════════════════════════
    {
      type: "heading",
      level: 2,
      en: "Classroom Korean: Phrases We Use in Lessons",
      ko: "수업에서 쓰는 한국어",
    },
    {
      type: "tip",
      audience: "tutor",
      markdown:
        "이 섹션의 목적은 학생이 향후 수업(또는 완전 한국어 몰입 수업)에서 튜터의 지시어를 알아듣게 " +
        "만드는 것. 체험수업 마무리에 이 카드들을 한 번 훑어주면 다음 수업부터 한국어 지시를 더 " +
        "편안하게 느낀다.",
    },
    {
      type: "phrase-cards",
      title: "Phrases your tutor uses — and how to reply",
      cards: [
        {
          ko: "따라 하세요",
          rr: "ttara haseyo",
          en: "Repeat after me",
          note: "Your tutor will say this before drills.",
        },
        {
          ko: "잘했어요!",
          rr: "jalhaesseoyo!",
          en: "Well done! / Great job!",
          note: "Common praise — enjoy hearing it often.",
        },
        {
          ko: "다시 한번 해 보세요",
          rr: "dasi hanbeon hae boseyo",
          en: "Try that one more time",
          note: "Not a correction — just more practice.",
        },
        {
          ko: "여기 보세요",
          rr: "yeogi boseyo",
          en: "Look here",
          note: "Usually points to the shared screen.",
        },
        {
          ko: "읽어 보세요",
          rr: "ilgeo boseyo",
          en: "Try reading this",
          note: "Sound it out — mistakes are expected.",
        },
        {
          ko: "이해했어요?",
          rr: "ihaehaesseoyo?",
          en: "Do you understand?",
          note: "Answer honestly — 네 or 아니요 are both fine answers.",
        },
        {
          ko: "네, 이해했어요",
          rr: "ne, ihaehaesseoyo",
          en: "Yes, I understand",
          note: "Your go-to reply when things click.",
        },
        {
          ko: "잘 모르겠어요, 다시 설명해 주세요",
          rr: "jal moreugesseoyo, dasi seolmyeonghae juseyo",
          en: "I don't get it, please explain again",
          note: "Perfectly fine to say — that's exactly what lessons are for.",
        },
      ],
    },
    {
      type: "dialogue",
      speakers: { a: "Tutor", b: "You" },
      lines: [
        { speaker: "A", ko: "따라 하세요: 안녕하세요.", rr: "ttara haseyo: annyeonghaseyo.", en: "Repeat after me: Hello." },
        { speaker: "B", ko: "안녕하세요.", rr: "annyeonghaseyo.", en: "Hello." },
        { speaker: "A", ko: "잘했어요! 다시 한번 해 보세요.", rr: "jalhaesseoyo! dasi hanbeon hae boseyo.", en: "Great! Try once more." },
        { speaker: "B", ko: "네, 이해했어요.", rr: "ne, ihaehaesseoyo.", en: "Yes, I understand." },
      ],
    },

    // ── 마무리
    {
      type: "tip",
      audience: "student",
      markdown:
        "Count what you just did: you greeted someone, introduced yourself, said thank you, asked for " +
        "help, and understood a classroom instruction — all in Korean. **오늘 5문장 말했어요!** (\"I spoke " +
        "5 sentences today!\") That's a real conversation, not just vocabulary.",
    },
    {
      type: "checklist",
      title: "Before your next lesson",
      items: [
        { en: "Say all six greetings out loud once", ko: "인사 표현 6개 소리 내어 말하기" },
        { en: "Introduce yourself without looking at the cards", ko: "카드 안 보고 자기소개 하기" },
        { en: "Practice the \"I don't understand\" phrases until they feel natural", ko: "도움 요청 표현 자연스럽게 말하기" },
        { en: "Count 1–10 in Sino-Korean without pausing", ko: "숫자 1~10 막힘없이 세기" },
        { en: "Recognize each classroom phrase when your tutor says it", ko: "수업 지시어 듣고 이해하기" },
      ],
    },
  ],
};
