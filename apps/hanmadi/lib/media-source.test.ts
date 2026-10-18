import test from "node:test";
import { mediaPreparation } from "./media-preparation";
import assert from "node:assert/strict";
import { mediaRegistration, normalizeOriginal, type MediaDetail } from "./media-source";
import { collectMedia, saveMediaOriginal, readMedia, runMediaJob, cancelMediaJob, deleteMediaSource, setMediaAcquisition } from "./media-store";
const input = { video: "https://youtu.be/abcdefghijk", title: "Own practice", language: "en", purposes: ["study", "music"] };
const raw = "WEBVTT\n\n00:00:01.000 --> 00:00:03.000\nGood morning\n\n00:00:04.000 --> 00:00:06.000\nHello my friend";
function fixture() {
  const data = new Map<string, string>(); let casCalls = 0, failedWrites = 0;
  const db = { get: async (key: string) => data.get(key) ?? null,
    cas: async (key: string, expected: string | null, value: string) => {
      casCalls++; if (failedWrites > 0) { failedWrites--; return false; }
      if ((data.get(key) ?? null) !== expected) return false; data.set(key, value); return true;
    } };
  return { db, data, casCalls: () => casCalls, failWrites: (n: number) => { failedWrites = n; } };
}
async function setup() {
  const f = fixture(); const first = await collectMedia(input, f.db);
  const body = { id: first.source.id, revision: 0, raw, rights: "Self authored practice content", confirmed: true, requestId: "request-first" };
  const saved = await saveMediaOriginal(body, "owner:fixture", f.db);
  return { ...f, body, saved, deps: { db: f.db, now: () => 1000, normalize: normalizeOriginal } };
}
test("canonical identity and bounded registration never fetch arbitrary URLs or overwrite metadata", async () => {
  for (const video of ["file:///secret", "https://localhost/abcdefghijk", "https://youtube.com.evil/watch?v=abcdefghijk"]) assert.throws(() => mediaRegistration({ ...input, video }));
  for (const bad of [{ language: "ko" }, { purposes: [] }, { purposes: ["study", "study"] }, { title: "" }]) assert.throws(() => mediaRegistration({ ...input, ...bad }));
  const f = fixture(); f.failWrites(2);
  const [a, b] = await Promise.all([collectMedia(input, f.db), collectMedia({ ...input, video: "abcdefghijk" }, f.db)]);
  assert.equal(a.source.id, b.source.id); assert.equal((await readMedia(undefined, f.db) as { sources: unknown[] }).sources.length, 1);
  const old = await collectMedia({ ...input, title: "Do not overwrite" }, f.db); assert.equal(old.source.title, input.title);
});
test("rights confirmation and input bounds are required before persistent source writes", async () => {
  const f = await setup(), before = [...f.data.values()];
  for (const bad of [{ confirmed: false }, { rights: "short" }, { raw: "a".repeat(12001) }, { raw: "" }, { requestId: "x" }])
    await assert.rejects(saveMediaOriginal({ ...f.body, revision: 1, requestId: "new-request", ...bad }, "owner", f.db));
  assert.deepEqual([...f.data.values()], before);
});
test("response replay is idempotent; reused request with different content and stale edits conflict", async () => {
  const f = await setup();
  const repeated = await saveMediaOriginal(f.body, "owner:fixture", f.db); assert.equal(repeated.jobs.length, 1); assert.equal(repeated.source.revision, 1);
  await assert.rejects(saveMediaOriginal({ ...f.body, raw: "new\nwords" }, "owner", f.db), /요청 번호/);
  await assert.rejects(saveMediaOriginal({ ...f.body, requestId: "another-request" }, "owner", f.db), /버전/);
});
test("normalization is durable and cached; list excludes originals and derived text", async () => {
  const f = await setup(); let calls = 0;
  const deps = { ...f.deps, normalize: (o: Parameters<typeof normalizeOriginal>[0]) => { calls++; return normalizeOriginal(o); } };
  const complete = await runMediaJob(f.saved.jobs[0].id, deps) as MediaDetail;
  assert.equal(complete.jobs[0].status, "ready"); assert.equal(complete.jobs[0].output?.timing, "timed");
  assert.equal(complete.jobs[0].output?.cues[1].text, "Hello my friend");
  await runMediaJob(f.saved.jobs[0].id, deps); assert.equal(calls, 1);
  const reloaded = await readMedia(f.saved.source.id, f.db) as MediaDetail;
  assert.deepEqual(reloaded.jobs[0].output, complete.jobs[0].output);
  const list = JSON.stringify(await readMedia(undefined, f.db)); assert(!list.includes("Good morning")); assert(!list.includes("originals"));
});
test("bad timing is a persisted failure, then a corrected immutable revision can be processed", async () => {
  const f = await setup();
  const second = await saveMediaOriginal({ ...f.body, revision: 1, requestId: "bad-timing", raw: raw.replace("00:00:04.000", "00:00:02.000") }, "owner", f.db);
  await assert.rejects(runMediaJob(second.jobs.at(-1)!.id, f.deps));
  const failed = await readMedia(f.saved.source.id, f.db) as MediaDetail;
  assert.equal(failed.jobs.at(-1)?.status, "failed"); assert.equal(failed.jobs.at(-1)?.error?.code, "invalid_source");
  assert.equal(failed.source.originals[0].raw, raw);
  const third = await saveMediaOriginal({ ...f.body, revision: 2, requestId: "corrected-version" }, "owner", f.db);
  const complete = await runMediaJob(third.jobs.at(-1)!.id, f.deps) as MediaDetail;
  assert.equal(complete.jobs.at(-1)?.status, "ready"); assert.equal(complete.source.originals.length, 3);
  await assert.rejects(runMediaJob(f.saved.jobs[0].id, f.deps), /最新|최신/);
});
test("active leases suppress duplicate work and an expired attempt resumes its checkpoint", async () => {
  const f = await setup(); let release!: () => void, entered!: () => void, calls = 0, clock = 1000;
  const waiting = new Promise<void>(r => { release = r; }), started = new Promise<void>(r => { entered = r; });
  const first = runMediaJob(f.saved.jobs[0].id, { ...f.deps, now: () => clock, normalize: async original => { calls++; entered(); await waiting; return normalizeOriginal(original); } });
  await started;
  const active = await runMediaJob(f.saved.jobs[0].id, f.deps) as MediaDetail; assert.equal(active.jobs[0].status, "running"); assert.equal(calls, 1);
  clock = 32000;
  const resumed = await runMediaJob(f.saved.jobs[0].id, { ...f.deps, now: () => clock }) as MediaDetail;
  assert.equal(resumed.jobs[0].status, "ready"); assert.equal(resumed.jobs[0].attempts[0].outcome, "interrupted");
  const rejected = assert.rejects(first); release(); await rejected;
  const latest = await readMedia(f.saved.source.id, f.db) as MediaDetail; assert.equal(latest.jobs[0].status, "ready"); assert.equal(latest.jobs[0].attempts.length, 2);
});
test("replacement, cancellation and deletion prevent late output from being applied", async () => {
  for (const action of ["replace", "cancel", "delete"]) {
    const f = await setup(); let release!: () => void, entered!: () => void;
    const waiting = new Promise<void>(r => { release = r; }), started = new Promise<void>(r => { entered = r; });
    const running = runMediaJob(f.saved.jobs[0].id, { ...f.deps, normalize: async original => { entered(); await waiting; return normalizeOriginal(original); } });
    await started;
    if (action === "replace") await saveMediaOriginal({ ...f.body, revision: 1, requestId: "newer-original", raw: "New line\nSecond line" }, "owner", f.db);
    else if (action === "delete") await deleteMediaSource({ id: f.body.id, revision: 1 }, f.db);
    else {
      const current = await readMedia(f.body.id, f.db) as MediaDetail;
      await cancelMediaJob({ jobId: current.jobs[0].id, revision: current.jobs[0].revision }, f.db, 1100);
    }
    const rejected = assert.rejects(running); release(); await rejected;
    if (action === "delete") assert.equal(JSON.stringify(await readMedia(undefined, f.db)).includes("Good morning"), false);
    else { const current = await readMedia(f.body.id, f.db) as MediaDetail; assert.equal(current.jobs[0].status, "cancelled"); assert.equal(current.jobs[0].output, undefined); }
  }
});
test("transient processing failures preserve the normalize checkpoint, bounded retries and usable raw data", async () => {
  const f = await setup(), jobId = f.saved.jobs[0].id;
  for (let i = 0; i < 5; i++) await assert.rejects(runMediaJob(jobId, { ...f.deps, normalize: () => { throw new Error("private upstream detail"); } }));
  const failed = await readMedia(f.body.id, f.db) as MediaDetail;
  assert.equal(failed.jobs[0].stage, "normalize"); assert.equal(failed.jobs[0].attempts.length, 5);
  assert(!JSON.stringify(failed).includes("private upstream")); assert.equal(failed.source.originals[0].raw, raw);
  await assert.rejects(runMediaJob(jobId, f.deps), /5회/);
});
test("unknown schemas and failed CAS never reset or partially persist a source", async () => {
  const f = fixture(); f.data.set("media-foundation:v1", JSON.stringify({ schema: 99, sources: [], jobs: [] }));
  await assert.rejects(collectMedia(input, f.db)); assert.equal(f.casCalls(), 0);
  f.data.clear(); f.failWrites(20); await assert.rejects(collectMedia(input, f.db), /수정 중/); assert.equal(f.data.size, 0);
});

