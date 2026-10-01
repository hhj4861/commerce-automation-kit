"use client";
import { useEffect, useRef, useState } from "react";
import { studyAudio } from "@/lib/study-audio-client";
import { createStudyPlayback } from "@/lib/study-audio-stream";
import { V2Icon as Icon } from "./v2-icon";
let activePlayback: ReturnType<typeof createStudyPlayback> | null = null;
export function Speaker({ text, language, label = "들어보기", rate = 0.85 }: {
  text: string; language: string; label?: string; rate?: number;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const player = useRef<ReturnType<typeof createStudyPlayback> | null>(null);
  const generation = useRef(0);
  const pending = useRef(false);
  useEffect(() => {
    const version = generation.current;
    return () => {
      generation.current = version + 1;
      pending.current = false;
      player.current?.dispose();
      if (activePlayback === player.current) activePlayback = null;
    };
  }, [text, language]);
  async function play() {
    if (pending.current) return;
    pending.current = true;
    const version = generation.current;
    setBusy(true); setError("");
    activePlayback?.dispose();
    const playback = createStudyPlayback(rate, error => {
      if (version === generation.current && player.current === playback) setError(error.message);
    });
    player.current = playback; activePlayback = playback;
    // Download/caching continues after first sound. Errors later in the stream remain visible.
    void studyAudio.load(text, language, playback.append).then(playback.finish).catch(playback.fail);
    try { await playback.started; }
    catch (error) {
      if (version === generation.current && !(error instanceof DOMException && error.name === "AbortError"))
        setError(error instanceof Error ? error.message : "음성을 재생하지 못했어요.");
    } finally {
      if (version === generation.current) { pending.current = false; setBusy(false); }
    }
  }
  const prepare = () => { void studyAudio.prepare(text, language).catch(() => {}); };
  return <span className="hm-audio">
    <button className="hm-soft" disabled={busy} onPointerEnter={prepare} onFocus={prepare}
      onClick={() => void play()} aria-busy={busy}>
      <Icon name="sound" /> {busy ? "음성 준비 중…" : label}
    </button>
    {error && <small role="alert">{error}</small>}
  </span>;
}
