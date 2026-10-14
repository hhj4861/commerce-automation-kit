"use client";
import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from "react";
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

/** A small action bubble follows the first selected line and stays inside the sentence width. */
function SelectionTip({ frameRef, textRef, text, onOpen, onDismiss }: {
  frameRef: RefObject<HTMLDivElement | null>; textRef: RefObject<HTMLParagraphElement | null>;
  text: string; onOpen: (text: string, trigger: HTMLElement) => void; onDismiss: () => void;
}) {
  const tipRef = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const frame = frameRef.current, sentence = textRef.current, tip = tipRef.current;
    if (!frame || !sentence || !tip) return;
    const position = () => {
      const selected = window.getSelection();
      const original = selected && !selected.isCollapsed && sentence.contains(selected.anchorNode) && sentence.contains(selected.focusNode);
      const anchor = original ? selected.getRangeAt(0).getClientRects()[0] : sentence.querySelector("mark")?.getClientRects()[0];
      if (!anchor) { tip.style.visibility = "hidden"; return; }
      const box = frame.getBoundingClientRect();
      const half = tip.offsetWidth / 2;
      const center = anchor.left + anchor.width / 2 - box.left;
      const clamped = Math.max(half, Math.min(box.width - half, center));
      tip.style.left = `${clamped}px`;
      tip.style.setProperty("--hm-tip-anchor", `${Math.max(8, Math.min(tip.offsetWidth - 8, center - clamped + half))}px`);
      tip.style.top = `${Math.max(tip.offsetHeight + 4, anchor.top - box.top) - 4}px`;
      tip.style.visibility = "visible";
    };
    position();
    const observer = new ResizeObserver(position); observer.observe(frame); observer.observe(tip);
    document.addEventListener("selectionchange", position);
    window.addEventListener("resize", position);
    return () => { observer.disconnect(); document.removeEventListener("selectionchange", position); window.removeEventListener("resize", position); };
  }, [frameRef, textRef, text]);
  useEffect(() => {
    const dismiss = (event: KeyboardEvent) => {
      if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); onDismiss(); }
    };
    document.addEventListener("keydown", dismiss, true);
    return () => document.removeEventListener("keydown", dismiss, true);
  }, [onDismiss]);
  return <div className="hm-selection-tip" role="group" aria-label="단어 선택 안내" ref={tipRef}>
    <button type="button" aria-label="선택한 표현 뜻 보기" onPointerDown={event => event.preventDefault()}
      onClick={event => onOpen(text, event.currentTarget)}>뜻 보기</button>
    <button type="button" aria-label="선택 안내 닫기" onClick={onDismiss}>×</button>
  </div>;
}

export function Vocabulary({ phrase, language, onSaved }: {
  phrase: Phrase; language: StudyLanguage; onSaved?: (state: StudyState) => void;
}) {
  const frameRef = useRef<HTMLDivElement>(null);
  const textRef = useRef<HTMLParagraphElement>(null);
  const [tipDismissed, setTipDismissed] = useState(false);
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
      if (original) setTipDismissed(false);
      const meaning = meaningRef.current;
      if (!selected || selected.isCollapsed || !meaning?.contains(selected.anchorNode) || !meaning.contains(selected.focusNode)) return;
      const range = selected.getRangeAt(0);
      const prefix = range.cloneRange(); prefix.selectNodeContents(meaning); prefix.setEnd(range.startContainer, range.startOffset);
      const raw = selected.toString(), text = raw.trim();
      const start = prefix.toString().length + raw.length - raw.trimStart().length;
      const key = start + ":" + text;
      setTipDismissed(false);
      if (key === lastKey) return;
      lastKey = key;
      clearTimeout(timer); controller?.abort(); setMatch(null);
      if (!text || text.length > 80) { setAlignmentStatus("한국어 뜻을 80자 이내로 선택해 주세요."); return; }
      const show = (value: MeaningMatch | null) => {
        setMatch(value);
        setAlignmentStatus(value ? "" : "정확히 대응하는 원문을 찾지 못했어요. 더 짧은 범위로 선택해 주세요.");
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
    const focusTarget = trigger.closest(".hm-selection-tip")
      ? textRef.current?.querySelector<HTMLElement>(".hm-word-aligned") ?? textRef.current?.querySelector<HTMLElement>(".hm-word")
      : trigger;
    focusTarget?.focus({ preventScroll: true });
    window.getSelection()?.removeAllRanges();
    setTipDismissed(true); setSelection(""); setWord(text);
  }
  const tipText = selection || match?.text || "";
  return <>
    <div className="hm-word-frame" ref={frameRef}>
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
              const selected = window.getSelection();
              // Dragging the original still selects a range, even on an aligned word.
              if (selected?.toString().trim() && textRef.current?.contains(selected.anchorNode)) return;
              if (highlighted) open(match!.text, event.currentTarget);
              else if (!selected?.toString().trim()) open(part.text, event.currentTarget);
            }}>{content}</button> : <span key={part.index}>{part.text}</span>;
      })}
    </p>
    {tipText && tipText.length <= 80 && !word && !tipDismissed &&
      <SelectionTip frameRef={frameRef} textRef={textRef} text={tipText} onOpen={open} onDismiss={() => setTipDismissed(true)} />}
    </div>
    {selection.length > 80 && <small role="status">80자 이내로 선택해 주세요.</small>}
    <p className="hm-reading">{phrase.reading}</p>
    <p className="hm-meaning-selectable" lang="ko" ref={meaningRef}>{phrase.meaning}</p>
    <details className="hm-word-help"><summary>단어 도움말</summary>
      <p>원문을 누르면 뜻을 볼 수 있어요. 한국어 뜻을 두 번 누르거나 길게 눌러 선택하면 해당 원문을 강조해요.</p>
    </details>
    {alignmentStatus && <p className="hm-alignment-status" role="status">{alignmentStatus}</p>}
    {word && <Dialog title="단어 뜻" onClose={() => setWord("")}>
      <Definition key={language + word} text={word} sentence={phrase.text} language={language} onSaved={onSaved} />
    </Dialog>}
  </>;
}