test("version quota rejects without data loss and stale delete cannot remove a new version", async () => {
  const f = await setup();
  for (let version = 1; version < 8; version++) await saveMediaOriginal({ ...f.body, revision: version, requestId: `version-${version}` }, "owner", f.db);
  await assert.rejects(saveMediaOriginal({ ...f.body, revision: 8, requestId: "version-overflow" }, "owner", f.db), /8개/);
  await assert.rejects(deleteMediaSource({ id: f.body.id, revision: 1 }, f.db), /버전/);
  const current = await readMedia(f.body.id, f.db) as MediaDetail;
  assert.equal(current.source.originals.length, 8); assert.equal(current.source.originals[0].raw, raw);
});

test("one collected video adds another purpose without duplicating or replacing saved originals", async () => {
  const f = fixture();
  const collected = await collectMedia({ ...input, purposes: ["study"] }, f.db);
  const saved = await saveMediaOriginal({ id: collected.source.id, revision: 0, raw, rights: "Self authored practice source", confirmed: true, requestId: "purpose-original" }, "owner", f.db);
  const music = await collectMedia({ ...input, title: "Do not overwrite", purposes: ["music"] }, f.db);
  assert.deepEqual(music.source.purposes, ["music", "study"]);
  assert.deepEqual(music.source.originals, saved.source.originals);
  assert.deepEqual(music.jobs, saved.jobs);
  assert.equal(music.source.title, input.title);
  assert.equal(music.source.revision, 1);
  await assert.rejects(collectMedia({ ...input, language: "ja" }, f.db), /다른 원문 언어/);
  assert.equal((await readMedia(undefined, f.db) as { sources: unknown[] }).sources.length, 1);
});

