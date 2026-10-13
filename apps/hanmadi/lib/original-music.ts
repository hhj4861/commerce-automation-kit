import { ConversationError } from "./conversation";
import type { Phrase, StudyLanguage } from "./v2";

export type PracticeSong = {
  id: string; language: StudyLanguage; title: string; subtitle: string; revision: string;
  audio: string; lines: (Phrase & { id: string; startSeconds: number; endSeconds: number })[];
};
export type SongProgress = {
  revision: string; index: number; practiced: string[]; reviewed: string[];
  completedAt?: number; dueAt?: number; phase?: "practice" | "review";
};
// Original lyrics written for Hanmadi. No commercial song reconstruction.
const rows: Record<StudyLanguage, [string, string, string][]> = {
  en: [
    ["Hello, the morning is bright.", "헬로, 더 모닝 이즈 브라이트", "안녕, 아침이 밝아요."],
    ["We walk together, side by side.", "위 워크 투게더, 사이드 바이 사이드", "우리는 나란히 함께 걸어요."],
    ["A little step, a little smile.", "어 리틀 스텝, 어 리틀 스마일", "작은 한 걸음, 작은 미소."],
    ["Let's stay here for a little while.", "렛츠 스테이 히어 포 어 리틀 와일", "우리 여기 잠깐 머물러요."],
  ],
  ja: [
    ["おはよう、空が青い。", "오하요오, 소라가 아오이", "좋은 아침, 하늘이 파래요."],
    ["となりで、君が笑う。", "토나리데, 키미가 와라우", "옆에서 네가 웃어요."],
    ["ゆっくり、歩いていこう。", "윳쿠리, 아루이테 이코오", "천천히 걸어가요."],
    ["小さな今日を、歌おう。", "치이사나 쿄오오, 우타오오", "작은 오늘을 노래해요."],
  ],
  th: [
    ["สวัสดี วันนี้ฟ้าใส", "싸왓디이 완니이 파아 싸이", "안녕하세요, 오늘은 하늘이 맑아요."],
    ["เราเดินไปด้วยกัน", "라오 드언 빠이 두아이 깐", "우리는 함께 걸어가요."],
    ["ยิ้มให้กันทุกวัน", "임 하이 깐 툭 완", "매일 서로에게 미소 지어요."],
    ["ร้องเพลงไปด้วยกัน", "롱 플렝 빠이 두아이 깐", "함께 노래해요."],
  ],
  es: [
    ["Hola, el cielo brilla hoy.", "올라, 엘 씨엘로 브리야 오이", "안녕, 오늘 하늘이 빛나요."],
    ["Paso a paso, contigo voy.", "빠소 아 빠소, 꼰띠고 보이", "한 걸음씩, 너와 함께 가요."],
    ["Una sonrisa, una canción.", "우나 손리사, 우나 깐씨온", "미소 하나, 노래 하나."],
    ["Este momento es de los dos.", "에스떼 모멘또 에스 데 로스 도스", "이 순간은 우리 둘의 것이에요."],
  ],
};
const titles = { en: "A Little Step", ja: "小さな今日", th: "เดินไปด้วยกัน", es: "Paso a paso" };
// Provider word alignment verified against every authored lyric; include small playback margins.
const audioRanges: Record<StudyLanguage, [number, number][]> = {"en": [[0.52, 4.95], [9.3, 14.45], [18.58, 22.87], [24.24, 28.73]], "ja": [[1.36, 7.55], [8.22, 15.61], [17.02, 24.37], [24.64, 31.53]], "th": [[0.30, 4.71], [5.50, 10.65], [12.42, 16.51], [18.36, 22.41]], "es": [[0.56, 7.17], [9.3, 15.95], [15.96, 23.27], [25.48, 30.97]]};
export const practiceSongs: PracticeSong[] = (Object.keys(rows) as StudyLanguage[]).map(language => ({
  id: `hanmadi-${language}-morning`, language, title: titles[language], subtitle: "함께 걷는 아침 · 입문",
  revision: "original-20261013-v1", audio: `/study/music/hanmadi-${language}-morning.mp3`,
  lines: rows[language].map(([text, reading, meaning], i) => ({ id: `line-${i + 1}`, text, reading, meaning, startSeconds: audioRanges[language][i][0], endSeconds: audioRanges[language][i][1] })),
}));
export function songProgress(song: PracticeSong, saved?: SongProgress): SongProgress {
  if (!saved || saved.revision !== song.revision) return { revision: song.revision, index: 0, practiced: [], reviewed: [] };
  const valid = new Set(song.lines.map(line => line.id));
  const unique = (ids: string[] | undefined) => [...new Set(ids ?? [])].filter(id => valid.has(id));
  return { ...saved, index: Number.isInteger(saved.index) && saved.index >= 0 && saved.index < song.lines.length ? saved.index : 0,
    practiced: unique(saved.practiced), reviewed: unique(saved.reviewed) };
}
export type SongAction = { trackId: string; revision: string; index: number; action: "move" | "practice" | "review" | "answer"; answer?: string };
export function parseSongAction(value: unknown): { song: PracticeSong; input: SongAction } {
  const b = value as Partial<SongAction> | null;
  const song = practiceSongs.find(song => song.id === b?.trackId);
  if (!song || !b || !Number.isInteger(b.index) || Number(b.index) < 0 || Number(b.index) >= song.lines.length ||
    !["move", "practice", "review", "answer"].includes(b.action ?? "")) throw new ConversationError(400, "연습할 곡과 줄을 다시 선택해 주세요.");
  if (b.revision !== song.revision) throw new ConversationError(409, "연습곡이 바뀌었어요. 다시 불러와 주세요.");
  if (b.action === "answer" && !song.lines.some(line => line.id === b.answer)) throw new ConversationError(400, "뜻을 하나 골라 주세요.");
  return { song, input: b as SongAction };
}
export function updateSongProgress(song: PracticeSong, previous: SongProgress | undefined, input: SongAction, now = Date.now()) {
  const progress = songProgress(song, previous), line = song.lines[input.index];
  progress.index = input.index;
  let correct: boolean | undefined;
  if (input.action === "practice") progress.phase = "practice";
  if (input.action === "practice" && !progress.practiced.includes(line.id)) progress.practiced = [...progress.practiced, line.id];
  if (input.action === "review") {
    progress.phase = "review";
    if (progress.practiced.length !== song.lines.length) throw new ConversationError(409, "먼저 네 줄을 따라 불러 주세요.");
    if (progress.reviewed.length === song.lines.length) progress.reviewed = [];
  }
  if (input.action === "answer") {
    if (progress.practiced.length !== song.lines.length) throw new ConversationError(409, "먼저 네 줄을 따라 불러 주세요.");
    progress.phase = "review";
    const alreadyComplete = progress.reviewed.length === song.lines.length;
    correct = input.answer === line.id;
    if (correct && !progress.reviewed.includes(line.id)) progress.reviewed = [...progress.reviewed, line.id];
    if (correct && !alreadyComplete && progress.reviewed.length === song.lines.length) {
      progress.completedAt = now; progress.dueAt = now + 86400000;
    }
  }
  return { progress, correct };
}
