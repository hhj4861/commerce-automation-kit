/**
 * 한글 기초 (Hangul Basics) — A0
 * 완전 초보의 첫 관문: 자음 14 + 모음 10 → 글자 조합 → 쌍자음/이중모음 →
 * 받침 → 첫 20단어 읽기까지 단계적으로 도달한다.
 * 블록 필드 설명은 data/types.ts 주석 참조. 작성 형식은 demo.ts 참고.
 */
import type { Pack } from "@/data/types";

export const hangulBasicsPack: Pack = {
  id: "hangul-basics",
  title: {
    en: "Hangul Basics",
    ko: "한글 기초",
  },
  level: "absolute-beginner",
  category: "hangul",
  minutes: 50,
  summary:
    "한글 자모부터 실제 단어 읽기까지, 차근차근 완성하는 한글 완전정복",
  order: 1,
  learns: [
    "한글 기본 자모 24개(자음 14 + 모음 10) 읽고 쓰기",
    "자음과 모음을 조합해 글자 만들기 — 모든 한국어 단어의 기본 원리",
    "쌍자음, 이중모음, 받침까지 실제 단어로 소리 내어 읽기",
  ],
  tutorGuide:
    "이 팩은 분량이 많아 보통 체험수업 직후 첫 1~2회 수업에 걸쳐 나눠 진행한다. 1교시는 '한글 소개~글자 조합 원리'까지, 2교시는 '쌍자음/이중모음~읽기 연습'을 다루는 흐름을 추천한다. phrase-cards는 화면공유로 한 번에 한 장씩 크게 띄우고, 튜터가 먼저 소리 내어 읽은 뒤 학생이 3번 따라 읽게 한다. 받침(batchim)은 발음보다 '듣고 구별하기'가 먼저이므로, drill 문항을 반복 재생하듯 여러 번 다시 들려주는 것이 효과적이다. 마지막 20단어 읽기 연습은 다음 수업 시작 전 워밍업으로 재사용하기 좋다.",
  blocks: [
    /* ═══════════════════════ 1. Meet Hangul ═══════════════════════ */
    {
      type: "heading",
      level: 1,
      en: "Meet Hangul: Why It's the Easiest Alphabet",
      ko: "한글 소개",
    },
    {
      type: "text",
      markdown:
        "Hangul (한글) was created in 1443 by King Sejong so that ordinary people — not just scholars — could learn to read in days, not years. It is not a random set of shapes: consonants are drawn from the shape your mouth makes to say them, and vowels are built from three simple strokes (a dot for the sun/sky, a flat line for the earth, a vertical line for a standing person).\n\nThe result is one of the most logical writing systems in the world. By the end of this pack you will be able to sound out **any** Korean word, even ones you have never seen before.",
    },
    {
      type: "tip",
      audience: "tutor",
      markdown:
        "완전 초보 학생에게는 '한글은 24개 글자만 알면 끝'이라는 안도감을 먼저 주는 게 중요하다. 알파벳처럼 개별 글자를 다 외우게 하기보다, 이번 수업에서 바로 글자를 조합해 보여줘서 '읽을 수 있다'는 성취감을 빨리 느끼게 한다.",
    },
    {
      type: "tip",
      audience: "student",
      markdown:
        "Don't try to memorize everything today. Hangul clicks with practice, not with staring — you'll be combining letters into real words before this pack ends.",
    },

    /* ═══════════════════════ 2. Basic Consonants (14) ═══════════════════════ */
    {
      type: "heading",
      level: 1,
      en: "Basic Consonants (자음 14)",
      ko: "기본 자음 14",
    },
    {
      type: "text",
      markdown:
        "Korean has 14 basic consonants (자음, jaeum). Each has a traditional name (its own way of saying \"this letter\"), which you'll sometimes hear in classrooms or dictionaries — but you don't need to memorize the names to use the letters.",
    },
    {
      type: "phrase-cards",
      title: "Basic Consonants (자음)",
      cards: [
        { ko: "ㄱ", rr: "g / k", en: "like 'g' in \"go\"", note: "Letter name: 기역 (giyeok)" },
        { ko: "ㄴ", rr: "n", en: "like 'n' in \"name\"", note: "Letter name: 니은 (nieun)" },
        { ko: "ㄷ", rr: "d / t", en: "like 'd' in \"dog\"", note: "Letter name: 디귿 (digeut)" },
        { ko: "ㄹ", rr: "r / l", en: "soft, between English 'r' and 'l'", note: "Letter name: 리을 (rieul)" },
        { ko: "ㅁ", rr: "m", en: "like 'm' in \"mom\"", note: "Letter name: 미음 (mieum)" },
        { ko: "ㅂ", rr: "b / p", en: "like 'b' in \"boy\"", note: "Letter name: 비읍 (bieup)" },
        { ko: "ㅅ", rr: "s", en: "like 's' in \"sun\"", note: "Letter name: 시옷 (siot)" },
        { ko: "ㅇ", rr: "– / ng", en: "silent at the start, \"ng\" at the end", note: "Letter name: 이응 (ieung)" },
        { ko: "ㅈ", rr: "j", en: "like 'j' in \"jam\"", note: "Letter name: 지읒 (jieut)" },
        { ko: "ㅊ", rr: "ch", en: "like 'ch' in \"chair\", with a puff of air", note: "Letter name: 치읓 (chieut)" },
        { ko: "ㅋ", rr: "k", en: "like 'k' in \"kite\", with a puff of air", note: "Letter name: 키읔 (kieuk)" },
        { ko: "ㅌ", rr: "t", en: "like 't' in \"top\", with a puff of air", note: "Letter name: 티읕 (tieut)" },
        { ko: "ㅍ", rr: "p", en: "like 'p' in \"pie\", with a puff of air", note: "Letter name: 피읖 (pieup)" },
        { ko: "ㅎ", rr: "h", en: "like 'h' in \"hello\"", note: "Letter name: 히읗 (hieut)" },
      ],
    },
    {
      type: "text",
      markdown:
        "Notice a pattern: **ㄱ, ㄷ, ㅂ, ㅈ** (plain) sound softer than **ㅋ, ㅌ, ㅍ, ㅊ** (aspirated — extra puff of air). ㅅ has its own tense partner (ㅆ) you'll meet in a later section, and ㄴ, ㅁ, ㅇ, ㄹ are the \"smooth\" sounds — no air, no tension. For now, just get comfortable saying the plain sounds above out loud.",
    },
    {
      type: "quiz",
      questions: [
        {
          prompt: "Which letter sounds closest to the 'n' in \"name\"?",
          choices: ["ㄴ", "ㅁ", "ㄹ"],
          answerIndex: 0,
          explanation: "ㄴ (n) is a clear 'n' sound, just like in English.",
        },
        {
          prompt: "ㅋ, ㅌ, ㅍ, ㅊ all share what feature?",
          choices: [
            "They are silent",
            "They are pronounced with a small puff of air (aspirated)",
            "They only appear at the end of a word",
          ],
          answerIndex: 1,
          explanation:
            "These are the aspirated consonants — say them with a little burst of air, like blowing out a candle.",
        },
      ],
    },

    /* ═══════════════════════ 3. Basic Vowels (10) ═══════════════════════ */
    {
      type: "heading",
      level: 1,
      en: "Basic Vowels (모음 10)",
      ko: "기본 모음 10",
    },
    {
      type: "text",
      markdown:
        "Korean has 10 basic vowels (모음, moeum), built from three strokes: a dot (sky), a flat line (earth), and a standing line (person). Combine them and you get every basic vowel shape below.",
    },
    {
      type: "phrase-cards",
      title: "Basic Vowels (모음)",
      cards: [
        { ko: "ㅏ", rr: "a", en: "like 'a' in \"father\"" },
        { ko: "ㅑ", rr: "ya", en: "like 'ya' in \"yard\"" },
        { ko: "ㅓ", rr: "eo", en: "like 'aw' in British \"law\" — open mouth, no lip rounding" },
        { ko: "ㅕ", rr: "yeo", en: "'y' + the ㅓ sound above" },
        { ko: "ㅗ", rr: "o", en: "like 'o' in \"go\"" },
        { ko: "ㅛ", rr: "yo", en: "like 'yo' in \"yodel\"" },
        { ko: "ㅜ", rr: "u", en: "like 'oo' in \"moon\"" },
        { ko: "ㅠ", rr: "yu", en: "like 'yu' in \"you\"" },
        { ko: "ㅡ", rr: "eu", en: "spread lips and say \"uh\" — no real English equivalent" },
        { ko: "ㅣ", rr: "i", en: "like 'ee' in \"see\"" },
      ],
    },
    {
      type: "tip",
      audience: "student",
      markdown:
        "English speakers often mix up **ㅓ (eo)** with **ㅗ (o)**, and **ㅡ (eu)** with **ㅜ (u)**. The trick: ㅗ and ㅜ round your lips like blowing a bubble; ㅓ and ㅡ keep your lips flat and relaxed.",
    },
    {
      type: "quiz",
      questions: [
        {
          prompt: "Which vowel sounds like 'ee' in \"see\"?",
          choices: ["ㅡ", "ㅣ", "ㅜ"],
          answerIndex: 1,
          explanation: "ㅣ (i) is a clean, flat 'ee' sound.",
        },
        {
          prompt: "Which vowel sounds like 'oo' in \"moon\" (rounded lips)?",
          choices: ["ㅗ", "ㅜ", "ㅡ"],
          answerIndex: 1,
          explanation: "ㅜ (u) rounds the lips more and further back than ㅗ (o).",
        },
      ],
    },

    /* ═══════════════════════ 4. Building Syllable Blocks ═══════════════════════ */
    {
      type: "heading",
      level: 1,
      en: "Building Syllable Blocks",
      ko: "글자 조합 원리",
    },
    {
      type: "text",
      markdown:
        "Every Korean syllable is written as one block: **consonant + vowel** (and sometimes a final consonant, covered later). Where the vowel goes depends on its shape:\n\n- **\"Tall\" vowels** (ㅏ ㅑ ㅓ ㅕ ㅣ) are written to the **right** of the consonant.\n- **\"Wide\" vowels** (ㅗ ㅛ ㅜ ㅠ ㅡ) are written **below** the consonant.\n\nThat's the entire rule — once you know it, you can build (and read) any syllable.",
    },
    {
      type: "phrase-cards",
      title: "Consonant + vowel = syllable block",
      cards: [
        { ko: "ㄱ + ㅏ = 가", rr: "g + a = ga", en: "tall vowel → written to the right" },
        { ko: "ㄴ + ㅗ = 노", rr: "n + o = no", en: "wide vowel → written below" },
        { ko: "ㅁ + ㅣ = 미", rr: "m + i = mi", en: "tall vowel → written to the right" },
        { ko: "ㅅ + ㅜ = 수", rr: "s + u = su", en: "wide vowel → written below" },
        { ko: "ㅂ + ㅓ = 버", rr: "b + eo = beo", en: "tall vowel → written to the right" },
        { ko: "ㅎ + ㅡ = 흐", rr: "h + eu = heu", en: "wide vowel → written below" },
      ],
    },
    {
      type: "checklist",
      title: "Before moving on",
      items: [
        { en: "Say out loud which vowels are \"tall\" and which are \"wide\"", ko: "'세로' 모음과 '가로' 모음 구분해서 말해보기" },
        { en: "Write 가, 노, 미, 수 by hand once each", ko: "가·노·미·수 손으로 써보기" },
        { en: "Build 3 new syllables using ㄷ, ㅈ, or ㅋ + any vowel", ko: "ㄷ·ㅈ·ㅋ으로 새 글자 3개 만들어보기" },
      ],
    },

    /* ═══════════════════════ 5. Double Consonants & Compound Vowels ═══════════════════════ */
    {
      type: "heading",
      level: 1,
      en: "Double Consonants & Compound Vowels",
      ko: "쌍자음과 이중모음",
    },
    {
      type: "text",
      markdown:
        "**Double consonants** (쌍자음, ssangjaeum) are five plain consonants doubled up. They sound tighter and more tense — no puff of air, throat pulled in slightly. Compare each pair below.",
    },
    {
      type: "phrase-cards",
      title: "Double Consonants (쌍자음)",
      cards: [
        { ko: "ㄲ", rr: "kk", en: "tense 'k' — tight throat, no air puff", note: "가 (ga) vs 까 (kka)" },
        { ko: "ㄸ", rr: "tt", en: "tense 't'", note: "다 (da) vs 따 (tta)" },
        { ko: "ㅃ", rr: "pp", en: "tense 'p'", note: "바 (ba) vs 빠 (ppa)" },
        { ko: "ㅆ", rr: "ss", en: "tense 's'", note: "사 (sa) vs 싸 (ssa)" },
        { ko: "ㅉ", rr: "jj", en: "tense 'j'", note: "자 (ja) vs 짜 (jja)" },
      ],
    },
    {
      type: "text",
      markdown:
        "**Compound vowels** (이중모음, ijungmoeum) combine two vowel sounds into one syllable — think of them as the diphthongs of Korean.",
    },
    {
      type: "phrase-cards",
      title: "Compound Vowels (이중모음)",
      cards: [
        { ko: "ㅐ", rr: "ae", en: "like 'e' in \"bed\"" },
        { ko: "ㅔ", rr: "e", en: "also like 'e' in \"bed\"", note: "In casual speech, ㅐ and ㅔ sound almost the same to most Koreans today." },
        { ko: "ㅘ", rr: "wa", en: "like 'wa' in \"wander\"" },
        { ko: "ㅝ", rr: "wo", en: "like 'wo' in \"won\" (the currency)" },
        { ko: "ㅚ", rr: "oe", en: "close to English \"way\" for most speakers today" },
        { ko: "ㅟ", rr: "wi", en: "like 'wee' in \"week\"" },
        { ko: "ㅢ", rr: "ui", en: "\"uh\" + \"ee\" said quickly", note: "Pronunciation shifts depending on where it appears in a word — beginners can start with \"uh-ee\"." },
      ],
    },
    {
      type: "quiz",
      questions: [
        {
          prompt: "Which pair is a plain-vs-tense minimal pair?",
          choices: ["가 / 카", "가 / 까", "가 / 나"],
          answerIndex: 1,
          explanation: "까 is the tense (double consonant) version of 가 — tighter throat, no extra air.",
        },
        {
          prompt: "ㅚ, ㅟ, ㅘ, ㅝ are all called ____.",
          choices: ["Batchim", "Compound vowels", "Double consonants"],
          answerIndex: 1,
          explanation: "They combine two vowel sounds into one syllable — that's why they're compound (diphthong) vowels.",
        },
      ],
    },

    /* ═══════════════════════ 6. Batchim: Final Consonants ═══════════════════════ */
    {
      type: "heading",
      level: 1,
      en: "Batchim: Final Consonants",
      ko: "받침",
    },
    {
      type: "text",
      markdown:
        "A syllable can end in a consonant — this is called **batchim** (받침, literally \"support\"). No matter which of the 14 consonants sits in that final spot, it collapses into one of just **7 representative sounds** when pronounced. Learn these 7, and you can read the ending of any Korean syllable.",
    },
    {
      type: "phrase-cards",
      title: "The 7 Batchim Sounds",
      cards: [
        { ko: "ㄱ, ㅋ, ㄲ", rr: "-k", en: "throat closes, like the end of \"lu-ck\"" },
        { ko: "ㄴ", rr: "-n", en: "tongue behind front teeth, like the end of \"pe-n\"" },
        { ko: "ㄷ, ㅌ, ㅅ, ㅆ, ㅈ, ㅊ, ㅎ", rr: "-t", en: "tongue tip closes, no release, like the end of \"ca-t\"" },
        { ko: "ㄹ", rr: "-l", en: "tongue tip touches the roof of the mouth, like the end of \"pa-l\"" },
        { ko: "ㅁ", rr: "-m", en: "lips close, like the end of \"ha-m\"" },
        { ko: "ㅂ, ㅍ", rr: "-p", en: "lips close, like the end of \"sto-p\"" },
        { ko: "ㅇ", rr: "-ng", en: "back of the tongue, like the end of \"so-ng\"" },
      ],
    },
    {
      type: "tip",
      audience: "tutor",
      markdown:
        "받침은 발음보다 '듣고 구별하기'가 먼저다. 학생에게 직접 발음시키기 전에, 튜터가 먼저 여러 번 들려주고 어떤 받침인지 맞혀보게 하는 순서를 추천한다. 특히 -ㄱ/-ㄷ/-ㅂ 세 개는 영어권 학습자가 헷갈려하므로 최소 3회 이상 반복 청취시킨다.",
    },
    {
      type: "drill",
      instruction: "Read each word aloud. Close your mouth or throat cleanly on the final sound — don't add an extra vowel after it.",
      items: [
        { ko: "국", rr: "guk", en: "soup" },
        { ko: "문", rr: "mun", en: "door" },
        { ko: "곧", rr: "got", en: "soon, right away" },
        { ko: "물", rr: "mul", en: "water" },
        { ko: "밤", rr: "bam", en: "night / chestnut" },
        { ko: "밥", rr: "bap", en: "rice, meal" },
        { ko: "강", rr: "gang", en: "river" },
      ],
    },

    /* ═══════════════════════ 7. Reading Practice: First 20 Words ═══════════════════════ */
    {
      type: "heading",
      level: 1,
      en: "Reading Practice: Your First 20 Korean Words",
      ko: "첫 읽기 연습",
    },
    {
      type: "text",
      markdown:
        "Time to put it all together. These 20 words mix every letter type you've learned — plain and tense consonants, basic and compound vowels, and every batchim sound. Read them one at a time; don't worry about memorizing the meaning yet, just focus on sounding each one out.",
    },
    {
      type: "drill",
      instruction: "Read each word out loud once, then check the meaning. Slow and correct beats fast and mumbled.",
      items: [
        { ko: "물", rr: "mul", en: "water" },
        { ko: "밥", rr: "bap", en: "rice / meal" },
        { ko: "사람", rr: "saram", en: "person" },
        { ko: "이름", rr: "ireum", en: "name" },
        { ko: "학교", rr: "hakgyo", en: "school" },
        { ko: "친구", rr: "chingu", en: "friend" },
        { ko: "나라", rr: "nara", en: "country" },
        { ko: "시간", rr: "sigan", en: "time" },
        { ko: "음식", rr: "eumsik", en: "food" },
        { ko: "사랑", rr: "sarang", en: "love" },
        { ko: "하늘", rr: "haneul", en: "sky" },
        { ko: "바다", rr: "bada", en: "sea" },
        { ko: "나무", rr: "namu", en: "tree" },
        { ko: "우유", rr: "uyu", en: "milk" },
        { ko: "고양이", rr: "goyangi", en: "cat" },
        { ko: "강아지", rr: "gangaji", en: "puppy / dog" },
        { ko: "노래", rr: "norae", en: "song" },
        { ko: "커피", rr: "keopi", en: "coffee" },
        { ko: "아침", rr: "achim", en: "morning" },
        { ko: "저녁", rr: "jeonyeok", en: "evening" },
      ],
    },
    {
      type: "quiz",
      questions: [
        {
          prompt: "Which word means \"water\"?",
          choices: ["불", "물", "말"],
          answerIndex: 1,
          explanation: "물 (mul) = water. 불 (bul) = fire, 말 (mal) = horse / language — one small sound change, a totally different meaning!",
        },
        {
          prompt: "Which word means \"friend\"?",
          choices: ["친구", "시간", "고양이"],
          answerIndex: 0,
          explanation: "친구 (chingu) = friend. You'll use this word constantly in conversation practice.",
        },
      ],
    },
    {
      type: "checklist",
      title: "Before next lesson",
      items: [
        { en: "Read all 20 words out loud, twice", ko: "20단어 소리 내어 2번 읽기" },
        { en: "Pick 5 words and write them by hand", ko: "5단어 골라 손으로 써보기" },
        { en: "Circle any words with a batchim you found tricky", ko: "헷갈렸던 받침 단어에 동그라미 치기" },
      ],
    },
    {
      type: "tip",
      audience: "student",
      markdown:
        "You just learned to read Korean. That's the hardest part — everything from here is vocabulary and practice, not a new alphabet. Come back to this pack any time you want a quick refresher on a tricky sound.",
    },
  ],
};
