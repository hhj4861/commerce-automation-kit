/**
 * 데모 팩 — 모든 블록 타입을 1개씩 시연한다.
 * 새 팩을 만들 때 이 파일을 복사해서 시작하면 된다.
 * 블록 필드 설명은 data/types.ts 주석 참조.
 */
import type { Pack } from "@/data/types";

export const demoPack: Pack = {
  id: "demo",
  title: {
    en: "Starter: Greetings & First Words",
    ko: "첫인사와 첫 표현",
  },
  level: "absolute-beginner",
  category: "essential-phrases",
  minutes: 20,
  summary: "Your very first Korean phrases — greet, thank, and ask politely.",
  learns: [
    "Greet anyone politely with 안녕하세요",
    "Say thank you and ask for things with 주세요",
    "Read your first Hangul syllables (ㄱ + ㅏ = 가)",
  ],
  order: 1,
  tutorGuide:
    "체험수업 직후 첫 자습용으로 추천. 수업에서는 phrase-cards를 화면공유로 함께 읽고, drill은 학생 혼자 복습하게 남겨둔다. 퀴즈는 다음 수업 워밍업으로 재사용.",
  blocks: [
    // ── heading (level 1): 팩의 큰 장 — TOC에 표시된다
    {
      type: "heading",
      level: 1,
      en: "Three Phrases That Open Every Door",
      ko: "문을 여는 세 마디",
    },

    // ── text: 마크다운 설명 문단
    {
      type: "text",
      markdown:
        "Korean politeness lives in the ending **-요 (-yo)**. Add it and almost any phrase becomes polite enough for strangers, cafés, and taxis.\n\nIn this pack you will learn three phrases that Koreans use *every single day* — plus how Hangul puts sounds together.",
    },

    // ── tip (tutor): 앰버 카드, 학생 모드에서는 숨겨진다 — 한국어로 작성
    {
      type: "tip",
      audience: "tutor",
      markdown:
        "첫 수업이면 카드 3장을 **한 장씩** 화면에 크게 두고, 튜터가 2번 읽고 학생이 3번 따라 읽게 한다. 학생 발음은 /live 교정 로그에 바로 받아쓰기.",
    },

    // ── phrase-cards: 한국어 초대형 / RR / 영어 3단 카드
    {
      type: "phrase-cards",
      title: "Today's phrases",
      cards: [
        {
          ko: "안녕하세요",
          rr: "annyeonghaseyo",
          en: "Hello (polite)",
          note: "Works any time of day, to anyone.",
        },
        {
          ko: "감사합니다",
          rr: "gamsahamnida",
          en: "Thank you (formal)",
          note: "Slight bow of the head makes it perfect.",
        },
        {
          ko: "주세요",
          rr: "juseyo",
          en: "Please give me ~",
          note: "Point at anything + 주세요 = instant shopping skill.",
        },
      ],
    },

    // ── heading (level 2): 소단원
    {
      type: "heading",
      level: 2,
      en: "Hangul Is a Puzzle",
      ko: "한글은 퍼즐",
    },

    // ── text + phrase-cards로 자모 조합 차트 표현 (별도 table 블록 없음)
    {
      type: "text",
      markdown:
        "Hangul letters snap together like blocks: a consonant plus a vowel makes one syllable. **ㄱ (g) + ㅏ (a) = 가 (ga)**. That is the whole trick.",
    },
    {
      type: "phrase-cards",
      title: "Consonant + vowel = syllable",
      cards: [
        { ko: "ㄱ + ㅏ = 가", rr: "g + a = ga", en: "like “ga” in garden" },
        { ko: "ㄴ + ㅏ = 나", rr: "n + a = na", en: "like “na” in nachos" },
        { ko: "ㅅ + ㅏ = 사", rr: "s + a = sa", en: "like “sa” in salsa" },
      ],
    },

    // ── heading + dialogue: A/B 말풍선 — 역할 바꿔 읽기 연습
    {
      type: "heading",
      level: 2,
      en: "Practice Together",
      ko: "함께 연습",
    },
    {
      type: "dialogue",
      speakers: { a: "Tutor", b: "You" },
      lines: [
        {
          speaker: "A",
          ko: "안녕하세요!",
          rr: "annyeonghaseyo!",
          en: "Hello!",
        },
        {
          speaker: "B",
          ko: "안녕하세요! 만나서 반가워요.",
          rr: "annyeonghaseyo! mannaseo bangawoyo.",
          en: "Hello! Nice to meet you.",
        },
        {
          speaker: "A",
          ko: "커피 주세요.",
          rr: "keopi juseyo.",
          en: "Coffee, please.",
        },
        {
          speaker: "B",
          ko: "네! 감사합니다.",
          rr: "ne! gamsahamnida.",
          en: "Yes! Thank you.",
        },
      ],
    },

    // ── drill: 한 문장씩 초대형으로 — 발음 반복 전용
    {
      type: "drill",
      instruction: "Read each phrase out loud 3 times. Slow is fine — clear beats fast.",
      items: [
        { ko: "안녕하세요", rr: "annyeonghaseyo", en: "Hello" },
        { ko: "감사합니다", rr: "gamsahamnida", en: "Thank you" },
        { ko: "커피 주세요", rr: "keopi juseyo", en: "Coffee, please" },
        {
          ko: "천천히 말해 주세요",
          rr: "cheoncheonhi malhae juseyo",
          en: "Please speak slowly",
        },
      ],
    },

    // ── heading + quiz: 탭하면 정답/해설 공개
    {
      type: "heading",
      level: 2,
      en: "Check Yourself",
      ko: "확인해 보기",
    },
    {
      type: "quiz",
      questions: [
        {
          prompt: "You want to order water (물, mul). What do you say?",
          choices: ["물 감사합니다", "물 주세요", "물 안녕하세요"],
          answerIndex: 1,
          explanation: "주세요 (juseyo) = “please give me.” 물 주세요 = “Water, please.”",
        },
        {
          prompt: "ㄴ (n) + ㅏ (a) makes which syllable?",
          choices: ["가", "나", "사"],
          answerIndex: 1,
          explanation: "ㄴ + ㅏ = 나 (na). Same puzzle every time!",
        },
      ],
    },

    // ── tip (student): 항상 표시되는 학습 요령 — 영어로 작성
    {
      type: "tip",
      audience: "student",
      markdown:
        "Say 안녕하세요 out loud to your mirror every morning this week. Ten seconds a day builds the muscle memory faster than one long session.",
    },

    // ── checklist: 체크 상태는 브라우저에 저장된다
    {
      type: "checklist",
      title: "Before next lesson",
      items: [
        { en: "Read the drill out loud 3 times", ko: "드릴 소리 내어 3번 읽기" },
        { en: "Write 가 / 나 / 사 by hand once", ko: "가·나·사 손으로 써 보기" },
        { en: "Try the quiz until both answers are easy", ko: "퀴즈 다시 풀기" },
      ],
    },
  ],
};
