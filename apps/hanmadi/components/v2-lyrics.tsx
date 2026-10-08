"use client";
import { useEffect, useState } from "react";
import { pretender } from "@/lib/v2-music";
import { musicProgressIndex, type LicensedMusicLesson, type MusicProgress } from "@/lib/music-lyrics";
import { prepareLessonAudio } from "@/lib/study-audio-client";
import { Speaker } from "./v2-speaker";

export function LyricsPractice({ lesson, progress, onReload }: {
  lesson: LicensedMusicLesson; progress?: MusicProgress; onReload: () => void;
}) {
  const [index, setIndex] = useState(() => musicProgressIndex(progress, lesson));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [meaning, setMeaning] = useState(true);
  const [video, setVideo] = useState(0);
  const [audioEpoch, setAudioEpoch] = useState(0);
  const [expired, setExpired] = useState(() => Date.parse(lesson.expiresAt) <= Date.now());
  const line = lesson.lines[index];
  const next = lesson.lines[index + 1]?.text;
  useEffect(() => {
    const check = () => setExpired(Date.parse(lesson.expiresAt) <= Date.now());
    const timer = setInterval(check, 1000);
    return () => clearInterval(timer);
  }, [lesson.expiresAt]);
  useEffect(() => {
    if (expired) return;
    return prepareLessonAudio(next ? [line.text, next] : [line.text], "ja");
  }, [line.text, next, expired]);
  async function move(target: number) {
    setVideo(0); setAudioEpoch(value => value + 1); setBusy(true); setError("");
    try {
      const response = await fetch("/api/study/music", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ revision: lesson.revision, index: target }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "진도를 저장하지 못했어요. 다시 눌러 주세요.");
      setIndex(target);
    } catch (e) { setError(e instanceof Error ? e.message : "진도를 저장하지 못했어요."); }
    finally { setBusy(false); }
  }
  if (expired) return <div role="status"><p>가사 이용 기간이 끝났어요. 새 자료가 있는지 확인해 주세요.</p><button onClick={onReload}>다시 확인</button></div>;
  const segment = line.startSeconds !== undefined && line.endSeconds !== undefined;
  return <section className="hm-lyrics" aria-label="가사 한 줄 연습" aria-busy={busy}>
    <div className="hm-row"><h2>한 줄씩 따라 해요</h2><span role="status">가사 {index + 1} / {lesson.lines.length}</span></div>
    <progress aria-label="가사 위치" value={index + 1} max={lesson.lines.length} />
    <div className="hm-lyrics-line" key={line.id}>
      <p lang="ja" className="hm-lyrics-original">{line.text}</p>
      <p className="hm-lyrics-reading">{line.reading}</p>
      {meaning && <p className="hm-lyrics-meaning">{line.meaning}</p>}
      <div className="hm-lyrics-actions">
        <span onClickCapture={() => setVideo(0)}><Speaker key={audioEpoch} text={line.text} language="ja" label="발음 듣기" /></span>
        <button aria-pressed={!meaning} onClick={() => setMeaning(!meaning)}>{meaning ? "뜻 가리기" : "뜻 보기"}</button>
      </div>
    </div>
    <div className="hm-lesson-navigation">
      <button disabled={busy || index === 0} onClick={() => void move(index - 1)}>이전</button>
      <button className="hm-primary" disabled={busy} onClick={() => void move(index + 1 < lesson.lines.length ? index + 1 : 0)}>
        {busy ? "저장 중…" : index + 1 < lesson.lines.length ? "다음" : "처음부터 다시"}
      </button>
    </div>
    {segment && <div className="hm-music-listen">
      <button onClick={() => { setAudioEpoch(audioEpoch + 1); setVideo(video + 1); }}>{video ? "이 구간 다시 듣기" : "원곡에서 이 구간 듣기"}</button>
      {video > 0 && <>
        <iframe key={`${line.id}:${video}`} title="현재 가사 원곡 구간"
          src={`https://www.youtube-nocookie.com/embed/${pretender.videoId}?playsinline=1&autoplay=1&cc_load_policy=1&cc_lang_pref=ja&start=${line.startSeconds}&end=${line.endSeconds}`}
          allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowFullScreen referrerPolicy="strict-origin-when-cross-origin" />
        <button onClick={() => setVideo(0)}>구간 영상 닫기</button>
      </>}
      <a href={`${pretender.officialUrl}&t=${line.startSeconds}s`} target="_blank" rel="noopener noreferrer">YouTube에서 이 구간 열기 ↗</a>
    </div>}
    {!segment && <p className="hm-muted">이 줄의 원곡 구간은 아직 준비되지 않았어요. 발음 듣기로 먼저 연습해 보세요.</p>}
    {error && <div role="alert"><p>{error}</p><button onClick={onReload}>가사 다시 불러오기</button></div>}
    <p className="hm-lyrics-credit"><a href={lesson.attribution.url} target="_blank" rel="noopener noreferrer">{lesson.attribution.label}</a></p>
  </section>;
}
