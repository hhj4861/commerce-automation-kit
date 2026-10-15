"use client";
import { useEffect, useRef, useState } from "react";
import { type Expression, type StudyLanguage, type StudyState, studyLanguages, isVocabulary } from "@/lib/v2";
import { meaningChoices, vocabularyForStudy, wordPacks, type StudyWord } from "@/lib/word-study";
import { Dialog } from "./v2-dialog";
import { Speaker } from "./v2-speaker";
import { V2Icon as Icon } from "./v2-icon";
import "@/app/study/word-study.css";

type Props = {
  language: StudyLanguage; expressions: Expression[];
  onSaved: (state: StudyState) => void; onWordbook: () => void;
};
type Session = { title: string; words: StudyWord[] };

async function mutate(language: StudyLanguage, body: Record<string, unknown>) {
  const response = await fetch("/api/study", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...body, language }), signal: AbortSignal.timeout(15000),
  });
  const data = await response.json();
  if (!response.ok || !data.state || (body.action === "save-word" && !data.saved))
    throw new Error(data.error || "저장하지 못했어요. 다시 시도해 주세요.");
  return data.state as StudyState;
}

function WordStep({ word, language, quiz, choices, saved, last, onSaved, onNext }: {
  word: StudyWord; language: StudyLanguage; quiz: boolean; choices: string[];
  saved?: Expression; last: boolean;
  onSaved: Props["onSaved"]; onNext: (correct: boolean) => void;
}) {
  const [revealed, setRevealed] = useState(false);
  const [answer, setAnswer] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [reviewStored, setReviewStored] = useState(false);
  const [error, setError] = useState("");
  const heading = useRef<HTMLHeadingElement>(null);
  const revealHeading = useRef<HTMLElement>(null);
  const feedback = useRef<HTMLDivElement>(null);
  const lock = useRef(false);
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    heading.current?.focus({ preventScroll: true });
    heading.current?.scrollIntoView({ block: "nearest" });
    return () => { alive.current = false; };
  }, []);
  useEffect(() => { if (revealed) revealHeading.current?.focus(); }, [revealed]);
  useEffect(() => { if (answer !== null) feedback.current?.focus(); }, [answer]);
  async function store(body: Record<string, unknown>, review = false) {
    if (lock.current) return;
    lock.current = true; setSaving(true); setError("");
    try {
      const state = await mutate(language, body);
      // A closed lesson can belong to a previous language or signed-out account.
      if (alive.current) {
        onSaved(state);
        if (review) setReviewStored(true);
      }
    } catch (e) {
      if (alive.current) setError(e instanceof Error ? e.message : "저장하지 못했어요.");
    } finally {
      lock.current = false;
      if (alive.current) setSaving(false);
    }
  }
  function review(value: string) {
    if (saved) void store({ action: "practice", id: saved.id, confidence: value === word.meaning ? "alone" : "help" }, true);
  }
  const answered = answer !== null;
  const correct = answer === word.meaning;
  return <div className="hm-word-step">
    <p className="hm-word-instruction">{quiz ? "이 단어의 뜻은 무엇일까요?" : "먼저 소리 내어 읽어 보세요."}</p>
    <div className="hm-word-face">
      <h3 ref={heading} tabIndex={-1} lang={language}>{word.text}</h3>
      <p className="hm-reading">{word.reading}</p>
      <Speaker key={word.id} text={word.text} language={language} label="단어 듣기" />
    </div>
    {!quiz ? <>
      {!revealed ? <button className="hm-primary hm-full" onClick={() => setRevealed(true)}>뜻 확인하기</button> : <>
        <div className="hm-word-reveal" aria-live="polite">
          <strong ref={revealHeading} tabIndex={-1}>{word.meaning}</strong>
          {word.example && <div className="hm-word-example">
            <small>이렇게 써요</small>
            <p lang={language}>{word.example.text}</p>
            <p className="hm-reading">{word.example.reading}</p>
            <p>{word.example.meaning}</p>
            <Speaker text={word.example.text} language={language} label="예문 듣기" />
          </div>}
        </div>
        <div className="hm-word-step-actions">
          <button disabled={saving || Boolean(saved)} onClick={() => void store({ action: "save-word", phrase: { text: word.text, meaning: word.meaning, reading: word.reading } })}>{saved ? "단어장에 저장됨" : saving ? "저장 중…" : "단어장에 저장"}</button>
          <button className="hm-primary" disabled={saving} onClick={() => onNext(true)}>{last ? "뜻 퀴즈 시작" : "다음 단어"}<Icon name="arrow" /></button>
        </div>
      </>}
    </> : <>
      <div className="hm-word-choices" role="group" aria-label="뜻 선택">
        {choices.map(choice => <button key={choice} disabled={answered}
          className={answered && choice === word.meaning ? "is-correct" : answered && choice === answer ? "is-wrong" : ""}
          onClick={() => { if (answer !== null) return; setAnswer(choice); review(choice); }}>
          {choice}{answered && choice === word.meaning ? <span>정답 <Icon name="check" /></span> : answered && choice === answer ? <span>내 선택</span> : null}
        </button>)}
      </div>
      {!answered && <button className="hm-word-skip" onClick={() => { setAnswer(""); review(""); }}>아직 모르겠어요</button>}
      {answered && <>
        <div ref={feedback} tabIndex={-1} className={`hm-word-feedback ${correct ? "is-correct" : "is-wrong"}`} role="status">
          <strong>{correct ? "맞았어요!" : "한 번 더 익혀 봐요."}</strong>
          <p>{word.text} = {word.meaning}</p>
          {saved && <small>{saving ? "복습 기록 저장 중…" : reviewStored ? `단어장에 기록했어요. ${correct ? "3일" : "내일"}${correct ? " 뒤" : ""} 다시 복습해요.` : "복습 기록을 아직 저장하지 못했어요."}</small>}
        </div>
        <button className="hm-primary hm-full" disabled={saving || (Boolean(saved) && !reviewStored)} onClick={() => onNext(correct)}>
          {last ? "학습 결과 보기" : "다음 문제"}<Icon name="arrow" />
        </button>
      </>}
    </>}
    {error && <div className="hm-word-error" role="alert"><p>{error}</p>
      {quiz && answer !== null && <button disabled={saving} onClick={() => review(answer)}>복습 기록 다시 저장</button>}
    </div>}
  </div>;
}

