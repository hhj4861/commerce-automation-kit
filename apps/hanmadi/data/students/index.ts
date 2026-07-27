/**
 * 학생 레지스트리 — 학생 추가 시 students 배열에 객체 추가.
 * slug가 포털 주소가 된다: /s/{slug} — 로그인 없는 비공개 링크이므로
 * 실제 운영에서는 추측 어려운 slug 권장 (예: "emma-k7x2").
 *
 * 수업이 끝나면: /live에서 "마크다운 복사" → 내용을 해당 학생의
 * lessons 배열에 LessonLog 구조로 옮겨 적고 커밋 → 재배포.
 * 필드 설명은 data/types.ts 주석 참조.
 */
import type { Student } from "@/data/types";

export const students: Student[] = [
  {
    slug: "emma",
    name: "Emma",
    level: "absolute-beginner",
    goal: "Watch K-dramas without subtitles someday",
    feedback: {
      doingWell: [
        "Your ㅏ/ㅗ vowels are already clear — great ear!",
        "You never forget the polite -요 ending. That's the hardest habit, and you have it.",
      ],
      focusOn: [
        "Final consonants (받침): 잔 sounds like *jan*, not *ja*",
        "에서 (from/at a place) vs 에 (to a place) — we'll drill this next lesson",
      ],
    },
    recommendedPackIds: ["hangul-basics", "survival-phrases"],
    nextLesson: {
      when: "Thu, Jul 24 · 7:00 PM (your time)",
      topic: "Numbers & Prices — 얼마예요?",
      bookingUrl: "https://preply.com/",
    },
    lessons: [
      // ── Lesson 1 — 실시간 받아쓰기 교정 예시 (/live에서 복사한 내용을 옮긴 형태)
      {
        id: "l1",
        date: "2026-07-08",
        topic: "Introducing Yourself",
        corrections: [
          {
            said: "저는 Emma예요. 미국에 왔어요.",
            fixed: "저는 엠마예요. 미국에서 왔어요.",
            rr: "jeoneun emmayeyo. migugeseo wasseoyo.",
            note: "“I came FROM” = 에서 왔어요. 에 = to, 에서 = from.",
          },
          {
            said: "만나서 반갑다",
            fixed: "만나서 반가워요",
            rr: "mannaseo bangawoyo",
            note: "Add -요 for the polite tone you want with new people.",
          },
        ],
        phrases: [
          {
            ko: "저는 엠마예요",
            rr: "jeoneun emmayeyo",
            en: "I am Emma",
            example: "저는 엠마예요. 잘 부탁드립니다!",
          },
          {
            ko: "미국에서 왔어요",
            rr: "migugeseo wasseoyo",
            en: "I'm from the U.S.",
          },
          {
            ko: "만나서 반가워요",
            rr: "mannaseo bangawoyo",
            en: "Nice to meet you",
          },
        ],
        puzzle: {
          en: "I'm Emma. I'm from the U.S.",
          words: ["저는", "엠마예요.", "미국에서", "왔어요."],
          rr: "jeoneun emmayeyo. migugeseo wasseoyo.",
          note: "Remember: 에서 = from, 에 = to. You fixed this one in class!",
        },
        homework: [
          {
            en: "Read your self-introduction out loud 3 times",
            ko: "자기소개 소리 내어 3번 읽기",
            rr: "jagisogae sori naeeo se beon ilgi",
            how: "Say the three lines below as one introduction: once slowly, once at normal speed, once while recording yourself. Listening back is where the fixing happens.",
            target: "3 times a day · about 5 minutes",
            phrases: [
              {
                ko: "저는 엠마예요",
                rr: "jeoneun emmayeyo",
                en: "I am Emma",
              },
              {
                ko: "미국에서 왔어요",
                rr: "migugeseo wasseoyo",
                en: "I'm from the U.S.",
              },
              {
                ko: "만나서 반가워요",
                rr: "mannaseo bangawoyo",
                en: "Nice to meet you",
              },
            ],
          },
          {
            en: "Finish the Hangul letters drill",
            ko: "한글 자모 드릴 끝내기",
            rr: "hangeul jamo deuril kkeunnaegi",
            how: "Read the vowel chart out loud, one row at a time. Don't memorize the names — just make the sound each time you see the shape.",
            target: "about 10 minutes",
            packId: "hangul-basics",
          },
        ],
        tutorNote:
          "Fantastic first lesson! You said a full self-introduction in Korean on day one — most students take three lessons to get there.",
      },
      // ── Lesson 2
      {
        id: "l2",
        date: "2026-07-15",
        topic: "Ordering at a Café",
        corrections: [
          {
            said: "커피 하나 있어요?",
            fixed: "커피 한 잔 주세요.",
            rr: "keopi han jan juseyo.",
            note: "Drinks use the counter 잔 (jan). 한 잔 = one cup.",
          },
          {
            said: "얼마이에요?",
            fixed: "얼마예요?",
            rr: "eolmayeyo?",
            note: "After a vowel, -이에요 shortens to -예요.",
          },
          {
            said: "감사해요",
            fixed: "감사합니다",
            rr: "gamsahamnida",
            note: "To staff and strangers, 감사합니다 sounds warmer and more polite.",
          },
        ],
        phrases: [
          {
            ko: "아이스 아메리카노 한 잔 주세요",
            rr: "aiseu amerikano han jan juseyo",
            en: "One iced americano, please",
          },
          {
            ko: "얼마예요?",
            rr: "eolmayeyo?",
            en: "How much is it?",
          },
          {
            ko: "포장이요",
            rr: "pojangiyo",
            en: "To go, please",
            example: "아이스 아메리카노 한 잔 주세요. 포장이요!",
          },
        ],
        puzzle: {
          en: "One iced americano, please. To go!",
          words: ["아이스", "아메리카노", "한", "잔", "주세요.", "포장이요!"],
          rr: "aiseu amerikano han jan juseyo. pojangiyo!",
          note: "Drinks use the counter 잔 — 한 잔 = one cup.",
        },
        homework: [
          {
            en: "Order your imaginary coffee out loud every morning",
            ko: "아침마다 소리 내어 커피 주문해 보기",
            rr: "achimmada sori naeeo keopi jumunhae bogi",
            how: "Stand in your kitchen and order out loud, in one breath: the drink, then “to go”. Watch the counter 잔 — 한 잔, not 하나.",
            target: "Once every morning · 1 minute",
            phrases: [
              {
                ko: "아이스 아메리카노 한 잔 주세요",
                rr: "aiseu amerikano han jan juseyo",
                en: "One iced americano, please",
              },
              {
                ko: "얼마예요?",
                rr: "eolmayeyo?",
                en: "How much is it?",
              },
              {
                ko: "포장이요",
                rr: "pojangiyo",
                en: "To go, please",
              },
            ],
          },
          {
            en: "Skim the Survival Phrases pack before next class",
            ko: "다음 수업 전에 필수 표현 팩 훑어보기",
            rr: "daeum sueop jeone pilsu pyohyeon paek hulteobogi",
            how: "You don't need to memorize anything — just note 1-2 phrases you want to try in our next lesson about numbers and prices.",
            target: "about 10 minutes",
            packId: "survival-phrases",
          },
        ],
        tutorNote:
          "Your café role-play was so natural! Next time we'll add numbers so you can understand the price they say back.",
      },
    ],
  },
];

export function getStudent(slug: string): Student | undefined {
  return students.find((s) => s.slug === slug);
}

/** 포털 헤더 통계: 누적 수업 횟수 / 배운 표현 수 */
export function studentStats(student: Student): {
  lessonCount: number;
  phraseCount: number;
} {
  return {
    lessonCount: student.lessons.length,
    phraseCount: student.lessons.reduce((n, l) => n + l.phrases.length, 0),
  };
}
