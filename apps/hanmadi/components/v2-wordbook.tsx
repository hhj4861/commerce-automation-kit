"use client";
import { useEffect, useState } from "react";
import { studyLanguages, type Expression, type StudyLanguage } from "@/lib/v2";
import { Speaker } from "./v2-speaker";

function WordCard({ word, language, busy, onReview, onRemove }: {
  word: Expression; language: StudyLanguage; busy: boolean;
  onReview: (id: string, confidence: "help" | "alone") => void;
  onRemove: (id: string) => void;
}) {
  const [meaningVisible, setMeaningVisible] = useState(true);
  return <article className="hm-expression hm-word-card" aria-label={word.text}>
    <p className="hm-native" lang={language}>{word.text}</p>
    <p className="hm-reading">{word.reading}</p>
    <button className="hm-word-meaning-toggle" aria-expanded={meaningVisible} onClick={() => setMeaningVisible(v => !v)}>
      {meaningVisible ? "뜻 가리기" : "뜻 보기"}
    </button>
    {meaningVisible && <p>{word.meaning}</p>}
    <Speaker text={word.text} language={language} />
    <p className="hm-muted">{word.practicedAt ? `다음 복습 ${new Date(word.dueAt).toLocaleDateString("ko-KR")}` : "아직 복습 전이에요"}</p>
    <div className="hm-row hm-word-review">
      <button disabled={busy} onClick={() => onReview(word.id, "help")}>아직 헷갈려요</button>
      <button className="hm-primary" disabled={busy} onClick={() => onReview(word.id, "alone")}>기억나요</button>
    </div>
    <button className="hm-word-remove" disabled={busy} aria-label={`${word.text} 단어장에서 삭제`} onClick={() => onRemove(word.id)}>단어장에서 삭제</button>
  </article>;
}
export function Wordbook({ language, words, busy, onStudy, onReview, onRemove }: {
  language: StudyLanguage; words: Expression[]; busy: boolean; onStudy: () => void;
  onReview: (id: string, confidence: "help" | "alone") => void; onRemove: (id: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [onlyDue, setOnlyDue] = useState(false);
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 60000);
    return () => clearInterval(timer);
  }, []);
  const due = words.filter(word => word.dueAt <= now);
  const normalized = query.normalize("NFKC").trim().toLocaleLowerCase();
  const visible = (onlyDue ? due : words).filter(word =>
    [word.text, word.meaning, word.reading].some(value => value.normalize("NFKC").toLocaleLowerCase().includes(normalized)),
  ).toSorted((a, b) => b.createdAt - a.createdAt);
  return <section className="hm-wordbook">
    <div className="hm-page-heading"><h1>내가 모은 단어,<br />나의 단어장.</h1>
      <p>{studyLanguages[language].name} {words.length}개 · 오늘 복습 {due.length}개</p></div>
    {!words.length ? <section className="hm-panel">
      <h2>첫 단어를 모아 볼까요?</h2><p>스터디에서 단어를 누른 뒤 ‘단어장에 저장’을 눌러 주세요. 직접 저장한 단어만 여기에 모여요.</p>
      <button className="hm-primary" onClick={onStudy}>스터디에서 단어 찾기</button>
    </section> : <>
      <label className="hm-word-search">단어 검색<input type="search" value={query} onChange={e => setQuery(e.target.value)} placeholder="단어, 한국어 뜻 또는 발음" /></label>
      <div className="hm-row hm-word-filters" aria-label="단어장 보기">
        <button aria-pressed={!onlyDue} onClick={() => setOnlyDue(false)}>전체 {words.length}</button>
        <button aria-pressed={onlyDue} onClick={() => setOnlyDue(true)}>오늘 복습 {due.length}</button>
      </div>
      <p role="status" className="hm-muted">{visible.length ? `${visible.length}개 단어` : normalized ? "검색 결과가 없어요." : "오늘 복습을 마쳤어요. 전체에서 언제든 다시 볼 수 있어요."}</p>
      <div className="hm-grid">{visible.map(word => <WordCard key={word.id} word={word} language={language} busy={busy} onReview={onReview} onRemove={onRemove} />)}</div>
    </>}
  </section>;
}
