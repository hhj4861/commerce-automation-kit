/**
 * 레벨 체크 & 온보딩 — 체험수업(25분) 전용 마스터 팩.
 * 별도의 체험수업 대본과 짝을 이루며, 이 팩 하나로 라포 형성 → 목표 인터뷰 →
 * 간이 레벨 체크(읽기/말하기) → 레벨 판정 → 맞춤 학습 플랜 안내까지 진행한다.
 *
 * 타입 관련 결정 사항 (types.ts의 스키마 제약 때문에 그대로 매핑 불가한 값들):
 * - level: 원래는 모든 레벨의 체험수업에서 공통으로 쓰이지만, PackLevel에
 *   "ALL"이 없어 가장 보수적인 값인 "absolute-beginner"로 지정했다.
 *   (레벨 체크 자체가 목적이라 실제 필터링에는 큰 영향이 없다.)
 * - category: 전용 "onboarding" 카테고리가 없어 대화/문장 위주 내용과 가장
 *   가까운 "essential-phrases"로 분류했다.
 * - order: 지정하지 않았다. order는 "자율학습 트랙"(라이브러리의 이전/다음
 *   내비게이션) 기준인데, 이 팩은 학생이 스스로 찾아 진행하는 자습 팩이 아니라
 *   튜터가 체험수업 중 화면공유로 직접 진행하는 라이브 진행용 팩이기 때문이다.
 */
import type { Pack } from "@/data/types";

