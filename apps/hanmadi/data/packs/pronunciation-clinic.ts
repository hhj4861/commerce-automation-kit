/**
 * 발음 클리닉 (Pronunciation Clinic)
 *
 * 영어권 학습자가 가장 많이 틀리는 한국어 발음만 모은 교정 전용 팩.
 * 레벨 무관하게 반복 사용 — Pack.level 타입에는 "ALL"이 없어 대표값으로
 * "beginner"를 지정했다 (tutorGuide 참고: 완전 초보~초중급 모두에 재사용).
 * 블록 필드 설명은 data/types.ts 주석 참조. 새 팩을 만들 땐 demo.ts 참고.
 */
import type { Pack } from "@/data/types";

export const pronunciationClinicPack: Pack = {
  id: "pronunciation-clinic",
  title: {
    en: "Pronunciation Clinic",
    ko: "발음 클리닉",
  },
  level: "beginner",
  category: "pronunciation",
  minutes: 30,
  summary:
    "학생들이 가장 자주 틀리는 발음만 모았어요 — 최소대립쌍, 받침, 연음까지 화면공유용 큰 카드로 교정해요.",
  order: 4,
  learns: [
    "평음·격음·경음 3중 대립 듣고 소리 내기",
    "받침 발음 7가지 소리로 모든 받침 읽기",
    "연음 규칙을 익혀 한국어를 'han-gu-geo'처럼 자연스럽게 발음하기",
  ],
  tutorGuide:
    "레벨 고정 없이 반복 사용하는 '교정 전용' 팩. 완전 초보는 Sound Map과 Batchim 섹션만, " +
    "초중급은 전체를 워밍업/복습용으로. 학생이 수업 중 특정 발음을 계속 틀리면 해당 섹션의 " +
    "phrase-cards만 화면공유로 열어 즉시 교정하고, 결과는 /live 교정 로그에 바로 받아쓰기. " +
    "drill 블록은 튜터가 먼저 2번 시범 → 학생 3번 반복이 기본 리듬. 잰말놀이는 재미용 보너스이니 " +
    "시간이 부족하면 건너뛰어도 무방하다.",
  blocks: [
    /* ══════════════════════ 1. Sound Map ══════════════════════ */
    {
      type: "heading",
      level: 1,
      en: "Sound Map: Korean Sounds vs. English Sounds",
      ko: "소리 비교표",
    },
    {
      type: "text",
      markdown:
        "Two things trip up English speakers before anything else:\n\n" +
        "- Korean has **three versions** of sounds like \"g/k\", \"d/t\", and \"b/p\" — English only has two (voiced vs. voiceless). Korean's three are about *airflow and tension*, not voicing.\n" +
        "- Korean has **vowel sounds English doesn't use**, especially ㅡ and ㅓ — they aren't wrong versions of \"oo\" or \"uh\", they're genuinely new mouth shapes.\n\n" +
        "This pack is a reference you'll come back to again and again — don't try to memorize it in one sitting.",
    },
    {
      type: "phrase-cards",
      title: "10 Basic Vowels — Quick Reference",
      cards: [
        { ko: "ㅏ", rr: "a", en: "like \"a\" in \"father\"" },
        { ko: "ㅑ", rr: "ya", en: "\"a\" with a \"y\" in front" },
        {
          ko: "ㅓ",
          rr: "eo",
          en: "like \"aw\" in British \"law\"",
          note: "Lips stay relaxed — do not round them.",
        },
        { ko: "ㅕ", rr: "yeo", en: "\"eo\" with a \"y\" in front" },
        {
          ko: "ㅗ",
          rr: "o",
          en: "like \"o\" in \"go\"",
          note: "Lips round forward.",
        },
        { ko: "ㅛ", rr: "yo", en: "\"o\" with a \"y\" in front" },
        { ko: "ㅜ", rr: "u", en: "like \"oo\" in \"food\"" },
        { ko: "ㅠ", rr: "yu", en: "\"u\" with a \"y\" in front" },
        {
          ko: "ㅡ",
          rr: "eu",
          en: "no English equivalent",
          note: "Smile — flat, unrounded lips. Covered in detail below.",
        },
        { ko: "ㅣ", rr: "i", en: "like \"ee\" in \"see\"" },
      ],
    },
    {
      type: "tip",
      audience: "tutor",
      markdown:
        "첫 사용 시 이 표 전체를 다 가르치려 하지 말 것. 학생이 헷갈려하는 모음 1~2개만 짚고, " +
        "\"이 표는 필요할 때마다 다시 볼 참고표\"라고 안내한다. 표 자체보다 아래 트리오/모음 섹션의 " +
        "실전 연습이 핵심.",
    },

    /* ══════════════════════ 2. Tricky Trios ══════════════════════ */
    {
      type: "heading",
      level: 1,
      en: "Tricky Trios: ㅂ/ㅍ/ㅃ, ㄱ/ㅋ/ㄲ, ㄷ/ㅌ/ㄸ, ㅈ/ㅊ/ㅉ",
      ko: "자주 틀리는 발음",
    },
    {
      type: "text",
      markdown:
        "Each of these four consonant families has **three versions** that change the meaning of a word:\n\n" +
        "- **Plain** (ㅂ, ㄱ, ㄷ, ㅈ): light, relaxed — a small puff of air.\n" +
        "- **Aspirated** (ㅍ, ㅋ, ㅌ, ㅊ): a *strong* puff of air, like blowing out a candle.\n" +
        "- **Tense** (ㅃ, ㄲ, ㄸ, ㅉ): *no* puff of air at all — throat tight, sound feels \"squeezed\" and slightly higher-pitched.\n\n" +
        "**Try this:** hold a tissue (or your hand) in front of your mouth. On the aspirated sound it should flutter hard. On the tense sound it should barely move.",
    },
    {
      type: "phrase-cards",
      title: "Bilabial Trio: ㅂ · ㅍ · ㅃ",
      cards: [
        { ko: "바", rr: "ba", en: "plain", note: "Light puff of air." },
        { ko: "파", rr: "pa", en: "aspirated", note: "Strong puff of air — tissue flutters hard." },
        { ko: "빠", rr: "ppa", en: "tense", note: "No air at all — throat tight, crisp and sharp." },
      ],
    },
    {
      type: "phrase-cards",
      title: "Velar Trio: ㄱ · ㅋ · ㄲ",
      cards: [
        { ko: "가", rr: "ga", en: "plain", note: "Light puff of air." },
        { ko: "카", rr: "ka", en: "aspirated", note: "Strong puff of air." },
        { ko: "까", rr: "kka", en: "tense", note: "No air — sharp, squeezed sound." },
      ],
    },
    {
      type: "phrase-cards",
      title: "Alveolar Trio: ㄷ · ㅌ · ㄸ",
      cards: [
        { ko: "다", rr: "da", en: "plain", note: "Light puff of air." },
        { ko: "타", rr: "ta", en: "aspirated", note: "Strong puff of air." },
        { ko: "따", rr: "tta", en: "tense", note: "No air — sharp, squeezed sound." },
      ],
    },
    {
      type: "phrase-cards",
      title: "Affricate Trio: ㅈ · ㅊ · ㅉ",
      cards: [
        { ko: "자", rr: "ja", en: "plain", note: "Light puff of air." },
        { ko: "차", rr: "cha", en: "aspirated", note: "Strong puff of air." },
        { ko: "짜", rr: "jja", en: "tense", note: "No air — sharp, squeezed sound." },
      ],
    },
    {
      type: "drill",
      instruction:
        "Read each pair/trio out loud. Focus on airflow, not spelling — the meaning changes completely.",
      items: [
        { ko: "불", rr: "bul", en: "fire" },
        { ko: "풀", rr: "pul", en: "grass" },
        { ko: "뿔", rr: "ppul", en: "horn (animal)" },
        { ko: "달", rr: "dal", en: "moon" },
        { ko: "탈", rr: "tal", en: "mask" },
        { ko: "딸", rr: "ttal", en: "daughter" },
        { ko: "방", rr: "bang", en: "room" },
        { ko: "빵", rr: "ppang", en: "bread" },
        { ko: "공", rr: "gong", en: "ball" },
        { ko: "콩", rr: "kong", en: "bean" },
        { ko: "자다", rr: "jada", en: "to sleep" },
        { ko: "차다", rr: "chada", en: "to kick" },
        { ko: "짜다", rr: "jjada", en: "to be salty" },
      ],
    },
    {
      type: "tip",
      audience: "tutor",
      markdown:
        "화면공유로 트리오 카드 3장을 나란히 띄우고, 튜터가 손등에 입김을 불며 시범을 보인 뒤 " +
        "학생도 손등을 대고 따라 하게 한다. drill의 최소대립쌍 단어는 그림 없이도 뜻 차이가 " +
        "확실하니, 학생이 단어를 말하면 튜터가 뜻을 맞혀보는 역할극으로 바꿔도 좋다.",
    },

    /* ══════════════════════ 3. Batchim ══════════════════════ */
    {
      type: "heading",
      level: 1,
      en: "Batchim Sound Rules Made Simple",
      ko: "받침 발음 7가지 소리",
    },
    {
      type: "text",
      markdown:
        "A **batchim** (받침) is the consonant that sits *under* a syllable block, closing it. " +
        "Korean has dozens of possible batchim letters and letter pairs — but they all collapse " +
        "down into just **7 actual sounds** when spoken:\n\n" +
        "**ㄱ · ㄴ · ㄷ · ㄹ · ㅁ · ㅂ · ㅇ**\n\n" +
        "The stop sounds (ㄱ, ㄷ, ㅂ) are *unreleased* — like saying \"stop!\" in English but never " +
        "opening your mouth again. You stop the airflow and hold it, you don't release a puff of air.",
    },
    {
      type: "phrase-cards",
      title: "The 7 Batchim Sounds",
      cards: [
        { ko: "국", rr: "guk", en: "soup", note: "ㄱ-family batchim (ㄱ, ㅋ, ㄲ...) → closed \"k\"" },
        { ko: "눈", rr: "nun", en: "snow / eye", note: "ㄴ batchim → \"n\", tongue stays up" },
        { ko: "옷", rr: "ot", en: "clothes", note: "ㄷ-family batchim (ㄷ, ㅌ, ㅅ, ㅆ, ㅈ, ㅊ, ㅎ...) → closed \"t\"" },
        { ko: "물", rr: "mul", en: "water", note: "ㄹ batchim → soft \"l\"" },
        { ko: "밤", rr: "bam", en: "night / chestnut", note: "ㅁ batchim → \"m\", lips closed" },
        { ko: "밥", rr: "bap", en: "rice / meal", note: "ㅂ-family batchim (ㅂ, ㅍ...) → closed \"p\"" },
        { ko: "강", rr: "gang", en: "river", note: "ㅇ batchim → \"ng\", like English \"sing\"" },
      ],
    },
    {
      type: "drill",
      instruction: "Say each word and hold the final sound — don't add an extra vowel after it.",
      items: [
        { ko: "국", rr: "guk", en: "soup" },
        { ko: "눈", rr: "nun", en: "snow / eye" },
        { ko: "옷", rr: "ot", en: "clothes" },
        { ko: "물", rr: "mul", en: "water" },
        { ko: "밤", rr: "bam", en: "night / chestnut" },
        { ko: "밥", rr: "bap", en: "rice / meal" },
        { ko: "강", rr: "gang", en: "river" },
      ],
    },
    {
      type: "tip",
      audience: "student",
      markdown:
        "For ㄱ, ㄷ, ㅂ batchim: say the English word \"stop!\" and freeze right after the \"p\" — " +
        "don't open your mouth again. That frozen, unreleased feeling is exactly the batchim sound.",
    },

    /* ══════════════════════ 4. Linking Sounds ══════════════════════ */
    {
      type: "heading",
      level: 1,
      en: "Linking Sounds: Why 한국어 Sounds Like 'han-gu-geo'",
      ko: "연음",
    },
    {
      type: "text",
      markdown:
        "**연음 (linking)** happens when a syllable ending in a batchim is followed by a syllable " +
        "that starts with a silent ㅇ. The batchim consonant \"jumps over\" and becomes the start of " +
        "the next syllable instead.\n\n" +
        "그래서 한국어 (han-**guk**-**eo**, written) is actually pronounced **han-gu-geo** — the ㄱ " +
        "batchim of 국 slides onto 어. This is not an exception — it happens constantly, so learning " +
        "to expect it is one of the fastest ways to sound (and understand) more natural Korean.",
    },
    {
      type: "phrase-cards",
      title: "Linking in Action",
      cards: [
        {
          ko: "한국어",
          rr: "hangugeo",
          en: "Korean (language)",
          note: "Written han-guk-eo, spoken han-gu-geo.",
        },
        {
          ko: "물이",
          rr: "muri",
          en: "water (+ subject particle)",
          note: "ㄹ batchim links: mul-i → mu-ri.",
        },
        {
          ko: "옷이",
          rr: "osi",
          en: "clothes (+ subject particle)",
          note: "ㅅ batchim links: ot-i → o-si.",
        },
        {
          ko: "좋아요",
          rr: "joayo",
          en: "(it's) good",
          note: "ㅎ batchim often weakens to nothing: joh-a-yo → jo-a-yo.",
        },
      ],
    },
    {
      type: "drill",
      instruction: "Read each phrase smoothly, letting the batchim slide into the next syllable.",
      items: [
        { ko: "한국어 공부해요", rr: "hangugeo gongbuhaeyo", en: "I study Korean" },
        { ko: "물이 없어요", rr: "muri eopseoyo", en: "There's no water" },
        { ko: "이름이 뭐예요?", rr: "ireumi mwoyeyo?", en: "What is your name?" },
      ],
    },
    {
      type: "tip",
      audience: "tutor",
      markdown:
        "화면에 음절을 크게 쓰고, 받침에서 다음 음절 초성으로 화살표를 그려 연음을 시각화한다. " +
        "학생이 \"왜 철자랑 다르게 들려요?\"라고 물으면 이 팁 카드로 바로 답이 된다 — 예외가 " +
        "아니라 규칙임을 강조.",
    },

    /* ══════════════════════ 5. Difficult Vowels ══════════════════════ */
    {
      type: "heading",
      level: 1,
      en: "ㅡ vs ㅜ, ㅓ vs ㅗ: Vowels English Doesn't Have",
      ko: "어려운 모음",
    },
    {
      type: "text",
      markdown:
        "English speakers tend to hear ㅡ as \"oo\" and ㅓ as \"uh\" — but Korean listeners hear the " +
        "difference immediately, because it's really about **lip shape**, not just sound:\n\n" +
        "- **ㅡ (eu)**: lips flat, almost smiling. **ㅜ (u)**: lips rounded and pushed forward.\n" +
        "- **ㅓ (eo)**: jaw drops, lips relaxed and unrounded. **ㅗ (o)**: lips rounded forward.\n\n" +
        "A mirror helps a lot here — if your lips are moving, you're probably drifting toward the wrong sound.",
    },
    {
      type: "phrase-cards",
      title: "ㅡ vs ㅜ — Flat Lips vs. Round Lips",
      cards: [
        {
          ko: "크다",
          rr: "keuda",
          en: "to be big",
          note: "ㅡ — smile shape, lips flat and unrounded.",
        },
        {
          ko: "구두",
          rr: "gudu",
          en: "dress shoes",
          note: "ㅜ — round your lips forward, like blowing out a candle.",
        },
      ],
    },
    {
      type: "phrase-cards",
      title: "ㅓ vs ㅗ — Relaxed Jaw vs. Rounded Lips",
      cards: [
        {
          ko: "어머니",
          rr: "eomeoni",
          en: "mother",
          note: "ㅓ — drop your jaw, keep lips relaxed and unrounded.",
        },
        {
          ko: "오늘",
          rr: "oneul",
          en: "today",
          note: "ㅗ — round lips forward, like saying \"oh\".",
        },
      ],
    },
    {
      type: "drill",
      instruction: "Watch your lips in a mirror (or your webcam) while reading these out loud.",
      items: [
        { ko: "크다", rr: "keuda", en: "to be big" },
        { ko: "구두", rr: "gudu", en: "dress shoes" },
        { ko: "어머니", rr: "eomeoni", en: "mother" },
        { ko: "오늘", rr: "oneul", en: "today" },
        { ko: "그리고", rr: "geurigo", en: "and then" },
        { ko: "그래서", rr: "geuraeseo", en: "so / therefore" },
      ],
    },
    {
      type: "tip",
      audience: "student",
      markdown:
        "Turn on your camera and watch your own lips while you say ㅡ, ㅜ, ㅓ, and ㅗ back to back. " +
        "If two of them look the same on your face, they need more practice — the sounds should look different too.",
    },

    /* ══════════════════════ 6. Minimal Pairs & Tongue Twisters ══════════════════════ */
    {
      type: "heading",
      level: 1,
      en: "Minimal Pair Drills & Tongue Twisters",
      ko: "대립쌍 훈련과 잰말놀이",
    },
    {
      type: "text",
      markdown:
        "A **minimal pair** is two words that differ by only one sound but mean something completely " +
        "different — the fastest way to prove to your ear (and mouth) that these distinctions really matter. " +
        "Here's a bonus pair beyond the trios above: plain **ㅅ** vs. tense **ㅆ**.",
    },
    {
      type: "drill",
      instruction: "Say each pair back-to-back. Notice the meaning flips completely.",
      items: [
        { ko: "살", rr: "sal", en: "flesh / years old (counter)" },
        { ko: "쌀", rr: "ssal", en: "(uncooked) rice" },
        { ko: "불", rr: "bul", en: "fire" },
        { ko: "풀", rr: "pul", en: "grass" },
        { ko: "뿔", rr: "ppul", en: "horn (animal)" },
        { ko: "공", rr: "gong", en: "ball" },
        { ko: "콩", rr: "kong", en: "bean" },
      ],
    },
    {
      type: "text",
      markdown:
        "**Bonus fun (optional, advanced):** Korea's most famous tongue twister — save it for a student who " +
        "wants a challenge, not a first lesson.\n\n" +
        "> 간장 공장 공장장은 강 공장장이고, 된장 공장 공장장은 공 공장장이다.\n" +
        "> *ganjang gongjang gongjangjangeun gang gongjangjangigo, doenjang gongjang gongjangjangeun gong gongjangjangida.*\n" +
        "> \"The soy sauce factory's factory manager is Manager Kang, and the doenjang factory's factory manager is Manager Gong.\"",
    },
    {
      type: "tip",
      audience: "tutor",
      markdown:
        "대립쌍 단어 카드를 뒤집기 게임처럼 활용: 튜터가 하나를 발음하면 학생이 뜻을 맞히고, " +
        "역할을 바꿔 학생이 발음하면 튜터가 알아듣는지 확인한다. 잰말놀이는 시간 여유가 있는 " +
        "재수강생 수업 마무리용 보너스로만 사용.",
    },
    {
      type: "quiz",
      questions: [
        {
          prompt: "Which word means \"grass\" (as in lawn)?",
          choices: ["불 (bul)", "풀 (pul)", "뿔 (ppul)"],
          answerIndex: 1,
          explanation:
            "풀 (pul) = grass. 불 (bul) = fire, and 뿔 (ppul) = horn — same shape, three different meanings.",
        },
        {
          prompt: "How is 한국어 actually pronounced out loud?",
          choices: ["han-guk-eo", "han-gu-geo", "han-gu-eo"],
          answerIndex: 1,
          explanation:
            "The ㄱ batchim links to the next syllable's silent ㅇ, so 한국어 is spoken as han-gu-geo, not han-guk-eo.",
        },
      ],
    },
    {
      type: "checklist",
      title: "Before next lesson",
      items: [
        { en: "Say the ㅂ/ㅍ/ㅃ trio out loud 3 times each", ko: "ㅂ/ㅍ/ㅃ 3번씩 소리 내어 읽기" },
        { en: "Read all 7 batchim sound words aloud", ko: "받침 7가지 소리 단어 읽기" },
        { en: "Practice 한국어 → han-gu-geo until it feels automatic", ko: "연음 자연스러워질 때까지 연습" },
        { en: "Try the soy sauce factory tongue twister at least once", ko: "간장공장 잰말놀이 한 번 도전" },
      ],
    },
  ],
};
