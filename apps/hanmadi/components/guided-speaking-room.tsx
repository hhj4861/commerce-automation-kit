"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { LearningProfile } from "@/lib/adaptive-learning";
import { speakingSteps, spokenReply, type SpeakingConfidence } from "@/lib/guided-speaking";
import { languages, type Language, type Lesson } from "@/lib/courses";
import { useSessionDraft } from "@/lib/use-session-draft";
import { ConversationVoice, type VoiceHandle } from "./conversation-voice";

type Draft = { step: number; phase: "listen" | "repeat" | "roleplay" | "done"; consent: boolean };
const initial: Draft = { step: 0, phase: "listen", consent: false };
const valid = (v: unknown): v is Draft => !!v && typeof v === "object" &&
  [0, 1].includes((v as Draft).step) && ["listen", "repeat", "roleplay", "done"].includes((v as Draft).phase) && typeof (v as Draft).consent === "boolean";

export function GuidedSpeakingRoom({ language, lesson, studentSlug, canRecord, canSpeak, storesConversation, learningProfile: profile, cacheKey }: {
  language: Language; lesson: Lesson; studentSlug?: string; canRecord: boolean; canSpeak: boolean;
  storesConversation: boolean; learningProfile?: LearningProfile | null; cacheKey: string;
}) {
  const router = useRouter();
  const [draft, setDraft, unavailable] = useSessionDraft(cacheKey, initial, valid);
  const [busy, setBusy] = useState(false);
  const [voiceBusy, setVoiceBusy] = useState(false);
  const [error, setError] = useState("");
  const [reply, setReply] = useState("");
  const [transcript, setTranscript] = useState("");
  const [hint, setHint] = useState(false);
  const [attempted, setAttempted] = useState(false);
  const [saved, setSaved] = useState(false);
  const [stale, setStale] = useState(false);
  const voice = useRef<VoiceHandle>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const request = useRef<AbortController | null>(null);
  const lock = useRef(false);
  useEffect(() => () => request.current?.abort(), []);
  const steps = speakingSteps(language, lesson.id);
  const target = steps[draft.step];
  const phrase = target.phrase;
  const needsConsent = storesConversation && !draft.consent;
  const disabled = busy || voiceBusy || stale;
  const query = new URLSearchParams({ language, lesson: lesson.id, ...(studentSlug ? { s: studentSlug } : {}) });
  function move(phase: Draft["phase"], step = draft.step) {
    voice.current?.reset(); setReply(""); setTranscript(""); setError(""); setHint(false); setAttempted(false);
    setDraft(d => ({ ...d, phase, step }));
    requestAnimationFrame(() => heading.current?.focus());
  }
  async function respond(text: string) {
    if (lock.current || needsConsent || stale) return;
    lock.current = true; setBusy(true); setError(""); setReply(""); setTranscript(text); setAttempted(false);
    const controller = new AbortController(); request.current = controller;
    const timer = setTimeout(() => controller.abort(), 40000);
    try {
      // Each bounded attempt is independent. Free-chat conversation IDs/history are never reused.
      const res = await fetch("/api/conversation", { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ language, lessonId: lesson.id, level: "beginner", learningRevision: profile?.revision,
          studentSlug, storageConsent: draft.consent, guidedStep: draft.step, messages: [{ role: "user", content: text }] }), signal: controller.signal });
      const data = await res.json();
      if (res.status === 409) setStale(true);
      if (!res.ok || typeof data.reply !== "string") throw new Error(data.error || "응답을 받지 못했어요.");
      setReply(data.reply); setAttempted(true);
      // Ambiguous mixed-language replies fall back to the supplied listening model.
      voice.current?.answer(spokenReply(data.reply, language) ?? phrase.text);
    } catch (e) { if (!controller.signal.aborted) setError(e instanceof Error ? e.message : "연결을 확인해 주세요."); else setError("응답이 늦어지고 있어요. 다시 말하거나 마이크 없이 이어가도 괜찮아요."); }
    finally { clearTimeout(timer); lock.current = false; setBusy(false); request.current = null; }
  }
  async function save(confidence: SpeakingConfidence) {
    if (!profile || lock.current) return;
    lock.current = true; setBusy(true); setError("");
    const controller = new AbortController(); request.current = controller;
    const timer = setTimeout(() => controller.abort(), 15000);
    try {
      const res = await fetch("/api/learning-profile", { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "speaking", language, studentSlug, lessonId: lesson.id, assessmentId: profile.assessmentId, revision: profile.revision, confidence }), signal: controller.signal });
      const data = await res.json();
      if (res.status === 409) setStale(true);
      if (!res.ok) throw new Error(data.error || "기록을 저장하지 못했어요.");
      setSaved(true);
    } catch (e) { setError(e instanceof Error && e.name !== "AbortError" ? e.message : "기록을 저장하지 못했어요. 다시 시도해 주세요."); }
    finally { clearTimeout(timer); lock.current = false; setBusy(false); request.current = null; }
  }
  const voiceControl = <ConversationVoice ref={voice} language={language} studentSlug={studentSlug} speakingFirst listenOnly={draft.phase === "listen"}
    onTranscript={text => void respond(text)} onBusyChange={setVoiceBusy} disabled={busy || stale || needsConsent || draft.phase === "listen"}
    canRecord={canRecord} canSpeak={canSpeak} preferencesKey={`${cacheKey}:audio`} />;
  return <section aria-label="글자 없이 듣고 말하기" className="mt-7">
    <p className="text-sm text-accent">{languages[language].name} · {lesson.title} · 표현 {draft.step + 1} / {steps.length}</p>
    <ol aria-label="말하기 연습 순서" className="mt-4 flex flex-wrap gap-x-5 gap-y-2 text-sm text-ink-soft">
      {([ ["listen", "1 듣기"], ["repeat", "2 따라 말하기"], ["roleplay", "3 상황에서 말하기"] ] as const).map(([phase, label]) => <li key={phase} aria-current={draft.phase === phase ? "step" : undefined} className={draft.phase === phase ? "font-semibold text-accent" : ""}>{label}</li>)}
    </ol>
    <div className="mt-5 rounded-2xl border border-ink-faint bg-card p-5 sm:p-7">
      <h2 ref={heading} tabIndex={-1} className="scroll-mt-24 font-display text-2xl">{draft.phase === "done" ? "직접 말해 보니 어땠나요?" : draft.phase === "listen" ? "먼저 소리를 들어요" : draft.phase === "repeat" ? "소리를 흉내 내어 말해요" : "이 상황에서 한마디 해 볼까요?"}</h2>
      {draft.phase !== "done" ? <>
        <p className="mt-3 leading-relaxed">{target.situation}</p>
        {(draft.phase !== "roleplay" || hint) ? <div className="mt-5 border-l-2 border-accent pl-4">
          <p className="text-sm text-ink-soft">이런 뜻이에요 · {phrase.meaning}</p>
          <p className="mt-2 break-words text-2xl font-medium">{phrase.koreanReading ?? phrase.text}</p>
          <details className="mt-2 text-sm text-ink-soft"><summary className="min-h-11 cursor-pointer py-3">{languages[language].name} 글자 보기 · 선택</summary><p lang={language} className="text-xl">{phrase.text}</p></details>
        </div> : <button type="button" onClick={() => setHint(true)} className="mt-4 min-h-11 rounded-full border border-accent px-5 text-accent">막막해요 · 발음 힌트 보기</button>}
        <button type="button" onClick={() => voice.current?.listen(phrase.text)} disabled={disabled || !canSpeak} className="mt-4 min-h-12 rounded-full bg-accent px-6 font-medium text-accent-ink disabled:opacity-50">{draft.phase === "roleplay" ? "힌트 소리 듣기" : "표현 듣기"}</button>
        <p className="mt-3 text-xs leading-relaxed text-ink-soft">한글은 발음 도움일 뿐이에요. {language === "th" ? "성조와 소리 길이" : "소리 길이와 높낮이"}는 음성을 듣고 따라 해요. 음성 재생기의 속도를 조절해 천천히 들어도 좋아요.</p>
        {language === "th" && <details className="mt-2 text-sm text-ink-soft"><summary className="min-h-11 cursor-pointer py-3">공손하게 말하는 도움말</summary><p>{lesson.note}</p></details>}
        {draft.phase === "listen" && voiceControl}
        {draft.phase === "listen" ? <button type="button" disabled={disabled} onClick={() => move("repeat")} className="mt-5 block min-h-12 rounded-full border border-accent px-6 text-accent">따라 말해 볼게요 →</button> : <>
          <p className="mt-4 text-sm">{draft.phase === "repeat" ? "위 소리를 따라 해 보세요. 글자를 읽거나 입력할 필요 없어요." : "기억나는 만큼 말해 보세요. 잊었으면 언제든 힌트를 다시 열어요."}</p>
          {storesConversation && <label className="mt-4 flex items-start gap-3 text-sm text-ink-soft"><input type="checkbox" checked={draft.consent} disabled={disabled} onChange={e => setDraft(d => ({ ...d, consent: e.target.checked }))} className="mt-1" />음성에서 인식한 말과 AI 답변이 회화 서버에 저장되는 것에 동의해요. 튜터·운영자가 볼 수 있고 삭제는 튜터에게 요청해요.</label>}
          {needsConsent && <p className="mt-2 text-sm text-ink-soft">AI와 연습하려면 위 안내에 동의해 주세요. 마이크 없이 따라 말하기는 동의 없이도 가능해요.</p>}
          {voiceControl}
          {busy && <p role="status" className="mt-4">AI가 말씀하신 내용을 확인하고 있어요…</p>}
          {reply && <div className="mt-4 rounded-xl bg-accent-wash p-4" role="status"><p className="text-sm font-medium">AI와 주고받기</p><p className="mt-2 whitespace-pre-wrap break-words">{reply}</p><p className="mt-2 text-xs text-ink-soft">{spokenReply(reply, language) ? "음성으로 AI의 짧은 대답을 들어요." : "답변에서 음성으로 읽을 문장을 구분하지 못해 연습 표현을 다시 들려드려요."}</p></div>}
          {transcript && <details className="mt-3 text-sm"><summary className="min-h-11 cursor-pointer py-3">AI가 인식한 말 보기 · 수정할 필요 없어요</summary><p lang={language} className="break-words">{transcript}</p><p className="mt-2 text-ink-soft">잘못 인식했으면 다시 말해 보세요. 인식 오류는 학습자의 잘못이 아니에요.</p></details>}
          {attempted && <button type="button" disabled={disabled} onClick={() => draft.phase === "repeat" ? move("roleplay") : draft.step + 1 < steps.length ? move("listen", draft.step + 1) : move("done")} className="mt-5 min-h-12 rounded-full bg-accent px-6 text-accent-ink disabled:opacity-50">{draft.phase === "repeat" ? "상황에서 말해 보기 →" : draft.step + 1 < steps.length ? "다음 표현 듣기 →" : "오늘 연습 돌아보기 →"}</button>}
          {!attempted && <button type="button" disabled={disabled} onClick={() => { setAttempted(true); setReply(""); setError(""); }} className="mt-4 block min-h-11 text-sm text-accent underline disabled:opacity-50">마이크 없이 소리 내어 말했어요</button>}
          <p className="mt-2 text-xs text-ink-soft">마이크 없이 말하면 AI 확인 없이 직접 연습한 것으로 돌아봐요. 버튼만 누른 것으로 실력을 판정하지 않아요.</p>
        </>}
      </> : <>
        <p className="mt-3 text-ink-soft">잘 썼는지가 아니라, 입으로 말해 본 느낌을 알려 주세요. 점수나 등급을 매기는 시험은 아니에요.</p>
        {saved ? <div role="status" className="mt-5"><p>오늘의 말하기 기록이 저장됐어요. 도움이 필요했던 표현은 다음 연습에 다시 나와요.</p><Link href={`/learn?${query}`} className="mt-4 inline-flex min-h-12 items-center rounded-full bg-accent px-6 text-accent-ink">나의 말하기 계획 보기 →</Link></div> : <div className="mt-5 grid gap-3">{([ ["repeat", "다시 듣고 따라 하고 싶어요"], ["help", "힌트를 보고 말했어요"], ["alone", "힌트 없이 혼자 말해 봤어요"] ] as const).map(([confidence, label]) => <button key={confidence} type="button" disabled={disabled} onClick={() => void save(confidence)} className="min-h-12 rounded-xl border border-accent px-4 py-3 text-left text-accent disabled:opacity-50">{label}</button>)}</div>}
        <button type="button" disabled={disabled} onClick={() => { setSaved(false); move("listen", 0); }} className="mt-4 min-h-11 text-sm text-accent underline">한 번 더 연습하기</button>
      </>}
    </div>
    {error && <p role="alert" className="mt-4 rounded-xl bg-amber-wash p-4 text-amber">{error}</p>}
    {stale && <button type="button" onClick={() => router.refresh()} className="mt-3 min-h-11 text-accent underline">최신 학습 설정 불러오기</button>}
    {unavailable && <p className="mt-3 text-sm text-ink-soft">임시 저장이 안 돼요. 새로고침하면 처음부터 다시 연습해요.</p>}
    <details className="mt-5 text-sm text-ink-soft"><summary className="min-h-11 cursor-pointer py-3">연습 안내와 다른 방식</summary><p>AI 도움말은 틀릴 수 있어요. 음성 인식으로 발음이나 성조를 채점하지 않아요. 말하기 체감은 하루 첫 기록을 계획에 반영해요.</p><Link href={`/conversation?${query}&mode=free`} className="mt-3 inline-flex min-h-11 items-center text-accent underline">도움 없이 자유 회화하기 →</Link></details>
  </section>;
}
