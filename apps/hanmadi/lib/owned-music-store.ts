import { randomUUID } from "node:crypto";
import { v2Driver } from "./store";
import { ConversationError } from "./conversation";
import { transientStore, claimSlot } from "./transient-store";
import { readKnowledge } from "./knowledge-store";
import { generateMusic, evaluateMusic } from "./owned-music-ai";
import { musicInput, publishedMusic, type OwnedMusic, type MusicUnit, type MusicJudgment } from "./owned-music";
const KEY = "music-catalog:v1";
type DB = ReturnType<typeof v2Driver>;
export async function readMusic(db: DB = v2Driver()): Promise<OwnedMusic[]> {
  const raw = await db.get(KEY);
  return raw ? JSON.parse(raw) : [];
}
async function change<T>(fn: (songs: OwnedMusic[]) => T, db: DB) {
  for (let i = 0; i < 8; i++) {
    const raw = await db.get(KEY), songs: OwnedMusic[] = raw ? JSON.parse(raw) : [];
    const result = fn(songs);
    if (await db.cas(KEY, raw, JSON.stringify(songs))) return result;
  }
  throw new ConversationError(409, "다른 관리자가 수정 중이에요. 목록을 다시 불러와 주세요.");
}
function current(songs: OwnedMusic[], id: unknown, revision: unknown) {
  const song = songs.find(s => s.id === id);
  if (!song || song.revision !== revision) throw new ConversationError(409, "곡 정보가 바뀌었어요. 목록을 다시 불러와 주세요.");
  return song;
}
export async function saveMusic(body: Record<string, unknown>, db: DB = v2Driver()) {
  const input = musicInput(body);
  const id = `music-${randomUUID()}`;
  return change(songs => {
    const old = body.id ? current(songs, body.id, body.revision) : undefined;
    if (old?.job && old.job.until > Date.now()) throw new ConversationError(409, "자료를 만드는 중이에요. 처리 후 수정해 주세요.");
    if (!old && songs.length >= 100) throw new ConversationError(409, "최대 100곡을 보관할 수 있어요.");
    if (songs.some(s => s.id !== old?.id && s.videoId === input.videoId && s.language === input.language)) throw new ConversationError(409, "이미 등록한 영상이에요. 기존 곡을 수정해 주세요.");
    const song: OwnedMusic = { ...input, id: old?.id ?? id, revision: (old?.revision ?? 0) + 1, updatedAt: Date.now(), status: "draft" };
    if (old) songs[songs.indexOf(old)] = song; else songs.push(song);
    return song;
  }, db);
}
export async function publishMusic(body: Record<string, unknown>, actor: string, db: DB = v2Driver()) {
  return change(songs => {
    const song = current(songs, body.id, body.revision);
    if (body.action === "unpublish") {
      if (song.status !== "published") throw new ConversationError(409, "게시된 곡을 선택해 주세요.");
      song.status = "review"; delete song.publishedIndices;
    } else {
      const indices = body.indices;
      if (song.status !== "review" || body.reviewed !== true || !Array.isArray(indices) || indices.length < 2 || indices.length > 8 || new Set(indices).size !== indices.length ||
        indices.some(i => !Number.isInteger(i) || !song.units?.[i] || !song.judgments?.[i] || song.judgments[i].disposition === "excluded"))
        throw new ConversationError(400, "평가를 마친 구간 2개 이상을 선택하고 뜻·발음·회화·사용권을 검수해 주세요.");
      song.publishedIndices = [...indices].sort((a, b) => a - b); song.status = "published";
      song.reviewedAt = Date.now(); song.reviewedBy = actor;
    }
    song.revision++; song.updatedAt = Date.now(); return song;
  }, db);
}
export async function learningMusic(db: DB = v2Driver()) {
  return (await readMusic(db)).flatMap(s => { const p = publishedMusic(s); return p ? [p] : []; });
}
const defaults = () => ({ db: v2Driver(), slots: transientStore(), generate: generateMusic, evaluate: evaluateMusic,
  references: async () => (await readKnowledge()).drafts.filter(d => d.status === "published") });
export async function buildMusic(id: unknown, revision: unknown, deps = defaults()) {
  const { db } = deps, jobId = randomUUID();
  // A durable job lease prevents duplicate charged calls even across server restarts.
  const start = await change(songs => {
    const song = current(songs, id, revision);
    if (song.job && song.job.until > Date.now()) throw new ConversationError(409, "이미 자료를 만들고 있어요. 목록 새로고침으로 상태를 확인해 주세요.");
    if (["published", "review"].includes(song.status)) return { cached: true, song };
    song.job = { id: jobId, until: Date.now() + 180000 };
    song.status = song.units ? "evaluating" : "generating"; delete song.error;
    song.updatedAt = Date.now(); return { cached: false, song };
  }, db);
  if (start.cached) return start.song;
  let release: (() => Promise<void>) | null = null;
  const writeJob = (update: (s: OwnedMusic) => void) => change(songs => {
    const song = current(songs, id, revision);
    if (song.job?.id !== jobId) throw new ConversationError(409, "더 최신 작업이 진행 중이에요. 새로 불러와 주세요.");
    update(song); song.updatedAt = Date.now(); return song;
  }, db);
  try {
    release = await claimSlot(deps.slots, "music-generation", 2, 180);
    if (!release) throw new ConversationError(429, "다른 곡 2개를 처리 중이에요. 잠시 후 다시 눌러 주세요.");
    if (await db.count(`music-generation:${new Date().toISOString().slice(0, 10)}`) > 20) throw new ConversationError(429, "오늘의 자료 생성·평가 한도(20회)에 도달했어요.");
    let units: MusicUnit[] | undefined = start.song.units;
    if (!units) {
      units = await deps.generate(start.song);
      await writeJob(s => { s.units = units; s.status = "evaluating"; });
    }
    const [catalog, knowledge] = await Promise.all([readMusic(db), deps.references()]);
    const references = [...catalog.filter(s => s.id !== id && s.status === "published" && s.language === start.song.language)
      .flatMap(s => (s.publishedIndices ?? []).map(i => s.units![i].lesson.answer)),
      ...knowledge.filter(d => d.language === start.song.language).flatMap(d => d.units)];
    const judgments: MusicJudgment[] = await deps.evaluate(start.song, units, references);
    if (judgments.length !== units.length || judgments.some(j => !["accepted", "review", "excluded"].includes(j.disposition))) throw new ConversationError(502, "평가 결과 개수가 맞지 않아요. 다시 평가해 주세요.");
    return await writeJob(s => { s.judgments = judgments; s.status = "review"; delete s.job; });
  } catch (e) {
    const error = e instanceof ConversationError ? e : new ConversationError(503, "자료 생성을 완료하지 못했어요. 다시 시도해 주세요.");
    await writeJob(s => { s.status = "error"; s.error = error.message; delete s.job; });
    throw error;
  } finally { if (release) await release().catch(() => {}); }
}
