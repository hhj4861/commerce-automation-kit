import test from "node:test";
import assert from "node:assert/strict";
import { musicInput, parseMusicSource, parseMusicUnits, publishedMusic, type MusicInput, type MusicJudgment } from "./owned-music";
import { readMusic, saveMusic, buildMusic, publishMusic, learningMusic } from "./owned-music-store";
import { memoryTransientStore } from "./transient-store";
import { practiceSongs, parseSongAction, songLearningPhrase } from "./original-music";
import { musicLanguageLessons } from "./music-language";
import { ConversationError } from "./conversation";
import { adminPath } from "./deployment";
const input: MusicInput = { title: "Original fixture", artist: "Hanmadi", language: "ja", videoId: "abcdefghijk", source: practiceSongs[1].lines.map(l => l.text).join("\n"), rights: "Original fixture with AI processing and learning reuse permission", rightsConfirmed: true };
const units = practiceSongs[1].lines.map(({ text, reading, meaning }, i) => ({ sourceIndex: i, line: { text, reading, meaning }, lesson: musicLanguageLessons.ja[i] }));
function fixture() {
  const data = new Map<string, string>(), counts = new Map<string, number>();
  const db = { get: async (key: string) => data.get(key) ?? null,
    cas: async (key: string, expected: string | null, value: string) => { if ((data.get(key) ?? null) !== expected) return false; data.set(key, value); return true; },
    count: async (key: string) => { const n = (counts.get(key) ?? 0) + 1; counts.set(key, n); return n; } };
  let generated = 0, evaluated = 0;
  const deps = { db, slots: memoryTransientStore(), generate: async () => { generated++; return structuredClone(units); },
    evaluate: async () => { evaluated++; return units.map((_, i): MusicJudgment => ({ disposition: i === 3 ? "excluded" : i === 1 ? "review" : "accepted", confidence: .8, reason: "fixture" })); }, references: async () => [] };
  return { db, deps, counts: () => ({ generated, evaluated }) };
}
test("TXT/SRT/VTT source validation does not fabricate timings", () => {
  assert.equal(parseMusicSource(input.source)[0].startSeconds, undefined);
  const timed = "1\n00:00:01,200 --> 00:00:04,900\nおはよう、空が青い。\n\n2\n00:00:05,100 --> 00:00:08,000\nとなりで、君が笑う。";
  assert.equal(parseMusicSource(timed)[0].startSeconds, 1.2);
  assert.equal(parseMusicSource("WEBVTT\n\n" + timed.replaceAll(",", "."))[1].endSeconds, 8);
  for (const bad of ["one", "a\n".repeat(101), timed.replace("00:00:04,900", "00:00:00,100"), timed.replace("00:00:01,200", "xx"), "a".repeat(251) + "\nb"]) assert.throws(() => parseMusicSource(bad));
});
test("registration requires rights and rejects arbitrary playback URL", () => {
  assert.deepEqual(musicInput(input), input);
  for (const override of [{ rightsConfirmed: false }, { rights: "" }, { videoId: "https://evil.test" }, { language: "ko" }, { source: "" }]) assert.throws(() => musicInput({ ...input, ...override }));
  assert.equal(adminPath("/api/study/admin/music"), "owner");
});
test("generated lyrics match source and words, target language is checked", () => {
  assert.equal(parseMusicUnits(units, input).length, 4);
  const changed = structuredClone(units); changed[0].line.text = "空が赤い。";
  assert.throws(() => parseMusicUnits(changed, input));
  assert.throws(() => parseMusicUnits([units[0], units[0]], input));
  const word = structuredClone(units); word[0].lesson.word.text = "こんにちは";
  assert.throws(() => parseMusicUnits(word, input));
  const ambiguous = structuredClone(units); ambiguous[1].lesson.word.meaning = units[0].lesson.word.meaning;
  assert.throws(() => parseMusicUnits(ambiguous, input));
});
test("generation and explicit human review gate publication and protect private fields", async () => {
  const f = fixture(); const song = await saveMusic(input, f.db);
  assert.deepEqual(await learningMusic(f.db), []);
  await assert.rejects(publishMusic({ id: song.id, revision: 1, indices: [0, 1], reviewed: true }, "owner", f.db));
  assert.equal((await buildMusic(song.id, 1, f.deps)).status, "review");
  await buildMusic(song.id, 1, f.deps); assert.deepEqual(f.counts(), { generated: 1, evaluated: 1 });
  await assert.rejects(publishMusic({ id: song.id, revision: 1, indices: [0, 3], reviewed: true }, "owner", f.db));
  await assert.rejects(publishMusic({ id: song.id, revision: 1, indices: [0, 1] }, "owner", f.db));
  const published = await publishMusic({ id: song.id, revision: 1, indices: [0, 1, 2], reviewed: true }, "owner", f.db);
  const catalog = await learningMusic(f.db); assert.equal(catalog[0].lines.length, 3);
  for (const field of ["source", "rights", "reviewedBy"]) assert.equal(field in catalog[0], false);
  const parsed = parseSongAction({ trackId: song.id, revision: "2", index: 1, action: "save-word" }, catalog);
  assert.equal(songLearningPhrase(parsed.song, 1, "save-word").text, units[1].lesson.word.text);
  await publishMusic({ action: "unpublish", id: song.id, revision: published.revision }, "owner", f.db);
  assert.deepEqual(await learningMusic(f.db), []);
  assert.throws(() => parseSongAction({ trackId: song.id, revision: "2", index: 0, action: "move" }, []));
});
test("JEV failure preserves generated units and retries only evaluation", async () => {
  const f = fixture(); const song = await saveMusic(input, f.db);
  await assert.rejects(buildMusic(song.id, 1, { ...f.deps, evaluate: async () => { throw new ConversationError(503, "JEV test failure"); } }));
  const error = (await readMusic(f.db))[0];
  assert.equal(error.status, "error"); assert.equal(error.units?.length, 4); assert.equal(error.job, undefined); assert.equal(publishedMusic(error), null);
  await buildMusic(song.id, 1, f.deps); assert.deepEqual(f.counts(), { generated: 1, evaluated: 1 });
});
test("durable lease blocks simultaneous charged work and edits", async () => {
  const f = fixture(); const song = await saveMusic(input, f.db);
  let resume!: () => void, started!: () => void;
  const signal = new Promise<void>(resolve => { started = resolve; });
  const promise = new Promise<void>(resolve => { resume = resolve; });
  const running = buildMusic(song.id, 1, { ...f.deps, generate: async () => { started(); await promise; return units; } });
  await signal;
  await assert.rejects(buildMusic(song.id, 1, f.deps), /이미/);
  await assert.rejects(saveMusic({ ...input, id: song.id, revision: 1 }, f.db), /중이에요/);
  resume(); await running;
});
test("stale revision is rejected and source edits unpublish and invalidate generation", async () => {
  const f = fixture(); const song = await saveMusic(input, f.db); await buildMusic(song.id, 1, f.deps);
  await publishMusic({ id: song.id, revision: 1, indices: [0, 1], reviewed: true }, "owner", f.db);
  await assert.rejects(saveMusic({ ...input, id: song.id, revision: 1 }, f.db), /바뀌었/);
  await saveMusic({ ...input, id: song.id, revision: 2 }, f.db);
  assert.deepEqual(await learningMusic(f.db), []); assert.equal((await readMusic(f.db))[0].units, undefined);
  await assert.rejects(saveMusic(input, f.db), /이미 등록/);
});
test("daily generation cap fails visibly and retains source", async () => {
  const f = fixture(); const song = await saveMusic(input, f.db);
  await assert.rejects(buildMusic(song.id, 1, { ...f.deps, db: { ...f.db, count: async () => 21 } }), /한도/);
  assert.equal((await readMusic(f.db))[0].source, input.source); assert.deepEqual(f.counts(), { generated: 0, evaluated: 0 });
});
