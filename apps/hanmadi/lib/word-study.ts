import { isVocabulary, type Expression, type Phrase, type StudyLanguage } from "./v2";

export type StudyWord = Phrase & { id: string; example?: Phrase };
export type WordPack = { id: string; title: string; description: string; icon: string; words: StudyWord[] };
type Entry = [text: string, meaning: string, reading: string, example: string, translation: string, exampleReading: string];
// Authored beginner material. No model call or third-party dictionary is needed to start.
const entries: Record<StudyLanguage, Entry[][]> = {
  en: [
    [
      ["coffee", "커피", "커피", "I'd like a coffee.", "커피 한 잔 주세요.", "아이드 라이크 어 커피"],
      ["water", "물", "워터", "Can I have some water?", "물 좀 주실 수 있나요?", "캔 아이 해브 섬 워터"],
      ["menu", "메뉴", "메뉴", "Can I see the menu?", "메뉴를 볼 수 있을까요?", "캔 아이 씨 더 메뉴"],
      ["milk", "우유", "밀크", "Do you have milk?", "우유가 있나요?", "두 유 해브 밀크"],
      ["sugar", "설탕", "슈거", "No sugar, please.", "설탕은 빼 주세요.", "노 슈거 플리즈"],
    ], [
      ["station", "역", "스테이션", "Where is the station?", "역은 어디에 있나요?", "웨어 이즈 더 스테이션"],
      ["ticket", "표", "티킷", "One ticket, please.", "표 한 장 주세요.", "원 티킷 플리즈"],
      ["exit", "출구", "엑싯", "Where is the exit?", "출구는 어디인가요?", "웨어 이즈 디 엑싯"],
      ["left", "왼쪽", "레프트", "Turn left here.", "여기서 왼쪽으로 도세요.", "턴 레프트 히어"],
      ["right", "오른쪽", "라이트", "Turn right here.", "여기서 오른쪽으로 도세요.", "턴 라이트 히어"],
    ], [
      ["name", "이름", "네임", "What's your name?", "이름이 뭐예요?", "왓츠 유어 네임"],
      ["today", "오늘", "투데이", "I'm free today.", "오늘은 시간이 있어요.", "아임 프리 투데이"],
      ["friend", "친구", "프렌드", "This is my friend.", "제 친구예요.", "디스 이즈 마이 프렌드"],
      ["hobby", "취미", "하비", "What's your hobby?", "취미가 뭐예요?", "왓츠 유어 하비"],
      ["music", "음악", "뮤직", "I like music.", "음악을 좋아해요.", "아이 라이크 뮤직"],
    ],
  ],
  ja: [
    [
      ["コーヒー", "커피", "코오히이", "コーヒーを一杯ください。", "커피 한 잔 주세요.", "코오히이오 잇파이 쿠다사이"],
      ["水", "물", "미즈", "水をください。", "물을 주세요.", "미즈오 쿠다사이"],
      ["メニュー", "메뉴", "메뉴우", "メニューを見せてください。", "메뉴를 보여 주세요.", "메뉴우오 미세테 쿠다사이"],
      ["牛乳", "우유", "규우뉴우", "牛乳はありますか。", "우유가 있나요?", "규우뉴우와 아리마스카"],
      ["砂糖", "설탕", "사토오", "砂糖はいりません。", "설탕은 필요 없어요.", "사토오와 이리마센"],
    ], [
      ["駅", "역", "에키", "駅はどこですか。", "역은 어디에 있나요?", "에키와 도코데스카"],
      ["切符", "표", "킷푸", "切符を一枚ください。", "표 한 장 주세요.", "킷푸오 이치마이 쿠다사이"],
      ["出口", "출구", "데구치", "出口はどこですか。", "출구는 어디인가요?", "데구치와 도코데스카"],
      ["左", "왼쪽", "히다리", "ここで左に曲がります。", "여기서 왼쪽으로 돌아요.", "코코데 히다리니 마가리마스"],
      ["右", "오른쪽", "미기", "ここで右に曲がります。", "여기서 오른쪽으로 돌아요.", "코코데 미기니 마가리마스"],
    ], [
      ["名前", "이름", "나마에", "お名前は何ですか。", "이름이 뭐예요?", "오나마에와 난데스카"],
      ["今日", "오늘", "쿄오", "今日は暇です。", "오늘은 한가해요.", "쿄오와 히마데스"],
      ["友達", "친구", "토모다치", "私の友達です。", "제 친구예요.", "와타시노 토모다치데스"],
      ["趣味", "취미", "슈미", "趣味は何ですか。", "취미가 뭐예요?", "슈미와 난데스카"],
      ["音楽", "음악", "온가쿠", "音楽が好きです。", "음악을 좋아해요.", "온가쿠가 스키데스"],
    ],
  ],
  th: [
    [
      ["กาแฟ", "커피", "까패", "ขอกาแฟหนึ่งแก้ว", "커피 한 잔 주세요.", "커 까패 능 깨우"],
      ["น้ำ", "물", "남", "ขอน้ำหน่อย", "물 좀 주세요.", "커 남 너이"],
      ["เมนู", "메뉴", "메누", "ขอดูเมนูหน่อย", "메뉴 좀 보여 주세요.", "커 두 메누 너이"],
      ["นม", "우유", "놈", "มีนมไหม", "우유가 있나요?", "미 놈 마이"],
      ["น้ำตาล", "설탕", "남딴", "ไม่ใส่น้ำตาล", "설탕은 넣지 마세요.", "마이 싸이 남딴"],
    ], [
      ["สถานี", "역", "싸타니", "สถานีอยู่ที่ไหน", "역은 어디에 있나요?", "싸타니 유 티 나이"],
      ["ตั๋ว", "표", "뚜아", "ขอตั๋วหนึ่งใบ", "표 한 장 주세요.", "커 뚜아 능 바이"],
      ["ทางออก", "출구", "탕억", "ทางออกอยู่ที่ไหน", "출구는 어디인가요?", "탕억 유 티 나이"],
      ["ซ้าย", "왼쪽", "싸이", "เลี้ยวซ้ายตรงนี้", "여기서 왼쪽으로 도세요.", "리아우 싸이 뜨롱 니"],
      ["ขวา", "오른쪽", "콰", "เลี้ยวขวาตรงนี้", "여기서 오른쪽으로 도세요.", "리아우 콰 뜨롱 니"],
    ], [
      ["ชื่อ", "이름", "츠", "คุณชื่ออะไร", "이름이 뭐예요?", "쿤 츠 아라이"],
      ["วันนี้", "오늘", "완니", "วันนี้ว่าง", "오늘은 한가해요.", "완니 왕"],
      ["เพื่อน", "친구", "프안", "นี่คือเพื่อน", "이 사람은 친구예요.", "니 크 프안"],
      ["งานอดิเรก", "취미", "응안 아디렉", "งานอดิเรกคืออะไร", "취미가 뭐예요?", "응안 아디렉 크 아라이"],
      ["ดนตรี", "음악", "돈뜨리", "ชอบดนตรี", "음악을 좋아해요.", "첩 돈뜨리"],
    ],
  ],
  es: [
    [
      ["café", "커피", "카페", "Un café, por favor.", "커피 한 잔 주세요.", "운 카페 포르 파보르"],
      ["agua", "물", "아구아", "Agua, por favor.", "물 주세요.", "아구아 포르 파보르"],
      ["menú", "메뉴", "메누", "¿Puedo ver el menú?", "메뉴를 볼 수 있을까요?", "푸에도 베르 엘 메누"],
      ["leche", "우유", "레체", "¿Tiene leche?", "우유가 있나요?", "티에네 레체"],
      ["azúcar", "설탕", "아수카르", "Sin azúcar, por favor.", "설탕은 빼 주세요.", "신 아수카르 포르 파보르"],
    ], [
      ["estación", "역", "에스타시온", "¿Dónde está la estación?", "역은 어디에 있나요?", "돈데 에스타 라 에스타시온"],
      ["billete", "표", "비예테", "Un billete, por favor.", "표 한 장 주세요.", "운 비예테 포르 파보르"],
      ["salida", "출구", "살리다", "¿Dónde está la salida?", "출구는 어디인가요?", "돈데 에스타 라 살리다"],
      ["izquierda", "왼쪽", "이스키에르다", "Gire a la izquierda.", "왼쪽으로 도세요.", "히레 아 라 이스키에르다"],
      ["derecha", "오른쪽", "데레차", "Gire a la derecha.", "오른쪽으로 도세요.", "히레 아 라 데레차"],
    ], [
      ["nombre", "이름", "놈브레", "¿Cuál es tu nombre?", "이름이 뭐예요?", "쿠알 에스 투 놈브레"],
      ["hoy", "오늘", "오이", "Hoy tengo tiempo.", "오늘은 시간이 있어요.", "오이 텡고 티엠포"],
      ["amigo", "친구", "아미고", "Es mi amigo.", "제 친구예요.", "에스 미 아미고"],
      ["afición", "취미", "아피시온", "¿Cuál es tu afición?", "취미가 뭐예요?", "쿠알 에스 투 아피시온"],
      ["música", "음악", "무시카", "Me gusta la música.", "음악을 좋아해요.", "메 구스타 라 무시카"],
    ],
  ],
};
const topics = [
  { id: "cafe", title: "카페에서 주문할 때", description: "커피 한 잔부터 나만의 주문까지", icon: "cup" },
  { id: "travel", title: "낯선 길을 찾을 때", description: "역과 출구, 가야 할 방향을 알아봐요", icon: "pin" },
  { id: "smalltalk", title: "처음 만난 사람과", description: "이름과 취미로 대화를 시작해요", icon: "chat" },
];
export function wordPacks(language: StudyLanguage): WordPack[] {
  return topics.map((topic, index) => ({ ...topic, words: entries[language][index].map(([text, meaning, reading, example, translation, exampleReading], i) => ({
    id: `word:${language}:${topic.id}:${i}`, text, meaning, reading,
    example: { text: example, meaning: translation, reading: exampleReading },
  })) }));
}
export function vocabularyForStudy(expressions: Expression[], language: StudyLanguage, now: number) {
  const all = expressions.filter(word => word.language === language && isVocabulary(word))
    .toSorted((a, b) => a.dueAt - b.dueAt || a.createdAt - b.createdAt);
  return { all, due: all.filter(word => word.dueAt <= now) };
}
export function meaningChoices(word: StudyWord, pool: StudyWord[]): string[] {
  const normalize = (value: string) => value.normalize("NFKC").trim().toLocaleLowerCase();
  const seen = new Set([normalize(word.meaning)]);
  const wrong = pool.filter(item => {
    const meaning = normalize(item.meaning);
    if (seen.has(meaning)) return false;
    seen.add(meaning); return true;
  }).slice(0, 3).map(item => item.meaning);
  // Stable per word, with the answer in varying positions (never a fixed first option).
  const position = Array.from(word.id).reduce((sum, char) => sum + char.charCodeAt(0), 0) % (wrong.length + 1);
  wrong.splice(position, 0, word.meaning);
  return wrong;
}