function WordSession({ session, language, expressions, onSaved, onClose, onWordbook }: Props & {
  session: Session; onClose: () => void;
}) {
  const [round, setRound] = useState(session.words);
  const [phase, setPhase] = useState<"learn" | "quiz" | "done">("learn");
  const [index, setIndex] = useState(0);
  const [missed, setMissed] = useState<StudyWord[]>([]);
  const word = round[index];
  const resultHeading = useRef<HTMLHeadingElement>(null);
  useEffect(() => { if (phase === "done") resultHeading.current?.focus(); }, [phase]);
  const vocabulary = expressions.filter(item => item.language === language && isVocabulary(item));
  const pool = [...round, ...wordPacks(language).flatMap(pack => pack.words)];
  const saved = vocabulary.find(item => item.id === word.id ||
    (item.text.normalize("NFKC").toLocaleLowerCase() === word.text.normalize("NFKC").toLocaleLowerCase() && item.meaning === word.meaning));
  function next(correct: boolean) {
    if (phase === "quiz" && !correct) setMissed(current => [...current, word]);
    if (index < round.length - 1) setIndex(index + 1);
    else if (phase === "learn") { setIndex(0); setPhase("quiz"); }
    else setPhase("done");
  }
  return <Dialog title={session.title} onClose={onClose}>
    <div className="hm-word-session">
      {phase !== "done" ? <>
        <div className="hm-word-session-progress"><div className="hm-word-session-top"><span>{phase === "learn" ? "1. 단어 익히기" : "2. 뜻 퀴즈"}</span><span>{index + 1} / {round.length}</span></div>
          <progress aria-label={phase === "learn" ? "단어 학습 진행" : "단어 퀴즈 진행"} value={index} max={round.length} />
        </div>
        <WordStep key={`${phase}:${word.id}`} word={word} language={language} quiz={phase === "quiz"}
          choices={meaningChoices(word, pool)} saved={saved} last={index === round.length - 1}
          onSaved={onSaved} onNext={next} />
      </> : <div className="hm-word-result">
        <span className="hm-word-result-icon"><Icon name="check" /></span>
        <h3 tabIndex={-1} ref={resultHeading}>단어 {round.length}개를 연습했어요.</h3>
        <p>이번 퀴즈에서 <strong>{round.length - missed.length}개 정답</strong>{missed.length ? `, ${missed.length}개는 한 번 더 보면 좋아요.` : ". 모두 기억해 냈어요!"}</p>
        {missed.length > 0 && <><ul className="hm-word-recap">{missed.map(item => <li key={item.id}><span lang={language}>{item.text}</span><span>{item.meaning}</span></li>)}</ul>
          <button className="hm-primary hm-full" onClick={() => { setRound(missed); setMissed([]); setIndex(0); setPhase("learn"); }}>헷갈린 {missed.length}개 다시 익히기</button></>}
        <div className="hm-word-step-actions"><button onClick={onClose}>다른 주제 보기</button><button onClick={onWordbook}>내 단어장 열기</button></div>
        <small>단어장에 저장한 단어의 퀴즈 결과는 다음 복습에 반영돼요.</small>
      </div>}
    </div>
  </Dialog>;
}

