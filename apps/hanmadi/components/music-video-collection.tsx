"use client";
import Image from "next/image";
import { useRef, useState } from "react";
import { studyLanguages, type StudyLanguage } from "@/lib/v2";
import type { MusicCollectedVideo } from "@/lib/music-collection";
import type { MusicCaptionTrack } from "@/lib/youtube-music";
import type { YoutubeSearchPage, YoutubeVideo } from "@/lib/youtube-search";
import type { OwnedMusic } from "@/lib/owned-music";
import { musicStudyHref } from "@/lib/music-study-link";
import { MusicPlayback } from "./music-playback";
async function api(body: Record<string, unknown>) {
  const response = await fetch("/api/study/admin/music", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), signal: AbortSignal.timeout(45000) });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "영상 수집을 완료하지 못했어요.");
  return data;
}
type Work = (body: Record<string, unknown>, message: string) => Promise<Awaited<ReturnType<typeof api>> | undefined>;
export function MusicVideoCollection({ items, youtube, songs, learningHref, disabled, onReload, onUse, hideSearch = false }: {
  hideSearch?: boolean; learningHref: string; items: MusicCollectedVideo[] | null; youtube: { search: boolean; captions: boolean }; songs: OwnedMusic[]; disabled: boolean;
  onReload: () => Promise<void>; onUse: (item: MusicCollectedVideo) => void;
}) {
  const [query, setQuery] = useState(""), [language, setLanguage] = useState<StudyLanguage>("ja"), [captionOnly, setCaptionOnly] = useState(false);
  const [url, setUrl] = useState(""), [results, setResults] = useState<YoutubeSearchPage | null>(null);
  const [busy, setBusy] = useState(false), [error, setError] = useState(""), [notice, setNotice] = useState("");
  const lock = useRef(false);
  const blocked = busy || disabled;
  async function work(body: Record<string, unknown>, message: string) {
    if (lock.current || disabled) return;
    lock.current = true; setBusy(true); setError(""); setNotice("");
    try {
      const data = await api(body);
      if (!["collection-search", "collection-tracks"].includes(String(body.action))) await onReload();
      setNotice(message); return data;
    } catch (e) { setError(e instanceof Error ? e.message : "연결을 확인한 뒤 다시 시도해 주세요." ); }
    finally { lock.current = false; setBusy(false); }
  }
  async function search(more = false) {
    const data = await work({ action: "collection-search", query, language, captionsOnly: captionOnly, ...(more && results?.nextPageToken ? { pageToken: results.nextPageToken } : {}) }, "");
    if (data) setResults({ ...data, videos: more ? [...(results?.videos ?? []), ...data.videos.filter((v: YoutubeVideo) => !results?.videos.some(old => old.id === v.id))] : data.videos });
  }
  return <section className="music-collection hm-panel" aria-label="YouTube 음악 수집">
    <div className="la-heading"><div><span className="ks-tag">1 · 영상과 자막 준비</span><h3>YouTube 음악 수집함</h3><p>곡이나 아티스트로 찾아 먼저 담아 두세요. 원곡은 공식 영상으로 듣고, 자막을 연결하면 학습 자료로 만들 수 있어요.</p></div></div>
    {error && <p className="hm-alert" role="alert">{error}</p>}
    {notice && <p className="hm-notice" role="status">{notice}</p>}
    {!hideSearch && <fieldset disabled={blocked || !items} className="music-fields">
      <label>수집할 학습 언어<select value={language} onChange={e => { setLanguage(e.target.value as StudyLanguage); setResults(null); }}>{Object.entries(studyLanguages).map(([id, l]) => <option value={id} key={id}>{l.name}</option>)}</select></label>
      <form className="music-search" onSubmit={e => { e.preventDefault(); void search(); }}>
        <label>노래·아티스트 검색<input required maxLength={100} value={query} onChange={e => { setQuery(e.target.value); setResults(null); }} placeholder="예: Official髭男dism Pretender" /></label>
        <button type="submit" disabled={!youtube.search || !query.trim()}>{busy ? "처리 중…" : "음악 영상 검색"}</button>
        <label className="music-check"><input type="checkbox" checked={captionOnly} onChange={e => { setCaptionOnly(e.target.checked); setResults(null); }} />YouTube 자막이 있는 영상만</label>
      </form>
      <form className="music-search" onSubmit={async e => { e.preventDefault(); if (await work({ action: "collection-add", video: url.trim(), language }, "영상을 수집함에 담았어요. 아래에서 자막을 준비해 주세요.")) setUrl(""); }}>
        <label>수집할 YouTube 주소<input required maxLength={2048} value={url} onChange={e => setUrl(e.target.value)} placeholder="https://youtu.be/…" /></label>
        <button type="submit" disabled={!youtube.search || !url.trim()}>주소로 수집</button>
      </form>
      {!youtube.search && <p>영상 검색 연결이 준비되지 않았어요. 아래 ‘새 곡 등록’에서 주소와 제공받은 자막으로 등록할 수 있어요.</p>}
      <p className="hm-muted">YouTube의 자막 표시와 가져오기 권한은 달라요. 자막 가져오기는 연결 채널이 수정할 수 있는 영상에만 가능해요. 다른 곡은 사용권 있는 자막 파일을 등록해 주세요.</p>
      {!youtube.captions && <p className="hm-notice">자막용 채널 연결 전이에요. 영상 수집과 자막 파일 등록은 이용할 수 있어요.</p>}
      {results && <div className="music-search-results" aria-label="음악 검색 결과">
        {!results.videos.length && <p>조건에 맞는 영상이 없어요. 검색어를 바꾸거나 ‘자막이 있는 영상만’을 해제해 보세요.</p>}
        {results.videos.map(video => <article key={video.id} className="music-video-result">
          {video.thumbnail && <Image src={video.thumbnail} width={160} height={90} alt="" unoptimized />}
          <div><h4><a href={video.url} target="_blank" rel="noopener noreferrer">{video.title} ↗</a></h4><p>{video.channel}</p>
            <button type="button" disabled={items?.some(item => item.video.id === video.id && item.language === language)} onClick={() => void work({ action: "collection-add", video: video.id, language }, "수집했어요. 아래 수집함에서 자막을 연결해 주세요.")}>{items?.some(item => item.video.id === video.id && item.language === language) ? "수집됨" : "수집함에 담기"}</button></div>
        </article>)}
        {results.nextPageToken && <button type="button" onClick={() => void search(true)}>검색 결과 더 보기</button>}
      </div>}
    </fieldset>}
    <h4>수집한 영상 {items?.length ?? 0}/100</h4>
    {!items ? <p role="status">수집함을 불러오고 있어요…</p> : !items.length ? <p className="la-empty">아직 수집한 영상이 없어요. 검색하거나 영상 주소를 넣어 시작해 보세요.</p> : <div className="music-catalog">{items.slice().reverse().map(item => <CollectedVideo key={`${item.id}:${item.revision}`} item={item} disabled={blocked} canImport={youtube.captions}
      song={songs.find(s => s.videoId === item.video.id && s.language === item.language)} learningHref={learningHref} onUse={() => onUse(item)} work={work} />)}</div>}
  </section>;
}
function CollectedVideo({ item, disabled, canImport, song, learningHref, onUse, work }: { item: MusicCollectedVideo; disabled: boolean; canImport: boolean; song?: OwnedMusic; learningHref: string; onUse: () => void; work: Work }) {
  const [tracks, setTracks] = useState<MusicCaptionTrack[] | null>(null), [trackId, setTrackId] = useState("");
  const [source, setSource] = useState(item.source ?? ""), [fileError, setFileError] = useState(""), [reading, setReading] = useState(false), [preview, setPreview] = useState(false);
  const epoch = useRef(0);
  const blocked = disabled || reading;
  const body = { id: item.id, revision: item.revision };
  const registered = !!song;
  const status = song ? ({ draft: "학습 원문 등록됨 · 자료 생성 필요", generating: "학습 자료 생성 중", evaluating: "학습 자료 평가 중", review: "학습 자료 검수·게시 대기", published: "앱에서 학습 가능", error: "학습 자료 처리 실패 · 재시도 필요" } as const)[song.status] : item.source ? "자막 확보 · 학습 등록 전" : "영상 수집됨 · 자막 필요";
  const unsaved = source !== (item.source ?? "");
  return <article className="music-collected" aria-label={`${item.video.title} 수집 정보`}>
    <div className="hm-row"><div><span className="ks-tag">{status}</span>
      <h4>{item.video.title}</h4><p>{item.video.channel} · {studyLanguages[item.language].name} · {Math.floor(item.video.seconds / 60)}분 {item.video.seconds % 60}초</p>
      <p className="hm-muted">{item.video.captionsAvailable ? "YouTube 자막 있음 · 가져오기 권한은 별도 확인" : "YouTube 자막 표시 없음 · 파일로 등록 가능"}</p></div></div>
    <div className="hm-row"><button type="button" onClick={() => setPreview(!preview)}>{preview ? "미리보기 닫기" : "원곡 미리보기"}</button>
      <a href={item.video.url} target="_blank" rel="noopener noreferrer">YouTube에서 열기 ↗</a></div>
    {song && <p>{song.status === "published" ? <a className="hm-primary" href={musicStudyHref(learningHref, song)} target="_blank" rel="noopener noreferrer">앱에서 이 곡 학습 ↗</a> : <>아래 ‘{song.title} 관리’ 카드에서 {song.status === "review" ? "학습 구간을 검수하고 게시해 주세요." : "자료 생성·검수를 마치면 앱에서 이 곡을 학습할 수 있어요."}</>}</p>}
    {preview && <MusicPlayback title={item.video.title} videoId={item.video.id} />}
    <details className="music-source-connect"><summary>자막 연결{item.source ? ` · ${item.sourceOrigin === "youtube" ? "YouTube에서 확보" : "파일·직접 등록"}` : ""}</summary>
      <fieldset disabled={blocked} className="music-fields">
        <div><button type="button" disabled={!canImport} onClick={async () => { const data = await work({ action: "collection-tracks", ...body }, ""); if (data) { setTracks(data.tracks); setTrackId(data.tracks[0]?.id ?? ""); } }}>YouTube 자막 확인</button></div>
        {tracks && !tracks.length && <p>가져올 수 있는 자막이 없어요. 사용권 있는 자막 파일을 등록해 주세요.</p>}
        {!!tracks?.length && <div className="music-search"><label>가져올 자막<select value={trackId} onChange={e => setTrackId(e.target.value)}>{tracks.map(t => <option value={t.id} key={t.id}>{t.language} · {t.name || "기본 자막"}{t.automatic ? " · 자동 생성 (검수 필요)" : ""}</option>)}</select></label>
          <button type="button" onClick={() => { if (!source || window.confirm("작성 중이거나 저장된 자막을 YouTube 자막으로 바꿀까요?")) void work({ action: "collection-import", ...body, trackId }, "자막을 수집함에 보관했어요. 가사 내용과 사용권을 확인한 뒤 학습 원문으로 등록해 주세요."); }}>선택한 자막 가져오기</button></div>}
        <label>수집 영상 자막 파일<input type="file" accept=".txt,.srt,.vtt,.lrc,text/plain" onChange={async e => {
          const file = e.target.files?.[0], current = ++epoch.current; setFileError(""); if (!file) return;
          if (file.size > 64000 || !/\.(txt|srt|vtt|lrc)$/i.test(file.name)) { setFileError("64KB 이하 TXT·SRT·VTT·LRC 파일을 선택해 주세요."); return; }
          setReading(true); try { const text = await file.text(); if (epoch.current === current) setSource(text); } catch { setFileError("파일을 읽지 못했어요."); } finally { if (epoch.current === current) setReading(false); }
        }} /></label>
        <label>수집 영상 자막 원문<textarea rows={5} maxLength={12000} value={source} onChange={e => { epoch.current++; setSource(e.target.value); }} /></label>
        <small>2~100줄, 최대 12,000자. 한 줄 250자 이내. 파일을 선택한 뒤 ‘자막 보관’을 눌러 주세요.</small>
        {fileError && <p role="alert">{fileError}</p>}
        <div><button type="button" disabled={!source.trim()} onClick={() => void work({ action: "collection-source", ...body, source }, "자막을 수집함에 보관했어요. 학습 원문 등록을 이어갈 수 있어요.")}>자막 보관</button></div>
      </fieldset>
    </details>
    {unsaved && <p className="hm-muted">자막을 수정했어요. ‘자막 보관’ 후 학습 원문 등록을 이어가 주세요.</p>}
    <div className="hm-row music-collection-actions"><button className="hm-primary" type="button" disabled={blocked || unsaved} onClick={onUse}>{registered ? "등록한 학습 원문 열기" : item.source ? "이 자막으로 학습 원문 등록" : "직접 원문 입력해서 등록"}</button>
      <button type="button" disabled={blocked} onClick={() => { if (window.confirm("이 영상과 수집한 자막을 수집함에서 지울까요? 이미 등록한 학습 자료는 유지돼요.")) void work({ action: "collection-remove", ...body }, "수집함에서 지웠어요. 등록된 학습 자료는 유지돼요."); }}>수집함에서 지우기</button></div>
  </article>;
}