export const levelCheckOnboardingPack: Pack = {
  id: "level-check-onboarding",
  title: {
    en: "Level Check & Onboarding",
    ko: "레벨 체크 & 온보딩",
  },
  level: "absolute-beginner",
  category: "essential-phrases",
  minutes: 25,
  summary:
    "25분 체험수업 진행 팩 — 수업 방식 안내, 목표 인터뷰, 간이 한글·말하기 레벨 체크, 맞춤 학습 플랜 안내까지 한 번에",
  learns: [
    "수업 진행 방식 안내하기 (화면공유, 실시간 교정, 수업 후 포털 링크 제공)",
    "목표 인터뷰로 학생의 학습 목표 파악하기",
    "한글 읽기·말하기 간이 체크로 시작 레벨 판정하고 맞춤 학습 플랜 안내하기",
  ],
  tutorGuide:
    "체험수업(25분) 진행용 마스터 팩 — 별도의 체험수업 대본과 세트로 사용한다.\n" +
    "진행 순서 및 권장 시간: ① 수업 방식 안내(2~3분) → ② 목표 인터뷰(7~8분) → " +
    "③ 읽기 레벨 체크(5분) → ④ 말하기 레벨 체크(5분) → ⑤ 레벨 판정(튜터 내부 판단) → " +
    "⑥ 학습 플랜 안내(2~3분).\n" +
    "수업이 끝나면 반드시 학생 포털(Student 레코드)에 level/goal/feedback/" +
    "recommendedPackIds/nextLesson을 채워야 다음 수업과 자연스럽게 연결된다 " +
    "(섹션 6의 튜터 노트 참고). 학생 반응에 따라 각 섹션 시간은 유연하게 조정할 것.",
  blocks: [
    /* ══════════════ 1. Welcome! How Our Lessons Work ══════════════ */
    {
      type: "heading",
      level: 1,
      en: "Welcome! How Our Lessons Work",
      ko: "수업 방식 안내",
    },
    {
      type: "text",
      markdown:
        "Welcome to your first Korean lesson! Here's what to expect today:\n\n" +
        "- I will **share my screen** the whole time — you'll see every word I type, in real time.\n" +
        "- When you speak, I'll write down corrections right on screen, so you can read them as we go.\n" +
        "- After the lesson, I'll send you a **private link** with everything we covered — notes, corrections, and new words — so you never have to scramble to take notes.\n" +
        "- This first lesson isn't a test. It's just how we get to know each other and find the right starting point for you.",
    },
    {
      type: "tip",
      audience: "tutor",
      markdown:
        "수업 시작 전 화면공유가 잘 되는지 먼저 확인한다. 카메라 On 여부는 학생 편한 대로 두고 강요하지 않는다. " +
        "이 팩은 처음부터 끝까지 그대로 따라가기보다, 학생 반응에 따라 시간 배분을 유연하게 조정한다 " +
        "(목표 인터뷰 7~8분, 레벨 체크 두 개 합쳐 10분 내외, 플랜 안내 2~3분 목표).",
    },
    {
      type: "tip",
      audience: "student",
      markdown:
        "There's no need to prepare anything for today. Just relax, be yourself, and try your best — mistakes are exactly how we find out what to teach you next!",
    },

    /* ══════════════ 2. Getting to Know You: Goal Interview ══════════════ */
    {
      type: "heading",
      level: 1,
      en: "Getting to Know You: Goal Interview",
      ko: "목표 인터뷰 질문지",
    },
    {
      type: "text",
      markdown:
        "Before we dive into Korean, I want to understand **why** you're learning it. Your answers will shape everything we do together — which words we practice, which topics we choose, and how fast we go.",
    },
    {
      type: "tip",
      audience: "tutor",
      markdown:
        "다음 질문을 편하게 대화하듯 물어보고, 답변은 학생 포털의 goal / feedback 필드에 요약해 기록한다.\n\n" +
        "- 한국어를 배우는 이유가 무엇인가요? (여행, 가족, K-pop/드라마, 업무, 취미 등)\n" +
        "- 목표 달성 기한이 있나요? (예: 3개월 뒤 한국 여행)\n" +
        "- 전에 한국어를 배워본 적이 있나요? 얼마나, 어떻게(앱/책/수업) 배웠나요?\n" +
        "- 매주 얼마나 자주, 얼마나 오래 연습할 수 있나요?\n" +
        "- 말하기/듣기/읽기/쓰기 중 가장 자신 없는 부분은 무엇인가요?\n\n" +
        "답변이 짧으면 \"조금 더 자세히 말해줄 수 있어요?\" 정도로 편하게 풀어간다. " +
        "질문지를 그대로 읽지 말고 자연스러운 대화처럼 진행할 것.",
    },
    {
      type: "phrase-cards",
      title: "Try Saying Your Goal in Korean",
      cards: [
        {
          ko: "제 목표는 여행이에요.",
          rr: "je mokpyoneun yeohaengieyo.",
          en: "My goal is travel.",
          note: "Swap in your own goal: work, family, K-pop, hobby...",
        },
        {
          ko: "천천히 배우고 있어요.",
          rr: "cheoncheonhi baeugo isseoyo.",
          en: "I'm learning (it) slowly.",
          note: "A relaxed, honest way to describe your pace.",
        },
        {
          ko: "잘 부탁드립니다.",
          rr: "jal butakdeurimnida.",
          en: "I look forward to working with you.",
          note: "A warm, very common phrase to end an introduction.",
        },
      ],
    },

    /* ══════════════ 3. Quick Check 1: Can You Read Hangul? ══════════════ */
    {
      type: "heading",
      level: 1,
      en: "Quick Check 1: Can You Read Hangul?",
      ko: "읽기 레벨 체크",
    },
    {
      type: "text",
      markdown:
        "Let's see how Hangul looks to you right now. I'll show you some Korean words — just try to **sound them out**, even if you don't know what they mean yet. There's no wrong answer here; this just helps me see where to start.",
    },
    {
      type: "drill",
      instruction:
        "Read each one out loud. Take your time — sounding it out matters more than speed.",
      items: [
        { ko: "가", rr: "ga", en: "(a single syllable)" },
        { ko: "나라", rr: "nara", en: "country" },
        { ko: "안녕", rr: "annyeong", en: "hi / bye (casual)" },
        { ko: "감사합니다", rr: "gamsahamnida", en: "thank you (formal)" },
        { ko: "학교", rr: "hakgyo", en: "school" },
        { ko: "괜찮아요", rr: "gwaenchanayo", en: "it's okay" },
        { ko: "맛있어요", rr: "masisseoyo", en: "it's delicious" },
      ],
    },
    {
      type: "quiz",
      questions: [
        {
          prompt: "Which word means \"thank you\" (formal)?",
          choices: ["안녕", "감사합니다", "학교"],
          answerIndex: 1,
          explanation:
            "감사합니다 (gamsahamnida) is the formal way to say thank you. 안녕 is a casual hi/bye, and 학교 means school.",
        },
        {
          prompt: "How do you romanize 학교?",
          choices: ["hakgyo", "hakkyo", "hakyo"],
          answerIndex: 0,
          explanation:
            "학교 is romanized hakgyo. It actually sounds like a crisp \"hak-kyo,\" but Korean's official Romanization spells the letters as written, not the extra crispness.",
        },
      ],
    },
    {
      type: "tip",
      audience: "tutor",
      markdown:
        "채점 기준(참고용):\n\n" +
        "- 음절 단위(가/나/사 등)도 더듬거리면 → 한글 자모부터 (absolute-beginner)\n" +
        "- 단어 단위(학교, 안녕 등)는 읽지만 받침·연음이 있는 단어에서 막히면 → beginner\n" +
        "- 받침·연음(괜찮아요, 맛있어요 등)까지 매끄럽게 읽으면 → upper-beginner 수준의 읽기 능력\n\n" +
        "이 결과는 '읽기' 하위 능력만 나타낸다. 다음 Quick Check 2(말하기)와 함께 종합해서 최종 레벨을 정한다.",
    },

    /* ══════════════ 4. Quick Check 2: Speaking Prompts by Level ══════════════ */
    {
      type: "heading",
      level: 1,
      en: "Quick Check 2: Speaking Prompts by Level",
      ko: "말하기 레벨 체크",
    },
    {
      type: "text",
      markdown:
        "Now let's flip it around — I'll say a few things in Korean and ask you to try them too. Repeat after me first, then try on your own. See how far down the list you can comfortably go.",
    },
    {
      type: "phrase-cards",
      title: "Try These, See How Far You Get",
      cards: [
        {
          ko: "안녕하세요, 저는 사라예요.",
          rr: "annyeonghaseyo, jeoneun sarayeyo.",
          en: "Hello, I'm Sarah.",
          note: "Level check 1 — introduce yourself (swap in your own name).",
        },
        {
          ko: "저는 미국에서 왔어요.",
          rr: "jeoneun migugeseo wasseoyo.",
          en: "I'm from the U.S.",
          note: "Level check 2 — can you say where you're from?",
        },
        {
          ko: "저는 커피 마시는 것을 좋아해요.",
          rr: "jeoneun keopi masineun geoseul joahaeyo.",
          en: "I like drinking coffee.",
          note: "Level check 3 — can you talk about something you like?",
        },
        {
          ko: "어제 친구를 만나서 영화를 봤어요.",
          rr: "eoje chingureul mannaseo yeonghwareul bwasseoyo.",
          en: "I met a friend yesterday and watched a movie.",
          note: "Level check 4 — can you describe something that happened in the past?",
        },
      ],
    },
    {
      type: "tip",
      audience: "tutor",
      markdown:
        "학생이 각 카드를 튜터를 따라 한 번, 그리고 스스로 한 번 말해보게 한다. 어디까지 편안하게 따라오는지 관찰:\n\n" +
        "- Card 1(자기소개)까지만 가능 → absolute-beginner\n" +
        "- Card 2~3(출신지, 좋아하는 것)까지 무리 없음 → beginner\n" +
        "- Card 4(과거 시제 묘사)까지 큰 어려움 없이 시도 → upper-beginner\n\n" +
        "정확한 발음보다 '시도하는 용기'와 '이해 여부'를 우선 관찰한다. 문법이 틀려도 의미가 통하면 긍정적으로 반응할 것.",
    },

    /* ══════════════ 5. Your Level & What It Means ══════════════ */
    {
      type: "heading",
      level: 1,
      en: "Your Level & What It Means",
      ko: "레벨 판정 가이드",
    },
    {
      type: "text",
      markdown:
        "Based on today's check-in, you'll land in one of three starting points. None of them is a bad place to be — everyone starts somewhere!\n\n" +
        "- **Absolute Beginner** — Hangul is still new, and that's completely normal. We'll start by learning the alphabet as a fun puzzle, plus a handful of survival phrases.\n" +
        "- **Beginner** — You can sound out Hangul and know a few greetings, but full sentences feel far away. We'll build your first real sentence patterns and everyday phrases.\n" +
        "- **Upper-Beginner** — You read Hangul comfortably and can already form some sentences. We'll focus on natural pronunciation, expanding your patterns, and real conversations.\n\n" +
        "Wherever you land, your plan below is built just for you.",
    },
    {
      type: "tip",
      audience: "tutor",
      markdown:
        "최종 레벨은 Quick Check 1(읽기)과 Quick Check 2(말하기) 결과를 종합해 튜터가 판단한다. " +
        "애매하면 더 보수적인(낮은) 레벨로 시작 — 쉬운 것에서 성취감을 느끼는 편이 초반 이탈 방지에 유리하다. " +
        "판정한 값은 학생 포털(Student.level)에 그대로 기록한다.",
    },

    /* ══════════════ 6. Your Personal Learning Plan ══════════════ */
    {
      type: "heading",
      level: 1,
      en: "Your Personal Learning Plan",
      ko: "맞춤 학습 플랜 템플릿",
    },
    {
      type: "text",
      markdown:
        "Great work today! Here's your starting plan based on everything we just covered. You'll find this same plan waiting on your personal student page after the lesson, along with today's notes.",
    },
    {
      type: "checklist",
      title: "Your First-Week Plan",
      items: [
        {
          en: "Review today's corrections and new words on your student page",
          ko: "오늘 교정/새 표현 복습하기",
        },
        {
          en: "Read today's Hangul drill out loud once a day",
          ko: "오늘 배운 한글 드릴 하루 한 번 소리 내어 읽기",
        },
        {
          en: "Try saying your goal sentence from today to one other person",
          ko: "오늘 배운 목표 문장 다른 사람에게 말해보기",
        },
        {
          en: "Pick your first learning pack from the Recommended list and skim it before next lesson",
          ko: "추천 학습 팩 하나 골라 다음 수업 전 훑어보기",
        },
      ],
    },
    {
      type: "tip",
      audience: "student",
      markdown:
        "This is just your starting point, not a final exam! We'll keep adjusting your plan together as you grow — the goal is steady progress, not perfection.",
    },
    {
      type: "tip",
      audience: "tutor",
      markdown:
        "수업 종료 전 반드시 학생 포털(Student 레코드)에 다음을 채운다:\n\n" +
        "- level (오늘 판정한 최종 레벨)\n" +
        "- goal (목표 인터뷰 요약)\n" +
        "- feedback.doingWell / feedback.focusOn (오늘 관찰한 강점·보완점 각 1개 이상)\n" +
        "- recommendedPackIds (레벨에 맞는 자습 팩 2~3개)\n" +
        "- nextLesson (다음 수업 일정과 주제)\n\n" +
        "이 팩(level-check-onboarding)은 체험수업 전용이므로 recommendedPackIds에는 포함하지 않는다.",
    },
  ],
};