export function WordStudy(props: Props) {
  const { language, expressions, onWordbook } = props;
  const [session, setSession] = useState<Session | null>(null);
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 60000);
    return () => clearInterval(timer);
  }, []);
  const packs = wordPacks(language);
  const { all, due } = vocabularyForStudy(expressions, language, now);
  const review = () => setSession({ title: due.length ? "오늘의 단어 복습" : "내 단어 다시 익히기", words: (due.length ? due : all).slice(0, 5) });
  const recommended = packs[0];
  return <section className="hm-word-study" aria-label="단어 스터디">
    <div className="hm-word-study-heading"><h1>단어 하나부터,<br />말문이 트이도록.</h1><p>{studyLanguages[language].name} 단어를 소리와 예문으로 익히고,<br className="hm-word-mobile-break" /> 뜻 퀴즈로 기억을 확인해요.</p></div>
    <section className="hm-word-start">
      <div><span className="hm-word-tag">{due.length ? "내 단어 복습" : "입문 단어"}</span>
        <h2>{due.length ? "기억을 꺼낼 시간이에요." : "오늘은 카페에서 시작해 볼까요?"}</h2>
        <p>{due.length ? `복습할 ${due.length}개 중 ${Math.min(5, due.length)}개씩 가볍게 연습해요.` : "커피, 물, 메뉴… 주문에 필요한 단어 5개를 만나 보세요."}</p>
        <button className="hm-primary" onClick={() => due.length ? review() : setSession(recommended)}>{due.length ? `단어 ${Math.min(5, due.length)}개 복습` : "단어 5개 시작하기"}<Icon name="arrow" /></button>
      </div>
    </section>
    <p className="hm-word-flow">단어 익히기 <Icon name="arrow" /> 뜻 퀴즈 <Icon name="arrow" /> 헷갈린 단어 복습</p>
    <div className="hm-section-heading"><h2>어디서 써 볼까요?</h2><span>주제마다 5개</span></div>
    <div className="hm-word-packs">{packs.map(pack => <button key={pack.id} className="hm-word-pack" onClick={() => setSession(pack)}>
      <span className="hm-word-pack-icon"><Icon name={pack.icon} /></span>
      <span><strong>{pack.title}</strong><small>{pack.description}</small></span>
      <Icon name="arrow" />
    </button>)}</div>
    <section className="hm-word-personal">
      <div><h2>내가 모은 단어도 익혀요</h2><p>{all.length ? `저장한 단어 ${all.length}개 · 오늘 복습 ${due.length}개` : "마음에 드는 단어를 저장하면, 여기서 다시 연습할 수 있어요."}</p></div>
      {all.length > 0 && <button onClick={review}>{due.length ? "내 단어 복습하기" : "저장한 단어 연습"}</button>}
      <button className="hm-wordbook-link" onClick={onWordbook}>단어장 보기<Icon name="arrow" /></button>
    </section>
    {session && <WordSession {...props} session={session} onClose={() => setSession(null)} onWordbook={() => { setSession(null); onWordbook(); }} />}
  </section>;
}
