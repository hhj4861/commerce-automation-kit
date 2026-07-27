/**
 * K-컬처 표현 (K-Culture Expressions) — A2 / upper-beginner
 *
 * K-드라마·K-pop 팬 학생의 동기를 수업으로 직접 연결하는 팩.
 * "이미 들어본 표현"을 해부해 아는 것에서 시작하는 자신감 설계가 핵심.
 * 블록 필드 설명은 data/types.ts 주석 참조.
 */
import type { Pack } from "@/data/types";

export const pack: Pack = {
  id: "k-culture-expressions",
  title: {
    en: "K-Culture Expressions",
    ko: "K-컬처 표현",
  },
  // types.ts의 PackLevel에는 CEFR 등급이 없어 3단계 중 가장 가까운
  // "upper-beginner"(초중급)로 매핑했다 — 이미 기초 표현을 아는 학생 대상.
  level: "upper-beginner",
  category: "k-culture",
  minutes: 35,
  summary:
    "K-드라마, K-pop, 팬덤 문화로 이미 접한 한국어를 실제로 쓸 수 있는 표현으로 바꿔줘요.",
  learns: [
    "K-드라마와 K-pop 노래에서 자주 들었던 한국어 대사·가사 알아듣기",
    "대박, 최애, 존맛 같은 팬덤·인터넷 용어 자연스럽게 사용하기",
    "ㅋㅋ, ㅠㅠ, ㅇㅋ 같은 한국식 문자 표현 읽고, 눈치·정 같은 문화 단어 설명하기",
  ],
  tutorGuide:
    "수업 시작할 때 학생이 좋아하는 K-드라마·아이돌을 먼저 물어보고, 관련된 카드부터 화면공유하면 몰입도가 크게 오른다. " +
    "'팬덤·인터넷 용어'와 '문자 표현' 섹션 카드는 캡션만 얹어도 틱톡 숏폼 소재로 바로 재활용 가능 — 외부 학생 유입용 콘텐츠로 우선 제작 추천. " +
    "존맛처럼 캐주얼한 슬랭은 튜터가 먼저 '친구 사이에서만' 이라는 톤앤매너를 짚어준 뒤 진행할 것.",
  blocks: [
    // ── 오프닝: 자신감 프레이밍 ──────────────────────────────
    {
      type: "heading",
      level: 1,
      en: "Korean You Already Know",
      ko: "이미 알고 있던 한국어",
    },
    {
      type: "text",
      markdown:
        "If you've ever watched a K-drama with subtitles or hummed along to a K-pop chorus, you already know more Korean than you think. This pack takes phrases you've *heard* a hundred times and turns them into phrases you can *say*.\n\nWe'll decode the lines dramas repeat in every episode, the words that show up in almost every K-pop song, the slang your favorite fan accounts use, and the texting shortcuts every Korean uses with friends.",
    },
    {
      type: "tip",
      audience: "tutor",
      markdown:
        "수업 시작할 때 학생이 좋아하는 K-드라마·아이돌을 먼저 물어보고, 관련된 카드부터 화면공유하면 몰입도가 크게 오른다. 학생이 이미 아는 표현이라는 걸 먼저 확인시켜주는 게 이 팩의 핵심 — '이거 들어본 적 있어요?' 로 시작.",
    },

    // ── 섹션 1: K-Drama Lines You Already Know ──────────────
    {
      type: "heading",
      level: 2,
      en: "K-Drama Lines You Already Know",
      ko: "드라마 단골 대사",
    },
    {
      type: "text",
      markdown:
        "Watch five minutes of any K-drama and you'll hear the same handful of lines over and over — a fight, a reunion, a confession. Once you know these, whole scenes suddenly make sense *before* you read the subtitles.",
    },
    {
      type: "phrase-cards",
      title: "Lines from every drama",
      cards: [
        {
          ko: "어떡해",
          rr: "eotteokhae",
          en: "What do I do?! / Oh no!",
          note: "The #1 panic line — shouted when something goes wrong.",
        },
        {
          ko: "잘 지냈어?",
          rr: "jal jinaesseo?",
          en: "Have you been well?",
          note: "A reunion classic, asked after time apart.",
        },
        {
          ko: "왜 이래?",
          rr: "wae irae?",
          en: "Why are you being like this?",
          note: "Said when someone acts strangely or too intense, all of a sudden.",
        },
        {
          ko: "미쳤어?",
          rr: "michyeosseo?",
          en: "Are you crazy?",
          note: "Shock or disbelief at someone's bold move.",
        },
        {
          ko: "됐어",
          rr: "dwaesseo",
          en: "Forget it. / That's enough.",
          note: "Cuts a conversation short — often said while walking away.",
        },
        {
          ko: "사랑해",
          rr: "saranghae",
          en: "I love you.",
          note: "The line every drama builds toward.",
        },
        {
          ko: "보고 싶었어",
          rr: "bogo sipeosseo",
          en: "I missed you.",
          note: "Past tense — said the moment two leads reunite.",
        },
        {
          ko: "그만해",
          rr: "geumanhae",
          en: "Stop it.",
          note: "Said firmly when someone's teasing (or crying) has gone far enough.",
        },
      ],
    },
    {
      type: "dialogue",
      speakers: { a: "Drama Lead", b: "You" },
      lines: [
        {
          speaker: "A",
          ko: "잘 지냈어?",
          rr: "jal jinaesseo?",
          en: "Have you been well?",
        },
        {
          speaker: "B",
          ko: "어떡해... 보고 싶었어.",
          rr: "eotteokhae... bogo sipeosseo.",
          en: "Oh no... I missed you.",
        },
        {
          speaker: "A",
          ko: "왜 이래, 갑자기?",
          rr: "wae irae, gapjagi?",
          en: "Why are you like this, all of a sudden?",
        },
        {
          speaker: "B",
          ko: "사랑해.",
          rr: "saranghae.",
          en: "I love you.",
        },
      ],
    },

    // ── 섹션 2: K-pop Lyrics Decoded ─────────────────────────
    {
      type: "heading",
      level: 2,
      en: "K-pop Lyrics Decoded",
      ko: "가사 속 표현 해부",
    },
    {
      type: "text",
      markdown:
        "K-pop lyrics repeat the same emotional vocabulary — love, distance, longing, forever — across almost every group and genre. Learn these words once and you'll start catching them in songs you already love.",
    },
    {
      type: "phrase-cards",
      title: "Words every K-pop song uses",
      cards: [
        {
          ko: "보고 싶어",
          rr: "bogo sipeo",
          en: "I miss you.",
          note: "Present tense — the most common line in any ballad.",
        },
        {
          ko: "함께",
          rr: "hamkke",
          en: "together",
          note: "Shows up in nearly every fandom anthem (우리 함께 = \"together, us\").",
        },
        {
          ko: "영원히",
          rr: "yeongwonhi",
          en: "forever",
          note: "Promises in love songs are almost always 영원히.",
        },
        {
          ko: "잊지 마",
          rr: "itji ma",
          en: "Don't forget (me).",
          note: "A tender goodbye line, common in ballads.",
        },
        {
          ko: "다시 만나",
          rr: "dasi manna",
          en: "meet again",
          note: "The hopeful line after a sad verse.",
        },
        {
          ko: "우리 둘이",
          rr: "uri duri",
          en: "just the two of us",
          note: "Sets up an intimate, romantic mood.",
        },
        {
          ko: "눈부셔",
          rr: "nunbusyeo",
          en: "dazzling / so bright",
          note: "Used for both sunlight and a person you admire.",
        },
      ],
    },

    // ── 섹션 3: Fan & Internet Slang ─────────────────────────
    {
      type: "heading",
      level: 2,
      en: "Fan & Internet Slang",
      ko: "팬덤·인터넷 용어",
    },
    {
      type: "text",
      markdown:
        "This is the Korean your favorite idols use in interviews and fans use in comments — casual, expressive, and everywhere online. Save it for friends, fellow fans, and social media; switch to polite forms with teachers, coworkers, or anyone older.",
    },
    {
      type: "phrase-cards",
      title: "Slang you'll see everywhere",
      cards: [
        {
          ko: "대박",
          rr: "daebak",
          en: "No way! / Amazing!",
          note: "The single most useful reaction word in Korean — fits almost any surprise.",
        },
        {
          ko: "최애",
          rr: "choeae",
          en: "my ultimate favorite (bias)",
          note: "Fandom word for the one member or artist you love most.",
        },
        {
          ko: "존맛",
          rr: "jonmat",
          en: "so freaking delicious",
          note: "Very casual — great for food posts with friends, skip it with elders or in formal settings.",
        },
        {
          ko: "헐",
          rr: "heol",
          en: "Whoa! / OMG",
          note: "A short gasp of surprise — can be good or bad news.",
        },
        {
          ko: "인정",
          rr: "injeong",
          en: "Agreed. / So true.",
          note: "Said when someone makes a point you fully agree with.",
        },
        {
          ko: "짱",
          rr: "jjang",
          en: "the best / awesome",
          note: "Attach it to anything you love: 짱 맛있어 = \"incredibly tasty.\"",
        },
      ],
    },
    {
      type: "tip",
      audience: "student",
      markdown:
        "Slang like 대박 and 존맛 is casual — perfect for texting friends or fellow fans, but switch to polite Korean with teachers, older relatives, or anyone you just met.",
    },

    // ── 섹션 4: Culture Keywords ─────────────────────────────
    {
      type: "heading",
      level: 2,
      en: "Culture Keywords",
      ko: "번역 안 되는 문화 단어",
    },
    {
      type: "text",
      markdown:
        "Some Korean words don't translate neatly into English — not because English lacks the idea, but because Korean culture built a whole word around it. Learning these four unlocks how Koreans actually think about relationships and family.",
    },
    {
      type: "phrase-cards",
      title: "Words with no single English word",
      cards: [
        {
          ko: "눈치",
          rr: "nunchi",
          en: "social awareness, reading the room",
          note: "Having good 눈치 means sensing what's needed without being told.",
        },
        {
          ko: "애교",
          rr: "aegyo",
          en: "cute, playful charm",
          note: "A deliberately sweet tone of voice or gesture used to be endearing.",
        },
        {
          ko: "정",
          rr: "jeong",
          en: "a deep bond that grows over time",
          note: "The warm attachment you feel for people (or places) you've shared history with.",
        },
        {
          ko: "막내",
          rr: "mangnae",
          en: "the youngest member",
          note: "Used for the youngest in any group — a band, a family, even a friend group.",
        },
      ],
    },

    // ── 섹션 5: Texting Like a Korean ────────────────────────
    {
      type: "heading",
      level: 2,
      en: "Texting Like a Korean",
      ko: "문자 표현",
    },
    {
      type: "text",
      markdown:
        "Korean texting is famous for going short: instead of typing full words, people use just the first consonant of each syllable (called *chosung*), or repeat a single letter to *draw* an emotion. Once you see the pattern, texts that look like random letters suddenly make sense.",
    },
    {
      type: "phrase-cards",
      title: "What Koreans actually text",
      cards: [
        {
          ko: "ㅋㅋㅋ",
          rr: "k-k-k",
          en: "haha / lol",
          note: "Made by repeating ㅋ (k) — imitates the sound of laughing. More ㅋ = more laughing.",
        },
        {
          ko: "ㅠㅠ",
          rr: "yu-yu",
          en: "aww / sad (crying)",
          note: "Made by repeating ㅠ (yu) — the shape looks like streaming tears. Often written ㅜㅜ too.",
        },
        {
          ko: "ㅇㅋ",
          rr: "o-kei",
          en: "OK / sounds good",
          note: "Short for 오케이 (okay, from English) — just the first sounds of each syllable.",
        },
        {
          ko: "ㄱㅅ",
          rr: "g-s",
          en: "thx (thanks)",
          note: "Short for 감사 (gamsa, \"thanks\") — first consonant of each syllable.",
        },
        {
          ko: "ㄴㄴ",
          rr: "n-n",
          en: "nope / no no",
          note: "Short for 노노 (no no) — a quick way to disagree.",
        },
        {
          ko: "ㅇㅇ",
          rr: "eung-eung",
          en: "yeah / uh-huh",
          note: "Short for 응 (eung, \"yeah\") doubled for casual agreement.",
        },
      ],
    },

    // ── 확인 & 마무리 ────────────────────────────────────────
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
          prompt: "Your friend surprises you with amazing news. What do you shout?",
          choices: ["존맛", "대박", "눈치"],
          answerIndex: 1,
          explanation:
            "대박 (daebak) is the all-purpose \"No way!\" / \"Amazing!\" reaction to big news.",
        },
        {
          prompt:
            "A drama character just got shocking news and grabs their head. What do they cry out?",
          choices: ["어떡해", "됐어", "그만해"],
          answerIndex: 0,
          explanation:
            "어떡해 (eotteokhae) = \"What do I do?!\" — the classic panic line in every K-drama.",
        },
        {
          prompt:
            "Your Korean friend can instantly sense the mood of a room and act appropriately. What do you call that skill?",
          choices: ["애교", "눈치", "정"],
          answerIndex: 1,
          explanation:
            "눈치 (nunchi) = social awareness, reading the room without being told.",
        },
        {
          prompt: "You want to text \"okay, sounds good\" the fast Korean way. What do you type?",
          choices: ["ㄴㄴ", "ㅇㅋ", "ㅠㅠ"],
          answerIndex: 1,
          explanation: "ㅇㅋ is chosung shorthand for 오케이 (okay) — quick and casual.",
        },
      ],
    },
    {
      type: "tip",
      audience: "student",
      markdown:
        "This week, watch one scene of a K-drama or listen to one K-pop song with lyrics on screen. Count how many phrases from this pack you catch — you'll be surprised how many you already know.",
    },
    {
      type: "checklist",
      title: "Before next lesson",
      items: [
        { en: "Text a friend using ㅋㅋ or ㅇㅋ", ko: "친구에게 ㅋㅋ나 ㅇㅋ로 문자 보내기" },
        {
          en: "Watch one K-drama clip and catch a line you now understand",
          ko: "드라마 클립 보고 아는 대사 찾기",
        },
        { en: "Say 대박 out loud the next time something surprises you", ko: "놀랄 때 대박 소리 내어 말하기" },
        { en: "Practice explaining 눈치 or 정 to a friend in English", ko: "눈치·정을 영어로 설명해보기" },
      ],
    },
  ],
};
