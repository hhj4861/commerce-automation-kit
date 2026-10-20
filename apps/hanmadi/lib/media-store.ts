import { randomUUID } from "node:crypto";
import { ConversationError } from "./conversation";
import { v2Driver } from "./store";
import { MEDIA_PARSER, mediaHash, mediaRegistration, normalizeOriginal, originalInput, isMediaAcquisitionMethod,
  type MediaState, type MediaSource, type MediaOriginal, type MediaJob, type MediaSummary, type MediaDetail } from "./media-source";

const KEY = "media-foundation:v1";
export type MediaDB = Pick<ReturnType<typeof v2Driver>, "get" | "cas">;
const empty = (): MediaState => ({ schema: 1, sources: [], jobs: [] });
function decode(raw: string | null): MediaState {
  if (raw === null) return empty();
  const state = JSON.parse(raw) as MediaState;
  if (state.schema !== 1 || !Array.isArray(state.sources) || !Array.isArray(state.jobs))
    throw new ConversationError(503, "원문 저장 형식을 확인해야 해요. 관리자에게 알려 주세요.");
  return state;
}
async function change<T>(db: MediaDB, update: (state: MediaState) => T): Promise<T> {
  for (let attempt = 0; attempt < 8; attempt++) {
    const old = await db.get(KEY), state = decode(old), result = update(state), next = JSON.stringify(state);
    const reserved = state.jobs.filter(job => !job.output && ["queued", "running", "failed"].includes(job.status))
      .reduce((sum, job) => { const source = state.sources.find(s => s.id === job.sourceId);
        return sum + (source?.revision === job.sourceRevision ? Buffer.byteLength(source.originals.at(-1)?.raw ?? "") + 40000 : 0); }, 0);
    if (Buffer.byteLength(next) + reserved > 1000000) throw new ConversationError(409, "원문 보관 공간이 가득 찼어요. 필요 없는 원문·작업을 삭제해 주세요.");
    if (await db.cas(KEY, old, next)) return result;
  }
  throw new ConversationError(409, "다른 창에서 수정 중이에요. 새로고침 후 다시 시도해 주세요.");
}
function sourceOf(state: MediaState, id: unknown) {
  const source = state.sources.find(s => s.id === id);
  if (!source) throw new ConversationError(404, "등록한 원문을 선택해 주세요.");
  return source;
}
function jobOf(state: MediaState, id: unknown) {
  const job = state.jobs.find(j => j.id === id);
  if (!job) throw new ConversationError(404, "처리 작업을 선택해 주세요.");
  return job;
}
function detail(state: MediaState, id: unknown): MediaDetail {
  return { source: sourceOf(state, id), jobs: state.jobs.filter(j => j.sourceId === id) };
}
export async function readMedia(id?: unknown, db: MediaDB = v2Driver()) {
  const state = decode(await db.get(KEY));
  if (id !== undefined) return detail(state, id);
  const sources: MediaSummary[] = state.sources.map(source => {
    const { originals, ...metadata } = source;
    const latest = [...state.jobs].reverse().find(j => j.sourceId === source.id && j.sourceRevision === source.revision);
    return { ...metadata, originalCount: originals.length, job: latest ? {
      id: latest.id, status: latest.status, stage: latest.stage, revision: latest.revision,
      sourceRevision: latest.sourceRevision, updatedAt: latest.updatedAt, error: latest.error, lease: latest.lease,
    } : null };
  });
  return { sources };
}
export async function collectMedia(body: Record<string, unknown>, db: MediaDB = v2Driver(), legacyId?: string) {
  const { acquisitionMethod, ...input } = mediaRegistration(body), now = Date.now();
  return change(db, state => {
    const existing = state.sources.find(s => s.id === input.id);
    if (existing) {
      if (existing.language !== input.language) throw new ConversationError(409, "이미 다른 원문 언어로 등록한 영상이에요. 원문·작업에서 기존 정보를 확인해 주세요.");
      // Recollection never overwrites a chosen plan. Existing legacy sources may acquire their first plan.
      if (!existing.acquisition && acquisitionMethod) existing.acquisition = { method: acquisitionMethod, revision: 1, updatedAt: now };
      existing.purposes = [...new Set([...existing.purposes, ...input.purposes])].sort();
      return detail(state, existing.id); // Add a use without replacing the source title, original, version or history.
    }
    if (state.sources.length >= 50) throw new ConversationError(409, "최대 50개 원본을 보관할 수 있어요.");
    const source: MediaSource = { ...input, origin: legacyId ? "music-collection" : "manual", ...(legacyId ? { legacyId } : {}),
      ...(acquisitionMethod ? { acquisition: { method: acquisitionMethod, revision: 1, updatedAt: now } } : {}), revision: 0, createdAt: now, originals: [] };
    state.sources.push(source); return detail(state, source.id);
  });
}
// Plans describe the next acquisition step; they do not grant rights or complete a source job.
export async function setMediaAcquisition(body: Record<string, unknown>, db: MediaDB = v2Driver()) {
  if (!isMediaAcquisitionMethod(body.method)) throw new ConversationError(400, "원문 확보 방법을 선택해 주세요.");
  const method = body.method;
  return change(db, state => {
    const source = sourceOf(state, body.id), revision = source.acquisition?.revision ?? 0;
    if (!Number.isSafeInteger(body.planRevision) || body.planRevision !== revision)
      throw new ConversationError(409, "다른 창에서 확보 방법을 바꿨어요. 최신 계획을 확인한 뒤 다시 저장해 주세요.");
    if (source.acquisition?.method !== method) source.acquisition = { method, revision: revision + 1, updatedAt: Date.now() };
    return detail(state, source.id);
  });
}
export async function saveMediaOriginal(body: Record<string, unknown>, actor: string, db: MediaDB = v2Driver()) {
  const input = originalInput(body), now = Date.now();
  return change(db, state => {
    const source = sourceOf(state, body.id);
    const inputHash = mediaHash({ sourceId: source.id, raw: input.raw, rights: input.rights, parser: MEDIA_PARSER });
    const repeated = state.jobs.find(j => j.requestId === input.requestId);
    if (repeated) {
      if (repeated.sourceId !== source.id || repeated.inputHash !== inputHash) throw new ConversationError(409, "같은 요청 번호에 다른 내용이 있어요. 새 요청으로 저장해 주세요.");
      return detail(state, source.id); // Replay after a lost response does not create another version/job.
    }
    if (!Number.isInteger(body.revision) || source.revision !== body.revision) throw new ConversationError(409, "원문 버전이 바뀌었어요. 다시 불러와 비교해 주세요.");
    if (source.originals.length >= 8 || state.jobs.length >= 400) throw new ConversationError(409, "원문별 8개 버전까지 보관해요. 필요 없는 원본을 삭제한 뒤 등록해 주세요.");
    source.revision++;
    for (const job of state.jobs.filter(j => j.sourceId === source.id && ["queued", "running"].includes(j.status))) {
      job.status = "cancelled"; job.revision++; job.updatedAt = now; delete job.lease;
      job.error = { code: "source_replaced", message: "새 원문 버전으로 대체됐어요." };
      const last = job.attempts.at(-1); if (last && !last.finishedAt) { last.finishedAt = now; last.outcome = "cancelled"; }
    }
    source.originals.push({ version: source.revision, hash: inputHash, raw: input.raw, rights: input.rights, savedBy: actor, savedAt: now });
    state.jobs.push({ id: randomUUID(), sourceId: source.id, sourceRevision: source.revision, inputHash, requestId: input.requestId,
      status: "queued", stage: "validate", parser: MEDIA_PARSER, revision: 1, attempts: [], createdAt: now, updatedAt: now });
    return detail(state, source.id);
  });
}
export async function cancelMediaJob(body: Record<string, unknown>, db: MediaDB = v2Driver(), now = Date.now()) {
  return change(db, state => {
    const job = jobOf(state, body.jobId);
    if (job.revision !== body.revision || ["ready", "cancelled"].includes(job.status)) throw new ConversationError(409, "작업 상태가 바뀌었어요. 다시 불러와 주세요.");
    job.status = "cancelled"; job.revision++; job.updatedAt = now; delete job.lease;
    job.error = { code: "cancelled", message: "관리자가 작업을 취소했어요." };
    const last = job.attempts.at(-1); if (last && !last.finishedAt) { last.finishedAt = now; last.outcome = "cancelled"; }
    return detail(state, job.sourceId);
  });
}
export async function deleteMediaSource(body: Record<string, unknown>, db: MediaDB = v2Driver()) {
  return change(db, state => {
    const source = sourceOf(state, body.id);
    if (!Number.isInteger(body.revision) || source.revision !== body.revision) throw new ConversationError(409, "원문 버전이 바뀌었어요. 다시 확인해 주세요.");
    state.sources = state.sources.filter(s => s.id !== source.id); state.jobs = state.jobs.filter(j => j.sourceId !== source.id);
    return { deleted: true }; // One CAS removes every raw version and derived cue; legacy stores/publications remain untouched.
  });
}
export async function runMediaJob(id: unknown, deps: { db: MediaDB; now: () => number; normalize: (original: MediaOriginal) => NonNullable<MediaJob["output"]> | Promise<NonNullable<MediaJob["output"]>> } = {
  db: v2Driver(), now: Date.now, normalize: normalizeOriginal,
}) {
  const token = randomUUID();
  const claim = await change(deps.db, state => {
    const job = jobOf(state, id), source = sourceOf(state, job.sourceId), now = deps.now();
    if (job.sourceRevision !== source.revision) throw new ConversationError(409, "더 최신 원문이 있어요. 새 버전의 작업을 선택해 주세요.");
    if (job.status === "ready" || (job.status === "running" && (job.lease?.until ?? 0) > now)) return { claimed: false, job, source };
    if (job.status === "cancelled" || job.attempts.length >= 5) throw new ConversationError(409, "취소됐거나 5회 시도한 작업이에요. 새 원문 버전으로 등록해 주세요.");
    const previous = job.attempts.at(-1);
    if (previous && !previous.finishedAt) { previous.finishedAt = now; previous.outcome = "interrupted"; }
    job.status = "running"; job.revision++; job.updatedAt = now; delete job.error;
    job.lease = { token, until: now + 20000 }; job.attempts.push({ startedAt: now });
    return { claimed: true, job, source };
  });
  if (!claim.claimed) return readMedia(claim.source.id, deps.db);
  const write = (fn: (job: MediaJob) => void) => change(deps.db, state => {
    const job = jobOf(state, id), now = deps.now();
    if (job.status !== "running" || job.lease?.token !== token || job.lease.until <= now || sourceOf(state, job.sourceId).revision !== job.sourceRevision)
      throw new ConversationError(409, "작업이 중단되거나 원문이 바뀌었어요. 목록에서 상태를 확인해 주세요.");
    fn(job); job.revision++; job.updatedAt = now; return detail(state, job.sourceId);
  });
  try {
    const original = claim.source.originals.find(o => o.version === claim.job.sourceRevision);
    if (!original || original.hash !== claim.job.inputHash || claim.job.parser !== MEDIA_PARSER) throw new ConversationError(409, "원문과 처리 버전이 일치하지 않아요.");
    if (claim.job.stage === "validate") await write(job => { job.stage = "normalize"; });
    const output = await deps.normalize(original);
    return await write(job => {
      job.output = output; job.status = "ready"; job.stage = "ready"; delete job.lease;
      const last = job.attempts.at(-1)!; last.finishedAt = deps.now(); last.outcome = "ready";
    });
  } catch (error) {
    const failure = error instanceof ConversationError ? error : new ConversationError(503, "원문 처리를 완료하지 못했어요. 원문을 확인한 뒤 재개해 주세요.");
    // Never overwrite a newer lease, cancellation, replacement or deletion while recording a failure.
    await change(deps.db, state => {
      const job = state.jobs.find(j => j.id === id);
      if (!job || job.status !== "running" || job.lease?.token !== token) return;
      job.status = "failed"; job.revision++; job.updatedAt = deps.now(); delete job.lease;
      job.error = { code: failure.status === 422 ? "invalid_source" : "processing_failed", message: failure.message };
      const last = job.attempts.at(-1)!; last.finishedAt = deps.now(); last.outcome = "failed";
    });
    throw failure;
  }
}
