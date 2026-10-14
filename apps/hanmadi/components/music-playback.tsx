"use client";
import { useEffect, useEffectEvent, useImperativeHandle, useRef, useState, type Ref } from "react";
import { segmentAction, type TimeRange } from "@/lib/music-playback";

export type MusicPlaybackHandle = { play: (start?: number, end?: number) => void; pause: () => void; time: () => number };
type VideoPlayer = { playVideo: () => void; pauseVideo: () => void; seekTo: (s: number, allow: boolean) => void; getCurrentTime: () => number;
  getPlayerState: () => number; getAvailablePlaybackRates: () => number[]; getPlaybackRate: () => number; setPlaybackRate: (n: number) => void; destroy: () => void };
type YouTube = { Player: new (element: HTMLElement, options: { events: { onReady: () => void; onError: (e: { data: number }) => void; onAutoplayBlocked: () => void; onStateChange: (e: { data: number }) => void; onPlaybackRateChange: (e: { data: number }) => void } }) => VideoPlayer };
type VideoWindow = Window & { YT?: YouTube; onYouTubeIframeAPIReady?: () => void };
let apiPromise: Promise<YouTube> | undefined;
function youtube(): Promise<YouTube> {
  const w = window as VideoWindow;
  if (w.YT?.Player) return Promise.resolve(w.YT);
  if (apiPromise) return apiPromise;
  apiPromise = new Promise((resolve, reject) => {
    const prior = w.onYouTubeIframeAPIReady;
    const script = document.createElement("script");
    const fail = () => { clearTimeout(timer); script.remove(); w.onYouTubeIframeAPIReady = prior; apiPromise = undefined; reject(new Error("YouTube player unavailable")); };
    const timer = setTimeout(fail, 15000);
    w.onYouTubeIframeAPIReady = () => { clearTimeout(timer); w.onYouTubeIframeAPIReady = prior; prior?.(); if (w.YT?.Player) resolve(w.YT); else fail(); };
    script.src = "https://www.youtube.com/iframe_api"; script.onerror = fail; document.head.appendChild(script);
  });
  return apiPromise;
}

