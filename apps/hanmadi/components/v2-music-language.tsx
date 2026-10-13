"use client";
import { useRef, useState } from "react";
import type { Expression, StudyState } from "@/lib/v2";
import type { PracticeSong, SongAction, SongProgress } from "@/lib/original-music";
import { musicLanguageLessons, musicConversationPrompt } from "@/lib/music-language";
import { Speaker } from "./v2-speaker";

type ProgressResult = { progress: SongProgress; correct?: boolean };
export function MusicLanguagePractice({ song, index, progress, expressions, busy, audioEpoch, onAction, onSaved, onConversation, onPause }: {
  song: PracticeSong; index: number; progress: SongProgress; expressions: Expression[]; busy: boolean; audioEpoch: number;
  onAction: (action: SongAction["action"], index: number, answer?: string, confidence?: "help" | "alone") => Promise<ProgressResult | null>;
  onSaved: (state: StudyState) => void; onConversation: (prompt: string) => void; onPause: () => void;
}) {
  const [tab, setTab] = useState<"word" | "conversation">("word");
  const [answerShown, setAnswerShown] = useState(false);
  const [feedback, setFeedback] = useState<"correct" | "wrong" | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const pending = useRef(false);
  const lesson = musicLanguageLessons[song.language][index], lineId = song.lines[index].id;
  const confidence = progress.conversations?.[lineId];
  const reviewed = progress.wordsReviewed?.includes(lineId);
  const normalize = (text: string) => text.normalize("NFKC").toLowerCase().replace(/[\s\p{P}]/gu, "");
  const isSaved = (kind: "save-word" | "save-expression") => expressions.some(e => e.language === song.language &&
    normalize(e.text) === normalize(kind === "save-word" ? lesson.word.text : lesson.answer.text) &&
    (kind !== "save-word" || e.source === "vocabulary" || e.inVocabulary));
  async function save(kind: "save-word" | "save-expression") {
    if (pending.current || isSaved(kind)) return;
    pending.current = true; setSaving(true); setSaveError("");
    try {
      const response = await fetch("/api/study/practice-music", { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: kind, trackId: song.id, revision: song.revision, index }), signal: AbortSignal.timeout(15000) });
      const result = await response.json();
      if (!response.ok || !result.saved) throw new Error(result.error ?? "저장하지 못했어요. 저장 공간과 연결을 확인한 뒤 다시 눌러 주세요.");
      onSaved(result.state);
    } catch (error) { setSaveError(error instanceof Error ? error.message : "저장하지 못했어요. 다시 시도해 주세요."); }
    finally { pending.current = false; setSaving(false); }
  }
  return <section className="hm-music-language" aria-label="노래 속 단어와 회화">
    <div className="hm-row"><h2>노래를 내 말로 바꿔요</h2><span>{index + 1} / {song.lines.length}</span></div>
    <p className="hm-muted">가사에서 한 단어를 골라, 친구와 이야기할 때 써 봐요.</p>
    <div className="hm-music-learning-tabs" role="group" aria-label="단어와 회화 선택">
      <button aria-pressed={tab === "word"} onClick={() => { onPause(); setTab("word"); }}>단어 익히기</button>
      <button aria-pressed={tab === "conversation"} onClick={() => { onPause(); setTab("conversation"); }}>회화에 써보기</button>
    </div>
    {tab === "word" ? <div aria-label="음악 단어 연습" role="region">
      <h3 lang={song.language}>{lesson.word.text}</h3><p className="hm-reading">{lesson.word.reading}</p>
      <span onClickCapture={onPause}><Speaker key={`${audioEpoch}:word`} language={song.language} text={lesson.word.text} label="단어 발음 듣기" /></span>
      <p>이 단어의 뜻을 골라 보세요.</p>
      <div className="hm-song-choices">{[2, 0, 3, 1].map(i => <button key={i} disabled={busy || saving || feedback === "correct"} onClick={async () => {
        const result = await onAction("word-answer", index, song.lines[i].id);
        if (result) setFeedback(result.correct ? "correct" : "wrong");
      }}>{musicLanguageLessons[song.language][i].word.meaning}</button>)}</div>
      <p role="status">{feedback === "wrong" ? "아직 아니에요. 가사 속 뜻을 다시 떠올려 보세요." : feedback === "correct" ? "맞았어요! 이제 대화에 써 볼까요?" : reviewed ? "이전에 맞힌 단어예요. 다시 떠올려 보세요." : ""}</p>
      <details open={feedback === "correct" || undefined}><summary>뜻과 쓰임 확인</summary><p><b>{lesson.word.meaning}</b> — {lesson.note}</p></details>
      <button className="hm-soft" disabled={busy || saving || isSaved("save-word")} onClick={() => void save("save-word")}>
        {isSaved("save-word") ? "단어장에 저장됨" : saving ? "저장 중…" : "단어장에 저장"}
      </button>
      {feedback === "correct" && <button className="hm-primary" onClick={() => { onPause(); setTab("conversation"); }}>이 단어로 회화 연습</button>}
    </div> : <div aria-label="음악 회화 연습" role="region">
      <h3>{lesson.situation}</h3>
      <p className="hm-muted">가사를 그대로 외우는 대신 일상에서 쓸 수 있게 바꾼 대화예요.</p>
      <div className="hm-music-dialogue"><b>친구</b><p lang={song.language}>{lesson.question.text}</p><p>{lesson.question.reading}</p><p>{lesson.question.meaning}</p>
        <span onClickCapture={onPause}><Speaker key={`${audioEpoch}:question`} language={song.language} text={lesson.question.text} label="친구 말 듣기" /></span>
      </div>
      <p><b>{lesson.word.text}</b>를 써서 소리 내어 답해 보세요.</p>
      <button aria-expanded={answerShown} onClick={() => setAnswerShown(!answerShown)}>{answerShown ? "예시 답변 가리기" : "예시 답변 보기"}</button>
      {answerShown && <div className="hm-music-dialogue hm-music-my-turn"><b>내가 할 말</b><p lang={song.language}>{lesson.answer.text}</p><p>{lesson.answer.reading}</p><p>{lesson.answer.meaning}</p>
        <span onClickCapture={onPause}><Speaker key={`${audioEpoch}:answer`} language={song.language} text={lesson.answer.text} label="답변 발음 듣기" /></span>
      </div>}
      <p className="hm-muted">직접 말해 본 뒤 기록해 주세요. 자동 발음 채점은 아니에요.</p>
      <div className="hm-music-learning-tabs" role="group" aria-label="회화 연습 기록">
        <button disabled={busy || saving} aria-pressed={confidence === "help"} onClick={() => void onAction("conversation", index, undefined, "help")}>도움받아 말했어요</button>
        <button disabled={busy || saving} aria-pressed={confidence === "alone"} onClick={() => void onAction("conversation", index, undefined, "alone")}>혼자 말했어요</button>
      </div>
      {confidence && <p role="status">{confidence === "alone" ? "혼자 말하기" : "도움받아 말하기"} 기록이 저장됐어요.</p>}
      <button className="hm-soft" disabled={busy || saving || isSaved("save-expression")} onClick={() => void save("save-expression")}>{isSaved("save-expression") ? "내 표현에 저장됨" : saving ? "저장 중…" : "내 표현에 저장"}</button>
      <button className="hm-primary" disabled={busy || saving} onClick={() => { onPause(); onConversation(musicConversationPrompt(song.title, lesson)); }}>새 AI 대화로 연습</button>
      <small>AI 대화 입력창에 연습 상황을 준비해요. 보내기를 누르면 대화가 시작돼요.</small>
    </div>}
    <p className="hm-muted">단어 {progress.wordsReviewed?.length ?? 0} / 4개 · 회화 {Object.keys(progress.conversations ?? {}).length} / 4개 연습</p>
    {saveError && <p role="alert">{saveError}</p>}
  </section>;
}
