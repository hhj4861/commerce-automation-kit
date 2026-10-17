"use client";
import { useRef, useState } from "react";
import { formatCueTime, parseMusicSource, timedSource } from "@/lib/music-source";
import { MusicPlayback, type MusicPlaybackHandle } from "./music-playback";

export function MusicTimingEditor({ source, videoId, onApply, active = true }: { active?: boolean; source: string; videoId: string; onApply: (source: string) => void }) {
  const [rows, setRows] = useState<{ text: string; start: string; end: string }[]>([]);
  const [error, setError] = useState("");
  const [time, setTime] = useState(0);
  const player = useRef<MusicPlaybackHandle>(null);
  function load() {
    try { setRows(parseMusicSource(source).map(l => ({ text: l.text, start: l.startSeconds?.toString() ?? "", end: l.endSeconds?.toString() ?? "" }))); setError(""); }
    catch (e) { setError(e instanceof Error ? e.message : "원문을 확인해 주세요."); }
  }
  function update(index: number, field: "start" | "end", value: string) { setRows(previous => previous.map((r, i) => i === index ? { ...r, [field]: value } : r)); }
  return <details className="hm-timing"><summary>가사 시간 맞추기</summary>
    <p>원문을 불러온 뒤 영상을 듣고 줄마다 시작·끝을 찍으세요. 시간은 초 단위로 직접 고칠 수도 있어요.</p>
    <button type="button" onClick={load}>원문에서 줄 불러오기</button>
    {rows.length > 0 && <>
      {active && /^[\w-]{11}$/.test(videoId) && <MusicPlayback ref={player} videoId={videoId} title="시간 편집" onTime={setTime} />}
      <p>현재 재생 위치 <output aria-label="현재 재생 위치">{formatCueTime(time)}</output></p>
      <ol className="hm-timing-lines">{rows.map((row, i) => <li key={i}>
        <p>{i + 1}. {row.text}</p><div className="hm-timing-inputs">
          <label>시작 (초)<input aria-label={`${i + 1}번 줄 시작 (초)`} type="number" min={0} max={3600} step="0.001" value={row.start} onChange={e => update(i, "start", e.target.value)} /></label>
          <button type="button" onClick={() => update(i, "start", player.current?.time().toFixed(3) ?? "0")}>현재 위치를 {i + 1}번 시작으로</button>
          <label>끝 (초)<input aria-label={`${i + 1}번 줄 끝 (초)`} type="number" min={0} max={3600} step="0.001" value={row.end} onChange={e => update(i, "end", e.target.value)} /></label>
          <button type="button" onClick={() => update(i, "end", player.current?.time().toFixed(3) ?? "0")}>현재 위치를 {i + 1}번 끝으로</button>
          <button type="button" disabled={!row.start || !row.end || Number(row.end) <= Number(row.start)} onClick={() => player.current?.play(Number(row.start), Number(row.end))}>{i + 1}번 구간 확인</button>
        </div>
      </li>)}</ol>
      <button type="button" onClick={() => {
        try { const next = timedSource(rows.map(r => ({ text: r.text, startSeconds: r.start === "" ? undefined : Number(r.start), endSeconds: r.end === "" ? undefined : Number(r.end) }))); player.current?.pause(); onApply(next); }
        catch (e) { setError(e instanceof Error ? e.message : "시간을 확인해 주세요."); }
      }}>시간을 원문에 적용</button>
      <p>적용 후 ‘새 원문 버전 저장’을 눌러야 보관돼요. 다시 생성·검수한 구간이 학습 앱에 반영돼요.</p>
    </>}
    {error && <p role="alert">{error}</p>}
  </details>;
}