export function MusicPlayback({ ref, audio, videoId, title, onTime, onPlay }: {
  ref?: Ref<MusicPlaybackHandle>; audio?: string; videoId?: string; title: string; onTime?: (seconds: number, playing: boolean) => void; onPlay?: () => void;
}) {
  const native = useRef<HTMLAudioElement>(null), host = useRef<HTMLDivElement>(null), video = useRef<VideoPlayer | null>(null);
  const range = useRef<TimeRange | null>(null), clock = useRef(0), sequence = useRef(0);
  const [request, setRequest] = useState<{ id: number; start: number; end?: number } | null>(null);
  const [loop, setLoop] = useState(false), [isSegment, setIsSegment] = useState(false), [rate, setRate] = useState(1);
  const [rates, setRates] = useState<number[]>(videoId ? [1] : [.5, .75, 1, 1.25]);
  const [error, setError] = useState(""), [notice, setNotice] = useState("");
  function pause() { native.current?.pause(); video.current?.pauseVideo(); setRequest(null); onTime?.(clock.current, false); }
  function play(start = 0, end?: number) {
    range.current = end !== undefined && end > start ? { startSeconds: start, endSeconds: end } : null;
    setIsSegment(!!range.current); setError(""); setNotice(""); clock.current = start; onTime?.(start, false);
    if (videoId) { setRequest({ id: ++sequence.current, start, end }); return; }
    const el = native.current; if (!el) return;
    el.currentTime = start; el.playbackRate = rate;
    void el.play().catch(() => setError("노래를 재생하지 못했어요. 재생 버튼을 다시 눌러 주세요."));
  }
  useImperativeHandle(ref, () => ({ play, pause, time: () => clock.current }));
  function tick(seconds: number, playing: boolean, ended = false) {
    clock.current = seconds; onTime?.(seconds, playing);
    if (!playing && !ended) return;
    const action = segmentAction(seconds, range.current, loop);
    if (action === "repeat" || (ended && loop && !range.current)) {
      const start = range.current?.startSeconds ?? 0;
      if (video.current) { video.current.seekTo(start, true); video.current.playVideo(); }
      else if (native.current) { native.current.currentTime = start; void native.current.play().catch(() => setError("재생 버튼을 다시 눌러 주세요.")); }
    } else if (action === "pause") { native.current?.pause(); video.current?.pauseVideo(); }
  }
  const videoTick = useEffectEvent(tick);
  const readyRate = useEffectEvent((p: VideoPlayer) => { if (p.getAvailablePlaybackRates().includes(rate)) p.setPlaybackRate(rate); else setRate(p.getPlaybackRate()); });
  const played = useEffectEvent(() => onPlay?.());
  const stopped = useEffectEvent(() => onTime?.(clock.current, false));
  // The external API owns only children of this host. React never reconciles those nodes.
  useEffect(() => {
    if (!videoId || !request || !host.current) return;
    let cancelled = false, current: VideoPlayer | undefined, interval: ReturnType<typeof setInterval> | undefined;
    const container = host.current, frame = document.createElement("iframe");
    frame.title = `${title} 공식 영상`;
    frame.src = `https://www.youtube-nocookie.com/embed/${videoId}?playsinline=1&enablejsapi=1&origin=${encodeURIComponent(location.origin)}&start=${Math.floor(request.start)}${request.end !== undefined ? `&end=${Math.ceil(request.end)}` : ""}`;
    frame.allow = "autoplay; encrypted-media; picture-in-picture; fullscreen"; frame.allowFullscreen = true;
    frame.referrerPolicy = "strict-origin-when-cross-origin";
    frame.style.cssText = "width:100%;aspect-ratio:16/9;min-height:200px;border:0";
    container.appendChild(frame);
    const timeout = setTimeout(() => { if (!cancelled) setError("영상 연결이 지연되고 있어요. 다시 불러오거나 공식 영상 링크를 이용해 주세요."); }, 20000);
    void youtube().then(api => {
      if (cancelled) return;
      current = new api.Player(frame, { events: {
        onReady: () => {
          if (cancelled || !current) return;
          clearTimeout(timeout); video.current = current; setRates(current.getAvailablePlaybackRates());
          setError(""); readyRate(current); current.seekTo(request.start, true); current.playVideo();
          interval = setInterval(() => { if (current) { const state = current.getPlayerState(); videoTick(current.getCurrentTime(), state === 1, state === 0); } }, 100);
        },
        onError: e => { if (!cancelled) {
          clearTimeout(timeout); clearInterval(interval); stopped();
          const message = [101, 150].includes(e.data) ? "이 영상은 앱 안에서 재생할 수 없어요. YouTube에서 공식 영상을 열어 주세요." : e.data === 100 ? "영상을 사용할 수 없어요. 공식 영상 링크를 확인해 주세요." : e.data === 153 ? "영상 재생 환경을 확인하지 못했어요. 공식 영상 링크를 이용해 주세요." : "영상을 재생하지 못했어요. 공식 영상 링크에서 확인해 주세요.";
          setError(message);
        } },
        onAutoplayBlocked: () => { if (!cancelled) setNotice("영상 안의 재생 버튼을 눌러 주세요."); },
        onStateChange: e => { if (!cancelled && e.data === 1) { setNotice(""); played(); } },
        onPlaybackRateChange: e => { if (!cancelled) setRate(e.data); },
      } });
    }).catch(() => { if (!cancelled) setError("영상 동기화를 연결하지 못했어요. 다시 불러오거나 공식 영상 링크를 이용해 주세요."); });
    return () => { cancelled = true; clearTimeout(timeout); clearInterval(interval); video.current = null; current?.destroy(); container.replaceChildren(); };
  }, [request, title, videoId]);
  useEffect(() => { const el = native.current; return () => el?.pause(); }, []);
  function speed(n: number) { setRate(n); if (native.current) native.current.playbackRate = n; video.current?.setPlaybackRate(n); }
  return <div className="hm-playback">
    {videoId ? <>
      <a href={`https://www.youtube.com/watch?v=${videoId}`} target="_blank" rel="noopener noreferrer">YouTube에서 공식 영상 듣기 ↗</a>
      <button type="button" onClick={() => play()}>앱에서 원곡 듣기</button>
      <div ref={host} />
      {request && <button type="button" onClick={pause}>영상 닫기</button>}
    </> : <>
      <audio ref={native} aria-label="노래 전체 듣기" controls preload="metadata" src={audio}
        onTimeUpdate={e => tick(e.currentTarget.currentTime, !e.currentTarget.paused)}
        onPause={e => tick(e.currentTarget.currentTime, false)} onEnded={e => tick(e.currentTarget.currentTime, false, true)} onPlay={() => onPlay?.()}
        onError={() => setError("노래를 재생하지 못했어요. 연결을 확인하고 다시 시도해 주세요.")} />
      <button type="button" onClick={() => play()}>처음부터 노래 전체 듣기</button>
    </>}
    <div className="hm-playback-options">
      <label><input type="checkbox" checked={loop} onChange={e => setLoop(e.target.checked)} />{isSegment ? "현재 줄 반복" : "노래 반복"}</label>
      <label>재생 속도<select aria-label="재생 속도" value={rate} onChange={e => speed(Number(e.target.value))}>{[...new Set([...rates, rate])].sort((a, b) => a - b).map(n => <option key={n} value={n}>{n}×</option>)}</select></label>
    </div>
    {notice && <p role="status">{notice}</p>}
    {error && <div role="alert"><p>{error}</p><button type="button" onClick={() => { native.current?.load(); play(range.current?.startSeconds, range.current?.endSeconds); }}>노래 다시 불러오기</button></div>}
  </div>;
}
