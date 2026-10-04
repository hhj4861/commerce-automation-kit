"use client";
import { useEffect, useRef, useState } from "react";
import type { Phrase, StudyLanguage, StudyState } from "@/lib/v2";
import type { MeaningMatch } from "@/lib/vocabulary";
import { wordSegments } from "@/lib/word-segments";
import { Dialog } from "./v2-dialog";
import { Speaker } from "./v2-speaker";

function Definition({ text, sentence, language, onSaved }: {
  text: string; sentence: string; language: StudyLanguage;
  onSaved?: (state: StudyState) => void;
}) {
  const [phrase, setPhrase] = useState<Phrase | null>(null);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    void (async () => {
      try {
        const res = await fetch("/api/study", { method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "lookup-word", language, text, sentence }),
          signal: AbortSignal.any([controller.signal, AbortSignal.timeout(45000)]) });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "단어 뜻을 불러오지 못했어요.");
        if (!controller.signal.aborted) setPhrase(data.phrase);
      } catch (e) {
        if (!controller.signal.aborted) setError(e instanceof Error ? e.message : "다시 시도해 주세요.");
      }
    })();
    return () => controller.abort();
  }, [text, sentence, language, attempt]);
  async function save() {
    if (!phrase || saving || saved) return;
    setSaving(true); setError("");
    try {
      const res = await fetch("/api/study", { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "save-word", language, phrase }), signal: AbortSignal.timeout(15000) });
      const data = await res.json();
      if (!res.ok || !data.saved) throw new Error(data.error || "저장하지 못했어요. 다시 시도해 주세요.");
      onSaved?.(data.state); setSaved(true);
    } catch (e) { setError(e instanceof Error ? e.message : "저장하지 못했어요."); }
    finally { setSaving(false); }
  }
  return <div className="hm-word-definition">
    <p className="hm-native" lang={language}>{text}</p>
    {!phrase && !error && <p role="status">문장에 맞는 뜻을 찾고 있어요…</p>}
    {phrase && <><p className="hm-reading">{phrase.reading}</p><p>{phrase.meaning}</p>
      <Speaker text={text} language={language} />
      <p><button className="hm-primary" disabled={saving || saved} onClick={() => void save()}>
        {saved ? "단어장에 저장했어요" : saving ? "저장 중…" : "단어장에 저장"}
      </button></p></>}
    {error && <p role="alert">{error}</p>}
    {error && !phrase && <button onClick={() => { setError(""); setAttempt(n => n + 1); }}>다시 시도</button>}
    <small className="hm-muted">AI가 문맥에 맞게 설명해요. 저장한 단어는 하단 단어장 메뉴에서 복습할 수 있어요.</small>
  </div>;
}

