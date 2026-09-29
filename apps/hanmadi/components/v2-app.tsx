"use client";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import Link from "next/link";
import {
  curriculum,
  studyLanguages,
  isStudyLanguage,
  starterUnits,
  studyQueue,
  emptyStudy,
  type StudyLanguage,
  type StudyState,
  type Unit,
  type Phrase,
} from "@/lib/v2";
import type { ModelConnection } from "@/lib/model-connections";
type Identity = { name: string; owner: boolean };
type Tab = "study" | "chat" | "translate" | "phrases";
async function request(path: string, body?: unknown, method = "POST") {
  const res = await fetch(path, {
    method: body === undefined ? "GET" : method,
    headers: body === undefined ? {} : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
    cache: "no-store",
    signal: AbortSignal.timeout(45000),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "잠시 후 다시 시도해 주세요.");
  return data;
}
function Dialog({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useEffect(() => {
    const el = ref.current;
    el?.showModal();
    return () => el?.close();
  }, []);
  return (
    <dialog
      className="hm-dialog"
      ref={ref}
      onCancel={onClose}
      aria-labelledby={titleId}
    >
      <div className="hm-row">
        <h2 id={titleId}>{title}</h2>
        <button onClick={onClose} aria-label="닫기">
          ×
        </button>
      </div>
      {children}
    </dialog>
  );
}
function Speaker({
  text,
  label = "들어보기",
}: {
  text: string;
  label?: string;
}) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const audio = useRef<HTMLAudioElement | null>(null),
    url = useRef(""),
    alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      audio.current?.pause();
      if (url.current) URL.revokeObjectURL(url.current);
    };
  }, []);
  async function play() {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      audio.current?.pause();
      if (url.current) URL.revokeObjectURL(url.current);
      const res = await fetch("/api/study/audio", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
        signal: AbortSignal.timeout(45000),
      });
      if (!res.ok)
        throw new Error(
          (await res.json()).error || "음성을 재생하지 못했어요.",
        );
      const blob = await res.blob();
      if (!alive.current) return;
      url.current = URL.createObjectURL(blob);
      audio.current = new Audio(url.current);
      audio.current.playbackRate = 0.85;
      await audio.current.play();
    } catch (e) {
      if (alive.current)
        setError(e instanceof Error ? e.message : "음성을 재생하지 못했어요.");
    } finally {
      if (alive.current) setBusy(false);
    }
  }
  return (
    <span className="hm-audio">
      <button className="hm-soft" disabled={busy} onClick={() => void play()}>
        ▷ {busy ? "음성 준비 중…" : label}
      </button>
      {error && <small role="alert">{error}</small>}
    </span>
  );
}
function Microphone({
  language,
  onText,
  disabled = false,
}: {
  language: string;
  onText: (text: string) => void;
  disabled?: boolean;
}) {
  const [status, setStatus] = useState<"idle" | "recording" | "sending">(
      "idle",
    ),
    [error, setError] = useState("");
  const recorder = useRef<MediaRecorder | null>(null),
    stream = useRef<MediaStream | null>(null),
    timer = useRef<ReturnType<typeof setTimeout> | null>(null),
    alive = useRef(true),
    lock = useRef(false);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      if (timer.current) clearTimeout(timer.current);
      if (recorder.current?.state === "recording") recorder.current.stop();
      stream.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);
  async function toggle() {
    if (recorder.current?.state === "recording") {
      recorder.current.stop();
      return;
    }
    if (lock.current || disabled) return;
    lock.current = true;
    setError("");
    try {
      if (
        !navigator.mediaDevices?.getUserMedia ||
        typeof MediaRecorder === "undefined"
      )
        throw new Error(
          "이 브라우저에서는 녹음을 사용할 수 없어요. 아래 직접 입력을 이용해 주세요.",
        );
      stream.current = await navigator.mediaDevices.getUserMedia({
        audio: true,
      });
      if (!alive.current) {
        stream.current.getTracks().forEach((t) => t.stop());
        return;
      }
      const type = ["audio/webm", "audio/mp4", "audio/ogg"].find((t) =>
        MediaRecorder.isTypeSupported(t),
      );
      const r = new MediaRecorder(
        stream.current,
        type ? { mimeType: type } : undefined,
      );
      recorder.current = r;
      const chunks: BlobPart[] = [];
      r.ondataavailable = (e) => {
        if (e.data.size) chunks.push(e.data);
      };
      r.onstop = async () => {
        stream.current?.getTracks().forEach((t) => t.stop());
        if (timer.current) clearTimeout(timer.current);
        if (!alive.current) return;
        setStatus("sending");
        try {
          const blob = new Blob(chunks, { type: r.mimeType });
          if (blob.size > 2_900_000)
            throw new Error("녹음이 길어요. 한 문장씩 짧게 말해 주세요.");
          const form = new FormData();
          form.set("file", blob, "voice");
          form.set("language", language);
          const res = await fetch("/api/study/audio", {
            method: "POST",
            body: form,
            signal: AbortSignal.timeout(45000),
          });
          const data = await res.json();
          if (!res.ok)
            throw new Error(data.error || "음성을 인식하지 못했어요.");
          if (alive.current) onText(data.text);
        } catch (e) {
          if (alive.current)
            setError(
              e instanceof Error ? e.message : "녹음 권한을 확인해 주세요.",
            );
        } finally {
          lock.current = false;
          if (alive.current) setStatus("idle");
        }
      };
      r.start();
      setStatus("recording");
      timer.current = setTimeout(() => {
        if (r.state === "recording") r.stop();
      }, 30000);
    } catch (e) {
      lock.current = false;
      stream.current?.getTracks().forEach((t) => t.stop());
      if (alive.current) {
        setStatus("idle");
        setError(
          e instanceof Error ? e.message : "마이크 권한을 허용해 주세요.",
        );
      }
    }
  }
  return (
    <div className="hm-mic-wrap">
      <button
        className={`hm-mic ${status === "recording" ? "recording" : ""}`}
        disabled={disabled || status === "sending"}
        onClick={() => void toggle()}
        aria-label={status === "recording" ? "녹음 마치기" : "말하기 시작"}
      >
        {status === "recording" ? (
          "■"
        ) : (
          <svg
            width="34"
            height="34"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            aria-hidden="true"
          >
            <rect x="9" y="2" width="6" height="12" rx="3" />
            <path d="M5 10v2a7 7 0 0 0 14 0v-2M12 19v3M8 22h8" />
          </svg>
        )}
      </button>
      <strong aria-live="polite">
        {status === "recording"
          ? "듣고 있어요 · 눌러서 마치기"
          : status === "sending"
            ? "말을 옮기고 있어요…"
            : "눌러서 말하기"}
      </strong>
      <small>한 번에 한 사람씩 · 최대 30초</small>
      {error && <p role="alert">{error}</p>}
    </div>
  );
}
function PhraseCard({
  phrase,
  language,
  children,
}: {
  phrase: Phrase;
  language: StudyLanguage;
  children?: React.ReactNode;
}) {
  return (
    <article className="hm-expression">
      <p className="hm-native" lang={language}>
        {phrase.text}
      </p>
      <p className="hm-reading">{phrase.reading}</p>
      <p>{phrase.meaning}</p>
      <Speaker text={phrase.text} />
      {children}
    </article>
  );
}
function Login({ onDone }: { onDone: () => void }) {
  const [signup, setSignup] = useState(false),
    [name, setName] = useState(""),
    [password, setPassword] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        if (busy) return;
        setBusy(true);
        setError("");
        try {
          await request("/api/study/account", {
            action: signup ? "signup" : "login",
            name,
            password,
          });
          setPassword("");
          onDone();
        } catch (e) {
          setError(e instanceof Error ? e.message : "로그인하지 못했어요.");
        } finally {
          setBusy(false);
        }
      }}
    >
      <p>기기가 바뀌어도 내 언어와 연습 기록을 이어가요.</p>
      <label>
        학습자 아이디
        <input
          autoComplete="username"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
          pattern="[a-z0-9_-]{3,32}"
          placeholder="영문 소문자·숫자 3~32자"
        />
      </label>
      <label>
        비밀번호
        <input
          type="password"
          autoComplete={signup ? "new-password" : "current-password"}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          minLength={12}
          maxLength={128}
          placeholder="12자 이상"
        />
      </label>
      {error && <p role="alert">{error}</p>}
      <button className="hm-primary" disabled={busy}>
        {busy ? "확인 중…" : signup ? "학습 계정 만들기" : "로그인"}
      </button>
      <button
        type="button"
        onClick={() => {
          setSignup(!signup);
          setError("");
        }}
      >
        {signup ? "이미 계정이 있어요" : "처음이에요 · 계정 만들기"}
      </button>
      <p className="hm-muted">
        학습 계정에는 학생·콘텐츠 관리 권한이 없어요. 비밀번호 재설정은 아직
        지원하지 않으니 안전하게 보관해 주세요.
      </p>
      <Link href="/login?from=%2Fstudy">기존 튜터·관리자 로그인 →</Link>
    </form>
  );
}
function Connections({
  selection,
  onSelect,
}: {
  selection: string;
  onSelect: (s: string) => void;
}) {
  const [items, setItems] = useState<ModelConnection[]>([]),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [consent, setConsent] = useState(false),
    [key, setKey] = useState("");
  const refresh = useCallback(async () => {
    const data = await request("/api/model-connections");
    setItems(data.connections);
  }, []);
  useEffect(() => {
    let alive = true;
    async function check() {
      try {
        const d = await request("/api/model-connections");
        if (alive) {
          setItems(d.connections);
          setError("");
        }
      } catch (e) {
        if (alive)
          setError(e instanceof Error ? e.message : "연결을 확인해 주세요.");
      }
    }
    void check();
    const t = setInterval(() => void check(), 7000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, []);
  async function act(body: unknown, method = "POST") {
    setBusy(true);
    setError("");
    setKey("");
    try {
      await request("/api/model-connections", body, method);
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "연결 상태를 확인해 주세요.");
    } finally {
      setBusy(false);
    }
  }
  const choices = items
    .filter((c) => c.state === "connected")
    .flatMap((c) =>
      c.models.map((m) => ({
        id: `${c.id}:${m}`,
        label: `${c.provider} · ${m}`,
      })),
    );
  return (
    <>
      <p>
        기본 Gemini로 바로 시작하거나 내 AI를 연결하세요. 모델 변경 시 새 대화를
        시작해요.
      </p>
      <label>
        회화에 사용할 모델
        <select value={selection} onChange={(e) => onSelect(e.target.value)}>
          <option value="default">기본 Gemini</option>
          {selection !== "default" &&
            !choices.some((c) => c.id === selection) && (
              <option value={selection}>선택한 연결 확인 필요</option>
            )}
          {choices.map((c) => (
            <option key={c.id} value={c.id}>
              {c.label}
            </option>
          ))}
        </select>
      </label>
      <label className="hm-check">
        <input
          type="checkbox"
          checked={consent}
          onChange={(e) => setConsent(e.target.checked)}
        />
        대화를 선택한 공급자에 전달하고 연결 자격을 서버에 암호화 보관하는 데
        동의해요.
      </label>
      <button
        disabled={busy || !consent || items.some((c) => c.provider === "codex")}
        onClick={() => void act({ provider: "codex" })}
      >
        Codex 계정 연결
      </button>
      <p className="hm-muted">
        Codex는 ChatGPT 계정 로그인으로 연결해요. Claude는 구독 로그인이 아닌
        API 키 연결이며 API 요금이 적용돼요.
      </p>
      <label>
        Claude API 키
        <input
          type="password"
          autoComplete="off"
          value={key}
          onChange={(e) => setKey(e.target.value)}
          placeholder="sk-ant-api…"
        />
      </label>
      <button
        disabled={
          busy || !consent || !key || items.some((c) => c.provider === "claude")
        }
        onClick={() => void act({ provider: "claude", apiKey: key })}
      >
        Claude 연결
      </button>
      {items.map((c) => (
        <div key={c.id} className="hm-panel">
          <strong>{c.provider}</strong>
          <p>
            {
              {
                connected: "연결됨",
                authorizing: "공식 로그인 대기",
                expired: "다시 로그인 필요",
                quota_exceeded: "사용 한도 초과",
                error: "연결 확인 필요",
                disconnected: "연결 해제됨",
              }[c.state]
            }
          </p>
          {c.challenge && (
            <>
              <p>
                인증 코드: <strong>{c.challenge.code}</strong>
              </p>
              <a
                href={c.challenge.url}
                target="_blank"
                rel="noopener noreferrer"
              >
                공식 로그인 열기 ↗
              </a>
              <p>로그인 후 여기로 돌아와 모델을 선택하세요.</p>
            </>
          )}
          <button
            disabled={busy}
            onClick={() => void act({ id: c.id }, "DELETE")}
          >
            연결 해제
          </button>
        </div>
      ))}
      {error && <p role="alert">{error}</p>}
      <small>
        연결 오류가 나면 다른 모델로 자동 전환하지 않아요. 번역과 음성은 기본
        서비스를 사용해요.
      </small>
    </>
  );
}
const questions = [
  {
    title: "처음 만난 사람에게 내 출신을 말할 때",
    choices: [
      "한국에서 왔어요.",
      "얼마인가요?",
      "괜찮아요.",
      "아직 모르겠어요",
    ],
    scene: "smalltalk",
    index: 0,
  },
  {
    title: "카페에서 음료를 고르기 어려울 때",
    choices: [
      "두 명이에요.",
      "어떤 음료를 추천하세요?",
      "또 만나요.",
      "아직 모르겠어요",
    ],
    scene: "cafe",
    index: 1,
  },
  {
    title: "목적지에 처음 가는 길이에요",
    choices: [
      "주문을 바꿀게요.",
      "다른 색이 있나요?",
      "어떻게 가면 되나요?",
      "아직 모르겠어요",
    ],
    scene: "directions",
    index: 2,
  },
];
function Assessment({
  language,
  onFinish,
  busy,
}: {
  language: StudyLanguage;
  onFinish: (answers: number[], confidence: number, minutes: number) => void;
  busy: boolean;
}) {
  const [step, setStep] = useState(0),
    [answers, setAnswers] = useState<number[]>([]),
    [confidence, setConfidence] = useState(1),
    [minutes, setMinutes] = useState(10);
  const q = questions[step],
    units = starterUnits(language);
  const unit = q
    ? units.find((u) => u.scene === q.scene && u.level === q.index + 1)
    : undefined;
  return (
    <section className="hm-assessment hm-panel">
      <span className="hm-eyebrow">
        나에게 맞는 시작 · {Math.min(step + 1, 4)} / 4
      </span>
      <h1>쓸 줄 몰라도 괜찮아요.</h1>
      <p>
        들어보고, 아는 만큼만 골라요. 시험 점수가 아닌 연습 난이도를 추천해
        드려요.
      </p>
      {unit && q ? (
        <>
          <h2>{q.title}</h2>
          <Speaker
            key={unit.id}
            text={unit.phrase.text}
            label="문제 들어보기"
          />
          <p lang={language} className="hm-native">
            {unit.phrase.text}
          </p>
          <div className="hm-stack">
            {q.choices.map((c, i) => (
              <button
                key={c}
                onClick={() => {
                  setAnswers([...answers, i]);
                  setStep(step + 1);
                }}
              >
                {c}
              </button>
            ))}
          </div>
        </>
      ) : (
        <>
          <h2>이 한마디를 따라 말해 볼까요?</h2>
          <PhraseCard language={language} phrase={units[0].phrase} />
          <p>소리를 따라 한 뒤, 지금 편하게 할 수 있는 것을 골라 주세요.</p>
          <label>
            말하기 자신감
            <select
              value={confidence}
              onChange={(e) => setConfidence(Number(e.target.value))}
            >
              {curriculum.levels.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.title} · {l.goal}
                </option>
              ))}
            </select>
          </label>
          <label>
            하루 연습 시간
            <select
              value={minutes}
              onChange={(e) => setMinutes(Number(e.target.value))}
            >
              {[5, 10, 15].map((n) => (
                <option key={n} value={n}>
                  {n}분
                </option>
              ))}
            </select>
          </label>
          <p className="hm-muted">
            자기평가를 바탕으로 추천해요. 발음 점수나 공인 언어 등급이 아니며
            나중에 바꿀 수 있어요.
          </p>
          <button
            className="hm-primary"
            disabled={busy}
            onClick={() => onFinish(answers, confidence, minutes)}
          >
            내 연습 시작하기 →
          </button>
        </>
      )}
    </section>
  );
}
async function loadSnapshot(
  signal?: AbortSignal,
): Promise<{ identity: Identity; state: StudyState; units: Unit[] } | null> {
  const res = await fetch("/api/study", { cache: "no-store", signal });
  if (res.status === 401) return null;
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "기록을 불러오지 못했어요.");
  return data;
}
export function V2App() {
  const [identity, setIdentity] = useState<Identity | null>(null),
    [state, setState] = useState<StudyState>(emptyStudy),
    [extra, setExtra] = useState<Unit[]>([]),
    [language, setLanguage] = useState<StudyLanguage | null>(null),
    [tab, setTab] = useState<Tab>("study"),
    [section, setSection] = useState("today"),
    [levelFilter, setLevelFilter] = useState(1),
    [scene, setScene] = useState("smalltalk"),
    [selection, setSelection] = useState("default");
  const [modal, setModal] = useState<"login" | "ai" | "settings" | null>(null),
    [activeUnit, setActiveUnit] = useState<Unit | null>(null),
    [busy, setBusy] = useState(false),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  const [text, setText] = useState(""),
    [from, setFrom] = useState("auto"),
    [confirm, setConfirm] = useState(false),
    [translation, setTranslation] = useState<{
      translated: string;
      reading: string;
      from: string;
      original: string;
      saved: boolean;
    } | null>(null);
  const [chat, setChat] = useState<
      { role: "user" | "assistant"; content: string; phrase?: Phrase }[]
    >([]),
    [chatInput, setChatInput] = useState("");
  const operation = useRef(false);
  const apply = useCallback(
    (next: StudyState) =>
      setState((old) => (next.revision >= old.revision ? next : old)),
    [],
  );
  const hydrate = useCallback(
    (data: { identity: Identity; state: StudyState; units: Unit[] } | null) => {
      try {
        const saved = localStorage.getItem("hanmadi:v2:language");
        if (isStudyLanguage(saved)) setLanguage(saved);
      } catch {
        /* Optional browser preference. */
      }
      setIdentity(data?.identity ?? null);
      setState(data?.state ?? emptyStudy());
      setExtra(data?.units ?? []);
      if (data?.state.language) setLanguage(data.state.language);
    },
    [],
  );
  const refresh = useCallback(async () => {
    try {
      hydrate(await loadSnapshot());
    } catch (e) {
      setError(e instanceof Error ? e.message : "기록을 불러오지 못했어요.");
    } finally {
      setLoading(false);
    }
  }, [hydrate]);
  useEffect(() => {
    const controller = new AbortController();
    void loadSnapshot(controller.signal)
      .then((data) => {
        if (!controller.signal.aborted) hydrate(data);
      })
      .catch((e) => {
        if (!controller.signal.aborted)
          setError(
            e instanceof Error ? e.message : "기록을 불러오지 못했어요.",
          );
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [hydrate]);
  async function run(body: Record<string, unknown>) {
    if (!identity) {
      setModal("login");
      return null;
    }
    if (operation.current) return null;
    operation.current = true;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const data = await request("/api/study", { ...body, language });
      if (data.state) apply(data.state);
      return data;
    } catch (e) {
      setError(e instanceof Error ? e.message : "다시 시도해 주세요.");
      return null;
    } finally {
      operation.current = false;
      setBusy(false);
    }
  }
  async function chooseLanguage(value: StudyLanguage) {
    if (operation.current) return;
    setLanguage(value);
    try {
      localStorage.setItem("hanmadi:v2:language", value);
    } catch {
      /* Server preference still works. */
    }
    setChat([]);
    setText("");
    setChatInput("");
    setTranslation(null);
    setConfirm(false);
    setFrom("auto");
    setActiveUnit(null);
    setTab("study");
    setNotice("");
    setError("");
    if (identity) {
      operation.current = true;
      setBusy(true);
      try {
        const data = await request("/api/study", {
          action: "settings",
          language: value,
        });
        apply(data.state);
      } catch (e) {
        setError(
          e instanceof Error ? e.message : "언어 설정을 저장하지 못했어요.",
        );
      } finally {
        operation.current = false;
        setBusy(false);
      }
    }
  }
  async function toggleAutoSave(enabled: boolean) {
    const previous = state;
    setState((s) => ({ ...s, autoSave: enabled }));
    const result = await run({ action: "settings", autoSave: enabled });
    if (!result)
      setState((s) => (s.revision === previous.revision ? previous : s));
  }
  async function doTranslate(value = text, direction = from) {
    const data = await run({
      action: "translate",
      text: value,
      from: direction,
    });
    if (!data) return;
    if (data.needsConfirmation) {
      setConfirm(true);
      setTranslation(null);
      return;
    }
    setConfirm(false);
    setTranslation({ ...data, original: value });
  }
  async function sendChat(value = chatInput) {
    if (!value.trim()) return;
    const messages = [
      ...chat.map(({ role, content }) => ({ role, content })),
      { role: "user" as const, content: value },
    ];
    const data = await run({ action: "chat", scene, messages, selection });
    if (!data) return;
    setChat([
      ...messages,
      {
        role: "assistant",
        content: `${data.reply.text}\n${data.reply.reading}\n${data.reply.meaning}`,
        phrase: data.reply,
      },
    ]);
    setChatInput("");
  }
  const profile = language ? state.profiles[language] : undefined;
  const units = language
    ? [
        ...starterUnits(language),
        ...extra.filter((u) => u.language === language),
      ]
    : [];
  const queue = language ? studyQueue(state, language, units) : null;
  const due = language
    ? state.expressions.filter((e) => e.language === language)
    : [];
  return (
    <div className="hm">
      <header className="hm-header">
        <Link className="hm-brand" href="/study">
          한마디<span>small words, real moments</span>
        </Link>
        <div className="hm-row">
          {language && (
            <label className="hm-language">
              <span className="sr-only">학습 언어</span>
              <select
                aria-label="학습 언어"
                disabled={busy}
                value={language}
                onChange={(e) =>
                  void chooseLanguage(e.target.value as StudyLanguage)
                }
              >
                {Object.entries(studyLanguages).map(([id, l]) => (
                  <option key={id} value={id}>
                    {l.name}
                  </option>
                ))}
              </select>
            </label>
          )}
          <button
            disabled={busy}
            onClick={() => setModal(identity ? "ai" : "login")}
          >
            내 AI
          </button>
          <button
            aria-label={identity ? "설정" : "로그인"}
            disabled={busy}
            onClick={() => setModal(identity ? "settings" : "login")}
          >
            {identity ? "설정" : "로그인"}
          </button>
        </div>
      </header>
      <main className="hm-main">
        {error && (
          <div className="hm-alert" role="alert">
            {error}
            <button onClick={() => setError("")} aria-label="오류 닫기">
              ×
            </button>
          </div>
        )}
        {notice && (
          <p className="hm-notice" role="status">
            {notice}
          </p>
        )}
        {loading ? (
          <section className="hm-panel" role="status">
            내 학습을 준비하고 있어요…
          </section>
        ) : !language ? (
          <>
            <span className="hm-eyebrow">YOUR NEXT CONVERSATION</span>
            <h1>
              어디서든, 말문이 트이는
              <br />
              나만의 한마디.
            </h1>
            <p>
              여행에서 나눈 대화를 내 실력으로. 먼저 연습할 언어를 골라 주세요.
            </p>
            <div className="hm-language-grid">
              {Object.entries(studyLanguages).map(([id, l]) => (
                <button
                  key={id}
                  onClick={() => void chooseLanguage(id as StudyLanguage)}
                >
                  <span className="hm-lang-mark">{l.mark}</span>
                  <strong>{l.name}</strong>
                  <small>{l.native}</small>
                  <span>시작하기 ↗</span>
                </button>
              ))}
            </div>
          </>
        ) : identity && !profile ? (
          <Assessment
            key={language}
            language={language}
            busy={busy}
            onFinish={(answers, confidence, minutes) =>
              void run({ action: "assess", answers, confidence, minutes })
            }
          />
        ) : (
          <>
            {tab === "study" && (
              <>
                <div className="hm-page-heading">
                  <span className="hm-eyebrow">A LITTLE EVERY DAY</span>
                  <h1>
                    {identity
                      ? "오늘도, 한마디."
                      : "말하기가 처음이어도 괜찮아요."}
                  </h1>
                  <p>
                    {studyLanguages[language].name} ·{" "}
                    {curriculum.levels[(profile?.level ?? 1) - 1].title} · 하루{" "}
                    {profile?.minutes ?? 10}분
                  </p>
                </div>
                <div className="hm-segments" aria-label="학습 보기">
                  {[
                    ["today", "오늘 학습"],
                    ["levels", "레벨별"],
                    ["scenes", "상황별"],
                  ].map(([id, label]) => (
                    <button
                      aria-pressed={section === id}
                      key={id}
                      onClick={() => setSection(id)}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                {!identity && (
                  <div className="hm-notice">
                    표현은 먼저 둘러볼 수 있어요.{" "}
                    <button onClick={() => setModal("login")}>
                      로그인하고 레벨 체크하기 →
                    </button>
                  </div>
                )}
                {section === "today" && (
                  <>
                    <section className="hm-hero">
                      <div>
                        <span className="hm-eyebrow">TODAY’S LITTLE WIN</span>
                        <h2>
                          오늘 배운 한마디가
                          <br />
                          내일의 대화가 돼요.
                        </h2>
                        <p>
                          {queue?.due.length
                            ? `번역에서 만난 표현 ${queue.due.length}개를 다시 말해 볼까요?`
                            : "듣고, 따라 말하고, 나만의 말로 바꿔요."}
                        </p>
                        <button
                          className="hm-primary"
                          onClick={() =>
                            setActiveUnit(queue?.lessons[0] ?? units[0])
                          }
                        >
                          오늘 연습 시작하기 ↗
                        </button>
                      </div>
                      <div className="hm-hero-art" aria-hidden="true">
                        <span>hello!</span>
                        <span>こんにちは</span>
                        <span>สวัสดี</span>
                        <span>¡hola!</span>
                      </div>
                    </section>
                    {!!queue?.due.length && (
                      <section>
                        <div className="hm-row hm-between">
                          <h2>내 대화에서 다시 만난 표현</h2>
                          <button onClick={() => setTab("phrases")}>
                            모두 보기 →
                          </button>
                        </div>
                        <div className="hm-grid">
                          {queue.due.map((e) => (
                            <PhraseCard
                              key={e.id}
                              language={language}
                              phrase={e}
                            >
                              <span className="hm-badge">
                                {e.source === "translation"
                                  ? "번역에서"
                                  : "AI 대화에서"}
                              </span>
                              <div className="hm-row">
                                <button
                                  disabled={busy}
                                  onClick={() =>
                                    void run({
                                      action: "practice",
                                      id: e.id,
                                      confidence: "help",
                                    })
                                  }
                                >
                                  도움 받고 말했어요
                                </button>
                                <button
                                  disabled={busy}
                                  onClick={() =>
                                    void run({
                                      action: "practice",
                                      id: e.id,
                                      confidence: "alone",
                                    })
                                  }
                                >
                                  혼자 말했어요
                                </button>
                              </div>
                            </PhraseCard>
                          ))}
                        </div>
                      </section>
                    )}
                    <h2>오늘의 연습 순서</h2>
                    <div className="hm-grid">
                      {queue?.lessons.map((u, i) => (
                        <button
                          className="hm-course-card"
                          key={u.id}
                          onClick={() => setActiveUnit(u)}
                        >
                          <span className="hm-eyebrow">
                            0{i + 1} ·{" "}
                            {u.source === "admin" ? "추가 수업" : "기본 수업"}
                          </span>
                          <strong>{u.title}</strong>
                          {profile?.practiced[u.id] && (
                            <span className="hm-badge">연습한 표현</span>
                          )}
                          <p>{u.phrase.meaning}</p>
                          <span>듣고 말하기 →</span>
                        </button>
                      ))}
                    </div>
                    <div className="hm-callout">
                      <div>
                        <h3>여행 중이라면?</h3>
                        <p>지금 필요한 말을 번역하고 다음 연습으로 이어가요.</p>
                      </div>
                      <button onClick={() => setTab("translate")}>
                        번역 열기 ↗
                      </button>
                    </div>
                  </>
                )}
                {section === "levels" && (
                  <>
                    <div className="hm-levels">
                      {curriculum.levels.map((l) => (
                        <button
                          key={l.id}
                          aria-pressed={levelFilter === l.id}
                          onClick={() => setLevelFilter(l.id)}
                        >
                          <span>LEVEL {l.id}</span>
                          <strong>{l.title}</strong>
                          <small>{l.goal}</small>
                        </button>
                      ))}
                    </div>
                    <h2>{curriculum.levels[levelFilter - 1].title}</h2>
                    <div className="hm-grid">
                      {units
                        .filter((u) => u.level === levelFilter)
                        .map((u) => (
                          <button
                            className="hm-course-card"
                            key={u.id}
                            onClick={() => setActiveUnit(u)}
                          >
                            <span>
                              {
                                curriculum.scenes.find((s) => s.id === u.scene)
                                  ?.title
                              }
                            </span>
                            <strong>{u.title}</strong>
                            {profile?.practiced[u.id] && (
                              <span className="hm-badge">연습한 표현</span>
                            )}
                            <p>{u.phrase.meaning}</p>
                            <span>연습하기 →</span>
                          </button>
                        ))}
                    </div>
                  </>
                )}
                {section === "scenes" && (
                  <>
                    <div className="hm-scene-grid">
                      {curriculum.scenes.map((s) => (
                        <button
                          aria-pressed={scene === s.id}
                          key={s.id}
                          onClick={() => setScene(s.id)}
                        >
                          <strong>{s.title}</strong>
                          <small>{s.subtitle}</small>
                        </button>
                      ))}
                    </div>
                    <h2>
                      {curriculum.scenes.find((s) => s.id === scene)?.title}에서
                      한마디
                    </h2>
                    <div className="hm-grid">
                      {units
                        .filter((u) => u.scene === scene)
                        .map((u) => (
                          <button
                            className="hm-course-card"
                            key={u.id}
                            onClick={() => setActiveUnit(u)}
                          >
                            <span>
                              LEVEL {u.level} ·{" "}
                              {u.source === "admin" ? "추가 수업" : "기본 수업"}
                            </span>
                            <strong>{u.title}</strong>
                            {profile?.practiced[u.id] && (
                              <span className="hm-badge">연습한 표현</span>
                            )}
                            <p>{u.phrase.meaning}</p>
                            <span>연습하기 →</span>
                          </button>
                        ))}
                    </div>
                  </>
                )}
                <p className="hm-muted">
                  한글 발음은 소리를 따라 하기 위한 도움이에요. 특히 태국어
                  성조는 음성과 함께 익혀 주세요.
                </p>
              </>
            )}
            {tab === "translate" && (
              <>
                <div className="hm-page-heading">
                  <span className="hm-eyebrow">WORDS FOR RIGHT NOW</span>
                  <h1>지금, 서로에게 한마디.</h1>
                  <p>
                    한국어 ↔ {studyLanguages[language].name} · 같은 마이크로
                    번갈아 말해요.
                  </p>
                </div>
                <section className="hm-panel">
                  <div className="hm-row hm-between">
                    <label>
                      입력 언어
                      <select
                        value={from}
                        disabled={busy}
                        onChange={(e) => {
                          setFrom(e.target.value);
                          setConfirm(false);
                        }}
                      >
                        <option value="auto">자동 감지</option>
                        <option value="ko">한국어</option>
                        <option value={language}>
                          {studyLanguages[language].name}
                        </option>
                      </select>
                    </label>
                    <span className="hm-badge">기본 번역 AI</span>
                  </div>
                  {translation && (
                    <div className="hm-translation" aria-live="polite">
                      <div>
                        <span className="hm-eyebrow">
                          {translation.from === "ko"
                            ? "한국어"
                            : studyLanguages[language].name}
                        </span>
                        <p>{translation.original}</p>
                        {translation.from !== "ko" && (
                          <p className="hm-reading">{translation.reading}</p>
                        )}
                      </div>
                      <div>
                        <span className="hm-eyebrow">
                          {translation.from === "ko"
                            ? studyLanguages[language].name
                            : "한국어"}
                        </span>
                        <p className="hm-native">{translation.translated}</p>
                        {translation.from === "ko" && (
                          <p className="hm-reading">{translation.reading}</p>
                        )}
                        <Speaker
                          key={translation.translated}
                          text={translation.translated}
                          label={
                            translation.from === "ko"
                              ? "상대에게 들려주기"
                              : "한국어로 듣기"
                          }
                        />
                      </div>
                      <small>
                        {translation.saved
                          ? "내 표현에 반영했어요. 오늘 학습에서 다시 말해 보세요."
                          : state.autoSave
                            ? "학습에 저장할 일반 표현이 없거나 저장 설정이 바뀌었어요."
                            : "번역은 완료했어요. 자동 학습 반영은 꺼져 있어요."}
                      </small>
                    </div>
                  )}
                  <Microphone
                    key={`${language}:${from}:translate`}
                    language={from}
                    disabled={busy || !identity}
                    onText={(t) => {
                      setText(t);
                      void doTranslate(t);
                    }}
                  />
                  <details>
                    <summary>직접 입력하거나 인식한 말 수정하기</summary>
                    <label>
                      번역할 말
                      <textarea
                        maxLength={1000}
                        value={text}
                        onChange={(e) => setText(e.target.value)}
                        placeholder="편하게 한국어로 말해도 돼요."
                      />
                    </label>
                    <button
                      className="hm-primary"
                      disabled={busy || !text.trim()}
                      onClick={() => void doTranslate()}
                    >
                      {busy ? "번역 중…" : "번역하기"}
                    </button>
                  </details>
                  {!identity && (
                    <button onClick={() => setModal("login")}>
                      로그인하고 번역하기
                    </button>
                  )}
                  {confirm && (
                    <div className="hm-notice" role="status">
                      <p>
                        짧거나 섞인 말이라 언어를 확인해야 해요. 아직
                        번역·저장하지 않았어요.
                      </p>
                      <button
                        disabled={busy}
                        onClick={() => void doTranslate(text, "ko")}
                      >
                        한국어로 말했어요
                      </button>
                      <button
                        disabled={busy}
                        onClick={() => void doTranslate(text, language)}
                      >
                        {studyLanguages[language].name}로 말했어요
                      </button>
                    </div>
                  )}
                </section>
                <div className="hm-callout">
                  <div>
                    <h3>번역을 내 실력으로</h3>
                    <p>
                      켜면 번역에서 짧은 일반 표현을 골라 내 학습에 반영해요.
                      원음·전체 대화는 한마디 학습 기록에 저장하지 않아요.
                    </p>
                  </div>
                  <label className="hm-check">
                    <input
                      type="checkbox"
                      checked={state.autoSave}
                      disabled={busy}
                      onChange={(e) => void toggleAutoSave(e.target.checked)}
                    />
                    자동 반영
                  </label>
                </div>
                <p className="hm-muted">
                  상대에게 번역 중임을 알려 주세요. 음성·문장은 처리를 위해 AI
                  공급자로 전송돼요. 중요한 정보는 번역 결과를 확인해 주세요.
                </p>
              </>
            )}
            {tab === "chat" && (
              <>
                <div className="hm-page-heading">
                  <span className="hm-eyebrow">
                    YOUR PATIENT PRACTICE PARTNER
                  </span>
                  <h1>틀려도 괜찮은 대화 상대.</h1>
                  <p>
                    아무 말이 떠오르지 않으면 한국어로 말해 주세요. 한마디씩
                    같이 해 볼게요.
                  </p>
                </div>
                <section className="hm-panel">
                  <div className="hm-row hm-between">
                    <label>
                      대화 상황
                      <select
                        disabled={busy}
                        value={scene}
                        onChange={(e) => {
                          setScene(e.target.value);
                          setChat([]);
                        }}
                      >
                        {curriculum.scenes.map((s) => (
                          <option key={s.id} value={s.id}>
                            {s.title}
                          </option>
                        ))}
                      </select>
                    </label>
                    <button
                      onClick={() => setModal(identity ? "ai" : "login")}
                      disabled={busy}
                    >
                      {selection === "default" ? "기본 Gemini" : "내 AI 모델"} ▾
                    </button>
                    <button
                      disabled={busy || !chat.length}
                      onClick={() => setChat([])}
                    >
                      새 대화
                    </button>
                  </div>
                  {!chat.length && (
                    <div className="hm-chat-empty">
                      <span className="hm-coach">h.</span>
                      <h2>먼저 말을 걸어 드릴게요.</h2>
                      <p>
                        {curriculum.scenes.find((s) => s.id === scene)?.prompt}
                      </p>
                      <button
                        className="hm-primary"
                        disabled={busy}
                        onClick={() =>
                          void sendChat(
                            "아직 이 언어를 몰라요. 짧은 인사와 따라 말할 예시부터 알려 주세요.",
                          )
                        }
                      >
                        AI가 먼저 말하기 →
                      </button>
                    </div>
                  )}
                  <div className="hm-chat-log" aria-live="polite">
                    {chat.map((m, i) =>
                      m.phrase ? (
                        <div key={i} className="hm-chat-assistant">
                          <span className="hm-eyebrow">한마디 AI</span>
                          <PhraseCard phrase={m.phrase} language={language}>
                            <button
                              disabled={busy}
                              onClick={async () => {
                                const data = await run({
                                  action: "save-chat",
                                  phrase: m.phrase,
                                });
                                if (data)
                                  setNotice(
                                    data.saved
                                      ? "내 표현에 추가했어요."
                                      : "표현을 저장하지 못했어요.",
                                  );
                              }}
                            >
                              이 표현 연습에 추가
                            </button>
                          </PhraseCard>
                        </div>
                      ) : (
                        <p key={i} className="hm-chat-user">
                          {m.content}
                        </p>
                      ),
                    )}
                  </div>
                  {busy && <p role="status">한마디를 준비하고 있어요…</p>}
                  <Microphone
                    key={`${language}:${selection}:${scene}:chat`}
                    language="auto"
                    disabled={busy || chat.length >= 20 || !identity}
                    onText={(t) => {
                      setChatInput(t);
                      void sendChat(t);
                    }}
                  />
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      void sendChat();
                    }}
                  >
                    <label>
                      말이 막히면 한국어로 도움 요청
                      <input
                        value={chatInput}
                        onChange={(e) => setChatInput(e.target.value)}
                        maxLength={1000}
                        placeholder="예: 덜 달게 해 달라고 말하고 싶어"
                      />
                    </label>
                    <button
                      className="hm-primary"
                      disabled={busy || !chatInput.trim() || chat.length >= 20}
                    >
                      보내기
                    </button>
                  </form>
                  {chat.length >= 20 && (
                    <p>충분히 연습했어요! 새 대화를 열면 계속할 수 있어요.</p>
                  )}
                  <p className="hm-muted">
                    대화는 이 화면을 떠나면 사라져요. 다시 연습할 표현만 직접
                    추가하세요. AI는 틀릴 수 있으며 음성 전사로 발음 점수를
                    매기지 않아요.
                  </p>
                </section>
              </>
            )}
            {tab === "phrases" && (
              <>
                <div className="hm-page-heading">
                  <span className="hm-eyebrow">WORDS THAT ARE YOURS</span>
                  <h1>내가 써 본 말, 내 표현.</h1>
                  <p>
                    {studyLanguages[language].name} 표현 {due.length}개 · 말해
                    본 뒤 다음 복습일을 정해요.
                  </p>
                </div>
                {!due.length ? (
                  <section className="hm-panel">
                    <h2>아직 모은 표현이 없어요.</h2>
                    <p>
                      번역 자동 반영을 켜거나 AI 대화에서 마음에 드는 표현을
                      추가해 보세요.
                    </p>
                    <button
                      className="hm-primary"
                      onClick={() => setTab("translate")}
                    >
                      번역해 보기 →
                    </button>
                  </section>
                ) : (
                  <div className="hm-grid">
                    {due.map((e) => (
                      <PhraseCard key={e.id} language={language} phrase={e}>
                        <div className="hm-row hm-between">
                          <span className="hm-badge">
                            {e.source === "translation"
                              ? "번역에서"
                              : "AI 대화에서"}
                          </span>
                          <button
                            disabled={busy}
                            onClick={() =>
                              void run({ action: "delete", id: e.id })
                            }
                            aria-label={`${e.meaning} 삭제`}
                          >
                            삭제
                          </button>
                        </div>
                        <small>
                          {e.practicedAt
                            ? `다음 복습 ${new Date(e.dueAt).toLocaleDateString("ko-KR")}`
                            : "아직 연습 전이에요"}
                        </small>
                        <div className="hm-row">
                          <button
                            disabled={busy}
                            onClick={() =>
                              void run({
                                action: "practice",
                                id: e.id,
                                confidence: "help",
                              })
                            }
                          >
                            도움 받고 말했어요
                          </button>
                          <button
                            disabled={busy}
                            onClick={() =>
                              void run({
                                action: "practice",
                                id: e.id,
                                confidence: "alone",
                              })
                            }
                          >
                            혼자 말했어요
                          </button>
                        </div>
                      </PhraseCard>
                    ))}
                  </div>
                )}
              </>
            )}
          </>
        )}
      </main>
      <nav className="hm-bottom" aria-label="주요 메뉴">
        {(
          [
            ["study", "◫", "스터디"],
            ["chat", "◌", "AI 대화"],
            ["translate", "↔", "번역"],
            ["phrases", "▤", "내 표현"],
          ] as const
        ).map(([id, icon, label]) => (
          <button
            key={id}
            disabled={busy || !language}
            aria-current={tab === id ? "page" : undefined}
            onClick={() => {
              setTab(id);
              setError("");
              setNotice("");
              if (id !== "chat") {
                setChat([]);
                setChatInput("");
              }
            }}
          >
            <span aria-hidden="true">{icon}</span>
            {label}
          </button>
        ))}
      </nav>
      {modal && (
        <Dialog
          title={
            modal === "login"
              ? "나의 한마디 시작하기"
              : modal === "ai"
                ? "내 AI 연결"
                : "나의 학습 설정"
          }
          onClose={() => setModal(null)}
        >
          {error && <p role="alert">{error}</p>}
          {modal === "login" ? (
            <Login
              onDone={() => {
                setModal(null);
                void refresh();
              }}
            />
          ) : modal === "ai" ? (
            <Connections
              selection={selection}
              onSelect={(s) => {
                setSelection(s);
                setChat([]);
              }}
            />
          ) : (
            <>
              <p>{identity?.name}님의 학습 공간</p>
              {profile && language && (
                <>
                  <label>
                    현재 연습 난이도
                    <select
                      value={profile.level}
                      disabled={busy}
                      onChange={(e) =>
                        void run({
                          action: "level",
                          level: Number(e.target.value),
                          minutes: profile.minutes,
                        })
                      }
                    >
                      {curriculum.levels.map((l) => (
                        <option key={l.id} value={l.id}>
                          {l.id} · {l.title}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    하루 연습 시간
                    <select
                      value={profile.minutes}
                      disabled={busy}
                      onChange={(e) =>
                        void run({
                          action: "level",
                          level: profile.level,
                          minutes: Number(e.target.value),
                        })
                      }
                    >
                      {[5, 10, 15].map((n) => (
                        <option key={n} value={n}>
                          {n}분
                        </option>
                      ))}
                    </select>
                  </label>
                </>
              )}
              <label className="hm-check">
                <input
                  type="checkbox"
                  checked={state.autoSave}
                  disabled={busy}
                  onChange={(e) => void toggleAutoSave(e.target.checked)}
                />
                번역 표현 자동 학습 반영
              </label>
              <p>
                내 표현에서 항목별로 삭제할 수 있어요. 저장해도 실력이 자동으로
                오른 것으로 기록하지 않아요.
              </p>
              <button onClick={() => setModal("ai")}>내 AI 연결 관리 →</button>
              {identity?.owner && (
                <p>
                  <Link href="/study/admin">콘텐츠 관리자 →</Link>
                </p>
              )}
              <p>
                <Link href="/learn">기존 한국어·튜터 수업 →</Link>
              </p>
              <button
                onClick={async () => {
                  try {
                    await request("/api/study/account", { action: "logout" });
                    setIdentity(null);
                    setState(emptyStudy());
                    setExtra([]);
                    setChat([]);
                    setTranslation(null);
                    setSelection("default");
                    setModal(null);
                  } catch (e) {
                    setError(
                      e instanceof Error ? e.message : "로그아웃하지 못했어요.",
                    );
                  }
                }}
              >
                로그아웃
              </button>
            </>
          )}
        </Dialog>
      )}
      {activeUnit && language && (
        <Dialog title={activeUnit.title} onClose={() => setActiveUnit(null)}>
          {error && <p role="alert">{error}</p>}
          <span className="hm-badge">
            LEVEL {activeUnit.level} ·{" "}
            {curriculum.levels[activeUnit.level - 1].title}
          </span>
          <h3>① 듣고 소리를 따라 해요</h3>
          <PhraseCard language={language} phrase={activeUnit.phrase} />
          <h3>② 화면을 가리고 한 번 말해요</h3>
          <p>정답을 쓸 필요 없어요. 입으로 꺼내 말하는 것이 목표예요.</p>
          <details>
            <summary>뜻만 보고 연습하기</summary>
            <p>{activeUnit.phrase.meaning}</p>
          </details>
          <h3>③ 지금은 얼마나 편했나요?</h3>
          <div className="hm-stack">
            <button
              disabled={busy}
              onClick={async () => {
                const data = await run({
                  action: "practice",
                  id: activeUnit.id,
                  confidence: "help",
                });
                if (data) {
                  setActiveUnit(null);
                  setNotice("연습을 기록했어요. 다음에 다시 들어봐요.");
                }
              }}
            >
              도움을 받고 말했어요
            </button>
            <button
              className="hm-primary"
              disabled={busy}
              onClick={async () => {
                const data = await run({
                  action: "practice",
                  id: activeUnit.id,
                  confidence: "alone",
                });
                if (data) {
                  setActiveUnit(null);
                  setNotice("말하기 연습을 기록했어요!");
                }
              }}
            >
              혼자 말했어요
            </button>
            <button
              onClick={() => {
                setScene(activeUnit.scene);
                setActiveUnit(null);
                setTab("chat");
                setChat([]);
              }}
            >
              이 상황에서 AI와 대화하기 →
            </button>
          </div>
          {language === "th" && (
            <p className="hm-muted">
              예문의 ค่ะ/คะ는 여성 화자용 존댓말이에요. 남성 화자는 ครับ을
              사용할 수 있어요. 성조는 음성과 함께 확인해 주세요.
            </p>
          )}
        </Dialog>
      )}
    </div>
  );
}
