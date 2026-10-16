"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { studyLanguages, type StudyLanguage } from "@/lib/v2";
import { musicStudyHref } from "@/lib/music-study-link";
import { MusicVideoCollection } from "./music-video-collection";
import type { MusicCollectedVideo } from "@/lib/music-collection";
import type { MediaDetail } from "@/lib/media-source";
import type { OwnedMusic } from "@/lib/owned-music";
async function api(body?: unknown) {
  const response = await fetch("/api/study/admin/music", { method: body ? "POST" : "GET", cache: "no-store",
    headers: body ? { "Content-Type": "application/json" } : {}, body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(body ? 155000 : 15000) });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "음악 자료를 처리하지 못했어요.");
  return data;
}
const labels: Record<OwnedMusic["status"], string> = { draft: "원문 등록됨", generating: "AI 자료 생성 중", evaluating: "JEV 평가 중", review: "검수 대기", published: "앱에 게시됨", error: "다시 시도 가능" };
const blank = { title: "", artist: "", videoId: "", source: "", rights: "", language: "ja" as StudyLanguage, rightsConfirmed: false };
export function MusicAdmin({ stage = "review", prepared, onPrepare, onReview, onLegacyUse, onBusyChange }: { stage?: "review" | "published" | "legacy"; prepared?: MediaDetail; onPrepare?: (song?: OwnedMusic) => void; onLegacyUse?: (item: MusicCollectedVideo) => void; onBusyChange?: (value: boolean) => void; onReview?: () => void }) {
  const original = prepared?.source.originals.at(-1);
  const preparedForm = prepared && original ? { title: prepared.source.title, artist: "", videoId: prepared.source.videoId, source: original.raw, rights: original.rights, language: prepared.source.language, rightsConfirmed: false } : blank;
  const [songs, setSongs] = useState<OwnedMusic[] | null>(null), [form, setForm] = useState(preparedForm);
  const [collection, setCollection] = useState<MusicCollectedVideo[] | null>(null), [youtube, setYoutube] = useState({ search: false, captions: false });
  const [learningHref, setLearningHref] = useState("/study");
  const [initial] = useState(() => ({ prepared, preparedForm }));
  const [showPrepared, setShowPrepared] = useState(!!prepared);
  const [now, setNow] = useState(() => Date.now());
  const [editing, setEditing] = useState<OwnedMusic | null>(null);
  const [busy, setBusy] = useState(false), [error, setError] = useState(""), [notice, setNotice] = useState("");
  const pending = useRef(false), fileEpoch = useRef(0);
  const load = useCallback(async () => { const data = await api(); setSongs(data.songs); setCollection(data.collection); setYoutube(data.youtube); setLearningHref(data.learningAppHref); setNow(Date.now()); }, []);
  useEffect(() => { let live = true; void api().then(data => { if (live) { setSongs(data.songs); setCollection(data.collection); setYoutube(data.youtube); setLearningHref(data.learningAppHref); setNow(Date.now()); if (initial.prepared) { const existing = (data.songs as OwnedMusic[]).find(s => s.videoId === initial.prepared!.source.videoId && s.language === initial.prepared!.source.language); if (existing) { setEditing(existing); setForm({ ...initial.preparedForm, artist: existing.artist }); } } } }).catch(e => { if (live) setError(e.message); }); return () => { live = false; }; }, [initial]);
  useEffect(() => { onBusyChange?.(busy); return () => onBusyChange?.(false); }, [busy, onBusyChange]);
  const active = songs?.some(s => ["generating", "evaluating"].includes(s.status) && (s.job?.until ?? 0) > now);
  useEffect(() => {
    if (!active && !busy) return;
    const timer = setInterval(() => { void load().catch(() => {}); }, 3000);
    return () => clearInterval(timer);
  }, [active, busy, load]);
  async function work(body: Record<string, unknown>, message: string) {
    if (pending.current) return;
    pending.current = true; setBusy(true); setError(""); setNotice(body.action === "generate" ? "AI가 학습 구간을 만들고 JEV로 평가하고 있어요. 화면을 닫아도 목록에서 결과를 확인할 수 있어요." : "");
    try { await api(body); await load(); setNotice(message); return true; }
    catch (e) { setNotice(""); setError(e instanceof Error ? e.message : "처리하지 못했어요. 목록에서 상태를 확인해 주세요."); try { await load(); } catch {} return false; }
    finally { pending.current = false; setBusy(false); }
  }
  function reset() { fileEpoch.current++; setEditing(null); setShowPrepared(false); setForm(blank); }
  function videoId(value: string) {
    try { const url = new URL(value); return url.hostname === "youtu.be" ? url.pathname.slice(1) : ["youtube.com", "www.youtube.com", "m.youtube.com"].includes(url.hostname) ? url.searchParams.get("v") ?? value : value; }
    catch { return value; }
  }
  return <section className="music-admin" aria-label="음악 자료 관리">
    <div className="la-heading"><div><h2>{stage === "published" ? "앱에 반영된 음악" : stage === "legacy" ? "기존 음악 수집함" : "음악 자료 생성·검수"}</h2><p>{stage === "published" ? "게시된 곡과 학습 구간을 관리해요. 새 영상은 콘텐츠 준비에서 시작하세요." : "콘텐츠 준비에서 가져온 원문으로 자료를 만들고, 검수한 구간만 앱에 게시해요."}</p></div>
      <button onClick={() => void load().catch(e => setError(e.message))}>음악 목록 새로고침</button></div>

    {error && <p role="alert" className="hm-alert">{error}</p>}
    {notice && <p role="status" className="hm-notice">{notice}</p>}
    {stage === "legacy" && <MusicVideoCollection hideSearch items={collection} youtube={youtube} songs={songs ?? []} learningHref={learningHref} disabled={busy} onReload={load} onUse={item => onLegacyUse?.(item)} />}
    {stage === "review" && showPrepared && <details className="hm-panel" open><summary>{editing ? `음악 초안 갱신 · ${editing.title}` : "준비한 원문으로 음악 초안 만들기"}</summary>
      <form onSubmit={async e => { e.preventDefault(); if (await work({ action: "save", ...form, ...(editing ? { id: editing.id, revision: editing.revision } : {}) }, "원문을 보관했어요. 곡 카드에서 ‘AI 자료 만들기’를 눌러 주세요.")) reset(); }}>
        <fieldset disabled={busy || !songs} className="music-fields">
          <div className="hm-grid"><label>곡 제목<input readOnly={!!prepared} required maxLength={100} value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} /></label>
            <label>아티스트<input required maxLength={100} value={form.artist} onChange={e => setForm({ ...form, artist: e.target.value })} /></label>
            <label>학습 언어<select disabled={!!prepared} value={form.language} onChange={e => setForm({ ...form, language: e.target.value as StudyLanguage })}>{Object.entries(studyLanguages).map(([id, l]) => <option key={id} value={id}>{l.name}</option>)}</select></label>
            <label>공식 YouTube 영상 링크 또는 ID<input readOnly={!!prepared} required value={form.videoId} onChange={e => setForm({ ...form, videoId: videoId(e.target.value.trim()) })} placeholder="https://www.youtube.com/watch?v=…" /></label></div>
          <label>학습에 사용할 원문<textarea aria-label="학습에 사용할 원문" readOnly={!!prepared} required rows={7} maxLength={12000} value={form.source} onChange={e => { fileEpoch.current++; setForm({ ...form, source: e.target.value }); }} placeholder="가사는 한 줄씩, 또는 SRT/VTT/LRC 자막을 붙여 넣어 주세요." /></label>
          <small>2~100줄 · 최대 12,000자. AI가 2~8개 학습 구간을 골라요. 자막 시간이 있으면 원곡의 해당 구간을 바로 들을 수 있어요.</small>

          <label>사용권 근거<textarea aria-label="사용권 근거" readOnly={!!prepared} required minLength={10} maxLength={1000} rows={2} value={form.rights} onChange={e => setForm({ ...form, rights: e.target.value })} placeholder="예: 직접 작사한 곡. AI 처리·가사 표시·번역·발음 음성·학습 자료 저장 및 재사용 권한 보유." /></label>
          <label className="music-check"><input required type="checkbox" checked={form.rightsConfirmed} onChange={e => setForm({ ...form, rightsConfirmed: e.target.checked })} />원문을 AI에 제공하고, 가사·번역·발음 음성 및 학습 자료로 저장·재사용할 권한을 확인했어요.</label>
          {editing?.status === "published" && <p>원문을 수정해 저장하면 게시가 내려가고 새 자료를 만들어 검수해야 해요.</p>}
          <div className="hm-row"><button className="hm-primary" type="submit">{busy ? "보관 중…" : editing ? "음악 초안 갱신" : "음악 초안 준비"}</button>{editing && <button type="button" onClick={reset}>수정 취소</button>}</div>
        </fieldset>
      </form>
    </details>}
    {!songs ? <p role="status">등록한 곡을 불러오고 있어요…</p> : <>
      <p>{stage === "published" ? `${songs.filter(s => s.status === "published").length}곡 게시` : `${songs.filter(s => s.status !== "published").length}곡 준비·검수 중`}</p>
      {!songs.length && <p className="la-empty">콘텐츠 준비에서 영상을 수집하고 원문을 연결해 주세요.</p>}
      <div className="music-catalog">{songs.filter(s => stage === "published" ? s.status === "published" : stage === "review" ? s.status !== "published" : false).slice().reverse().map(song => <MusicCard key={`${song.id}:${song.revision}:${song.status}`} song={song} busy={busy} now={now} learningHref={learningHref}
        onEdit={() => onPrepare?.(song)}
        onWork={work} />)}</div>
    </>}
    <div className="hm-row">{stage === "published" && <button onClick={onReview}>미게시 음악 검수하기</button>}<button onClick={() => onPrepare?.()}>콘텐츠 준비로 이동</button></div>
  </section>;
}
function MusicCard({ song, busy, now, learningHref, onEdit, onWork }: { learningHref: string; song: OwnedMusic; busy: boolean; now: number; onEdit: () => void; onWork: (b: Record<string, unknown>, message: string) => Promise<boolean | undefined> }) {
  const [selected, setSelected] = useState(() => song.units?.flatMap((_, i) => song.judgments?.[i]?.disposition !== "excluded" ? [i] : []) ?? []);
  const [reviewed, setReviewed] = useState(false);
  const running = ["generating", "evaluating"].includes(song.status) && (song.job?.until ?? 0) > now;
  const interrupted = ["generating", "evaluating"].includes(song.status) && !running;
  const action = (name: string, message: string, extra = {}) => onWork({ action: name, id: song.id, revision: song.revision, ...extra }, message);
  return <article className="hm-panel music-card" aria-label={`${song.title} 관리`} aria-busy={running}>
    <div className="hm-row"><div><span className="ks-tag">{interrupted ? "처리 중단 · 재시도 가능" : labels[song.status]}</span><h3>{song.title}</h3><p>{song.artist} · {studyLanguages[song.language].name}</p></div><a target="_blank" rel="noopener noreferrer" href={`https://www.youtube.com/watch?v=${song.videoId}`}>공식 영상 ↗</a></div>
    {running && <p role="status">{song.status === "generating" ? "가사에서 단어와 일상 대화를 만들고 있어요…" : "자료 생성 완료. JEV가 정확성과 학습 가치를 평가하고 있어요…"}</p>}
    {song.error && <p role="alert">{song.error}</p>}
    {interrupted && <p>완료 응답을 받지 못했어요. 보관된 자료가 있으면 평가부터 다시 이어갈 수 있어요.</p>}
    {song.status === "published" && <p>학습 앱에서 {song.publishedIndices?.length}개 구간을 이용할 수 있어요. <a href={musicStudyHref(learningHref, song)} target="_blank" rel="noopener noreferrer">앱에서 이 곡 학습 ↗</a></p>}
    <div className="hm-row">{["draft", "error"].includes(song.status) || interrupted ? <button className="hm-primary" disabled={busy || running} onClick={() => void action("generate", "생성과 JEV 평가를 마쳤어요. 아래 구간을 검수한 후 게시해 주세요.")}>{song.units ? "JEV 평가 다시 시도" : "AI 자료 만들기"}</button> : null}
      <button disabled={busy || running} onClick={onEdit}>원문·곡 정보 수정</button>
      {song.status === "published" && <button disabled={busy} onClick={() => void action("unpublish", "앱에서 곡을 내렸어요. 새 학습과 저장 요청은 차단돼요. 이미 개인 보관함에 저장한 표현은 유지돼요.")}>앱에서 게시 내리기</button>}</div>
    {song.units && <details open={song.status === "review"}><summary>학습 자료 {song.units.length}개 확인{song.judgments ? ` · 제외 ${song.judgments.filter(j => j.disposition === "excluded").length}개` : " · JEV 평가 미완료"}</summary>
      {song.units.map((u, i) => <section className="music-review-unit" key={u.sourceIndex}>
        {song.status === "review" && <label className="music-check"><input type="checkbox" disabled={busy || song.judgments?.[i]?.disposition === "excluded"} checked={selected.includes(i)} onChange={e => { setReviewed(false); setSelected(e.target.checked ? [...selected, i] : selected.filter(n => n !== i)); }} />{i + 1}번 구간 게시</label>}
        <p className="hm-muted">{song.judgments?.[i]?.reason ?? "평가 전"}</p>
        <p lang={song.language}><b>{u.line.text}</b></p><p>{u.line.reading} · {u.line.meaning}</p>
        <p><b>단어</b> {u.lesson.word.text} / {u.lesson.word.reading} / {u.lesson.word.meaning}</p><p>{u.lesson.note}</p>
        <p><b>{u.lesson.situation}</b></p><p>친구: {u.lesson.question.text}<br />{u.lesson.question.reading} · {u.lesson.question.meaning}</p><p>답변: {u.lesson.answer.text}<br />{u.lesson.answer.reading} · {u.lesson.answer.meaning}</p>
      </section>)}
      {song.status === "review" && <div className="music-publish"><p>선택한 {selected.length}개 구간이 앱에 나타나요. 제외된 구간은 게시할 수 없어요. 부정확한 구간은 선택에서 빼거나 원문을 수정한 뒤 다시 생성해 주세요.</p>
        <label className="music-check"><input type="checkbox" checked={reviewed} disabled={busy} onChange={e => setReviewed(e.target.checked)} />선택한 가사·단어·회화의 뜻과 발음, 사용권을 검수했어요. 확신이 낮은 구간도 직접 확인했어요.</label>
        <button className="hm-primary" disabled={busy || !reviewed || selected.length < 2} onClick={() => void action("publish", "앱에 게시했어요. 해당 언어의 음악 목록에서 바로 학습할 수 있어요.", { indices: selected, reviewed })}>선택한 {selected.length}개 구간 앱에 게시</button>
      </div>}
    </details>}
  </article>;
}
