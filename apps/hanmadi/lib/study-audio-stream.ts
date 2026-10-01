import type { AudioChunk } from "./study-audio-client";

/** MP3 MSE where supported; the same completed response is the fallback (no second TTS call). */
export function createStudyPlayback(rate: number, onError: (error: Error) => void) {
  const audio = new Audio();
  // Loading a source resets playbackRate to defaultPlaybackRate in browsers.
  audio.defaultPlaybackRate = rate;
  audio.playbackRate = rate;
  let disposed = false, streamed = false, audible = false, fallback = false, url = "";
  let source: MediaSource | undefined, buffer: SourceBuffer | undefined;
  let queue = Promise.resolve();
  let resolveStarted!: () => void, rejectStarted!: (error: Error) => void;
  const started = new Promise<void>((resolve, reject) => { resolveStarted = resolve; rejectStarted = reject; });
  const release = () => { audio.pause(); audio.removeAttribute("src"); audio.load(); if (url) URL.revokeObjectURL(url); url = ""; };
  function fail(error: unknown) {
    if (disposed) return;
    const message = error instanceof Error && /[가-힣]/.test(error.message)
      ? error.message : "음성을 재생하지 못했어요. 다시 눌러 주세요.";
    const friendly = new Error(message);
    disposed = true; release(); rejectStarted(friendly); onError(friendly);
  }
  const play = () => {
    void audio.play().then(() => { if (!disposed) { audible = true; resolveStarted(); } }).catch(error => {
      if (!disposed && !fallback) fail(error);
    });
  };
  const append: AudioChunk = (chunk, type) => {
    if (disposed || fallback) return;
    if (!streamed) {
      if (!/^audio\/(mpeg|mp3)(;|$)/i.test(type) || typeof MediaSource === "undefined" || !MediaSource.isTypeSupported("audio/mpeg")) { fallback = true; return; }
      streamed = true; source = new MediaSource();
      const opening = new Promise<void>((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error("Audio source unavailable")), 1500);
        source!.addEventListener("sourceopen", () => {
          clearTimeout(timer);
          if (disposed) { resolve(); return; }
          try { buffer = source!.addSourceBuffer("audio/mpeg"); resolve(); } catch (error) { reject(error); }
        }, {once:true});
      });
      url = URL.createObjectURL(source); audio.src = url;
      queue = opening;
    }
    queue = queue.then(async () => {
      if (disposed || fallback) return;
      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => { clean(); reject(new Error("Audio append timeout")); }, 1500);
        const clean = () => { clearTimeout(timeout); buffer?.removeEventListener("updateend", done); buffer?.removeEventListener("error", error); };
        const done = () => { clean(); resolve(); };
        const error = () => { clean(); reject(new Error("Audio decoding failed")); };
        buffer!.addEventListener("updateend", done, {once:true});
        buffer!.addEventListener("error", error, {once:true});
        try { buffer!.appendBuffer(new Uint8Array(chunk)); } catch (error) { clean(); reject(error); }
      });
      if (!disposed && !audible) play();
    }).catch(error => {
      if (disposed) return;
      if (audible) fail(error);
      else { fallback = true; release(); }
    });
  };
  async function finish(blob: Blob) {
    await queue;
    if (disposed) return;
    if (streamed && !fallback) {
      if (source?.readyState === "open") source.endOfStream();
    } else {
      release(); url = URL.createObjectURL(blob); audio.src = url;
      fallback = false; play();
    }
  }
  audio.addEventListener("error", () => { if (!disposed && (!streamed || audible)) fail(new Error("Audio decode error")); });
  return {
    audio, started, append, finish, fail,
    dispose() { if (disposed) return; disposed = true; release(); rejectStarted(new DOMException("Playback ended", "AbortError")); },
  };
}
