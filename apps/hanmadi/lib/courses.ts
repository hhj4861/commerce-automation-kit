/** New language-neutral content. Legacy Korean packs keep their ko/rr/en contract. */
export const languages = {
  ko: {
    name: "한국어",
    native: "한국어",
    locale: "ko-KR",
    greeting: "안녕하세요",
  },
  th: {
    name: "태국어",
    native: "ภาษาไทย",
    locale: "th-TH",
    greeting: "สวัสดี",
  },
  ja: {
    name: "일본어",
    native: "日本語",
    locale: "ja-JP",
    greeting: "こんにちは",
  },
} as const;
export type Language = keyof typeof languages;
export function isLanguage(value: unknown): value is Language {
  return typeof value === "string" && Object.hasOwn(languages, value);
}
export type Phrase = { text: string; reading: string; meaning: string };
export type Lesson = {
  id: string;
  title: string;
  goal: string;
  note: string;
  phrases: Phrase[];
  quiz: {
    prompt: string;
    choices: string[];
    answer: number;
    explanation: string;
  };
};
const phrase = (text: string, reading: string, meaning: string): Phrase => ({
  text,
  reading,
  meaning,
});
export const courses: Record<Language, Lesson[]> = {
  ko: [
    {
      id: "greetings",
      title: "인사와 자기소개",
      goal: "인사하고 이름을 소개해요.",
      note: "처음 만난 사람에게는 존댓말을 써요. 이름 뒤에 받침이 있으면 ‘이에요’, 없으면 ‘예요’를 붙여요.",
      phrases: [
        phrase("안녕하세요", "annyeonghaseyo", "Hello · 안녕하세요"),
        phrase(
          "저는 민수예요",
          "jeoneun minsuyeyo",
          "I’m Minsu · 저는 민수예요",
        ),
        phrase(
          "만나서 반가워요",
          "mannaseo bangawoyo",
          "Nice to meet you · 만나서 반가워요",
        ),
      ],
      quiz: {
        prompt: "처음 만난 사람에게 하는 인사는?",
        choices: ["안녕하세요", "얼마예요?", "물 주세요"],
        answer: 0,
        explanation: "‘안녕하세요’는 공손한 인사예요.",
      },
    },
    {
      id: "cafe",
      title: "카페에서 주문하기",
      goal: "원하는 음료를 공손하게 주문해요.",
      note: "‘주세요’ 앞에 원하는 것을 말해요. 수량은 ‘한 잔’, ‘두 잔’으로 표현해요.",
      phrases: [
        phrase(
          "커피 한 잔 주세요",
          "keopi han jan juseyo",
          "One coffee, please · 커피 한 잔 주세요",
        ),
        phrase(
          "아이스로 주세요",
          "aiseuro juseyo",
          "Iced, please · 차갑게 주세요",
        ),
        phrase("얼마예요?", "eolmayeyo?", "How much is it? · 가격을 물어요"),
      ],
      quiz: {
        prompt: "가격을 물어보는 표현은?",
        choices: ["안녕하세요", "얼마예요?", "만나서 반가워요"],
        answer: 1,
        explanation: "‘얼마예요?’는 가격을 묻는 질문이에요.",
      },
    },
    {
      id: "directions",
      title: "길 묻기",
      goal: "찾는 장소가 어디인지 물어요.",
      note: "장소 이름 뒤에 ‘어디예요?’를 붙여요. 말을 걸 때 ‘실례합니다’로 시작해요.",
      phrases: [
        phrase("실례합니다", "sillyehamnida", "Excuse me · 실례합니다"),
        phrase(
          "역이 어디예요?",
          "yeogi eodiyeyo?",
          "Where is the station? · 역 위치를 물어요",
        ),
        phrase("감사합니다", "gamsahamnida", "Thank you · 감사합니다"),
      ],
      quiz: {
        prompt: "장소를 찾을 때 쓰는 말은?",
        choices: ["한 잔 주세요", "저는 민수예요", "어디예요?"],
        answer: 2,
        explanation: "‘어디예요?’로 위치를 물어요.",
      },
    },
  ],
  ja: [
    {
      id: "greetings",
      title: "인사와 자기소개",
      goal: "일본어로 인사하고 이름을 소개해요.",
      note: "こんにちは는 낮 인사예요. 처음 만났을 때는 はじめまして를 써요. 자기소개에서는 이름 뒤에 です를 붙여요.",
      phrases: [
        phrase("こんにちは", "konnichiwa", "안녕하세요"),
        phrase("はじめまして", "hajimemashite", "처음 뵙겠습니다"),
        phrase("私はミナです", "watashi wa Mina desu", "저는 미나입니다"),
        phrase(
          "よろしくお願いします",
          "yoroshiku onegaishimasu",
          "잘 부탁드립니다",
        ),
      ],
      quiz: {
        prompt: "‘처음 뵙겠습니다’에 해당하는 말은?",
        choices: ["ありがとうございます", "はじめまして", "いくらですか"],
        answer: 1,
        explanation: "はじめまして는 처음 만났을 때 하는 인사예요.",
      },
    },
    {
      id: "cafe",
      title: "카페에서 주문하기",
      goal: "음료를 주문하고 가격을 물어요.",
      note: "ください는 ‘주세요’라는 뜻이에요. ひとつ는 물건 하나를 세는 표현이에요.",
      phrases: [
        phrase(
          "コーヒーをひとつください",
          "kōhī o hitotsu kudasai",
          "커피 하나 주세요",
        ),
        phrase(
          "アイスでお願いします",
          "aisu de onegaishimasu",
          "아이스로 부탁드립니다",
        ),
        phrase("いくらですか", "ikura desu ka", "얼마인가요?"),
        phrase("ありがとうございます", "arigatō gozaimasu", "감사합니다"),
      ],
      quiz: {
        prompt: "‘얼마인가요?’를 골라 보세요.",
        choices: ["いくらですか", "こんにちは", "はじめまして"],
        answer: 0,
        explanation: "いくら는 가격을 물을 때 써요.",
      },
    },
    {
      id: "directions",
      title: "길 묻기",
      goal: "역과 화장실의 위치를 물어요.",
      note: "すみません으로 말을 걸고, 장소 이름 뒤에 はどこですか를 붙여요. 이때 조사 は는 ‘wa’로 읽어요.",
      phrases: [
        phrase("すみません", "sumimasen", "실례합니다 / 죄송합니다"),
        phrase("駅はどこですか", "eki wa doko desu ka", "역은 어디인가요?"),
        phrase(
          "トイレはどこですか",
          "toire wa doko desu ka",
          "화장실은 어디인가요?",
        ),
        phrase("ここです", "koko desu", "여기입니다"),
      ],
      quiz: {
        prompt: "‘역은 어디인가요?’는?",
        choices: ["ここです", "コーヒーをひとつください", "駅はどこですか"],
        answer: 2,
        explanation: "駅는 역, どこ는 어디라는 뜻이에요.",
      },
    },
  ],
  th: [
    {
      id: "greetings",
      title: "인사와 자기소개",
      goal: "태국어로 인사하고 이름을 소개해요.",
      note: "공손한 말끝은 보통 남성 화자가 ครับ(khráp), 여성 화자가 평서문에 ค่ะ(khâ), 질문에 คะ(khá)를 써요. 상황과 화자의 표현에 맞춰 선택해요. 로마자는 발음 보조이며 성조 학습을 대신하지 않아요.",
      phrases: [
        phrase("สวัสดี", "sà-wàt-dii", "안녕하세요 (공손한 말끝을 붙여요)"),
        phrase("สวัสดีครับ", "sà-wàt-dii khráp", "안녕하세요 (ครับ 사용)"),
        phrase("สวัสดีค่ะ", "sà-wàt-dii khâ", "안녕하세요 (ค่ะ 사용)"),
        phrase(
          "ยินดีที่ได้รู้จัก",
          "yin-dii thîi dâi rúu-jàk",
          "만나서 반갑습니다",
        ),
      ],
      quiz: {
        prompt: "인사할 때 쓰는 표현은?",
        choices: ["สวัสดี", "ห้องน้ำ", "เท่าไหร่"],
        answer: 0,
        explanation:
          "สวัสดี가 기본 인사예요. ครับ 또는 ค่ะ를 붙여 공손하게 말해요.",
      },
    },
    {
      id: "cafe",
      title: "카페에서 주문하기",
      goal: "커피를 주문하고 가격을 물어요.",
      note: "ขอ는 요청할 때 쓰고, หนึ่งแก้ว는 한 잔이라는 뜻이에요. 질문 끝에는 ครับ 또는 คะ를 붙일 수 있어요.",
      phrases: [
        phrase(
          "ขอกาแฟหนึ่งแก้ว",
          "khǎaw kaa-fɛɛ nʉ̀ng kɛ̂ɛw",
          "커피 한 잔 주세요",
        ),
        phrase("ไม่หวาน", "mâi wǎan", "달지 않게요"),
        phrase("เท่าไหร่", "thâo-rài", "얼마인가요?"),
        phrase("ขอบคุณ", "khàawp-khun", "감사합니다"),
      ],
      quiz: {
        prompt: "‘달지 않게요’는?",
        choices: ["ขอบคุณ", "ไม่หวาน", "สวัสดี"],
        answer: 1,
        explanation: "ไม่는 부정, หวาน은 달다는 뜻이에요.",
      },
    },
    {
      id: "directions",
      title: "길 묻기",
      goal: "찾는 장소의 위치를 물어요.",
      note: "อยู่ที่ไหน는 ‘어디에 있나요?’라는 뜻이에요. 먼저 ขอโทษ로 말을 걸고 공손한 말끝을 붙여 연습해요.",
      phrases: [
        phrase("ขอโทษ", "khǎaw-thôot", "실례합니다 / 죄송합니다"),
        phrase(
          "สถานีอยู่ที่ไหน",
          "sà-thǎa-nii yùu thîi nǎi",
          "역은 어디에 있나요?",
        ),
        phrase(
          "ห้องน้ำอยู่ที่ไหน",
          "hâawng-náam yùu thîi nǎi",
          "화장실은 어디에 있나요?",
        ),
        phrase("ตรงนี้", "trong níi", "여기요"),
      ],
      quiz: {
        prompt: "‘화장실’을 뜻하는 단어는?",
        choices: ["กาแฟ", "สถานี", "ห้องน้ำ"],
        answer: 2,
        explanation: "ห้องน้ำ는 화장실, สถานี는 역, กาแฟ는 커피예요.",
      },
    },
  ],
};
export function getLesson(language: Language, id: string): Lesson | undefined {
  return courses[language].find((lesson) => lesson.id === id);
}
