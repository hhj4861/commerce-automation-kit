import { ConversationError } from "./conversation";
import { isStudyLanguage, type StudyLanguage, type Phrase } from "./v2";
import { parseRoleplay } from "./v2-ai";
import type { MusicLanguageLesson } from "./music-language";
import type { PracticeSong } from "./original-music";

import { parseMusicSource as parseSource, type SourceLine } from "./music-source";
export type { SourceLine } from "./music-source";
export type MusicInput = { title: string; artist: string; language: StudyLanguage; videoId: string; source: string; rights: string; rightsConfirmed: true };
export type MusicUnit = { sourceIndex: number; line: Phrase; lesson: MusicLanguageLesson };
export type MusicJudgment = { disposition: "accepted" | "review" | "excluded"; confidence: number; reason: string };
export type OwnedMusic = MusicInput & {
  id: string; revision: number; updatedAt: number;
  status: "draft" | "generating" | "evaluating" | "review" | "published" | "error";
  units?: MusicUnit[]; judgments?: MusicJudgment[]; publishedIndices?: number[];
  job?: { id: string; until: number }; error?: string;
  reviewedAt?: number; reviewedBy?: string;
};
export function musicInput(value: unknown): MusicInput {
  const b = value as Partial<MusicInput> | null;
  if (!b || !isStudyLanguage(b.language) || b.rightsConfirmed !== true ||
    typeof b.title !== "string" || !b.title.trim() || b.title.length > 100 ||
    typeof b.artist !== "string" || !b.artist.trim() || b.artist.length > 100 ||
    typeof b.rights !== "string" || b.rights.trim().length < 10 || b.rights.length > 1000 ||
    typeof b.videoId !== "string" || !/^[A-Za-z0-9_-]{11}$/.test(b.videoId) ||
    typeof b.source !== "string" || b.source.length > 12000)
    throw new ConversationError(400, "곡 정보·공식 영상 ID·원문과 AI 처리 및 학습 재사용 권한을 확인해 주세요.");
  parseMusicSource(b.source);
  return { title: b.title.trim(), artist: b.artist.trim(), language: b.language, videoId: b.videoId,
    rights: b.rights.trim(), source: b.source.trim(), rightsConfirmed: true };
}
export function parseMusicSource(source: string): SourceLine[] {
  try { return parseSource(source); }
  catch (error) { throw new ConversationError(400, error instanceof Error ? error.message : "원문을 확인해 주세요."); }
}
export function parseMusicUnits(value: unknown, input: MusicInput): MusicUnit[] {
  const source = parseMusicSource(input.source);
  if (!Array.isArray(value) || value.length < 2 || value.length > 8) throw new ConversationError(502, "AI가 2~8개 학습 구간을 만들지 못했어요. 원문을 확인해 주세요.");
  const seen = new Set<number>(), meanings = new Set<string>(), words = new Set<string>();
  try {
    return value.map(u => {
      if (!u || !Number.isInteger(u.sourceIndex) || !source[u.sourceIndex] || seen.has(u.sourceIndex)) throw new Error("source");
      seen.add(u.sourceIndex);
      const phrase = (v: unknown) => parseRoleplay(JSON.stringify(v), input.language);
      const line = phrase(u.line), word = phrase(u.lesson?.word), question = phrase(u.lesson?.question), answer = phrase(u.lesson?.answer);
      if (line.text !== source[u.sourceIndex].text || !line.text.normalize("NFKC").includes(word.text.normalize("NFKC")) ||
        !answer.text.normalize("NFKC").includes(word.text.normalize("NFKC"))) throw new Error("grounding");
      const wordKey = word.text.normalize("NFKC").toLowerCase().replace(/[\s\p{P}]/gu, "");
      const meaningKey = word.meaning.normalize("NFKC").replace(/[\s\p{P}]/gu, "");
      if (words.has(wordKey) || meanings.has(meaningKey)) throw new Error("ambiguous quiz choices");
      words.add(wordKey); meanings.add(meaningKey);
      const note = u.lesson.note, situation = u.lesson.situation;
      if (typeof note !== "string" || !note.trim() || note.length > 500 || typeof situation !== "string" || !situation.trim() || situation.length > 150) throw new Error("lesson");
      return { sourceIndex: u.sourceIndex, line, lesson: { word, question, answer, note: note.trim(), situation: situation.trim() } };
    }).sort((a, b) => a.sourceIndex - b.sourceIndex);
  } catch { throw new ConversationError(502, "AI 자료의 원문 일치·학습 언어·발음·단어와 회화를 확인하지 못했어요. 게시하지 않았어요."); }
}
export function publishedMusic(item: OwnedMusic): PracticeSong | null {
  if (item.status !== "published" || !item.units || !item.publishedIndices || item.publishedIndices.length < 2) return null;
  const source = parseMusicSource(item.source);
  const units = item.publishedIndices.map(i => item.units![i]);
  return { id: item.id, language: item.language, title: item.title, subtitle: item.artist, revision: String(item.revision),
    audio: "", videoId: item.videoId, managed: true,
    lines: units.map(u => ({ ...u.line, id: `source-${u.sourceIndex}`, ...((source[u.sourceIndex].startSeconds !== undefined) ? { startSeconds: source[u.sourceIndex].startSeconds!, endSeconds: source[u.sourceIndex].endSeconds! } : { startSeconds: 0, endSeconds: 0 }) })),
    lessons: units.map(u => u.lesson) };
}
