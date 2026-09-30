import test from "node:test";
import assert from "node:assert/strict";
import { createStudyAudioCache } from "./study-audio-client";
const audio = () => new Response(new Uint8Array([1, 2, 3]), { headers: { "Content-Type": "audio/mpeg" } });
test("preparation and concurrent clicks share one request; replay reuses audio", async () => {
  let calls = 0, release!: () => void;
  const waiting = new Promise<void>(resolve => { release = resolve; });
  const cache = createStudyAudioCache(async () => { calls++; await waiting; return audio(); });
  const prepared = cache.prepare("こんにちは", "ja");
  const first = cache.load("こんにちは", "ja");
  const second = cache.load("こんにちは", "ja");
  assert.equal(calls, 1); release();
  assert.strictEqual(await prepared, await first);
  assert.strictEqual(await second, await cache.load("こんにちは", "ja"));
  assert.equal(calls, 1);
});
test("language isolation, expiry, LRU count and byte bounds", async () => {
  let now = 0, calls = 0;
  const cache = createStudyAudioCache(async () => { calls++; return audio(); }, { maxEntries: 2, maxBytes: 6, ttlMs: 10, now: () => now });
  await cache.load("A", "en"); await cache.load("A", "es");
  assert.equal(calls, 2); await cache.load("A", "en");
  await cache.load("B", "en"); await cache.load("A", "es");
  assert.equal(calls, 4); now = 11;
  await cache.load("A", "es"); assert.equal(calls, 5);
  const small = createStudyAudioCache(async () => { calls++; return audio(); }, { maxBytes: 2 });
  await small.load("A", "en"); await small.load("A", "en"); assert.equal(calls, 7);
});
test("failed preparation retries on click; invalid audio is never cached", async () => {
  let calls = 0;
  const cache = createStudyAudioCache(async () => ++calls === 1 ? new Response(JSON.stringify({error:"연결 실패"}), {status:502}) : audio());
  await assert.rejects(cache.prepare("A", "en"), /연결 실패/);
  await cache.load("A", "en"); assert.equal(calls, 2);
  const invalid = createStudyAudioCache(async () => new Response("not audio"));
  await assert.rejects(invalid.load("A", "en"), /재생/);
});
test("logout aborts outstanding audio and prevents late cache refill", async () => {
  let release!: () => void, signal: AbortSignal | null | undefined;
  const waiting = new Promise<void>(resolve => { release = resolve; });
  const cache = createStudyAudioCache(async (_url, init) => { signal=init?.signal; await waiting; return audio(); });
  const pending = cache.load("private phrase", "en");
  cache.clear(); assert.equal(signal?.aborted, true); release();
  await assert.rejects(pending, {name:"AbortError"});
});
test("browsing may prepare at most two unheard phrases, released by listening", async () => {
  let calls = 0;
  const cache = createStudyAudioCache(async () => { calls++; return audio(); });
  for (let i = 0; i < 32; i++) await cache.prepare(String(i), "ja");
  assert.equal(calls, 2);
  await cache.load("0", "ja"); await cache.prepare("next", "ja");
  assert.equal(calls, 3);
  cache.clear(); await cache.load("0", "ja"); assert.equal(calls, 4);
});