export function Vocabulary({ phrase, language, onSaved }: {
  phrase: Phrase; language: StudyLanguage; onSaved?: (state: StudyState) => void;
}) {
  const textRef = useRef<HTMLParagraphElement>(null);
  const meaningRef = useRef<HTMLParagraphElement>(null);
  const [match, setMatch] = useState<MeaningMatch | null>(null);
  const [alignmentStatus, setAlignmentStatus] = useState("");
  const [selection, setSelection] = useState("");
  const [word, setWord] = useState("");
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    let controller: AbortController | undefined;
    let lastKey = "";
    const cache = new Map<string, MeaningMatch | null>();
    const changed = () => {
      const selected = window.getSelection();
      const original = selected && !selected.isCollapsed && textRef.current?.contains(selected.anchorNode) && textRef.current.contains(selected.focusNode);
      setSelection(original ? selected.toString().trim() : "");
      const meaning = meaningRef.current;
      if (!selected || selected.isCollapsed || !meaning?.contains(selected.anchorNode) || !meaning.contains(selected.focusNode)) return;
      const range = selected.getRangeAt(0);
      const prefix = range.cloneRange(); prefix.selectNodeContents(meaning); prefix.setEnd(range.startContainer, range.startOffset);
      const raw = selected.toString(), text = raw.trim();
      const start = prefix.toString().length + raw.length - raw.trimStart().length;
      const key = start + ":" + text;
      if (key === lastKey) return;
      lastKey = key;
      clearTimeout(timer); controller?.abort(); setMatch(null);
      if (!text || text.length > 80) { setAlignmentStatus("한국어 뜻을 80자 이내로 선택해 주세요."); return; }
      const show = (value: MeaningMatch | null) => {
        setMatch(value);
        setAlignmentStatus(value ? `‘${text}’에 해당하는 원문을 눌러 뜻을 보세요.` : "정확히 대응하는 원문을 찾지 못했어요. 더 짧은 범위로 선택해 주세요.");
      };
      if (cache.has(key)) { show(cache.get(key)!); return; }
      setAlignmentStatus("대응하는 원문을 찾고 있어요…");
      const request = new AbortController(); controller = request;
      timer = setTimeout(() => { void (async () => {
        try {
          const res = await fetch("/api/study", { method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action: "align-meaning", language, text, start, meaning: phrase.meaning, sentence: phrase.text }),
            signal: AbortSignal.any([request.signal, AbortSignal.timeout(45000)]) });
          const data = await res.json();
          if (!res.ok) throw new Error(data.error || "원문을 찾지 못했어요. 다시 선택해 주세요.");
          if (request.signal.aborted) return;
          const value = data.match as MeaningMatch | null;
          if (value !== null && (!value || !Number.isInteger(value.start) || !Number.isInteger(value.end) || value.start < 0 || value.end <= value.start || phrase.text.slice(value.start, value.end) !== value.text))
            throw new Error("원문을 확인하지 못했어요. 다시 선택해 주세요.");
          if (cache.size >= 32) cache.delete(cache.keys().next().value!);
          cache.set(key, value); show(value);
        } catch (e) {
          if (!request.signal.aborted) { lastKey = ""; setAlignmentStatus(e instanceof Error ? e.message : "다시 선택해 주세요."); }
        }
      })(); }, 450);
    };
    document.addEventListener("selectionchange", changed);
    return () => { document.removeEventListener("selectionchange", changed); clearTimeout(timer); controller?.abort(); };
  }, [language, phrase.text, phrase.meaning]);
  function open(text: string, trigger: HTMLElement) {
    trigger.focus({ preventScroll: true });
    window.getSelection()?.removeAllRanges();
    setSelection(""); setWord(text);
  }
  return <>
    <p className="hm-native hm-word-sentence" lang={language} ref={textRef}>
      {wordSegments(phrase.text, language).map(part => {
        const from = Math.max(part.index, match?.start ?? Infinity);
        const to = Math.min(part.index + part.text.length, match?.end ?? -1);
        const highlighted = from < to;
        const content = highlighted ? <>{part.text.slice(0, from - part.index)}<mark>{part.text.slice(from - part.index, to - part.index)}</mark>{part.text.slice(to - part.index)}</> : part.text;
        return part.word || highlighted ?
          <button type="button" className={`hm-word${highlighted ? " hm-word-aligned" : ""}`} key={part.index}
            aria-label={`${highlighted ? match!.text : part.text} 뜻 보기`}
            onClick={event => {
              if (highlighted) open(match!.text, event.currentTarget);
              else if (!window.getSelection()?.toString().trim()) open(part.text, event.currentTarget);
            }}>{content}</button> : <span key={part.index}>{part.text}</span>;
      })}
    </p>
    <small className="hm-muted">단어를 누르거나 길게 눌러 범위를 선택하면 뜻을 볼 수 있어요.</small>
    {selection && <div className="hm-selection-action">
      {selection.length <= 80 ? <button className="hm-soft" onPointerDown={e => e.preventDefault()} onClick={event => open(selection, event.currentTarget)}>선택한 표현 뜻 보기</button> :
        <span role="status">80자 이내로 선택해 주세요.</span>}
    </div>}
    <p className="hm-reading">{phrase.reading}</p>
    <p className="hm-meaning-selectable" lang="ko" ref={meaningRef}>{phrase.meaning}</p>
    <small className="hm-muted">한국어 뜻을 두 번 누르거나 길게 눌러 선택하면 해당 원문을 찾아줘요.</small>
    {alignmentStatus && <p className="hm-alignment-status" role="status">{alignmentStatus}</p>}
    {word && <Dialog title="단어 뜻" onClose={() => setWord("")}>
      <Definition key={language + word} text={word} sentence={phrase.text} language={language} onSaved={onSaved} />
    </Dialog>}
  </>;
}
