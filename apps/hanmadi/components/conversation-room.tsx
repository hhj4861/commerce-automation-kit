"use client";
import { learningLevels, type LearningProfile, type Difficulty } from "@/lib/adaptive-learning";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useSessionDraft } from "@/lib/use-session-draft";
import { useEffect, useRef, useState } from "react";
import { languages, type Language, type Lesson } from "@/lib/courses";
import type { ChatMessage } from "@/lib/conversation";
import { ConversationVoice, type VoiceHandle } from "./conversation-voice";

type ConversationDraft = { messages: ChatMessage[]; draft: string; conversationId?: string; storageConsent: boolean };
const emptyDraft: ConversationDraft = { messages: [], draft: "", storageConsent: false };
function validDraft(value: unknown): value is ConversationDraft {
  if (!value || typeof value !== "object") return false;
  const v = value as ConversationDraft;
  return typeof v.draft === "string" && v.draft.length <= 2000 && typeof v.storageConsent === "boolean" &&
    (v.conversationId === undefined || typeof v.conversationId === "string") && Array.isArray(v.messages) && v.messages.length <= 20 && v.messages.length % 2 === 0 &&
    v.messages.every((m, i) => m && m.role === (i % 2 ? "assistant" : "user") && typeof m.content === "string" && m.content.length <= 20000);
}