test("readiness excludes missing originals, unfinished work and stale ready revisions", async () => {
  const { db, saved, deps, body } = await setup();
  const summary = async () => { const data = await readMedia(undefined, db); assert("sources" in data); return data.sources[0]; };
  assert.equal(mediaPreparation().ready, false);
  assert.equal(mediaPreparation(await summary()).label, "원문 정리 필요");
  await runMediaJob(saved.jobs[0].id, deps);
  const ready = await summary();
  assert.equal(mediaPreparation(ready).ready, true);
  assert.equal(mediaPreparation({ ...ready, originalCount: 0 }).ready, false);
  assert.equal(mediaPreparation({ ...ready, revision: ready.revision + 1 }).ready, false);
  await saveMediaOriginal({ ...body, revision: 1, requestId: "second-version", raw: "New line one\nNew line two" }, "owner:fixture", db);
  assert.equal(mediaPreparation(await summary()).ready, false, "An older completed job must not promote new unprocessed text");
});


test("acquisition plans persist without claiming readiness, and recollection preserves the saved plan", async () => {
  const f = fixture();
  const first = await collectMedia({ ...input, acquisitionMethod: "file" }, f.db);
  assert.equal(first.source.acquisition?.method, "file");
  assert.equal(first.source.revision, 0); assert.equal(first.jobs.length, 0);
  const repeated = await collectMedia({ ...input, acquisitionMethod: "channel" }, f.db);
  assert.deepEqual(repeated.source.acquisition, first.source.acquisition);
  const list = await readMedia(undefined, f.db); assert("sources" in list);
  assert.equal(list.sources[0].acquisition?.method, "file");
  assert.equal(mediaPreparation(list.sources[0]).ready, false);
  assert.match(mediaPreparation(list.sources[0]).next, /파일/);
  await assert.rejects(collectMedia({ ...input, acquisitionMethod: "ready" }, f.db));
});

