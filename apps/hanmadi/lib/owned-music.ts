import { ConversationError } from "./conversation";
import { isStudyLanguage, type StudyLanguage, type Phrase } from "./v2";
import { parseRoleplay } from "./v2-ai";
import type { MusicLanguageLesson } from "./music-language";
import type { PracticeSong } from "./original-music";

export type SourceLine = { text: string; startSeconds?: number; endSeconds?: number };
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
  if (typeof source !== "string" || source.length > 12000) throw new ConversationError(400, "원문은 12,000자까지 등록할 수 있어요.");
  const text = source.replace(/^\uFEFF/, "").replace(/\r/g, "").trim();
  const timed = text.includes("-->");
  let lines: SourceLine[];
  if (timed) {
    const seconds = (v: string) => v.replace(",", ".").split(":").reduce((sum, n) => sum * 60 + Number(n), 0);
    const cue = /^(?:(?:\d{2}:)?\d{2}:\d{2}[.,]\d{3})$/;
    lines = text.split(/\n\s*\n/).flatMap(block => {
      const rows = block.split("\n");
      const i = rows.findIndex(r => r.includes("-->"));
      if (i < 0) {
        if (/^(WEBVTT|NOTE|STYLE|REGION)(\s|$)/.test(block)) return [];
        throw new ConversationError(400, "자막의 시간 형식을 확인해 주세요.");
      }
      const [a, rest] = rows[i].split(/\s*-->\s*/);
      const b = rest?.split(/\s/)[0];
      if (!cue.test(a) || !cue.test(b ?? "")) throw new ConversationError(400, "자막 시간을 읽지 못했어요.");
      return [{ text: rows.slice(i + 1).join(" ").replace(/<[^>]*>/g, "").trim(), startSeconds: seconds(a), endSeconds: seconds(b) }];
    });
  } else lines = text.split(/\n/).map(t => ({ text: t.trim() })).filter(l => l.text);
  if (lines.length < 2 || lines.length > 100 || lines.some((l, i) => !l.text || l.text.length > 250 ||
    (l.startSeconds !== undefined && (!Number.isFinite(l.startSeconds) || !Number.isFinite(l.endSeconds) || l.startSeconds < 0 || l.endSeconds! <= l.startSeconds || l.endSeconds! > 3600 || l.endSeconds! - l.startSeconds > 120 || (i > 0 && l.startSeconds < lines[i - 1].startSeconds!)))))
    throw new ConversationError(400, "원문은 2~100줄, 한 줄 250자 이내로 나눠 주세요. 자막은 순서대로 2분 이하 구간이어야 해요.");
  return lines;
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
