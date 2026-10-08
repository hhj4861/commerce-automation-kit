import type { Phrase } from "./v2";

// Hanmadi's own adapter contract, NOT a Musixmatch or LyricFind API schema.
// A contracted supplier adapter must supply reviewed, licensed study material.
export type LicensedMusicLesson = {
  trackId: "pretender";
  revision: string;
  expiresAt: string;
  attribution: { label: string; url: string };
  rights: {
    reference: string;
    display: true;
    translation: true;
    pronunciation: true;
    speech: true;
  };
  lines: (Phrase & { id: string; startSeconds?: number; endSeconds?: number })[];
};
export type MusicProgress = { revision: string; index: number };
export type MusicLyricsResult =
  | { status: "ready"; lesson: LicensedMusicLesson; progress?: MusicProgress }
  | { status: "unavailable"; reason: "not-configured" | "rights-pending" | "expired" | "temporary" };

const record = (v: unknown): Record<string, unknown> =>
  v && typeof v === "object" && !Array.isArray(v) ? v as Record<string, unknown> : {};
function text(v: unknown, max: number): string {
  if (typeof v !== "string" || !v.trim() || v.length > max || /[<>\u0000-\u0008]/u.test(v))
    throw new Error("Invalid music material");
  return v.trim();
}
export function parseLicensedMusicLesson(value: unknown, now = Date.now()): LicensedMusicLesson {
  const data = record(value), rights = record(data.rights), attribution = record(data.attribution);
  if (data.trackId !== "pretender" || !Array.isArray(data.lines) || !data.lines.length || data.lines.length > 200)
    throw new Error("Invalid music track");
  const expiresAt = text(data.expiresAt, 40);
  if (!Number.isFinite(Date.parse(expiresAt)) || Date.parse(expiresAt) <= now)
    throw new Error("Expired music material");
  if (["display", "translation", "pronunciation", "speech"].some(key => rights[key] !== true))
    throw new Error("Music rights pending");
  const url = new URL(text(attribution.url, 1000));
  if (url.protocol !== "https:" || url.username || url.password)
    throw new Error("Invalid attribution");
  const ids = new Set<string>();
  let previousStart = -1;
  const lines = data.lines.map(value => {
    const line = record(value);
    const id = text(line.id, 80);
    if (ids.has(id)) throw new Error("Duplicate music line id");
    ids.add(id);
    const phrase = { text: text(line.text, 300), reading: text(line.reading, 400), meaning: text(line.meaning, 500) };
    if (!/[ぁ-ゖァ-ヺ一-龯]/u.test(phrase.text) || /[가-힣]/u.test(phrase.text) ||
        !/[가-힣]/u.test(phrase.reading) || /[a-zA-Zぁ-ゖァ-ヺ一-龯ㄱ-ㅎㅏ-ㅣ]/u.test(phrase.reading) ||
        !/[가-힣]/u.test(phrase.meaning)) throw new Error("Invalid music language");
    if (line.startSeconds === undefined && line.endSeconds === undefined) return { id, ...phrase };
    const start = line.startSeconds, end = line.endSeconds;
    if (typeof start !== "number" || typeof end !== "number" || !Number.isInteger(start) || !Number.isInteger(end) ||
        start < 0 || start < previousStart || end <= start || end > 3600 || end - start > 120)
      throw new Error("Invalid music timing");
    previousStart = start;
    return { id, ...phrase, startSeconds: start, endSeconds: end };
  });
  return {
    trackId: "pretender", revision: text(data.revision, 100), expiresAt,
    attribution: { label: text(attribution.label, 1000), url: url.href },
    rights: { reference: text(rights.reference, 300), display: true, translation: true, pronunciation: true, speech: true },
    lines,
  };
}
export function musicProgressIndex(progress: MusicProgress | undefined, lesson: LicensedMusicLesson) {
  return progress?.revision === lesson.revision && Number.isInteger(progress.index) &&
    progress.index >= 0 && progress.index < lesson.lines.length ? progress.index : 0;
}
