/** Short-lived, per-tab audio only. Never persist learner speech to browser storage. */
export function createStudyAudioCache(fetcher: typeof fetch = fetch, options: {
  maxEntries?: number; maxBytes?: number; ttlMs?: number; now?: () => number;
} = {}) {
  const maxEntries = options.maxEntries ?? 40;
  const maxBytes = options.maxBytes ?? 10_000_000;
  const ttlMs = options.ttlMs ?? 10 * 60_000;
  const now = options.now ?? Date.now;
  const ready = new Map<string, { blob: Blob; expires: number }>();
  const pending = new Map<string, { promise: Promise<Blob>; controller: AbortController }>();
  const warmed = new Set<string>();
  const keyFor = (text: string, language: string) => JSON.stringify([language, text.trim()]);
  let bytes = 0, generation = 0;
  const remove = (key: string) => {
    const entry = ready.get(key);
    if (entry) bytes -= entry.blob.size;
    ready.delete(key);
  };
  function get(text: string, language: string): Promise<Blob> {
    const key = keyFor(text, language);
    const hit = ready.get(key);
    if (hit && hit.expires > now()) {
      ready.delete(key);
      ready.set(key, hit);
      return Promise.resolve(hit.blob);
    }
    remove(key);
    const inFlight = pending.get(key);
    if (inFlight) return inFlight.promise;
    const controller = new AbortController();
    const version = generation;
    const promise = (async () => {
      const response = await fetcher("/api/study/audio", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: text.trim(), language }),
        signal: AbortSignal.any([controller.signal, AbortSignal.timeout(45000)]),
      });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || "음성을 재생하지 못했어요. 다시 눌러 주세요.");
      }
      const blob = await response.blob();
      if (!blob.size || !/^(audio\/|application\/octet-stream)/i.test(blob.type))
        throw new Error("음성을 재생하지 못했어요. 다시 눌러 주세요.");
      if (version !== generation || controller.signal.aborted)
        throw new DOMException("Audio session ended", "AbortError");
      if (blob.size <= maxBytes) {
        ready.set(key, { blob, expires: now() + ttlMs });
        bytes += blob.size;
        while (ready.size > maxEntries || bytes > maxBytes)
          remove(ready.keys().next().value!);
      }
      return blob;
    })().finally(() => {
      if (pending.get(key)?.controller === controller) pending.delete(key);
    });
    pending.set(key, { promise, controller });
    return promise;
  }
  function clear() {
    generation++;
    for (const item of pending.values()) item.controller.abort();
    pending.clear(); ready.clear(); warmed.clear(); bytes = 0;
  }
  function load(text: string, language: string) {
    warmed.delete(keyFor(text, language));
    return get(text, language);
  }
  function prepare(text: string, language: string): Promise<Blob | undefined> {
    const key = keyFor(text, language);
    if (!ready.has(key) && !pending.has(key)) {
      // Browsing without listening must not spend the daily speech quota.
      // At most two unheard phrases may be generated speculatively per tab.
      if (warmed.size >= 2) return Promise.resolve(undefined);
      warmed.add(key);
    }
    return get(text, language);
  }
  return { load, prepare, clear };
}
export const studyAudio = createStudyAudioCache();

/** Only two visible/next lesson phrases, sequentially; closing cancels the next warmup. */
export function prepareLessonAudio(texts: string[], language: string) {
  let cancelled = false;
  const timer = setTimeout(async () => {
    for (const text of texts.slice(0, 2)) {
      if (cancelled) return;
      try { await studyAudio.prepare(text, language); }
      catch { return; } // Speculative only; a deliberate click retries and displays errors.
    }
  }, 250);
  return () => { cancelled = true; clearTimeout(timer); };
}
