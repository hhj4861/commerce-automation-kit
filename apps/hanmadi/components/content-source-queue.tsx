"use client";
import { useEffect, useState } from "react";
import type { MediaDetail, MediaPurpose, MediaSummary } from "@/lib/media-source";
import { studyLanguages } from "@/lib/v2";
export async function mediaRequest(body?: Record<string, unknown>, id?: string) {
  const response = await fetch("/api/study/admin/media" + (id ? `?id=${encodeURIComponent(id)}` : ""), { method: body ? "POST" : "GET", cache: "no-store", headers: body ? { "Content-Type": "application/json" } : {}, body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(35000) });
  const data = await response.json(); if (!response.ok) throw new Error(data.error || "준비한 자료를 불러오지 못했어요."); return data;
}
export function ContentSourceQueue({ purpose, disabled, onSelect, onPrepare }: { purpose: MediaPurpose; disabled: boolean; onSelect: (detail: MediaDetail, purpose: MediaPurpose) => void; onPrepare: () => void }) {
  const [sources, setSources] = useState<MediaSummary[] | null>(null), [error, setError] = useState(""), [loading, setLoading] = useState(false);
  useEffect(() => { let live = true; void mediaRequest().then(data => { if (live) setSources(data.sources); }).catch(e => { if (live) setError(e.message); }); return () => { live = false; }; }, []);
  return <section className="hm-panel ks-source-queue" aria-label="준비한 콘텐츠"><h2>콘텐츠 준비에서 가져오기</h2>
    <p>같은 영상과 원문을 이어서 사용해요. 자료 생성과 게시에는 각각 확인이 필요해요.</p>
    {error && <p role="alert">{error}</p>}{!sources && !error && <p role="status">준비함을 불러오는 중이에요.</p>}
    {sources && !sources.some(s => s.purposes.includes(purpose)) && <p>준비한 {purpose === "music" ? "음악" : "회화"} 영상이 없어요.</p>}
    <ul>{sources?.filter(s => s.purposes.includes(purpose)).map(source => <li key={source.id}><div><strong>{source.title}</strong><p>{studyLanguages[source.language].name} · {source.originalCount ? `원문 ${source.originalCount}개 버전` : "영상 정보만 준비됨"}</p></div><button disabled={disabled || loading || (purpose === "music" && source.job?.status !== "ready")} onClick={async () => {
      setLoading(true); setError(""); try { onSelect(await mediaRequest(undefined, source.id), purpose); } catch (e) { setError(e instanceof Error ? e.message : "다시 불러와 주세요."); } finally { setLoading(false); }
    }}>이 자료로 {purpose === "music" ? "음악" : "회화"} 준비</button>{purpose === "music" && source.job?.status !== "ready" && <small>콘텐츠 준비에서 원문을 저장하고 정리를 완료해 주세요.</small>}</li>)}</ul>
    <button disabled={disabled || loading} onClick={onPrepare}>콘텐츠 준비로 이동</button></section>;
}
