"use client";
import { learningLevels, type LearningProfile, type Difficulty } from "@/lib/adaptive-learning";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { languages, type Language, type Lesson } from "@/lib/courses";
import type { ChatMessage } from "@/lib/conversation";
import { ConversationVoice, type VoiceHandle } from "./conversation-voice";

export function ConversationRoom({
  language,
  lesson,
  studentSlug,
  canRecord,
  canSpeak,
  storesConversation,
  learningProfile,
}: {
  language: Language;
  lesson: Lesson;
  studentSlug?: string;
  canRecord: boolean;
  canSpeak: boolean;
  storesConversation: boolean;
  learningProfile?: LearningProfile | null;
}) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState("");
  const level = learningProfile?.level ?? "beginner";
  const [feedbackBusy, setFeedbackBusy] = useState(false);
  const [feedbackDone, setFeedbackDone] = useState(false);
  const [feedbackError, setFeedbackError] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [voiceBusy, setVoiceBusy] = useState(false);
  const [conversationId, setConversationId] = useState<string>();
  const [storageConsent, setStorageConsent] = useState(false);
  const needsConsent = storesConversation && !storageConsent;
  const voice = useRef<VoiceHandle | null>(null);
  const request = useRef<AbortController | null>(null);
  const bottom = useRef<HTMLDivElement>(null);
  const sending = useRef(false);
  useEffect(
    () => () => {
      request.current?.abort();
    },
    [],
  );
  useEffect(() => {
    bottom.current?.scrollIntoView({ block: "nearest" });
  }, [messages, busy]);
  async function send() {
    if (sending.current || feedbackBusy || feedbackDone || voiceBusy || needsConsent || !draft.trim() || messages.length >= 20)
      return;
    sending.current = true;
    setBusy(true);
    setError("");
    const text = draft.trim();
    const pending: ChatMessage[] = [
      ...messages,
      { role: "user", content: text },
    ];
    const controller = new AbortController();
    request.current = controller;
    const timer = setTimeout(() => controller.abort(), 40000);
    try {
      const res = await fetch("/api/conversation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          language,
          lessonId: lesson.id,
          level,
          learningRevision: learningProfile?.revision,
          messages: pending,
          studentSlug,
          conversationId,
          storageConsent,
        }),
        signal: controller.signal,
      });
      const data = await res.json();
      if (!res.ok || typeof data.reply !== "string" ||
          (storesConversation && typeof data.conversationId !== "string"))
        throw new Error(
          data.error || "답변을 받지 못했어요. 다시 보내 주세요.",
        );
      setMessages([...pending, { role: "assistant", content: data.reply }]);
      setConversationId(data.conversationId);
      setDraft("");
      voice.current?.answer(data.reply);
    } catch (e) {
      if (controller.signal.aborted)
        setError(
          "대기 시간이 길어졌어요. 입력한 내용은 남아 있으니 다시 보내 주세요.",
        );
      else
        setError(
          e instanceof Error ? e.message : "연결을 확인하고 다시 보내 주세요.",
        );
    } finally {
      clearTimeout(timer);
      sending.current = false;
      setBusy(false);
      request.current = null;
    }
  }
  async function feedback(difficulty: Difficulty) {
    if (!learningProfile || feedbackBusy || busy) return;
    setFeedbackBusy(true); setFeedbackError("");
    try {
      const response = await fetch("/api/learning-profile", { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "feedback", language, studentSlug, assessmentId: learningProfile.assessmentId, revision: learningProfile.revision, difficulty }), signal: AbortSignal.timeout(15000) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "난이도를 저장하지 못했어요.");
      setFeedbackDone(true);
    } catch (e) { setFeedbackError(e instanceof Error ? e.message : "잠시 후 다시 시도해 주세요."); }
    finally { setFeedbackBusy(false); }
  }
  return (
    <section className="mt-8" aria-label="AI 회화 연습">
      {learningProfile && <div className="mb-6 rounded-2xl bg-accent-wash p-5">
        <h2 className="font-display text-xl">{learningProfile.confirmed ? "지금 난이도는 어떤가요?" : "2 / 2단계 · 짧은 회화로 확인해요"}</h2>
        <p className="mt-2 text-sm">{learningProfile.confirmed ? "하루 한 번 체감 난이도를 알려 주면 다음 연습과 계획에 반영해요." : "AI와 두 번 주고받고 체감 난이도를 선택해 주세요. 문제 결과와 체감을 함께 반영해 시작 단계를 정해요."}</p>
        <p className="mt-2 text-sm text-ink-soft">{learningLevels[level].task}. AI가 텍스트를 교정하지만 말하기 능력을 공인 채점하지는 않아요.</p>
        {feedbackDone ? <p role="status" className="mt-4"><Link href={`/learn?${new URLSearchParams({ language, ...(studentSlug ? { s: studentSlug } : {}) })}`} className="font-medium text-accent underline">나의 학습 계획 보기 →</Link></p> : learningProfile.feedbackToday ? <p className="mt-4 text-sm">오늘의 난이도 피드백이 저장됐어요. 다음 피드백은 내일 남길 수 있어요.</p> : <div className="mt-4 flex flex-wrap gap-2">{([["hard", "어려워요"], ["right", "적당해요"], ["easy", "쉬워요"]] as const).map(([value, label]) => <button key={value} type="button" disabled={feedbackBusy || busy || voiceBusy || Math.max(learningProfile.todayChatTurns, messages.length / 2) < 2} onClick={() => void feedback(value)} className="min-h-11 rounded-full border border-accent/30 bg-card px-4 disabled:opacity-40">{label}</button>)}</div>}
        {feedbackError && <p role="alert" className="mt-3 text-amber">{feedbackError}</p>}
      </div>}
      <div className="flex flex-wrap items-center justify-between gap-4 border-y border-ink-faint py-4">
        <div>
          <p className="font-medium">
            {languages[language].name} · {lesson.title}
          </p>
          <p className="mt-1 text-sm text-ink-soft">{lesson.goal}</p>
        </div>
        <p className="rounded-full bg-accent-wash px-4 py-2 text-sm text-accent">맞춤 난이도 · {learningLevels[level].label}</p>
      </div>
      <p className="mt-4 text-sm text-accent">{languages[language].name}로 대화해요.{language !== "ko" ? " 답변에 한글 발음과 한국어 뜻을 함께 보여 드려요." : ""}</p>
      <p className="mt-4 text-sm leading-relaxed text-ink-soft">
        AI 답변은 틀릴 수 있어요. 대화는 답변 생성을 위해 AI 제공업체로
        전송됩니다. 개인정보는 입력하지 마세요.{" "}
        {storesConversation
          ? "대화는 AI 회화 서버에 기록되며 튜터와 운영자가 확인할 수 있어요. 새로고침하거나 새 대화를 시작해도 서버 기록은 삭제되지 않아요. 기록 삭제는 튜터에게 요청해 주세요."
          : "이 앱은 대화 내용을 서버에 저장하지 않으며, 새로고침하면 사라져요."}
      </p>
      {storesConversation && (
        <label className="mt-3 flex items-start gap-2 text-sm text-ink-soft">
          <input type="checkbox" checked={storageConsent} disabled={busy || messages.length > 0}
            onChange={(event) => setStorageConsent(event.target.checked)} className="mt-1" />
          대화가 회화 서버에 저장되는 것에 동의해요.
        </label>
      )}
      <div
        role="log"
        aria-label="대화 내용"
        aria-live="polite"
        aria-relevant="additions"
        className="mt-6 max-h-[55vh] min-h-48 overflow-y-auto rounded-xl border border-ink-faint bg-card p-5"
      >
        {messages.length === 0 && (
          <div>
            <p className="font-display text-2xl">첫 한마디를 건네 보세요.</p>
            <p className="mt-2 text-base text-ink-soft">
              아래 표현을 누르면 입력창에 넣어 드려요.
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              {lesson.phrases.slice(0, 2).map((p) => (
                <button
                  type="button"
                  key={p.text}
                  disabled={busy}
                  onClick={() => setDraft(p.text)}
                  lang={language}
                  className="rounded-full bg-accent-wash px-4 py-2 text-base text-accent"
                >
                  <span className="block">{p.text}</span>
                  {p.koreanReading && <span lang="ko" className="mt-1 block text-sm">{p.koreanReading}</span>}
                </button>
              ))}
            </div>
          </div>
        )}
        {messages.map((m, i) => (
          <div
            key={i}
            className={`mb-5 max-w-[90%] ${m.role === "user" ? "ml-auto rounded-xl bg-accent-wash p-4" : "mr-auto border-l-2 border-accent pl-4"}`}
          >
            <p className="mb-2 text-xs font-medium text-ink-soft">
              {m.role === "user" ? "나" : "한마디 AI"}
            </p>
            <p className="whitespace-pre-wrap break-words text-base leading-relaxed">
              {m.content}
            </p>
          </div>
        ))}
        {busy && (
          <p role="status" className="text-base text-ink-soft">
            AI가 답변을 준비하고 있어요…
          </p>
        )}
        <div ref={bottom} />
      </div>
      {error && (
        <p
          role="alert"
          className="mt-4 rounded-lg bg-amber-wash p-4 text-base text-amber"
        >
          {error}
        </p>
      )}
      <ConversationVoice
        ref={voice}
        language={language}
        studentSlug={studentSlug}
        onTranscript={setDraft}
        onBusyChange={setVoiceBusy}
        disabled={busy || feedbackBusy || feedbackDone || needsConsent || messages.length >= 20}
        canRecord={canRecord}
        canSpeak={canSpeak}
      />
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void send();
        }}
        className="mt-5"
      >
        <label
          htmlFor="conversation-message"
          className="block text-sm font-medium"
        >
          {languages[language].name}로 말해 보세요. 모르면 한국어로 물어봐도
          돼요.
        </label>
        <textarea
          id="conversation-message"
          lang={language}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          disabled={busy || voiceBusy || messages.length >= 20}
          maxLength={2000}
          rows={3}
          className="mt-2 w-full resize-y rounded-xl border border-ink-faint bg-card p-4 text-base"
          placeholder={lesson.phrases[0].text}
        />
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-ink-soft">
            {messages.length / 2} / 10회 대화
          </p>
          <div className="flex gap-3">
            <button
              type="button"
              disabled={busy || feedbackBusy || feedbackDone}
              onClick={() => {
                voice.current?.reset();
                setMessages([]);
                setConversationId(undefined);
                setDraft("");
                setError("");
              }}
              className="min-h-11 rounded-full border border-ink-faint px-4 text-sm disabled:opacity-50"
            >
              새 대화
            </button>
            <button
              type="submit"
              disabled={
                busy || feedbackBusy || feedbackDone || voiceBusy || needsConsent || !draft.trim() || messages.length >= 20
              }
              className="min-h-11 rounded-full bg-accent px-6 font-medium text-white hover:bg-accent-strong disabled:opacity-50"
            >
              {busy ? "답변 기다리는 중" : "보내기"}
            </button>
          </div>
        </div>
        {messages.length >= 20 && (
          <p role="status" className="mt-4 text-base">
            이번 연습을 마쳤어요. 새 대화를 시작하거나 학습 화면에서 다른 주제를
            골라 보세요.
          </p>
        )}
      </form>
    </section>
  );
}
