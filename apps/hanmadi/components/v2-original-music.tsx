"use client";
import { useEffect, useRef, useState } from "react";
import { studyLanguages, type StudyLanguage, type StudyState, type Expression } from "@/lib/v2";
import type { PracticeSong, SongProgress, SongAction } from "@/lib/original-music";
import { MusicLanguagePractice } from "./v2-music-language";
import { Speaker } from "./v2-speaker";
import { LicensedMusicStudy } from "./v2-music";
import { pretender } from "@/lib/v2-music";

type Catalog = { songs: PracticeSong[]; progress: Record<string, SongProgress> };
export function MusicStudy({ language, expressions, onSaved, onConversation }: { language: StudyLanguage; expressions: Expression[]; onSaved: (state: StudyState) => void; onConversation: (prompt: string) => void }) {
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  const [commercial, setCommercial] = useState(false);
  const [selected, setSelected] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    void fetch("/api/study/practice-music", { cache: "no-store", signal: AbortSignal.any([controller.signal, AbortSignal.timeout(15000)]) })
      .then(async response => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.error ?? "연습곡을 불러오지 못했어요.");
        if (!controller.signal.aborted) setCatalog(data);
      }).catch(e => { if (!controller.signal.aborted) setError(e instanceof Error ? e.message : "연습곡을 불러오지 못했어요."); });
    return () => controller.abort();
  }, [attempt]);
  const available = catalog?.songs.filter(song => song.language === language) ?? [];
  const song = commercial ? available.find(song => song.videoId === pretender.videoId) : available.find(song => song.id === selected) ?? available[0];
  return <section className="hm-original-music" aria-label={`${studyLanguages[language].name} 음악 학습`}>
    {language === "ja" && <div className="hm-row hm-music-source" role="group" aria-label="음악 선택">
      <button aria-pressed={!commercial} onClick={() => setCommercial(false)}>한마디 연습곡</button>
      <button aria-pressed={commercial} onClick={() => setCommercial(true)}>Pretender · 공식 영상</button>
    </div>}
    {commercial && !song ? <LicensedMusicStudy /> : <>
      {!catalog && !error && <p role="status">연습곡을 불러오고 있어요…</p>}
      {error && <div role="alert"><p>{error}</p><button onClick={() => { setError(""); setAttempt(attempt + 1); }}>다시 불러오기</button></div>}
      {available.length > 1 && <label>학습할 곡<select aria-label="학습할 곡" value={song?.id ?? ""} onChange={e => { setSelected(e.target.value); setCommercial(false); }}>{available.map(s => <option key={s.id} value={s.id}>{s.title} · {s.managed ? s.subtitle : "한마디 연습곡"}</option>)}</select></label>}
      {song && catalog && <SongPractice key={`${song.id}:${song.revision}`} song={song} initial={catalog.progress[song.id]} expressions={expressions} onConversation={onConversation} onSaved={onSaved} onProgress={progress =>
        setCatalog(previous => previous ? { ...previous, progress: { ...previous.progress, [song.id]: progress } } : previous)} />}
    </>}
  </section>;
}
function SongPractice({ song, initial, onProgress, expressions, onSaved, onConversation }: { song: PracticeSong; initial: SongProgress; onProgress: (progress: SongProgress) => void; expressions: Expression[]; onSaved: (state: StudyState) => void; onConversation: (prompt: string) => void }) {
  const [progress, setProgress] = useState(initial);
  const [now] = useState(() => Date.now());
  const [stage, setStage] = useState<"practice" | "review" | "complete">(
    initial.phase === "practice" ? "practice" : initial.reviewed.length === song.lines.length ? "complete" : initial.phase === "review" ? "review" : "practice");
  const [showMeaning, setShowMeaning] = useState(true);
  const [feedback, setFeedback] = useState<"correct" | "wrong" | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [segment, setSegment] = useState<number | null>(null);
  const [video, setVideo] = useState<{ start?: number; end?: number; key: number } | null>(null);
  const [loop, setLoop] = useState(false);
  const [audioError, setAudioError] = useState(false);
  const [audioAttempt, setAudioAttempt] = useState(0);
  const [audioEpoch, setAudioEpoch] = useState(0);
  const player = useRef<HTMLAudioElement>(null);
  const pending = useRef(false);
  const index = progress.index, line = song.lines[index];
  const total = song.lines.length;
  // Stop the current song when leaving music, switching language/source or starting pronunciation.
  useEffect(() => { const audio = player.current; return () => audio?.pause(); }, [stage, audioAttempt]);
  function pause() { player.current?.pause(); setVideo(null); }
  async function playSong(onlyLine = false) {
    if (song.videoId) { setVideo({ ...(onlyLine ? { start: line.startSeconds, end: line.endSeconds } : {}), key: Date.now() }); setAudioEpoch(v => v + 1); return; }
    const audio = player.current;
    if (!audio) return;
    setSegment(onlyLine ? index : null);
    audio.currentTime = onlyLine ? line.startSeconds : 0;
    setAudioError(false);
    try { await audio.play(); } catch { setAudioError(true); }
  }
  function timeUpdate() {
    const audio = player.current;
    if (!audio || segment === null) return;
    const part = song.lines[segment];
    if (audio.currentTime >= part.endSeconds) {
      if (loop) audio.currentTime = part.startSeconds;
      else audio.pause();
    }
  }
  async function save(action: SongAction["action"], target = index, answer?: string, confidence?: "help" | "alone"): Promise<{ progress: SongProgress; correct?: boolean } | null> {
    if (pending.current) return null;
    pending.current = true; setBusy(true); setError("");
    try {
      const response = await fetch("/api/study/practice-music", { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, trackId: song.id, revision: song.revision, index: target, answer, confidence }), signal: AbortSignal.timeout(15000) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "진도를 저장하지 못했어요. 다시 눌러 주세요.");
      setProgress(data.progress); onProgress(data.progress);
      if (action === "answer") setFeedback(data.correct ? "correct" : "wrong");
      return data;
    } catch (e) { setError(e instanceof Error ? e.message : "저장하지 못했어요."); return null; }
    finally { pending.current = false; setBusy(false); }
  }
  async function move(target: number) {
    pause(); setSegment(null); setAudioEpoch(v => v + 1);
    if (await save("move", target)) { setFeedback(null); setShowMeaning(true); }
  }
  async function review() {
    pause(); setSegment(null); setAudioEpoch(v => v + 1);
    if (await save("review", 0)) { setFeedback(null); setStage("review"); }
  }
  // Fixed shuffled order keeps each correct answer in a different slot across the lesson questions.
  const choices = (total === 4 ? [2, 0, 3, 1] : song.lines.map((_, i) => (i + Math.ceil(total / 2)) % total)).map(i => song.lines[i]);
  const correct = feedback === "correct" || (feedback === null && progress.reviewed.length < total && progress.reviewed.includes(line.id));
  return <div className="hm-song-practice" aria-busy={busy}>
    <header className="hm-music-cover">
      <span className="hm-music-record" aria-hidden="true">♪</span>
      <div><p className="hm-song-eyebrow">{song.managed ? "음악으로 배우기" : "한마디 오리지널"} · {studyLanguages[song.language].name}</p><h1 lang={song.language}>{song.title}</h1><p>{song.subtitle}</p></div>
    </header>
    <p>짧은 노래 한 곡으로 듣고, 뜻을 익히고, 단어와 회화로 연습해요.</p>
    <ol className="hm-song-steps" aria-label="음악 학습 순서"><li>노래 듣기</li><li>한 줄씩 따라 부르기</li><li>단어·회화에 활용하기</li><li>뜻 떠올리기</li></ol>
    {stage !== "complete" && <section className="hm-song-player" aria-label="연습곡 듣기">
      {song.videoId ? <>
        <a href={`https://www.youtube.com/watch?v=${song.videoId}`} target="_blank" rel="noopener noreferrer">YouTube에서 공식 영상 듣기 ↗</a>
        <button onClick={() => void playSong()}>앱에서 원곡 듣기</button>
        {video && <><iframe key={video.key} title={`${song.title} 공식 영상`} src={`https://www.youtube-nocookie.com/embed/${song.videoId}?playsinline=1${video.start !== undefined ? `&start=${Math.floor(video.start)}&end=${Math.ceil(video.end!)}` : ""}`} allow="encrypted-media; picture-in-picture; fullscreen" allowFullScreen referrerPolicy="strict-origin-when-cross-origin" style={{ width: "100%", aspectRatio: "16/9", border: 0 }} /><button onClick={pause}>영상 닫기</button></>}
        <small>공식 영상으로 원곡을 들어요. 발음 듣기는 별도의 학습 음성이에요. 재생이 제한되면 YouTube 링크를 이용해 주세요.</small>
      </> : <>
      <label htmlFor={`audio-${song.id}`}>노래 전체 듣기 · 반복 재생 가능</label>
      <audio key={audioAttempt} id={`audio-${song.id}`} ref={player} controls preload="metadata" loop={loop && segment === null} src={song.audio} onTimeUpdate={timeUpdate}
        onPlay={() => setAudioEpoch(v => v + 1)} onError={() => setAudioError(true)} onLoadedData={() => setAudioError(false)} />
      <button disabled={busy} onClick={() => void playSong()}>처음부터 노래 전체 듣기</button>
      <label className="hm-song-loop"><input type="checkbox" checked={loop} onChange={e => setLoop(e.target.checked)} /> {segment === null ? "노래 반복" : "현재 줄 반복"}</label>
      {audioError && <div role="alert"><p>노래를 재생하지 못했어요. 연결을 확인하고 다시 시도해 주세요.</p><button onClick={() => { setAudioError(false); setAudioAttempt(v => v + 1); }}>노래 다시 불러오기</button></div>}
      <small>한마디가 직접 쓴 가사로 만든 AI 연습곡이에요. 발음 듣기는 노래와 별도의 학습 음성이에요.</small>
      </>}
    </section>}
    {stage === "practice" && <section className="hm-lyrics" aria-label="연습곡 한 줄 연습">
      <div className="hm-row"><h2>듣고, 따라 불러요</h2><span role="status">연습 {index + 1} / {total}</span></div>
      <progress aria-label="따라 부르기 완료" value={progress.practiced.length} max={total} />
      <div className="hm-lyrics-line">
        <p className="hm-lyrics-original" lang={song.language}>{line.text}</p>
        <p className="hm-lyrics-reading">{line.reading}</p>
        {showMeaning && <p className="hm-lyrics-meaning">{line.meaning}</p>}
        <div className="hm-lyrics-actions">
          {(!song.videoId || line.endSeconds > line.startSeconds) && <button disabled={busy} onClick={() => void playSong(true)}>이 줄 노래 듣기</button>}
          <span onClickCapture={pause}><Speaker key={audioEpoch + ":" + line.id} text={line.text} language={song.language} label="발음 듣기" /></span>
          <button aria-pressed={!showMeaning} onClick={() => setShowMeaning(!showMeaning)}>{showMeaning ? "뜻 가리기" : "뜻 보기"}</button>
        </div>
      </div>
      <p className="hm-muted">노래를 들으며 이 줄을 직접 불러 보세요. 완료 표시는 스스로 남기는 연습 기록이에요.</p>
      <button className="hm-primary" disabled={busy || progress.practiced.includes(line.id)} onClick={() => void save("practice")}>
        {progress.practiced.includes(line.id) ? "이 줄 연습 완료" : "따라 불렀어요"}
      </button>
      <MusicLanguagePractice key={line.id} song={song} index={index} progress={progress} expressions={expressions}
        busy={busy} audioEpoch={audioEpoch} onAction={save} onSaved={onSaved} onConversation={onConversation} onPause={pause} />
      <div className="hm-lesson-navigation">
        <button disabled={busy || index === 0} onClick={() => void move(index - 1)}>이전 줄</button>
        {index + 1 < total ? <button disabled={busy} onClick={() => void move(index + 1)}>다음 줄</button> :
          <button disabled={busy || progress.practiced.length !== total} onClick={() => void review()}>뜻 복습 시작</button>}
      </div>
      <p>{progress.practiced.length} / {total}줄 연습 완료 · 모든 구간을 연습하면 뜻 복습이 열려요.</p>
      {song.language === "th" && <p className="hm-muted">노래의 멜로디와 태국어 성조는 달라요. 회화 발음은 ‘발음 듣기’로 함께 확인해 주세요.</p>}
    </section>}
    {stage === "review" && <section className="hm-lyrics" aria-label="연습곡 뜻 복습">
      <div className="hm-row"><h2>뜻을 떠올려요</h2><span role="status">복습 {index + 1} / {total}</span></div>
      <p className="hm-lyrics-original" lang={song.language}>{line.text}</p>
      <p>이 가사의 뜻은 무엇일까요?</p>
      <div className="hm-song-choices">{choices.map(choice => <button key={choice.id} disabled={busy || correct} onClick={() => void save("answer", index, choice.id)}>{choice.meaning}</button>)}</div>
      <div role="status" aria-live="polite">{correct ? "맞았어요! 노래 속 뜻을 기억했네요." : feedback === "wrong" ? "한 번 더 생각해 보세요." : ""}</div>
      {feedback === "wrong" && <details><summary>발음과 뜻 힌트</summary><p>{line.reading}</p><p>{line.meaning}</p></details>}
      {correct && <button className="hm-primary" disabled={busy} onClick={() => {
        if (index + 1 < total) void move(index + 1); else if (progress.reviewed.length === total) { player.current?.pause(); setStage("complete"); }
      }}>{index + 1 < total ? "다음 복습" : "학습 결과 보기"}</button>}
    </section>}
    {stage === "complete" && <section className="hm-song-complete" aria-label="음악 학습 완료">
      <span aria-hidden="true">✓</span><h2>한 곡을 내 한마디로!</h2>
      <p>{total}개 구간을 따라 부르고 뜻까지 복습했어요.</p>
      <p>단어 {progress.wordsReviewed?.length ?? 0} / {total}개 · 회화 {Object.keys(progress.conversations ?? {}).length} / {total}개 연습</p>
      <p>{progress.dueAt && progress.dueAt <= now ? "오늘 다시 복습할 시간이에요." : "내일 다시 떠올려 보세요. 지금 한 번 더 연습해도 좋아요."}</p>
      <button className="hm-primary" disabled={busy} onClick={() => void review()}>다시 복습하기</button>
      <button disabled={busy} onClick={() => { void save("practice", 0).then(ok => { if (ok) { setStage("practice"); setFeedback(null); } }); }}>단어·회화 다시 연습하기</button>
    </section>}
    {error && <p role="alert">{error}</p>}
  </div>;
}
