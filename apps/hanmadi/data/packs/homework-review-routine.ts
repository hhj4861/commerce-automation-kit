/**
 * 숙제 & 복습 루틴 — 리텐션 팩.
 * 수업 사이의 공백을 채우는 장치: "수업 후 링크로 복습 → 다음 수업에서 확인" 사이클을
 * 학생이 매주 반복할 수 있는 작은 루틴으로 템플릿화했다.
 *
 * level: 원 기획은 "ALL"(모든 레벨 공통)이었으나 PackLevel 타입은 단일 값만 허용한다.
 * 전 레벨에 적용 가능한 팩이므로 중간값인 "beginner"를 선택했고, tutorGuide에
 * 모든 레벨에 배정 가능하다는 점을 명시했다.
 * category: 4개 카테고리 중 어휘/표현 반복 연습 비중이 가장 커서 "essential-phrases"로 분류.
 * order: Absolute Beginner 트랙 전용 필드라 이 팩에는 부여하지 않음 (레벨 무관 상시 배정용).
 */
import type { Pack } from "@/data/types";

export const homeworkReviewRoutinePack: Pack = {
  id: "homework-review-routine",
  title: {
    en: "Homework & Review Routine",
    ko: "숙제 & 복습 루틴",
  },
  level: "beginner",
  category: "essential-phrases",
  minutes: 15,
  summary:
    "수업 후 링크로 숙제·복습·단어 학습을 매주 반복하는 습관을 만들어요.",
  learns: [
    "수업 후 숙제 링크를 매주 반복하는 간단한 루틴으로 활용하기",
    "새 단어를 한 번에 몰아서가 아니라 매일 조금씩 나눠 복습하기",
    "튜터와 함께 학습 기록을 확인하고 숙제 스트릭 축하하기",
  ],
  tutorGuide:
    "레벨 무관, 모든 학생에게 배정 가능한 상시 팩. 체험수업 이후 첫 정규 수업 직후 링크로 전달하는 것을 추천한다. " +
    "핵심은 '수업 후 포털 링크 전달 → 학생이 이 루틴대로 복습 → 다음 수업 시작 시 숙제 확인' 사이클이며, 이것이 재수강률의 핵심 장치다. " +
    "매 수업 끝에 '오늘 배운 것 포털에 올려놨어요, 다음 수업 전에 한 번 봐 주세요' 한 마디만 반복해도 충분하다. " +
    "말하기 녹음 숙제는 전사할 필요 없이 1.5배속으로 한 번 듣고, 발음이 뭉개지는 단어 1개만 골라 다음 수업 워밍업으로 재사용한다. " +
    "LessonLog의 tutorNote 필드에 숙제 스트릭이나 성취를 짧게 남겨두면 눈에 보이는 인정이 재수강 결정에 실제로 영향을 준다.",
  blocks: [
    // ── heading (level 1)
    {
      type: "heading",
      level: 1,
      en: "Homework & Review Routine",
      ko: "숙제 & 복습 루틴",
    },

    // ── text: 왜 이 팩이 필요한가
    {
      type: "text",
      markdown:
        "Homework is not a test — it's the bridge between one lesson and the next. Little and often beats long and rare.\n\nEach time you finish a lesson, your tutor sends you a link to your **Student Page** with everything from that class: corrections, new words, and a short homework list. This pack is your guide to using that link well — plus a few simple routines you can repeat every single week.",
    },

    // ── tip (tutor): 이 팩의 배정 타이밍과 운영 철학
    {
      type: "tip",
      audience: "tutor",
      markdown:
        "이 팩은 **체험수업 이후 첫 정규 수업** 직후에 링크로 전달하는 것을 추천한다. 수업 후 포털 링크 전달 → 학생이 이 루틴을 따라 복습 → 다음 수업 시작 시 숙제 확인, 이 사이클이 재수강률의 핵심 장치다. 매 수업 끝에 \"오늘 배운 것 포털에 올려놨어요, 다음 수업 전에 한 번 봐 주세요\" 한 마디만 반복해도 충분하다.",
    },

    // ── Section 1: How Homework Works Here ──────────────────────────
    {
      type: "heading",
      level: 2,
      en: "How Homework Works Here",
      ko: "숙제 안내",
    },
    {
      type: "text",
      markdown:
        "Here's the simple cycle we use for every lesson:\n\n- **During class** — your tutor writes down corrections and new words while you talk.\n- **Right after class** — you get a link to your Student Page with that lesson's log.\n- **Before the next class** — you check the homework list and try the review routines in this pack.\n- **At the start of next class** — your tutor asks about one or two things from your homework, out loud.\n\nThat's it. No grading, no pressure — just a short loop that keeps last week's Korean alive until this week's lesson.",
    },
    {
      type: "phrase-cards",
      title: "Words You'll See Often",
      cards: [
        {
          ko: "숙제",
          rr: "sukje",
          en: "Homework",
          note: "Short tasks to try before your next lesson.",
        },
        {
          ko: "복습",
          rr: "bokseup",
          en: "Review",
          note: "Looking back at what you already learned.",
        },
        {
          ko: "단어장",
          rr: "daneojang",
          en: "Vocabulary notebook",
          note: "All the new words from your lessons, in one place.",
        },
        {
          ko: "확인",
          rr: "hwagin",
          en: "Check / confirm",
          note: "What your tutor does with your homework — no grades, just a quick look.",
        },
      ],
    },
    {
      type: "tip",
      audience: "student",
      markdown:
        "You never need to be “ready” to do homework. Five minutes of looking at yesterday's words is homework. Perfect is not the goal — showing up again is.",
    },

    // ── Section 2: Your Weekly Review Checklist ─────────────────────
    {
      type: "heading",
      level: 2,
      en: "Your Weekly Review Checklist",
      ko: "주간 복습 체크리스트",
    },
    {
      type: "text",
      markdown:
        "You don't need a new plan every week — you need the *same* plan, repeated. Pick one day between lessons (the day after your lesson works well) and go through this short checklist. It should take under 10 minutes.",
    },
    {
      type: "checklist",
      title: "Your Weekly Review Checklist",
      items: [
        {
          en: "Reread your last lesson log on your student page",
          ko: "학생 포털에서 지난 수업 기록 다시 읽기",
        },
        {
          en: "Look at your corrections and try saying them right",
          ko: "교정 내용 확인하고 바르게 말해보기",
        },
        {
          en: "Review 5 new words from your vocabulary list",
          ko: "단어장에서 새 단어 5개 복습하기",
        },
        {
          en: "Listen to or read your recorded homework once",
          ko: "녹음한 숙제 한 번 듣거나 읽어보기",
        },
        {
          en: "Try the self-check quiz for this pack",
          ko: "이 팩의 셀프 퀴즈 풀어보기",
        },
      ],
    },

    // ── Section 3: Vocabulary Routine: 5 Words a Day ────────────────
    {
      type: "heading",
      level: 2,
      en: "Vocabulary Routine: 5 Words a Day",
      ko: "단어 암기 루틴",
    },
    {
      type: "text",
      markdown:
        "Your vocabulary notebook grows every lesson — which means it can get overwhelming fast. Instead of reviewing all of it, pick just **5 words a day**. Say each one out loud, then try to use it in one sentence, even a very simple one.\n\nHere are 5 words every beginner uses constantly — a good set to practice this routine with right now.",
    },
    {
      type: "phrase-cards",
      title: "This Week's 5 Words",
      cards: [
        { ko: "오늘", rr: "oneul", en: "Today" },
        { ko: "내일", rr: "naeil", en: "Tomorrow" },
        { ko: "이번 주", rr: "ibeon ju", en: "This week" },
        { ko: "다시", rr: "dasi", en: "Again" },
        { ko: "조금", rr: "jogeum", en: "A little" },
      ],
    },
    {
      type: "drill",
      instruction:
        "Say each word out loud 3 times. Then close your eyes and try to say all 5 from memory.",
      items: [
        { ko: "오늘", rr: "oneul", en: "Today" },
        { ko: "내일", rr: "naeil", en: "Tomorrow" },
        { ko: "이번 주", rr: "ibeon ju", en: "This week" },
        { ko: "다시", rr: "dasi", en: "Again" },
        { ko: "조금", rr: "jogeum", en: "A little" },
      ],
    },

    // ── Section 4: Record Yourself: Speaking Homework ───────────────
    {
      type: "heading",
      level: 2,
      en: "Record Yourself: Speaking Homework",
      ko: "말하기 녹음 과제",
    },
    {
      type: "text",
      markdown:
        "Talking to yourself might feel strange — it works anyway. Recording a short voice memo lets you *hear* your own Korean, which is very different from just reading it.\n\nTry recording the short dialogue below. Play both parts yourself, or ask a friend — or your tutor, if there's time — to read one side while you read the other.",
    },
    {
      type: "dialogue",
      speakers: { a: "Tutor", b: "You" },
      lines: [
        {
          speaker: "A",
          ko: "기분이 어때요?",
          rr: "gibuni eottaeyo?",
          en: "How are you feeling?",
        },
        {
          speaker: "B",
          ko: "좋아요!",
          rr: "joayo!",
          en: "Good!",
        },
        {
          speaker: "A",
          ko: "다시 한번 말해 주세요.",
          rr: "dasi hanbeon malhae juseyo.",
          en: "Please say it one more time.",
        },
        {
          speaker: "B",
          ko: "알겠어요!",
          rr: "algesseoyo!",
          en: "Got it!",
        },
      ],
    },
    {
      type: "checklist",
      title: "Recording Homework Checklist",
      items: [
        {
          en: "Record yourself saying the dialogue above",
          ko: "위 대화문을 소리 내어 녹음하기",
        },
        {
          en: "Listen back once — don't judge, just notice",
          ko: "한 번 들어보기 — 평가하지 말고 그냥 느껴보기",
        },
        {
          en: "Say it again, a little slower and clearer",
          ko: "조금 더 천천히, 또렷하게 다시 말하기",
        },
        {
          en: "Save or send the recording before your next lesson",
          ko: "다음 수업 전에 녹음 파일 저장하거나 보내기",
        },
      ],
    },
    {
      type: "tip",
      audience: "tutor",
      markdown:
        "학생이 보낸 녹음은 전사할 필요 없다. 1.5배속으로 한 번 듣고 발음이 뭉개지는 단어 1개만 골라 다음 수업 워밍업으로 다시 연습시킨다. \"지난주 녹음 들어봤는데 여기 정말 좋아졌어요\" 한 마디가 다음 녹음 숙제를 하게 만드는 가장 강력한 동기부여다.",
    },

    // ── Section 5: Self-Check Mini Quizzes ──────────────────────────
    {
      type: "heading",
      level: 2,
      en: "Self-Check Mini Quizzes",
      ko: "셀프 퀴즈",
    },
    {
      type: "text",
      markdown:
        "Before your next lesson, take thirty seconds for this quiz. It's not graded and your tutor won't see the results — it's just for you, to notice what's still fuzzy *before* class instead of during it.",
    },
    {
      type: "quiz",
      questions: [
        {
          prompt: "What does 복습 (bokseup) mean?",
          choices: ["Homework", "Review", "Vocabulary notebook"],
          answerIndex: 1,
          explanation:
            "복습 (bokseup) = review — looking back at what you already learned. 숙제 (sukje) is homework.",
        },
        {
          prompt: "What does 숙제 (sukje) mean?",
          choices: ["Review", "Homework", "Pronunciation"],
          answerIndex: 1,
          explanation:
            "숙제 (sukje) = homework — the small tasks your tutor gives you to try before next lesson.",
        },
        {
          prompt: "How do you say “again” in Korean?",
          choices: ["다시 (dasi)", "내일 (naeil)", "조금 (jogeum)"],
          answerIndex: 0,
          explanation:
            "다시 (dasi) = again. 내일 (naeil) = tomorrow, 조금 (jogeum) = a little.",
        },
      ],
    },
    {
      type: "tip",
      audience: "student",
      markdown:
        "Missed one? Perfect — that's exactly what to bring up at the start of your next lesson. “Can we go over 복습 again?” is a great way to start class.",
    },

    // ── Section 6: Track Your Streak & Celebrate Progress ───────────
    {
      type: "heading",
      level: 2,
      en: "Track Your Streak & Celebrate Progress",
      ko: "학습 기록과 성취 축하",
    },
    {
      type: "text",
      markdown:
        "Your Student Page keeps a running record of every lesson — which means you can *see* your own streak grow: weeks in a row with homework done, corrections you've already fixed, words you've already learned.\n\nThat visible progress is worth celebrating out loud, not just noticing quietly. Ask your tutor to mark it at the start of a lesson — most tutors are happy to.",
    },
    {
      type: "phrase-cards",
      title: "Celebration Phrases",
      cards: [
        {
          ko: "잘했어요!",
          rr: "jalhaesseoyo!",
          en: "Well done!",
          note: "Perfect for finishing a homework streak.",
        },
        {
          ko: "최고예요!",
          rr: "choegoyeyo!",
          en: "You're the best! / Awesome!",
          note: "A little stronger than 잘했어요.",
        },
        {
          ko: "화이팅!",
          rr: "hwaiting!",
          en: "You can do it! / Go for it!",
          note: "A classic Korean cheer — used for encouragement before a challenge, not just after success.",
        },
      ],
    },
    {
      type: "checklist",
      title: "Celebrate These Milestones",
      items: [
        {
          en: "Completed homework 4 weeks in a row",
          ko: "4주 연속 숙제 완료",
        },
        {
          en: "Recorded your first speaking homework",
          ko: "첫 말하기 녹음 숙제 완료",
        },
        {
          en: "Got every self-check quiz question right",
          ko: "셀프 퀴즈 전부 맞히기",
        },
        {
          en: "Used a new word in a real sentence with your tutor",
          ko: "튜터와 함께 새 단어로 문장 만들어보기",
        },
      ],
    },
    {
      type: "tip",
      audience: "tutor",
      markdown:
        "수업 기록(LessonLog)의 tutorNote 필드에 이런 순간을 짧게 남겨두면 좋다. 예: \"4주 연속 숙제 완료! 정말 꾸준하네요.\" 거창한 보상이 아니라 **눈에 보이는 인정** 한 줄이 재수강 결정에 실제로 영향을 준다.",
    },

    // ── 마무리
    {
      type: "text",
      markdown:
        "You don't need to do everything in this pack every week. Pick one routine — the 5 words, the recording, or the quiz — and repeat just that one for a month. Consistency beats completeness, every time.",
    },
  ],
};
