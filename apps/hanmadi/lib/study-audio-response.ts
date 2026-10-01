/** Per-process cache of authored public lesson speech only. Never cache user dialogue here. */
export function createStudySpeechResponses(options: { maxBytes?: number; ttlMs?: number; now?: () => number } = {}) {
  const maxBytes = options.maxBytes ?? 12_000_000;
  const now = options.now ?? Date.now;
  const ready = new Map<string, { data: Uint8Array; type: string; expires: number }>();
  let bytes = 0;
  const remove = (key: string) => { const item = ready.get(key); if (item) bytes -= item.data.length; ready.delete(key); };
  return async function speechResponse(key: string | null, synthesize: () => Promise<Response>, signal?: AbortSignal) {
    const headers = { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" };
    const hit = key ? ready.get(key) : undefined;
    if (hit && hit.expires > now()) {
      ready.delete(key!); ready.set(key!, hit);
      return new Response(new Uint8Array(hit.data), { headers: { ...headers, "Content-Type": hit.type, "X-Hanmadi-Audio": "lesson-cache" } });
    }
    if (key) remove(key);
    const deadline = Date.now() + 40_000;
    const response = await synthesize();
    const type = response.headers.get("content-type") ?? "audio/mpeg";
    if (!response.ok || !/^(audio\/|application\/octet-stream)/i.test(type) || !response.body) throw new Error("Invalid speech response");
    const reader = response.body.getReader();
    let size = 0, stopped = false;
    const chunks: Uint8Array[] = [];
    let output: ReadableStreamDefaultController<Uint8Array>;
    const stop = (reason: unknown) => {
      if (stopped) return;
      stopped = true;
      clearTimeout(timer);
      signal?.removeEventListener("abort", abort);
      void reader.cancel(reason).catch(() => {});
      output.error(reason);
    };
    const abort = () => stop(new Error("Speech cancelled"));
    const timer = setTimeout(() => stop(new Error("Speech timeout")), Math.max(1, deadline - Date.now()));
    const stream = new ReadableStream<Uint8Array>({
      start(controller) { output = controller; signal?.addEventListener("abort", abort, {once:true}); if (signal?.aborted) abort(); },
      async pull(controller) {
        try {
          const next = await reader.read();
          if (stopped) return;
          if (next.done) {
            if (!size) throw new Error("Empty speech");
            if (key && size <= maxBytes) {
              const data = new Uint8Array(size); let offset = 0;
              for (const chunk of chunks) { data.set(chunk, offset); offset += chunk.length; }
              remove(key); ready.set(key, {data, type, expires:now() + (options.ttlMs ?? 3_600_000)}); bytes += size;
              while (bytes > maxBytes || ready.size > 160) remove(ready.keys().next().value!);
            }
            stopped = true; clearTimeout(timer); signal?.removeEventListener("abort", abort); reader.releaseLock(); controller.close();
          } else {
            size += next.value.length;
            if (size > 5_000_000) throw new Error("Speech exceeds size limit");
            if (key) chunks.push(next.value);
            controller.enqueue(next.value);
          }
        } catch (error) { stop(error); }
      },
      cancel(reason) {
        stopped = true; clearTimeout(timer); signal?.removeEventListener("abort", abort);
        return reader.cancel(reason);
      },
    });
    return new Response(stream, { headers: { ...headers, "Content-Type": type, "X-Hanmadi-Audio": "stream" } });
  };
}
