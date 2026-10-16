"use client";
import { useRef, useState } from "react";
import type { MediaSource } from "@/lib/media-source";
import type { MusicCaptionTrack } from "@/lib/youtube-music";
export function MediaCaptionImport({ source, disabled, onImport }: { source: MediaSource; disabled: boolean; onImport: (raw: string) => void }) {
  const [tracks, setTracks] = useState<MusicCaptionTrack[] | null>(null), [trackId, setTrackId] = useState("");
  const [item, setItem] = useState<{ id: string; revision: number } | null>(null), [busy, setBusy] = useState(false), [error, setError] = useState("");
  const lock = useRef(false);
  async function work(body: Record<string, unknown>) {
    const response = await fetch("/api/study/admin/music", { method: "POST", cache: "no-store", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), signal: AbortSignal.timeout(35000) });
    const data = await response.json(); if (!response.ok) throw new Error(data.error || "자막을 가져오지 못했어요."); return data;
  }
  async function run(action: () => Promise<void>) {
    if (lock.current || disabled) return; lock.current = true; setBusy(true); setError("");
    try { await action(); } catch (e) { setError(e instanceof Error ? e.message : "자막 연결을 확인해 주세요."); } finally { lock.current = false; setBusy(false); }
  }
  return <details className="hm-panel"><summary>YouTube 자막 가져오기</summary><p>연결한 채널이 수정할 수 있는 영상만 가져올 수 있어요. 다른 영상은 사용권 있는 자막 파일을 등록하세요.</p>
    <button type="button" disabled={disabled || busy} onClick={() => void run(async () => { const { item: video } = await work({ action: "collection-add", video: source.videoId, language: source.language }); setItem(video); const data = await work({ action: "collection-tracks", id: video.id }); setTracks(data.tracks); setTrackId(data.tracks[0]?.id ?? ""); })}>YouTube 자막 확인</button>
    {tracks && !tracks.length && <p>가져올 수 있는 자막이 없어요. 원문 파일을 연결해 주세요.</p>}
    {!!tracks?.length && <><label>가져올 자막<select value={trackId} disabled={disabled || busy} onChange={e => setTrackId(e.target.value)}>{tracks.map(track => <option key={track.id} value={track.id}>{track.language} · {track.name || "기본 자막"}</option>)}</select></label><button type="button" disabled={disabled || busy || !item || !trackId} onClick={() => void run(async () => { const data = await work({ action: "collection-import", id: item!.id, revision: item!.revision, trackId }); setItem(data.item); onImport(data.item.source); })}>선택한 자막 가져오기</button></>}
    {error && <p role="alert">{error}</p>}
  </details>;
}
