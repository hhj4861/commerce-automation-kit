"use client";
import { useEffect, useRef, useState } from "react";
import { studyLanguages, type StudyLanguage } from "@/lib/v2";
import type { MediaDetail, MediaSummary } from "@/lib/media-source";

type Data = Partial<MediaDetail> & { sources?: MediaSummary[]; legacyMusic?: { id: string; title: string; language: StudyLanguage }[] };
async function api(body?: Record<string, unknown>, id?: string, signal?: AbortSignal): Promise<Data> {
  const response = await fetch("/api/study/admin/media" + (id ? `?id=${encodeURIComponent(id)}` : ""), {
    method: body ? "POST" : "GET", cache: "no-store", headers: body ? { "Content-Type": "application/json" } : {},
    body: body ? JSON.stringify(body) : undefined, signal: signal ?? AbortSignal.timeout(35000),
  });
  const data = await response.json(); if (!response.ok) throw new Error(data.error || "원문을 처리하지 못했어요."); return data;
}
const statuses = { queued: "처리 대기", running: "처리 중", ready: "원문 정리 완료", failed: "처리 실패 · 재개 가능", cancelled: "작업 취소됨" };
const outcomes = { ready: "완료", failed: "실패", interrupted: "연결 중단", cancelled: "취소" };
const stages = { validate: "원문 확인", normalize: "줄·시간 정리", ready: "정리 완료" };
export function MediaAdmin() {
  const [list, setList] = useState<Data>({}), [detail, setDetail] = useState<Data>({});
  const [selected, setSelected] = useState(""), [busy, setBusy] = useState(false), [error, setError] = useState(""), [notice, setNotice] = useState("");
  const [title, setTitle] = useState(""), [video, setVideo] = useState(""), [language, setLanguage] = useState<StudyLanguage>("ja"), [purpose, setPurpose] = useState("study");
  const pending = useRef(false), selection = useRef(0), registration = useRef<HTMLDetailsElement>(null);
  useEffect(() => { const controller = new AbortController(); void api(undefined, undefined, controller.signal).then(setList).catch(e => { if (!controller.signal.aborted) setError(e.message); }); return () => controller.abort(); }, []);
  async function choose(id: string) {
    const epoch = ++selection.current; setSelected(id); setDetail({}); setError("");
    try { const data = await api(undefined, id); if (epoch === selection.current) setDetail(data); }
    catch (e) { if (epoch === selection.current) setError(e instanceof Error ? e.message : "원문을 불러오지 못했어요."); }
  }
  async function work(body: Record<string, unknown>, message: string) {
    if (pending.current) return false;
    pending.current = true; setBusy(true); setError(""); setNotice(""); ++selection.current;
    try {
      const data = await api(body);
      if (data.source) { setSelected(data.source.id); setDetail(data); }
      else if (body.action === "delete") { setSelected(""); setDetail({}); }
      setList(await api()); setNotice(message); return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : "처리하지 못했어요. 상태를 다시 불러와 주세요.");
      if (selected) try { setDetail(await api(undefined, selected)); } catch { /* Keep the visible error and previous input. */ }
      return false;
    } finally { pending.current = false; setBusy(false); }
  }
  return <section className="ma" aria-label="공통 원문·작업 관리">
    <div className="ma-heading"><div><h2>원문과 처리 이력을 한곳에서</h2>
    <p>사용 허용된 자막·원문을 버전별로 보관해요. 여기서 정리를 마쳐도 수업·음악 자료가 자동 생성되거나 게시되지는 않아요.</p></div><button disabled={busy} onClick={() => { void api().then(setList).then(() => { if (selected) return choose(selected); }).catch(e => setError(e.message)); }}>원문 목록 새로고침</button></div>
    {error && <p role="alert" className="hm-alert">{error}</p>}{notice && <p role="status" className="hm-notice">{notice}</p>}
    <details ref={registration} className="hm-panel ma-register"><summary>새 원본 등록</summary><form onSubmit={e => { e.preventDefault(); void work({ action: "collect", title, video, language, purposes: purpose === "both" ? ["study", "music"] : [purpose] }, "원본을 등록했어요. 원문을 연결해 주세요."); }}>
      <fieldset disabled={busy} className="music-fields"><label>원본 제목<input required maxLength={100} value={title} onChange={e => setTitle(e.target.value)} /></label>
        <label>YouTube 링크 또는 ID<input required value={video} onChange={e => setVideo(e.target.value)} /></label>
        <label>원문 언어<select aria-label="원문 언어" value={language} onChange={e => setLanguage(e.target.value as StudyLanguage)}>{Object.entries(studyLanguages).map(([id, l]) => <option key={id} value={id}>{l.name}</option>)}</select></label>
        <label>학습 용도<select aria-label="학습 용도" value={purpose} onChange={e => setPurpose(e.target.value)}><option value="study">스터디</option><option value="music">음악</option><option value="both">스터디와 음악</option></select></label>
        <small>직접 입력한 제목·언어예요. 이 등록은 영상 내용·자막·재생 권한의 검증이 아니에요.</small><button type="submit">원본 등록</button>
      </fieldset></form></details>
    {!!list.legacyMusic?.length && <details className="hm-panel"><summary>기존 음악 수집함 연결</summary><p>영상 정보만 연결해요. 기존 자막을 새 저장소로 복사하거나 수집함을 바꾸지 않아요.</p>{list.legacyMusic.map(item => <p key={item.id}>{item.title} · {studyLanguages[item.language].name} <button disabled={busy} onClick={() => void work({ action: "import-music", legacyId: item.id }, "기존 영상 정보를 연결했어요. 원문 보관·이용 근거를 확인해 등록해 주세요.")}>영상 정보 연결</button></p>)}</details>}
    <div className="ma-workspace">
    <aside className="ma-library" aria-label="등록한 원본 목록"><h3>등록한 원본</h3>
      {!!list.sources?.length && <label className="ma-source-select">원본 선택<select value={selected} onChange={e => void choose(e.target.value)} disabled={busy}>
        <option value="" disabled>원본을 선택하세요</option>{list.sources.map(source => <option key={source.id} value={source.id}>{source.title} · {source.job ? statuses[source.job.status] : "원문 필요"}</option>)}
      </select></label>}
      {!list.sources ? <p role="status">{error ? "목록 새로고침으로 다시 불러와 주세요." : "목록을 불러오는 중이에요."}</p> : !list.sources.length ? <div className="ma-empty"><p>등록된 공통 원문이 없어요.</p><small>영상 정보를 등록한 뒤 자막이나 원문을 연결하세요.</small><button disabled={busy} onClick={() => { if (registration.current) { registration.current.open = true; registration.current.querySelector("input")?.focus(); } }}>첫 원본 등록</button></div> : <ul>{list.sources.map(source => <li key={source.id}>
        <button disabled={busy} aria-label={`${source.title} · ${studyLanguages[source.language].name}`} aria-describedby={`media-status-${source.id}`} aria-pressed={selected === source.id} onClick={() => void choose(source.id)}><strong>{source.title} · {studyLanguages[source.language].name}</strong>
          <span>{source.originalCount}개 버전</span><span className="ma-status" id={`media-status-${source.id}`} data-status={source.job?.status ?? "empty"}>{source.job ? statuses[source.job.status] : "원문 필요"}</span>
        </button>
      </li>)}</ul>}
    </aside>
    <div className="ma-detail">
    {!selected && <div className="ma-placeholder"><h3>선택한 원문을 이곳에서 관리해요</h3><p>원본을 선택하면 보관한 버전과 처리 결과를 함께 볼 수 있어요.</p><ol><li>영상 정보 등록</li><li>원문 버전 보관</li><li>줄·시간 정리와 결과 확인</li></ol></div>}
    {selected && !detail.source && <p role="status">{error ? "목록에서 원문을 다시 선택해 주세요." : "선택한 원문을 불러오는 중이에요."}</p>}
    {detail.source && <section className="hm-panel" aria-label="선택한 원문">
      <h3>{detail.source.title}</h3><p>용도: {detail.source.purposes.map(p => p === "music" ? "음악" : "스터디").join(" · ")} · 원문 버전 {detail.source.revision}</p>
      <details className="ma-new-version" key={detail.source.id} open={detail.source.originals.length === 0}><summary>새 원문 버전 추가</summary><OriginalEditor key={`${detail.source.id}:${detail.source.revision}`} source={detail.source} busy={busy} save={body => work(body, "원문 버전과 처리 작업을 저장했어요. ‘정리·재개’로 줄과 시간을 확인해 주세요.")} /></details>
      <h4>처리 작업</h4>{!detail.jobs?.length && <p>원문을 등록하면 처리 작업이 생겨요.</p>}{detail.jobs?.slice().reverse().map(job => <article className="ma-job" data-status={job.status} key={job.id} aria-label={`원문 버전 ${job.sourceRevision} 작업`}>
        <h5>버전 {job.sourceRevision} · {statuses[job.status]}</h5><p>{stages[job.stage]} · 시도 {job.attempts.length}/5</p>
        {job.error && <p>{job.error.message}</p>}
        {job.status === "running" && <p>진행 중 작업은 중복 실행하지 않아요. 연결이 끊긴 작업은 20초 뒤 정리·재개할 수 있어요.</p>}
        {["queued", "running", "failed"].includes(job.status) && job.sourceRevision === detail.source?.revision && <>
          <button disabled={busy} onClick={() => void work({ action: "run", jobId: job.id }, "작업 상태를 갱신했어요. 정리 완료는 학습 자료 생성·게시와 별개예요.")}>정리·재개</button>
          <button disabled={busy} onClick={() => void work({ action: "cancel", jobId: job.id, revision: job.revision }, "작업을 취소했어요. 원문 버전은 유지돼요.")}>작업 취소</button>
        </>}
        {job.output && <details><summary>정리된 {job.output.cues.length}개 줄 · {job.output.timing === "timed" ? "시작·끝 시간 있음" : "읽기용 · 구간 재생 미준비"}</summary><ol>{job.output.cues.map(cue => <li key={cue.id}>{cue.startSeconds !== undefined && <small>{cue.startSeconds}~{cue.endSeconds ?? "끝 시간 없음"}초 · </small>}{cue.text}</li>)}</ol></details>}
        <details><summary>시도 이력</summary><ul>{job.attempts.map((attempt, i) => <li key={i}>{new Date(attempt.startedAt).toLocaleString()} · {attempt.outcome ? outcomes[attempt.outcome] : "진행 중"}</li>)}</ul></details>
      </article>)}
      <details><summary>보관한 원문 버전</summary>{detail.source.originals.slice().reverse().map(original => <section key={original.version}><h5>버전 {original.version}</h5><p>이용 근거: {original.rights}</p><pre style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{original.raw}</pre></section>)}</details>
      <button className="ma-delete" disabled={busy} onClick={() => { if (window.confirm("이 공통 원본의 모든 원문 버전과 처리 이력을 삭제할까요? 기존 음악 수집함·게시 자료는 유지돼요.")) void work({ action: "delete", id: detail.source!.id, revision: detail.source!.revision }, "공통 원문과 작업 이력을 삭제했어요."); }}>공통 원문·작업 삭제</button>
    </section>}
    </div></div>
  </section>;
}
function OriginalEditor({ source, busy, save }: { source: NonNullable<Data["source"]>; busy: boolean; save: (body: Record<string, unknown>) => Promise<boolean> }) {
  const [raw, setRaw] = useState(""), [rights, setRights] = useState(""), [confirmed, setConfirmed] = useState(false);
  const request = useRef("");
  return <form onSubmit={e => { e.preventDefault(); request.current ||= crypto.randomUUID(); void save({ action: "save-source", id: source.id, revision: source.revision, raw, rights, confirmed, requestId: request.current }); }}>
    <fieldset disabled={busy} className="music-fields"><p>원문은 소유자 전용 저장소에 보관해요. 최대 8개 버전이며 아래 삭제로 모두 제거할 수 있어요. 모델 재학습에는 자동 제공하지 않아요.</p>
      <label>보관할 원문<textarea required rows={7} maxLength={12000} value={raw} onChange={e => { setRaw(e.target.value); request.current = ""; }} placeholder="2~100줄의 TXT 또는 SRT·VTT·LRC를 붙여 넣어 주세요." /></label>
      <small>12,000자 · 한 줄 250자 이하. 시간이 없는 원문도 읽기용으로 보관할 수 있어요. 원문을 수정하면 새 버전의 작업을 만들어요.</small>
      <label>원문 보관·학습 이용 근거<input required minLength={10} maxLength={800} value={rights} onChange={e => { setRights(e.target.value); request.current = ""; }} placeholder="자체 제작, 이용 허락과 허용 범위 등" /></label>
      <label style={{ display: "flex", alignItems: "flex-start", gap: 8 }}><input style={{ width: "auto", marginTop: 4, flexShrink: 0 }} type="checkbox" checked={confirmed} onChange={e => setConfirmed(e.target.checked)} />이 원문을 보관하고 학습 자료 제작에 이용할 권한을 확인했어요.</label>
      <button disabled={!confirmed} type="submit">새 원문 버전 저장</button>
    </fieldset>
  </form>;
}
