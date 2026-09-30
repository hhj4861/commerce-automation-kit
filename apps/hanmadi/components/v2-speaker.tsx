"use client";
import { useEffect, useRef, useState } from "react";
import { studyAudio } from "@/lib/study-audio-client";
import { V2Icon as Icon } from "./v2-icon";
let activeAudio: HTMLAudioElement | null = null;
let latestPlayback = 0;
export function Speaker({ text, language, label = "들어보기" }: {
  text: string; language: string; label?: string;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const audio = useRef<HTMLAudioElement | null>(null);
  const url = useRef("");
  const generation = useRef(0);
  const playback = useRef(0);
  const pending = useRef(false);
  useEffect(() => {
    const version = generation.current;
    return () => {
      generation.current = version + 1;
      pending.current = false;
      if (playback.current === latestPlayback) latestPlayback++;
      audio.current?.pause();
      if (activeAudio === audio.current) activeAudio = null;
      if (url.current) URL.revokeObjectURL(url.current);
    };
  }, [text, language]);
  async function play() {
    if (pending.current) return;
    pending.current = true;
    const version = generation.current;
    const ticket = ++latestPlayback;
    playback.current = ticket;
    setBusy(true); setError("");
    try {
      activeAudio?.pause();
      const blob = await studyAudio.load(text, language);
      if (version !== generation.current || ticket !== latestPlayback) return;
      if (url.current) URL.revokeObjectURL(url.current);
      url.current = URL.createObjectURL(blob);
      activeAudio?.pause();
      audio.current = new Audio(url.current);
      activeAudio = audio.current;
      audio.current.playbackRate = 0.85;
      await audio.current.play();
    } catch (e) {
      if (version === generation.current)
        setError(e instanceof Error ? e.message : "음성을 재생하지 못했어요.");
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