export function ConversationRoom({
  language,
  lesson,
  studentSlug,
  canRecord,
  canSpeak,
  storesConversation,
  learningProfile, cacheKey,
}: {
  cacheKey: string;
  language: Language;
  lesson: Lesson;
  studentSlug?: string;
  canRecord: boolean;
  canSpeak: boolean;
  storesConversation: boolean;
  learningProfile?: LearningProfile | null;
}) {
  const router = useRouter();
  const [saved, setSaved, unavailable] = useSessionDraft(cacheKey, emptyDraft, validDraft);
  const { messages, draft, conversationId, storageConsent } = saved;
  const setDraft = (draft: string) => setSaved(v => ({ ...v, draft }));
  const [restartPending, setRestartPending] = useState(false);
  const [stale, setStale] = useState(false);
  const level = learningProfile?.level ?? "beginner";
  const [completedTurns, setCompletedTurns] = useState(learningProfile?.todayChatTurns ?? 0);
  const [feedbackBusy, setFeedbackBusy] = useState(false);
  const [feedbackDone, setFeedbackDone] = useState(false);
  const [feedbackError, setFeedbackError] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [voiceBusy, setVoiceBusy] = useState(false);
  const needsConsent = storesConversation && !storageConsent;
  const voice = useRef<VoiceHandle | null>(null);
  const request = useRef<AbortController | null>(null);
  const log = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLTextAreaElement>(null);
  const sending = useRef(false);
  useEffect(
    () => () => {
      request.current?.abort();
    },
    [],
  );
  useEffect(() => {
    const container = log.current;
    if (!container || !messages.length) return;
    const reply = container.querySelector<HTMLElement>("[data-last-reply]");
    // Scroll only the conversation pane; preserve the page and the start of long replies.
    if (busy) container.scrollTop = container.scrollHeight;
    else if (reply) container.scrollTop += reply.getBoundingClientRect().top - container.getBoundingClientRect().top - 20;
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
      if (res.status === 409) setStale(true);
      if (!res.ok || typeof data.reply !== "string" ||
          (storesConversation && typeof data.conversationId !== "string"))
        throw new Error(
          data.error || "답변을 받지 못했어요. 다시 보내 주세요.",
        );
      setSaved(v => ({ ...v, messages: [...pending, { role: "assistant", content: data.reply }], conversationId: data.conversationId, draft: "" }));
      setCompletedTurns(n => n + 1);
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
      if (response.status === 409) setStale(true);
      if (!response.ok) throw new Error(data.error || "난이도를 저장하지 못했어요.");
      setFeedbackDone(true);
    } catch (e) { setFeedbackError(e instanceof Error ? e.message : "잠시 후 다시 시도해 주세요."); }
    finally { setFeedbackBusy(false); }
  }
  return (
    <section className="mt-8" aria-label="AI 회화 연습">
      {learningProfile && !learningProfile.confirmed && <p className="mb-4 rounded-xl bg-accent-wash p-4 text-sm">2 / 2단계 · AI와 두 번 대화한 뒤 아래에서 난이도를 선택하면 학습 계획이 완성돼요.</p>}
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
      <details className="mt-3 text-sm text-ink-soft">
        <summary className="min-h-11 cursor-pointer py-3">AI 답변과 대화 기록 안내</summary>
        <p>AI 답변은 틀릴 수 있어요. 대화는 답변 생성을 위해 AI 제공업체로 전송됩니다. 개인정보는 입력하지 마세요. {storesConversation ? "대화는 AI 회화 서버에 기록되며 튜터와 운영자가 확인할 수 있어요. 새 대화를 시작해도 서버 기록은 삭제되지 않아요. 기록 삭제는 튜터에게 요청해 주세요." : "이 앱은 대화 내용을 서버에 저장하지 않아요."}</p>
      </details>
      <p className="mt-2 text-xs text-ink-soft">{unavailable ? "이 브라우저에서는 임시 저장이 안 돼요. 새로고침하면 대화가 사라질 수 있어요." : "이 탭에서는 대화와 입력 중인 문장을 24시간 동안 이어서 볼 수 있어요."}</p>
      {storesConversation && (
        <label className="mt-3 flex items-start gap-2 text-sm text-ink-soft">
          <input type="checkbox" checked={storageConsent} disabled={busy || messages.length > 0}
            onChange={(event) => setSaved(v => ({ ...v, storageConsent: event.target.checked }))} className="mt-1" />
          대화가 회화 서버에 저장되는 것에 동의해요.
        </label>
      )}
      <div
        ref={log}
        role="log"
        tabIndex={0}
        aria-label="대화 내용"
        aria-live="polite"
        aria-relevant="additions"
        className="relative mt-6 max-h-[55vh] min-h-48 overflow-y-auto rounded-xl border border-ink-faint bg-card p-5"
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
                  onClick={() => { setDraft(p.text); input.current?.focus(); }}
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
            data-last-reply={i === messages.length - 1 ? "true" : undefined}
            className={`mb-5 max-w-[90%] ${m.role === "user" ? "ml-auto rounded-xl bg-accent-wash p-4" : "mr-auto border-l-2 border-accent pl-4"}`}
          >
            <p className="mb-2 text-xs font-medium text-ink-soft">
              {m.role === "user" ? "나" : "한마디 AI"}
            </p>
            <div className="whitespace-pre-wrap break-words text-base leading-relaxed">
              {m.role === "user" ? m.content : <ReplyText text={m.content} />}
            </div>
          </div>
        ))}
        {busy && (
          <p role="status" className="text-base text-ink-soft">
            AI가 답변을 준비하고 있어요…
          </p>
        )}
      </div>
      {stale && <button type="button" onClick={() => router.refresh()} className="mt-4 min-h-11 text-accent underline">최신 학습 설정 불러오기</button>}
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
        preferencesKey={`${cacheKey}:audio`}
        restoredAnswer={messages.at(-1)?.role === "assistant" ? messages.at(-1)?.content : undefined}
      />
      {restartPending && <div role="group" aria-label="새 대화 확인" className="mt-4 rounded-xl border border-ink-faint p-4">
        <p>현재 화면의 대화와 입력을 비우고 새로 시작할까요? 서버에 저장된 기록은 삭제되지 않아요.</p>
        <button type="button" onClick={() => { voice.current?.reset(); setSaved(emptyDraft); setError(""); setRestartPending(false); input.current?.focus(); }} className="mr-4 mt-3 min-h-11 text-accent underline">비우고 시작</button>
        <button type="button" onClick={() => setRestartPending(false)} className="min-h-11 underline">계속 이어가기</button>
      </div>}
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
          ref={input}
          id="conversation-message"
          lang={language}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          disabled={busy || feedbackBusy || feedbackDone || voiceBusy || messages.length >= 20}
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
                if (messages.length || draft) { setRestartPending(true); return; }
                setSaved(emptyDraft); setError("");
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
              className="min-h-11 rounded-full bg-accent px-6 font-medium text-accent-ink hover:bg-accent-strong disabled:opacity-50"
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
      {learningProfile && <div className="mt-5 rounded-2xl bg-accent-wash p-5">
        <h2 className="font-display text-xl">{learningProfile.confirmed ? "지금 난이도는 어떤가요?" : "2 / 2단계 · 짧은 회화로 확인해요"}</h2>
        <p className="mt-2 text-sm">{learningProfile.confirmed ? "하루 한 번 체감 난이도를 알려 주면 다음 연습과 계획에 반영해요." : "AI와 두 번 주고받고 체감 난이도를 선택해 주세요. 문제 결과와 체감을 함께 반영해 시작 단계를 정해요."}</p>
        <p className="mt-2 text-sm text-ink-soft">{learningLevels[level].task}. AI가 텍스트를 교정하지만 말하기 능력을 공인 채점하지는 않아요.</p>
        {!feedbackDone && !learningProfile.feedbackToday && <p role="status" className="mt-3 text-sm">{Math.min(2, completedTurns)} / 2회 완료 · {completedTurns >= 2 ? "이제 난이도를 선택해 주세요." : "두 번 대화하면 선택할 수 있어요."}</p>}
        {feedbackDone ? <div role="status" className="mt-4"><Link href={`/learn?${new URLSearchParams({ language, ...(studentSlug ? { s: studentSlug } : {}) })}`} className="font-medium text-accent underline">나의 학습 계획 보기 →</Link><button type="button" onClick={() => router.refresh()} className="mt-3 block min-h-11 text-sm text-accent underline">새 난이도로 계속 대화하기</button></div> : learningProfile.feedbackToday ? <p className="mt-4 text-sm">오늘의 난이도 피드백이 저장됐어요. 다음 피드백은 내일 남길 수 있어요.</p> : <div className="mt-4 flex flex-wrap gap-2">{([["hard", "어려워요"], ["right", "적당해요"], ["easy", "쉬워요"]] as const).map(([value, label]) => <button key={value} type="button" disabled={feedbackBusy || busy || voiceBusy || completedTurns < 2} onClick={() => void feedback(value)} className="min-h-11 rounded-full border border-accent/30 bg-card px-4 disabled:opacity-40">{label}</button>)}</div>}
        {feedbackError && <p role="alert" className="mt-3 text-amber">{feedbackError}</p>}
      </div>}
    </section>
  );
}

// A small text-only renderer: React escapes every segment; no HTML or URL execution.
function ReplyText({ text }: { text: string }) {
  return text.split("\n").map((line, i) => /^\s*---+\s*$/.test(line) ? <hr key={i} className="my-3 border-ink-faint" /> :
    <p key={i} className="min-h-6">{line.replace(/^#{1,6}\s+/, "").replace(/^[-*]\s+/, "• ").split(/(\*\*[^*]+\*\*)/g).map((part, j) =>
      part.startsWith("**") && part.endsWith("**") ? <strong key={j}>{part.slice(2, -2)}</strong> : part)}</p>);
}
