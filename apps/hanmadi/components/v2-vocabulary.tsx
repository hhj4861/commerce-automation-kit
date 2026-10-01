"use client";
import { useEffect, useRef, useState } from "react";
import type { Phrase, StudyLanguage, StudyState } from "@/lib/v2";
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
  const [selection, setSelection] = useState("");
  const [word, setWord] = useState("");
  useEffect(() => {
    const changed = () => {
      const selected = window.getSelection();
      if (selected && !selected.isCollapsed && textRef.current?.contains(selected.anchorNode) && textRef.current.contains(selected.focusNode))
        setSelection(selected.toString().trim());
      else setSelection("");
    };
    document.addEventListener("selectionchange", changed);
    return () => document.removeEventListener("selectionchange", changed);
  }, []);
  function open(text: string, trigger: HTMLElement) {
    trigger.focus({ preventScroll: true });
    window.getSelection()?.removeAllRanges();
    setSelection(""); setWord(text);
  }
  return <>
    <p className="hm-native hm-word-sentence" lang={language} ref={textRef}>
      {wordSegments(phrase.text, language).map(part => part.word ?
        <button type="button" className="hm-word" key={part.index} aria-label={`${part.text} 뜻 보기`}
          onClick={event => { if (!window.getSelection()?.toString().trim()) open(part.text, event.currentTarget); }}>{part.text}</button> :
        <span key={part.index}>{part.text}</span>)}
    </p>
    <small className="hm-muted">단어를 누르거나 길게 눌러 범위를 선택하면 뜻을 볼 수 있어요.</small>
    {selection && <div className="hm-selection-action">
      {selection.length <= 80 ? <button className="hm-soft" onPointerDown={e => e.preventDefault()} onClick={event => open(selection, event.currentTarget)}>선택한 표현 뜻 보기</button> :
        <span role="status">80자 이내로 선택해 주세요.</span>}
    </div>}
    {word && <Dialog title="단어 뜻" onClose={() => setWord("")}>
      <Definition key={language + word} text={word} sentence={phrase.text} language={language} onSaved={onSaved} />
    </Dialog>}
  </>;
}
