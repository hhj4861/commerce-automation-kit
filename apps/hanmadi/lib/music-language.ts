import type { Phrase, StudyLanguage } from "./v2";

export type MusicLanguageLesson = {
  word: Phrase;
  note: string;
  situation: string;
  question: Phrase;
  answer: Phrase;
};
const phrase = (text: string, reading: string, meaning: string): Phrase => ({ text, reading, meaning });
// Authored teaching material for Hanmadi's original songs, not commercial lyrics.
export const musicLanguageLessons: Record<StudyLanguage, MusicLanguageLesson[]> = {
  en: [
    { word: phrase("morning", "모닝", "아침"), note: "인사할 때는 Good morning!처럼 써요.", situation: "아침에 친구와 만나 인사하기",
      question: phrase("Good morning! How are you?", "굿 모닝! 하우 아 유", "좋은 아침! 어떻게 지내?"), answer: phrase("Good morning! I'm fine, thanks.", "굿 모닝! 아임 파인, 땡크스", "좋은 아침! 잘 지내, 고마워.") },
    { word: phrase("together", "투게더", "함께"), note: "혼자가 아니라 같이 할 때 쓰는 말이에요.", situation: "친구에게 같이 걷자고 제안하기",
      question: phrase("Shall we walk to the park?", "쉘 위 워크 투 더 파크", "공원까지 걸어갈까?"), answer: phrase("Yes, let's walk together.", "예스, 렛츠 워크 투게더", "응, 함께 걸어가자.") },
    { word: phrase("smile", "스마일", "미소"), note: "a smile은 미소 하나, smile은 미소 짓다라는 동사로도 써요.", situation: "친구의 미소를 칭찬하기",
      question: phrase("Do I look happy today?", "두 아이 룩 해피 투데이", "오늘 나 행복해 보여?"), answer: phrase("Yes, I like your smile.", "예스, 아이 라이크 유어 스마일", "응, 네 미소가 좋아.") },
    { word: phrase("a little while", "어 리틀 와일", "잠깐"), note: "정확한 분 수보다 짧은 시간을 말하는 표현이에요.", situation: "공원에서 조금 더 쉬자고 말하기",
      question: phrase("Shall we go now?", "쉘 위 고 나우", "이제 갈까?"), answer: phrase("Let's stay for a little while.", "렛츠 스테이 포 어 리틀 와일", "잠깐 더 머물자.") },
  ],
  ja: [
    { word: phrase("おはよう", "오하요오", "좋은 아침"), note: "친구에게 하는 인사예요. 처음 만난 사람에게는 おはようございます라고 공손하게 말해요.", situation: "아침에 친구와 만나 인사하기",
      question: phrase("おはよう。元気？", "오하요오. 겐키", "좋은 아침. 잘 지내?"), answer: phrase("おはよう。元気だよ。", "오하요오. 겐키다요", "좋은 아침. 잘 지내.") },
    { word: phrase("となり", "토나리", "옆"), note: "となりで는 ‘옆에서’예요. 노래의 君는 가까운 사이에서 쓰는 ‘너’이므로 처음 만난 사람에게 그대로 쓰지 않아요.", situation: "친구 옆의 빈자리에 앉아도 되는지 묻기",
      question: phrase("ここ、空いてるよ。", "코코, 아이테루요", "여기 비어 있어."), answer: phrase("となりに座ってもいい？", "토나리니 스왓테모 이이", "옆에 앉아도 돼?") },
    { word: phrase("ゆっくり", "윳쿠리", "천천히"), note: "걷기뿐 아니라 말하는 속도를 늦춰 달라고 할 때도 써요.", situation: "친구에게 천천히 말해 달라고 부탁하기",
      question: phrase("今の話、わかった？", "이마노 하나시, 와캇타", "방금 이야기 이해했어?"), answer: phrase("もう少しゆっくり話して。", "모오 스코시 윳쿠리 하나시테", "조금 더 천천히 말해 줘.") },
    { word: phrase("今日", "쿄오", "오늘"), note: "노래의 ‘작은 오늘’은 시적인 표현이에요. 회화에서는 오늘 할 일처럼 구체적으로 말해요.", situation: "친구와 오늘 계획을 이야기하기",
      question: phrase("今日は何をする？", "쿄오와 나니오 스루", "오늘은 뭐 해?"), answer: phrase("今日は公園に行くよ。", "쿄오와 코오엔니 이쿠요", "오늘은 공원에 가.") },
  ],
  th: [
    { word: phrase("วันนี้", "완니이", "오늘"), note: "วัน은 날, นี้는 ‘이’예요. 회화 성조는 노래 대신 발음 듣기로 확인해요.", situation: "친구와 오늘 날씨 이야기하기",
      question: phrase("วันนี้อากาศเป็นยังไง", "완니이 아깟 뻰 양응아이", "오늘 날씨가 어때?"), answer: phrase("วันนี้ฟ้าใส", "완니이 파아 싸이", "오늘은 하늘이 맑아.") },
    { word: phrase("ด้วยกัน", "두아이 깐", "함께"), note: "동작 뒤에 붙여 ‘함께 한다’고 말할 수 있어요.", situation: "친구와 함께 걸어가기로 하기",
      question: phrase("ไปสวนกันไหม", "빠이 쑤안 깐 마이", "공원에 같이 갈까?"), answer: phrase("เราเดินไปด้วยกัน", "라오 드언 빠이 두아이 깐", "우리 함께 걸어가자.") },
    { word: phrase("ทุกวัน", "툭 완", "매일"), note: "ทุก은 ‘모든’, วัน은 ‘날’이에요. 자주 하는 일을 설명할 때 써요.", situation: "친구와 평소 하는 일 이야기하기",
      question: phrase("ฟังเพลงบ่อยไหม", "팡 플렝 버이 마이", "음악 자주 들어?"), answer: phrase("ฟังเพลงทุกวัน", "팡 플렝 툭 완", "매일 음악을 들어.") },
    { word: phrase("ร้องเพลง", "롱 플렝", "노래하다"), note: "เพลง은 노래이고, ร้องเพลง은 노래를 부른다는 동작이에요.", situation: "친구에게 노래 부르자고 제안하기",
      question: phrase("อยากทำอะไร", "약 탐 아라이", "뭐 하고 싶어?"), answer: phrase("ร้องเพลงด้วยกันไหม", "롱 플렝 두아이 깐 마이", "함께 노래할까?") },
  ],
  es: [
    { word: phrase("hoy", "오이", "오늘"), note: "h는 소리 내지 않아요. 오늘의 날씨나 계획을 말할 때 써요.", situation: "친구와 오늘 날씨 이야기하기",
      question: phrase("¿Qué tiempo hace hoy?", "께 띠엠뽀 아쎄 오이", "오늘 날씨가 어때?"), answer: phrase("Hoy hace buen tiempo.", "오이 아쎄 부엔 띠엠뽀", "오늘 날씨가 좋아.") },
    { word: phrase("contigo", "꼰띠고", "너와 함께"), note: "친근한 상대에게 써요. ‘나와 함께’는 conmigo예요.", situation: "친구와 함께 공원에 가기로 하기",
      question: phrase("¿Vamos al parque?", "바모스 알 빠르께", "우리 공원에 갈까?"), answer: phrase("Sí, voy contigo.", "씨, 보이 꼰띠고", "응, 너와 함께 갈게.") },
    { word: phrase("canción", "깐씨온", "노래"), note: "한 곡은 una canción이에요. 마지막 음절에 강세를 둬요.", situation: "친구에게 좋아하는 노래 알려 주기",
      question: phrase("¿Te gusta esta música?", "떼 구스따 에스따 무씨까", "이 음악 좋아해?"), answer: phrase("Sí, me gusta esta canción.", "씨, 메 구스따 에스따 깐씨온", "응, 이 노래가 좋아.") },
    { word: phrase("momento", "모멘또", "순간"), note: "un momento는 ‘잠깐’이라는 부탁에도 쓰여요.", situation: "친구에게 잠시 기다려 달라고 부탁하기",
      question: phrase("¿Vamos ahora?", "바모스 아오라", "지금 갈까?"), answer: phrase("Un momento, por favor.", "운 모멘또, 포르 파보르", "잠깐만 기다려 줘.") },
  ],
};
export function musicConversationPrompt(title: string, lesson: MusicLanguageLesson) {
  return `한마디 연습곡 「${title}」에서 ${lesson.word.text}(${lesson.word.meaning})를 배웠어요. ${lesson.situation} 상황을 친구 역할로 연습해 주세요. 예시 답변은 ${lesson.answer.text}(${lesson.answer.meaning})예요. 짧은 질문부터 시작하고, 제가 답하면 자연스럽게 이어가 주세요.`;
}
