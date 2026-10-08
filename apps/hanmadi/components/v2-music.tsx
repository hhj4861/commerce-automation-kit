"use client";
import { useEffect, useState } from "react";
import { pretender } from "@/lib/v2-music";
import type { MusicLyricsResult } from "@/lib/music-lyrics";
import { LyricsPractice } from "./v2-lyrics";

export function MusicStudy() {
  const [playing, setPlaying] = useState(false);
  const [result, setResult] = useState<MusicLyricsResult | null>(null);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    void fetch("/api/study/music", { signal: controller.signal, cache: "no-store" }).then(async response => {
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "가사를 불러오지 못했어요.");
      if (!controller.signal.aborted) setResult(data);
    }).catch(e => { if (!controller.signal.aborted) setError(e instanceof Error ? e.message : "가사를 불러오지 못했어요."); });
    return () => controller.abort();
  }, [attempt]);
  function reload() { setResult(null); setError(""); setAttempt(attempt + 1); }
  const ready = result?.status === "ready";
  const pending = result?.status === "unavailable" && ["not-configured", "rights-pending"].includes(result.reason);
  return <section className="hm-music" aria-label="음악으로 일본어 배우기">
    <div className="hm-music-cover">
      <span className="hm-music-record" aria-hidden="true">♪</span>
      <div><h1>{pretender.title}</h1><p>{pretender.artist}</p></div>
    </div>
    <p>가사를 한 줄씩 듣고, 뜻을 익히며 따라 불러요.</p>
    <section className="hm-music-listen" aria-label="공식 영상 듣기">
      <a className="hm-music-official" href={pretender.officialUrl} target="_blank" rel="noopener noreferrer">YouTube에서 공식 영상 듣기 ↗</a>
      {!ready && <>
        <button onClick={() => setPlaying(!playing)}>{playing ? "영상 닫기" : "앱에서 영상 열기"}</button>
        {playing && <>
          <iframe title="Pretender 공식 뮤직비디오"
            src={`https://www.youtube-nocookie.com/embed/${pretender.videoId}?playsinline=1&cc_load_policy=1&cc_lang_pref=ja`}
            allow="encrypted-media; picture-in-picture; fullscreen" allowFullScreen referrerPolicy="strict-origin-when-cross-origin" />
          <small>재생이 제한되면 위의 YouTube 링크로 들어 주세요. 자막은 영상에서 제공하는 경우 표시돼요.</small>
        </>}
      </>}
    </section>
    {!result && !error && <p role="status">가사 학습 자료를 확인하고 있어요…</p>}
    {error && <div role="alert"><p>{error}</p><button onClick={reload}>다시 시도</button></div>}
    {result?.status === "unavailable" && <div className="hm-lyrics-unavailable" role="status">
      <h2>{pending ? "가사 학습 준비 중" : "지금은 가사를 불러올 수 없어요"}</h2>
      <p>{pending ? "이 곡의 가사 학습은 아직 열리지 않았어요. 지금은 공식 영상으로 원곡을 들을 수 있어요." : "잠시 후 다시 확인해 주세요. 원곡은 위의 YouTube 링크에서 들을 수 있어요."}</p>
      <button onClick={reload}>다시 확인</button>
    </div>}
    {result?.status === "ready" && <LyricsPractice key={`${attempt}:${result.lesson.revision}`} lesson={result.lesson} progress={result.progress} onReload={reload} />}
  </section>;
}