test("plan edits use an independent revision and cannot invalidate originals or processing jobs", async () => {
  const f = await setup();
  const plan = await setMediaAcquisition({ id: f.body.id, planRevision: 0, method: "channel" }, f.db);
  assert.equal(plan.source.acquisition?.revision, 1);
  assert.equal(plan.source.revision, 1); assert.deepEqual(plan.source.originals, f.saved.source.originals);
  assert.deepEqual(plan.jobs, f.saved.jobs);
  const before = [...f.data.values()];
  await assert.rejects(setMediaAcquisition({ id: f.body.id, planRevision: 0, method: "file" }, f.db), /다른 창/);
  await assert.rejects(setMediaAcquisition({ id: f.body.id, planRevision: 1, method: "ready" }, f.db));
  assert.deepEqual([...f.data.values()], before);
  const repeat = await setMediaAcquisition({ id: f.body.id, planRevision: 1, method: "channel" }, f.db);
  assert.deepEqual(repeat.source.acquisition, plan.source.acquisition);
  const complete = await runMediaJob(f.saved.jobs[0].id, f.deps) as MediaDetail;
  assert.equal(complete.jobs[0].status, "ready");
  const edited = await setMediaAcquisition({ id: f.body.id, planRevision: 1, method: "file" }, f.db);
  assert.equal(edited.source.acquisition?.revision, 2);
  assert.deepEqual(edited.jobs, complete.jobs);
  const list = await readMedia(undefined, f.db); assert("sources" in list);
  assert.equal(mediaPreparation(list.sources[0]).ready, true);
});

test("legacy sources remain readable and may set their first plan without replacement", async () => {
  const f = fixture(); const legacy = await collectMedia(input, f.db);
  assert.equal(legacy.source.acquisition, undefined);
  const changed = await collectMedia({ ...input, acquisitionMethod: "channel" }, f.db);
  assert.equal(changed.source.acquisition?.revision, 1);
  assert.equal(changed.source.title, legacy.source.title); assert.equal(changed.source.revision, 0);
  const list = await readMedia(undefined, f.db); assert("sources" in list);
  assert.match(mediaPreparation(list.sources[0]).next, /채널 연결/);
  assert.equal(mediaPreparation(list.sources[0]).ready, false);
});
