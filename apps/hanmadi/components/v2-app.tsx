"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { V2Icon as Icon } from "./v2-icon";
import { Speaker } from "./v2-speaker";
import { studyAudio } from "@/lib/study-audio-client";
import { Dialog } from "./v2-dialog";
import { Wordbook } from "./v2-wordbook";
import { Vocabulary } from "./v2-vocabulary";
import { V2Lesson } from "./v2-lesson";
import { lessonPlan } from "@/lib/v2-lesson";
import { GoogleLogin } from "./google-login";
import { V2Settings } from "./v2-settings";
import {
  curriculum,
  studyLanguages,
  isStudyLanguage,
  starterUnits,
  studyQueue,
  isVocabulary,
  hasLessonProgress,
  emptyStudy,
  type StudyLanguage,
  type StudyState,
  type Unit,
  type Phrase,
} from "@/lib/v2";
import type { ModelConnection } from "@/lib/model-connections";
type Identity = { name: string; owner: boolean };
type Tab = "study" | "chat" | "translate" | "phrases" | "words";
async function request(
  path: string,
  body?: unknown,
  method = "POST",
  timeoutMs = 45000,
) {
  const res = await fetch(path, {
    method: body === undefined ? "GET" : method,
    headers: body === undefined ? {} : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
    cache: "no-store",
    signal: AbortSignal.timeout(timeoutMs),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "잠시 후 다시 시도해 주세요.");
  return data;
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
  vocabulary = false,
  onVocabularySaved,
}: {
  phrase: Phrase;
  language: StudyLanguage;
  vocabulary?: boolean;
  onVocabularySaved?: (state: StudyState) => void;
  children?: React.ReactNode;
}) {
  return (
    <article className="hm-expression">
      {vocabulary ? <Vocabulary phrase={phrase} language={language} onSaved={onVocabularySaved} /> : (
        <p className="hm-native" lang={language}>{phrase.text}</p>
      )}
      <p className="hm-reading">{phrase.reading}</p>
      <p>{phrase.meaning}</p>
      <Speaker key={language + phrase.text} text={phrase.text} language={language} />
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
      <GoogleLogin onDone={onDone} disabled={busy} onBusyChange={setBusy} />
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
        학습 계정에는 학생·콘텐츠 관리 권한이 없어요. 아이디로 가입했다면
        비밀번호를 안전하게 보관해 주세요. 비밀번호 재설정은 아직 지원하지 않아요.
      </p>
      <Link href="/login?from=%2Fstudy">기존 튜터·관리자 로그인 →</Link>
    </form>
  );
}
function ConnectionChallenge({
  connection,
  busy,
  onAuthorize,
}: {
  connection: ModelConnection;
  busy: boolean;
  onAuthorize: (id: string, code: string) => Promise<void>;
}) {
  const [code, setCode] = useState("");
  const [copyMessage, setCopyMessage] = useState("");
  const challenge = connection.challenge;
  if (!challenge) return <p role="status">공식 인증창을 준비하고 있어요…</p>;
  const native = challenge.kind === "code-entry";
  return (
    <div className="hm-auth-challenge">
      <p>
        {native
          ? "1. Claude 인증창에서 로그인하고 승인코드를 복사하세요."
          : "1. 아래 인증코드를 복사해 Codex 인증창에 입력하세요."}
      </p>
      {!native && (
        <>
          <label>
            Codex 인증코드
            <input
              readOnly
              value={challenge.code}
              onFocus={(e) => e.currentTarget.select()}
            />
          </label>
          <button
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(challenge.code);
                setCopyMessage("인증코드를 복사했어요.");
              } catch {
                setCopyMessage(
                  "자동 복사를 사용할 수 없어요. 위 코드를 선택해 직접 복사해 주세요.",
                );
              }
            }}
          >
            인증코드 복사
          </button>
          {copyMessage && <p role="status">{copyMessage}</p>}
        </>
      )}
      <a href={challenge.url} target="_blank" rel="noopener noreferrer">
        {native ? "Claude" : "Codex"} 인증창 열기 ↗
      </a>
      <small>새 창이 열리지 않거나 닫혔다면 위 링크를 눌러 주세요.</small>
      {native && !challenge.submitted && (
        <form
          onSubmit={async (event) => {
            event.preventDefault();
            if (busy || !code.trim()) return;
            const submittedCode = code.trim();
            setCode("");
            await onAuthorize(connection.id, submittedCode);
          }}
        >
          <label>
            2. Claude 승인코드
            <input
              type="password"
              autoComplete="off"
              spellCheck={false}
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="Claude 인증창에서 받은 승인코드"
              required
            />
          </label>
          <button disabled={busy || !code.trim()}>승인코드로 연결</button>
        </form>
      )}
      <p role="status">
        {native && !challenge.submitted
          ? "승인코드를 입력하면 연결 결과를 자동으로 확인해요."
          : "인증 완료를 기다리고 있어요. 연결되면 모델 목록이 자동으로 나타나요."}
      </p>
    </div>
  );
}
function Connections({
  selection,
  onSelect,
  onConversation,
}: {
  selection: string;
  onSelect: (s: string) => void;
  onConversation: () => void;
}) {
  const [items, setItems] = useState<ModelConnection[]>([]),
    [error, setError] = useState(""),
    [loadError, setLoadError] = useState(""),
    [pending, setPending] = useState(true),
    [busy, setBusy] = useState(false),
    [consent, setConsent] = useState(false),
    [key, setKey] = useState(""),
    [claudeSetup, setClaudeSetup] = useState(false);
  const mounted = useRef(false);
  const revision = useRef(0);
  const loginWindow = useRef<{
    window: Window | null;
    id: string;
    navigated: boolean;
  } | null>(null);
  const refresh = useCallback(async () => {
    const version = ++revision.current;
    const data = await request("/api/model-connections");
    if (!mounted.current || version !== revision.current) return;
    setItems(data.connections);
    setLoadError("");
    setPending(false);
  }, []);
  useEffect(() => {
    mounted.current = true;
    const requestRevision = revision;
    let stopped = false,
      checking = false;
    async function check() {
      if (checking || stopped) return;
      checking = true;
      try {
        await refresh();
      } catch (e) {
        if (!stopped)
          setLoadError(
            e instanceof Error ? e.message : "연결을 확인해 주세요.",
          );
      } finally {
        checking = false;
        if (!stopped) setPending(false);
      }
    }
    void check();
    const timer = setInterval(() => void check(), 3000);
    const focus = () => void check();
    window.addEventListener("focus", focus);
    document.addEventListener("visibilitychange", focus);
    return () => {
      stopped = true;
      mounted.current = false;
      requestRevision.current++;
      clearInterval(timer);
      window.removeEventListener("focus", focus);
      document.removeEventListener("visibilitychange", focus);
      if (loginWindow.current && !loginWindow.current.navigated)
        loginWindow.current.window?.close();
      loginWindow.current = null;
    };
  }, [refresh]);
  useEffect(() => {
    const target = loginWindow.current;
    if (!target || target.navigated) return;
    const connection = items.find((c) => c.id === target.id);
    if (connection?.challenge && target.window && !target.window.closed) {
      // URLs have already passed the account client's exact official URL allowlist.
      target.window.location.replace(connection.challenge.url);
      target.navigated = true;
    } else if (connection && connection.state !== "authorizing") {
      target.window?.close();
      loginWindow.current = null;
    }
  }, [items]);
  async function act(body: unknown, method = "POST", login = false) {
    setBusy(true);
    setError("");
    setKey("");
    revision.current++;
    try {
      const data = await request("/api/model-connections", body, method);
      if (login && loginWindow.current)
        loginWindow.current.id = data.connection.id;
      if (mounted.current && data.connection)
        setItems((previous) => [
          ...previous.filter((c) => c.id !== data.connection.id),
          data.connection,
        ]);
      await refresh();
      setClaudeSetup(false);
    } catch (e) {
      if (login && loginWindow.current && !loginWindow.current.navigated) {
        loginWindow.current.window?.close();
        loginWindow.current = null;
      }
      setError(e instanceof Error ? e.message : "연결 상태를 확인해 주세요.");
    } finally {
      setBusy(false);
    }
  }
  function startLogin(provider: "codex" | "claude") {
    if (busy || pending || loadError || !consent) return;
    // Reserve the window during the click so async challenge delivery is not popup-blocked.
    const popup = window.open("about:blank", "_blank");
    if (popup) {
      popup.opener = null;
      popup.document.title = "공식 인증창 준비 중";
      popup.document.body.textContent =
        "공식 인증창을 준비하고 있어요. 잠시만 기다려 주세요.";
    }
    loginWindow.current = { window: popup, id: "", navigated: false };
    void act(
      {
        provider,
        ...(provider === "claude" ? { authMethod: "claude-code" } : {}),
      },
      "POST",
      true,
    );
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
    <section className="hm-ai-settings">
      <h2 className="hm-panel-heading">
        내 AI로도
        <br />
        이야기해요.
      </h2>
      <p className="hm-settings-note">
        연결 없이 기본 Gemini로 시작할 수 있어요.
      </p>
      <section className="hm-model-active">
        <span className="hm-badge">현재 AI</span>
        <h3>
          {selection === "default"
            ? "기본 Gemini"
            : (choices.find((c) => c.id === selection)?.label ??
              "선택한 연결 확인 필요")}
        </h3>
        <p>
          AI 회화에 적용하는 선택이에요.
          <br />
          여행 번역과 음성은 기본 서비스를 사용해요.
        </p>
      </section>
      <fieldset className="hm-model-choices">
        <legend>대화할 AI 선택</legend>
        <button
          aria-pressed={selection === "default"}
          onClick={() => onSelect("default")}
        >
          <span>
            <b>기본 Gemini</b>
            <small>별도 연결 없이 사용</small>
          </span>
          {selection === "default" && <Icon name="check" />}
        </button>
        {choices.map((c) => (
          <button
            key={c.id}
            aria-pressed={selection === c.id}
            onClick={() => onSelect(c.id)}
          >
            <span>
              <b>{c.label}</b>
              <small>연결된 내 계정으로 대화해요</small>
            </span>
            {selection === c.id && <Icon name="check" />}
          </button>
        ))}
      </fieldset>
      <button
        className="hm-primary hm-full"
        disabled={
          selection !== "default" && !choices.some((c) => c.id === selection)
        }
        onClick={onConversation}
      >
        이 AI로 대화하기 <Icon name="arrow" />
      </button>

      {pending && <p role="status">내 계정 연결을 확인하고 있어요…</p>}
      {loadError && (
        <div className="hm-alert" role="alert">
          <p>{loadError}</p>
          <button
            disabled={busy}
            onClick={() =>
              void refresh().catch((e) =>
                setLoadError(
                  e instanceof Error ? e.message : "연결을 확인해 주세요.",
                ),
              )
            }
          >
            연결 상태 다시 확인
          </button>
        </div>
      )}
      <div className="hm-section-heading">
        <h2>연결 관리</h2>
      </div>
      <label className="hm-check">
        <input
          type="checkbox"
          checked={consent}
          onChange={(e) => setConsent(e.target.checked)}
        />
        대화를 선택한 공급자에 전달하고 연결 정보를 서버에 보관하는 데 동의해요.
      </label>
      {!consent && (
        <p className="hm-muted">
          새 계정을 연결하려면 위 동의 항목을 선택하세요. 기본 Gemini는 별도
          연결이 필요 없어요.
        </p>
      )}
      {(["codex", "claude"] as const).map((provider) => (
        <section
          key={provider}
          className="hm-provider-card"
          aria-label={`${provider === "codex" ? "Codex" : "Claude"} 연결 관리`}
        >
          <div className="hm-provider-row">
            <div>
              <h3>{provider === "codex" ? "Codex" : "Claude"}</h3>
              <small>
                {provider === "codex"
                  ? "ChatGPT 계정 로그인"
                  : "Claude 계정 로그인 · 공식 Claude Code 실행"}
              </small>
            </div>
            {!items.some((c) => c.provider === provider) &&
              (provider === "codex" ? (
                <button
                  disabled={busy || pending || !!loadError || !consent}
                  onClick={() => startLogin("codex")}
                >
                  Codex 계정 연결
                </button>
              ) : (
                <div className="hm-provider-actions">
                  <button
                    disabled={busy || pending || !!loadError || !consent}
                    onClick={() => startLogin("claude")}
                  >
                    Claude 계정 연결
                  </button>
                  <button
                    disabled={busy || pending || !!loadError}
                    aria-expanded={claudeSetup}
                    aria-controls="claude-connection-setup"
                    onClick={() => setClaudeSetup(true)}
                  >
                    API 키로 연결
                  </button>
                </div>
              ))}
          </div>
          {items
            .filter((c) => c.provider === provider)
            .map((c) => (
              <div key={c.id} className="hm-connection-state">
                <p
                  role={
                    c.state === "error" || c.state === "expired"
                      ? "alert"
                      : "status"
                  }
                >
                  {
                    {
                      connected: "연결됨",
                      authorizing: "공식 로그인 대기",
                      expired: "다시 로그인 필요",
                      quota_exceeded: "사용 한도 초과",
                      error: "연결에 실패했어요",
                      disconnected: "연결 해제됨",
                    }[c.state]
                  }
                </p>
                {["error", "expired", "quota_exceeded"].includes(c.state) && (
                  <p className="hm-muted">
                    {c.state === "quota_exceeded"
                      ? "계정의 사용 한도를 확인하거나 기본 Gemini를 선택해 주세요."
                      : "인증을 다시 확인해야 해요. 아래에서 연결을 해제한 뒤 다시 연결해 주세요."}
                  </p>
                )}
                {c.state === "connected" && (
                  <p>연결됐어요. 위에서 사용할 모델을 선택해 주세요.</p>
                )}
                {c.state === "authorizing" && (
                  <ConnectionChallenge
                    key={c.id}
                    connection={c}
                    busy={busy}
                    onAuthorize={(id, code) =>
                      act({ action: "authorize", id, code })
                    }
                  />
                )}
                <button
                  disabled={busy}
                  onClick={() => void act({ id: c.id }, "DELETE")}
                >
                  연결 해제
                </button>
              </div>
            ))}
          {provider === "claude" && claudeSetup && (
            <section
              id="claude-connection-setup"
              className="hm-claude-setup"
              aria-label="Claude 연결 안내"
            >
              <h3>Claude 연결하기</h3>
              <p>
                1. 공식 Claude Console에 로그인해 API 키를 발급하세요. 구독
                로그인 인증 코드와는 다른 키예요.
              </p>
              <a
                href="https://platform.claude.com/settings/keys"
                target="_blank"
                rel="noopener noreferrer"
              >
                Claude Console에서 키 발급하기 ↗
              </a>
              <p>
                2. 발급한 API 키를 아래에 붙여넣으세요. API 사용료는 키
                소유자에게 별도로 청구돼요.
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
              {!consent && (
                <p>
                  연결을 완료하려면 위의 공급자 전송·연결 정보 보관 동의 항목을
                  선택하세요.
                </p>
              )}
              <div className="hm-row">
                <button
                  className="hm-primary"
                  disabled={busy || !consent || !key.trim()}
                  onClick={() =>
                    void act({ provider: "claude", apiKey: key.trim() })
                  }
                >
                  키 확인하고 연결
                </button>
                <button
                  disabled={busy}
                  onClick={() => {
                    setClaudeSetup(false);
                    setKey("");
                  }}
                >
                  취소
                </button>
              </div>
            </section>
          )}
        </section>
      ))}
      {error && <p role="alert">{error}</p>}

      <p className="hm-settings-note">
        모델을 바꾸면 새 대화를 시작해요. 연결 오류가 나면 다른 모델로 자동
        전환하지 않아요.
      </p>
    </section>
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
            language={language}
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
    [category, setCategory] = useState("전체"),
    [sceneDetail, setSceneDetail] = useState(false),
    [selection, setSelection] = useState("default");
  const [modal, setModal] = useState<"login" | "ai" | "settings" | null>(null),
    [activeUnit, setActiveUnit] = useState<Unit | null>(null),
    [busy, setBusy] = useState(false),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  const [text, setText] = useState(""),
    [shareForLearning, setShareForLearning] = useState(false),
    [withdrawConfirm, setWithdrawConfirm] = useState(false),
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
      {
        role: "user" | "assistant";
        content: string;
        phrase?: Phrase;
        learning?: string;
      }[]
    >([]),
    [chatInput, setChatInput] = useState("");
  const [aiFromSettings, setAiFromSettings] = useState(false);
  const [assessmentInfo, setAssessmentInfo] = useState(false);
  const operation = useRef(false);
  const mainRef = useRef<HTMLElement>(null);
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
      studyAudio.clear();
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
    return () => { controller.abort(); studyAudio.clear(); };
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
      const data = await request(
        "/api/study",
        { ...body, language },
        "POST",
        body.action === "chat" || body.action === "translate" ? 90000 : 45000,
      );
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
    const previousLanguage = language;
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
        setLanguage(previousLanguage);
        try {
          if (previousLanguage)
            localStorage.setItem("hanmadi:v2:language", previousLanguage);
          else localStorage.removeItem("hanmadi:v2:language");
        } catch {
          /* Optional browser preference. */
        }
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
      shareForLearning,
    });
    if (!data) return;
    if (data.needsConfirmation) {
      setConfirm(true);
      setTranslation(null);
      return;
    }
    setConfirm(false);
    setShareForLearning(false);
    setTranslation({ ...data, original: value });
    const contributionMessages: Record<string, string> = {
      received:
        "일반 표현을 관리자 검수 후보로 제공했어요. 검수 전에는 공용 학습에 쓰지 않아요.",
      duplicate: "이미 제공한 표현이에요. 중복으로 저장하지 않았어요.",
      "no-safe-expression":
        "공용으로 제공할 일반 표현을 찾지 못해 수집하지 않았어요.",
      withdrawn: "제공을 철회한 요청이라 수집하지 않았어요.",
      full: "공용 자료함 한도에 도달해 수집하지 못했어요. 번역은 완료됐어요.",
      unavailable: "번역은 완료됐지만 공용 자료 제공은 저장하지 못했어요.",
    };
    if (contributionMessages[data.contribution])
      setNotice(contributionMessages[data.contribution]);
  }
  async function sendChat(value = chatInput) {
    if (!value.trim() || !profile) return;
    const messages = [
      ...chat.map(({ role, content }) => ({ role, content })),
      { role: "user" as const, content: value },
    ];
    const data = await run({ action: "chat", scene, messages, selection });
    if (!data) return;
    setChat([
      ...chat,
      {
        role: "user",
        content: value,
        phrase: data.learnerPhrase ?? undefined,
        learning: data.learning,
      },
      {
        role: "assistant",
        content: JSON.stringify(data.reply),
        phrase: data.reply,
      },
    ]);
    // The learner may already be writing their next turn while this request runs.
    setChatInput((current) => (current === value ? "" : current));
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
  // Each destination starts at its heading, even after a long form or lesson.
  useEffect(() => {
    mainRef.current?.scrollTo({ top: 0, behavior: "instant" });
  }, [tab, section, language, sceneDetail, profile?.assessedAt]);
  const secondary = modal === "settings" || modal === "ai";
  function closePanel() {
    setModal(modal === "ai" && aiFromSettings ? "settings" : null);
    setAiFromSettings(false);
    setError("");
    setNotice("");
  }
  useEffect(() => {
    if (modal !== "settings" && modal !== "ai") return;
    mainRef.current?.scrollTo({ top: 0, behavior: "instant" });
    mainRef.current?.focus({ preventScroll: true });
    function escape(event: KeyboardEvent) {
      if (event.key === "Escape" && !document.querySelector("dialog[open]")) {
        setModal(modal === "ai" && aiFromSettings ? "settings" : null);
        setAiFromSettings(false);
      }
    }
    window.addEventListener("keydown", escape);
    return () => window.removeEventListener("keydown", escape);
  }, [modal, aiFromSettings]);
  return (
    <div className="hm hm-app" data-view={secondary ? modal : tab}>
      <aside className="hm-brand-panel" aria-label="한마디 소개">
        <Link className="hm-wordmark" href="/study">
          <span className="hm-brand-mark">ㅎ</span> 한마디 <small>2.0</small>
        </Link>
        <div>
          <p className="hm-design-tag">말하기와 여행을 잇는 앱</p>
          <h2>
            여행에서 쓴 말이
            <br />
            내일의 실력이 되도록.
          </h2>
          <p>
            번역으로 한 번,
            <br />
            AI와 다시 한 번.
            <br />
            내가 필요했던 말부터 익혀요.
          </p>
        </div>
      </aside>
      <div className="hm-device">
        {secondary ? (
          <header className="hm-subheader">
            <button aria-label="이전 화면으로" onClick={closePanel}>
              <Icon name="back" />
            </button>
            <h1>{modal === "settings" ? "학습 설정" : "내 AI 연결"}</h1>
            <span aria-hidden="true" />
          </header>
        ) : (
          <header className="hm-header">
            {(!identity || !language) && (
              <Link className="hm-wordmark" href="/study">
                <span className="hm-brand-mark">ㅎ</span> 한마디
              </Link>
            )}
            {identity && !loading && (
              <div className="hm-header-actions">
                {language && (
                  <label className="hm-language">
                    <span
                      className={`hm-lang-dot ${language}`}
                      aria-hidden="true"
                    >
                      {language === "en" || language === "es"
                        ? language.toUpperCase()
                        : ""}
                    </span>
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
                    <span className="hm-language-chevron" aria-hidden="true">
                      <Icon name="down" />
                    </span>
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
                  {identity ? <Icon name="settings" /> : "로그인"}
                </button>
              </div>
            )}
          </header>
        )}
        <main
          ref={mainRef}
          tabIndex={-1}
          className="hm-main"
          aria-label={
            secondary
              ? modal === "settings"
                ? "학습 설정 내용"
                : "내 AI 연결 내용"
              : undefined
          }
        >
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
          ) : !identity ? (
            <section className="hm-login-screen">
              <h1>한마디 시작하기</h1>
              <p>
                로그인하고 나에게 맞는 말하기 연습을 시작하세요. 학습 기록과
                음성을 함께 이용할 수 있어요.
              </p>
              <Login
                onDone={() => {
                  setModal(null);
                  void refresh();
                }}
              />
            </section>
          ) : modal === "settings" ? (
            <V2Settings
              name={identity.name}
              owner={identity.owner}
              language={language}
              profile={profile}
              busy={busy}
              autoSave={state.autoSave}
              autoSaveChat={state.autoSaveChat !== false}
              onAutoSaveChat={(enabled) =>
                void run({ action: "settings", autoSaveChat: enabled })
              }
              onLanguage={(value) => void chooseLanguage(value)}
              onPlan={(level, minutes) =>
                void run({ action: "level", level, minutes }).then((data) => {
                  if (data) setNotice("학습 설정을 저장했어요.");
                })
              }
              onAutoSave={(enabled) => void toggleAutoSave(enabled)}
              onAI={() => {
                setAiFromSettings(true);
                setModal("ai");
              }}
              onPhrases={() => {
                setModal(null);
                setTab("phrases");
              }}
              onAssessment={() => {
                if (profile) setAssessmentInfo(true);
                else {
                  setModal(null);
                  setTab("study");
                }
              }}
              onLogout={() => {
                void (async () => {
                  try {
                    await request("/api/study/account", { action: "logout" });
                    studyAudio.clear();
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
                })();
              }}
            />
          ) : modal === "ai" ? (
            <Connections
              selection={selection}
              onSelect={(s) => {
                setSelection(s);
                setChat([]);
              }}
              onConversation={() => {
                setModal(null);
                setAiFromSettings(false);
                setTab("chat");
              }}
            />
          ) : !language ? (
            <>
              <span
                className="hm-brand-mark hm-onboarding-mark"
                aria-hidden="true"
              >
                ㅎ
              </span>
              <h1>
                읽을 줄 몰라도,
                <br />
                말할 수 있게.
              </h1>
              <p>배우고 싶은 언어를 골라 주세요.</p>
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
          ) : identity && !profile && tab === "study" ? (
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
                  <nav className="hm-segments" aria-label="학습 보기">
                    {[
                      ["today", "오늘 추천"],
                      ["levels", "레벨별"],
                      ["scenes", "상황별"],
                    ].map(([id, label]) => (
                      <button
                        key={id}
                        aria-current={section === id ? "page" : undefined}
                        aria-pressed={section === id}
                        onClick={() => {
                          setSection(id);
                          setSceneDetail(false);
                        }}
                      >
                        {label}
                      </button>
                    ))}
                  </nav>
                  {!identity && (
                    <div className="hm-guest">
                      <button onClick={() => setModal("login")}>
                        로그인하고 레벨 체크하기 →
                      </button>
                    </div>
                  )}
                  {section === "today" && (
                    <>
                      <div className="hm-study-intro">
                        <p>오늘도, 내 말이 하나씩 늘도록</p>
                        <h1>
                          나에게 맞는
                          <br />
                          다음 한마디.
                        </h1>
                      </div>
                      <section className="hm-course-hero">
                        <div className="hm-hero-top">
                          <span>
                            Lv.{profile?.level ?? 1} ·{" "}
                            {curriculum.levels[(profile?.level ?? 1) - 1].title}
                          </span>
                          <small>
                            {
                              units.filter(
                                (u) =>
                                  u.level === (profile?.level ?? 1) &&
                                  hasLessonProgress(profile, u.id),
                              ).length
                            }
                            /
                            {
                              units.filter(
                                (u) => u.level === (profile?.level ?? 1),
                              ).length
                            }{" "}
                            학습 완료
                          </small>
                        </div>
                        <h2>
                          {
                            curriculum.scenes.find(
                              (s) =>
                                s.id === (queue?.lessons[0] ?? units[0])?.scene,
                            )?.title
                          }
                          에서
                          <br />
                          {(queue?.lessons[0] ?? units[0])?.title}
                        </h2>
                        <p>{(queue?.lessons[0] ?? units[0])?.phrase.meaning}</p>
                        <button
                          onClick={() =>
                            setActiveUnit(queue?.lessons[0] ?? units[0])
                          }
                        >
                          오늘 연습 시작 <Icon name="arrow" />
                        </button>
                      </section>
                      <div className="hm-section-heading">
                        <h2>오늘, 어떤 상황인가요?</h2>
                        <button
                          onClick={() => {
                            setSection("scenes");
                            setSceneDetail(false);
                          }}
                        >
                          모두 보기
                        </button>
                      </div>
                      <div className="hm-scene-grid">
                        {curriculum.scenes
                          .filter((s) => ["smalltalk", "club"].includes(s.id))
                          .map((s) => (
                            <button
                              className={`hm-scene-tile ${s.color}`}
                              key={s.id}
                              onClick={() => {
                                setScene(s.id);
                                setSection("scenes");
                                setSceneDetail(true);
                              }}
                            >
                              <span className="hm-scene-icon">
                                <Icon name={s.icon} />
                              </span>
                              <strong>{s.title}</strong>
                              <small>{s.subtitle}</small>
                              <span className="hm-scene-meta">
                                4단계 연습 <Icon name="arrow" />
                              </span>
                            </button>
                          ))}
                      </div>
                      <div className="hm-section-heading">
                        <h2>내 대화가 수업이 돼요</h2>
                        <span>{due.length ? `${due.length}개 표현` : ""}</span>
                      </div>
                      {due.length ? (
                        <button
                          className="hm-personal-lesson"
                          onClick={() => setTab("phrases")}
                        >
                          <span className="hm-scene-icon">
                            <Icon name="spark" />
                          </span>
                          <span>
                            <b>내 대화로 연습하기</b>
                            <small>번역 · AI 대화에서 가져왔어요</small>
                          </span>
                          <Icon name="arrow" />
                        </button>
                      ) : (
                        <div className="hm-journey">
                          <Icon name="chat" />
                          <div>
                            <b>필요했던 말부터 배워요</b>
                            <p>
                              번역과 AI 대화에서 만난 표현을 모아
                              <br />내 레벨에 맞춰 다시 연습해요.
                            </p>
                            <button onClick={() => setTab("translate")}>
                              번역 열기 <Icon name="arrow" />
                            </button>
                          </div>
                        </div>
                      )}
                      {!!queue?.due.length && (
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
                                  : e.source === "vocabulary" ? "단어장에서" : "AI 대화에서"}
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
                      )}
                    </>
                  )}
                  {section === "levels" && (
                    <>
                      <h1>
                        한마디부터,
                        <br />
                        대화가 될 때까지.
                      </h1>
                      <div className="hm-levels">
                        {curriculum.levels.map((l) => (
                          <button
                            key={l.id}
                            aria-pressed={levelFilter === l.id}
                            onClick={() => setLevelFilter(l.id)}
                          >
                            <strong>Lv.{l.id}</strong>
                            <small>{l.title}</small>
                          </button>
                        ))}
                      </div>
                      <section className="hm-level-summary">
                        <span className="hm-badge">Lv.{levelFilter}</span>
                        <h2>{curriculum.levels[levelFilter - 1].title}</h2>
                        <p>{curriculum.levels[levelFilter - 1].goal}</p>
                        <progress
                          aria-label="현재 레벨 학습 완료"
                          value={
                            units.filter(
                              (u) =>
                                u.level === levelFilter &&
                                hasLessonProgress(profile, u.id),
                            ).length
                          }
                          max={
                            units.filter((u) => u.level === levelFilter).length
                          }
                        />
                        <small>
                          {
                            units.filter(
                              (u) =>
                                u.level === levelFilter &&
                                hasLessonProgress(profile, u.id),
                            ).length
                          }{" "}
                          /{" "}
                          {units.filter((u) => u.level === levelFilter).length}
                          개 학습 완료 · 숙달 판정과는 달라요
                        </small>
                      </section>
                      <div className="hm-section-heading">
                        <h2>차례로 말해 봐요</h2>
                        <span>순서는 바꿔도 괜찮아요</span>
                      </div>
                      <div className="hm-course-path">
                        {units
                          .filter((u) => u.level === levelFilter)
                          .map((u, i) => (
                            <button
                              className="hm-course-card"
                              key={u.id}
                              onClick={() => setActiveUnit(u)}
                            >
                              <span
                                className={`hm-unit-marker ${hasLessonProgress(profile, u.id) ? "done" : ""}`}
                              >
                                {hasLessonProgress(profile, u.id) ? (
                                  <Icon name="check" />
                                ) : (
                                  i + 1
                                )}
                              </span>
                              <span>
                                <strong>
                                  {
                                    curriculum.scenes.find(
                                      (s) => s.id === u.scene,
                                    )?.title
                                  }{" "}
                                  · {u.title}
                                </strong>
                                <small>
                                  {lessonPlan(u)?.goal ?? u.phrase.meaning}
                                </small>
                                <em>
                                  {hasLessonProgress(profile, u.id)
                                    ? "복습 · 다시 말해보기"
                                    : u.source === "starter"
                                      ? "새 수업 · 10문장 듣고 말하기"
                                      : "추가 표현 · 1문장"}
                                </em>
                              </span>
                              <Icon name="arrow" />
                            </button>
                          ))}
                      </div>
                    </>
                  )}
                  {section === "scenes" && (
                    <>
                      {!sceneDetail ? (
                        <>
                          <h1>
                            내가 가는 곳이
                            <br />
                            오늘의 교실.
                          </h1>
                          <p className="hm-muted">
                            처음 만난 사람과의 대화도, 여행의 작은 부탁도.
                          </p>
                          <div className="hm-categories" aria-label="상황 분류">
                            {curriculum.categories.map((c) => (
                              <button
                                key={c}
                                aria-pressed={category === c}
                                onClick={() => setCategory(c)}
                              >
                                {c}
                              </button>
                            ))}
                          </div>
                          <p className="hm-muted">
                            {
                              curriculum.scenes.filter(
                                (s) =>
                                  category === "전체" ||
                                  s.category === category,
                              ).length
                            }
                            개 상황 · 모두 Lv.1부터 시작할 수 있어요
                          </p>
                          <div className="hm-scene-grid">
                            {curriculum.scenes
                              .filter(
                                (s) =>
                                  category === "전체" ||
                                  s.category === category,
                              )
                              .map((s) => (
                                <button
                                  className={`hm-scene-tile ${s.color}`}
                                  key={s.id}
                                  onClick={() => {
                                    setScene(s.id);
                                    setSceneDetail(true);
                                  }}
                                >
                                  <span className="hm-scene-icon">
                                    <Icon name={s.icon} />
                                  </span>
                                  <strong>{s.title}</strong>
                                  <small>{s.subtitle}</small>
                                  <span className="hm-scene-meta">
                                    4단계 연습 <Icon name="arrow" />
                                  </span>
                                </button>
                              ))}
                          </div>
                        </>
                      ) : (
                        <>
                          <button
                            className="hm-back"
                            onClick={() => setSceneDetail(false)}
                          >
                            <Icon name="back" /> 모든 상황
                          </button>
                          {curriculum.scenes
                            .filter((s) => s.id === scene)
                            .map((s) => (
                              <section
                                key={s.id}
                                className={`hm-scene-heading ${s.color}`}
                              >
                                <span className="hm-scene-icon">
                                  <Icon name={s.icon} />
                                </span>
                                <h1>{s.title}</h1>
                                <p>{s.subtitle}</p>
                                <div className="hm-topic-tags">
                                  {s.topics.map((t) => (
                                    <span key={t}>{t}</span>
                                  ))}
                                </div>
                              </section>
                            ))}
                          <div className="hm-section-heading">
                            <h2>같은 상황, 나에게 맞는 단계</h2>
                          </div>
                          <div className="hm-course-path">
                            {units
                              .filter((u) => u.scene === scene)
                              .map((u) => (
                                <button
                                  className="hm-course-card"
                                  key={u.id}
                                  onClick={() => setActiveUnit(u)}
                                >
                                  <span className="hm-unit-marker">
                                    {u.level}
                                  </span>
                                  <span>
                                    <strong>
                                      Lv.{u.level} · {u.title}
                                    </strong>
                                    <small>
                                      {lessonPlan(u)?.goal ?? u.phrase.meaning}
                                    </small>
                                    <em>
                                      {hasLessonProgress(profile, u.id)
                                        ? "복습 · 다시 말해보기"
                                        : u.source === "starter"
                                          ? "새 수업 · 10문장 듣고 말하기"
                                          : "추가 표현 · 1문장"}
                                    </em>
                                  </span>
                                  <Icon name="arrow" />
                                </button>
                              ))}
                          </div>
                          <button
                            className="hm-primary hm-full"
                            onClick={() => {
                              setTab("chat");
                              setChat([]);
                            }}
                          >
                            AI와 이 상황 대화하기 <Icon name="arrow" />
                          </button>
                        </>
                      )}
                    </>
                  )}
                  <p className="hm-footnote">
                    한글 발음은 소리를 따라 하기 위한 도움이에요.
                    <br />
                    태국어 성조는 음성과 함께 익혀 주세요.
                  </p>
                </>
              )}
              {tab === "translate" && (
                <>
                  <div className="hm-page-heading">
                    <h1 className="hm-screen-title">여행 번역</h1>
                    <div className="hm-language-pair">
                      <span>한국어</span>
                      <Icon name="swap" />
                      <span>{studyLanguages[language].name}</span>
                    </div>
                  </div>
                  <section className="hm-panel">
                    {!translation && (
                      <div className="hm-translation hm-translation-empty">
                        <div>
                          <small>
                            {studyLanguages[language].name} → 한국어
                          </small>
                          <h2>
                            어느 쪽이 먼저 말해도
                            <br />
                            괜찮아요.
                          </h2>
                        </div>
                        <div>
                          <small>
                            한국어 → {studyLanguages[language].name}
                          </small>
                          <h2>
                            한 사람씩 말하면
                            <br />
                            서로의 언어로 옮겨요.
                          </h2>
                        </div>
                      </div>
                    )}
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
                            rate={1}
                            text={translation.translated}
                            language={translation.from === "ko" ? language : "ko"}
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
                  <details
                    className="hm-callout"
                    open={shareForLearning || withdrawConfirm || undefined}
                  >
                    <summary>공용 학습 자료 제공 (선택)</summary>
                    <p>
                      동의하면 이번 번역의 짧은 일반 표현을 관리자에게 제공해요.
                      개인정보를 검수한 뒤 전체 사용자의 수업·AI 답변에
                      참고하며, 모델 자체의 가중치 학습에는 사용하지 않아요.
                      전체 번역문과 원음은 학습 자료로 저장하지 않아요.
                    </p>
                    <label className="hm-check">
                      <input
                        type="checkbox"
                        checked={shareForLearning}
                        disabled={busy}
                        onChange={(e) => setShareForLearning(e.target.checked)}
                      />
                      이번 번역의 일반 표현을 공용 학습 자료로 제공하는 데
                      동의해요.
                    </label>
                    <p className="hm-muted">
                      내 복습 자동 저장과 별개예요. 제공한 자료는 철회 전까지
                      보관하며, 철회하면 연결된 공용 교재도 회수돼요. 이미
                      전달된 AI 답변과 공급자 로그는 소급 삭제되지 않아요.
                    </p>
                    {!withdrawConfirm ? (
                      <button
                        disabled={busy}
                        onClick={() => setWithdrawConfirm(true)}
                      >
                        내가 제공한 공용 자료 회수
                      </button>
                    ) : (
                      <div>
                        <p>
                          지금까지 제공한 모든 후보와 연결된 공용 교재를
                          회수할까요? 내 개인 복습 기록은 유지돼요.
                        </p>
                        <button
                          disabled={busy}
                          onClick={async () => {
                            const result = await run({
                              action: "withdraw-contributions",
                            });
                            if (result) {
                              setShareForLearning(false);
                              setWithdrawConfirm(false);
                              setNotice(
                                `공용 후보 ${result.removed}개를 회수했어요. 연결된 게시 교재 ${result.unpublished}개도 내렸어요.`,
                              );
                            }
                          }}
                        >
                          공용 자료 전체 회수
                        </button>
                        <button
                          disabled={busy}
                          onClick={() => setWithdrawConfirm(false)}
                        >
                          취소
                        </button>
                      </div>
                    )}
                  </details>
                </>
              )}
              {tab === "chat" && (
                <>
                  <div className="hm-page-heading">
                    <h1>
                      틀려도 괜찮은
                      <br />
                      나만의 대화 상대.
                    </h1>
                    <p>
                      아무 말이 떠오르지 않으면 한국어로 말해 주세요. 한마디씩
                      같이 해 볼게요.
                    </p>
                  </div>
                  <section className="hm-panel">
                    <div className="hm-chat-controls">
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
                        {selection === "default" ? "기본 Gemini" : "내 AI 모델"}{" "}
                        <Icon name="down" />
                      </button>
                      <button
                        disabled={busy || !chat.length}
                        onClick={() => setChat([])}
                      >
                        새 대화
                      </button>
                    </div>
                    {!profile && (
                      <div className="hm-settings-guidance">
                        <b>내 단계에 맞춰 대화해요.</b>
                        <p>
                          짧은 레벨 체크를 마치면 AI가 내 수준에 맞춰 말을
                          걸어요.
                        </p>
                        <button onClick={() => setTab("study")}>
                          레벨 체크 시작하기
                        </button>
                      </div>
                    )}
                    {!chat.length && profile && (
                      <div className="hm-chat-empty">
                        <span className="hm-coach">
                          <Icon
                            name={
                              curriculum.scenes.find((s) => s.id === scene)
                                ?.icon ?? "chat"
                            }
                          />
                        </span>
                        <h2>먼저 말을 걸어 드릴게요.</h2>
                        <p>
                          {
                            curriculum.scenes.find((s) => s.id === scene)
                              ?.prompt
                          }
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
                          <div
                            key={i}
                            className={
                              m.role === "user"
                                ? "hm-chat-learner"
                                : "hm-chat-assistant"
                            }
                          >
                            <span className="hm-eyebrow">
                              {m.role === "user"
                                ? "내가 하고 싶은 말"
                                : "한마디 AI"}
                            </span>
                            <PhraseCard phrase={m.phrase} language={language}>
                              {m.role === "user" ? (
                                <p className="hm-learning-status">
                                  {m.learning === "saved"
                                    ? "내 표현에 저장했어요 · 스터디에서 복습할 수 있어요."
                                    : m.learning === "disabled"
                                      ? "내 말 자동 학습이 꺼져 있어 저장하지 않았어요."
                                      : m.learning === "not-saved"
                                        ? "표현을 저장하지 못했어요. 설정과 내 표현을 확인해 주세요."
                                        : "개인정보 또는 복습에 적합하지 않은 내용은 저장하지 않아요."}
                                </p>
                              ) : (
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
                              )}
                            </PhraseCard>
                            {m.role === "user" && (
                              <details className="hm-original-input">
                                <summary>내 입력 보기</summary>
                                <p>{m.content}</p>
                              </details>
                            )}
                          </div>
                        ) : (
                          <div key={i} className="hm-chat-user">
                            <p>{m.content}</p>
                            {m.learning === "unavailable" && (
                              <small role="status">
                                내 말의 번역을 완성하지 못해 원문으로
                                표시했어요. 학습 자료로 저장하지 않았어요.
                              </small>
                            )}
                          </div>
                        ),
                      )}
                    </div>
                    {busy && <p role="status">한마디를 준비하고 있어요…</p>}
                    <Microphone
                      key={`${language}:${selection}:${scene}:chat`}
                      language="auto"
                      disabled={
                        busy || chat.length >= 20 || !identity || !profile
                      }
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
                        disabled={
                          busy ||
                          !profile ||
                          !chatInput.trim() ||
                          chat.length >= 20
                        }
                      >
                        보내기
                      </button>
                    </form>
                    {chat.length >= 20 && (
                      <p>충분히 연습했어요! 새 대화를 열면 계속할 수 있어요.</p>
                    )}
                    <p className="hm-muted">
                      한국어로 쓴 내 말은 {studyLanguages[language].name}·한글
                      발음·한국어 뜻으로 보여드려요.
                      {state.autoSaveChat !== false
                        ? " 짧은 일반 표현은 내 표현과 스터디 복습에 자동으로 반영돼요. 설정에서 끌 수 있어요."
                        : " 내 말 자동 학습이 꺼져 있어 새 표현을 저장하지 않아요."}{" "}
                      대화 원문은 이 화면을 떠나면 사라져요. AI는 틀릴 수
                      있어요.
                    </p>
                  </section>
                </>
              )}
              {tab === "words" && (
                <Wordbook key={language} language={language} words={due.filter(isVocabulary)} busy={busy}
                  onStudy={() => setTab("study")}
                  onRemove={id => { void run({ action: "remove-word", id }); }}
                  onReview={(id, confidence) => { void run({ action: "practice", id, confidence }); }} />
              )}
              {tab === "phrases" && (
                <>
                  <div className="hm-page-heading">
                    <h1>
                      내가 써 본 말,
                      <br />내 표현.
                    </h1>
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
                                : e.source === "vocabulary" ? "단어장에서" : "AI 대화에서"}
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
        {identity && !loading && (
          <nav className="hm-bottom" aria-label="주요 메뉴">
            {(
              [
                ["study", "book", "스터디"],
                ["chat", "chat", "AI 대화"],
                ["translate", "translate", "번역"],
                ["phrases", "heart", "내 표현"],
                ["words", "dictionary", "단어장"],
              ] as const
            ).map(([id, icon, label]) => (
              <button
                key={id}
                disabled={busy || !language}
                aria-current={tab === id ? "page" : undefined}
                onClick={() => {
                  setModal(null);
                  setAiFromSettings(false);
                  setTab(id);
                  setError("");
                  setNotice("");
                  if (id !== "chat") {
                    setChat([]);
                    setChatInput("");
                  }
                }}
              >
                <Icon name={icon} />
                {label}
              </button>
            ))}
          </nav>
        )}
      </div>
      {modal === "login" && (
        <Dialog title="나의 한마디 시작하기" onClose={() => setModal(null)}>
          {error && <p role="alert">{error}</p>}
          <Login
            onDone={() => {
              setModal(null);
              void refresh();
            }}
          />
        </Dialog>
      )}
      {assessmentInfo && (
        <Dialog
          title="나에게 맞는 연습 단계"
          onClose={() => setAssessmentInfo(false)}
        >
          <p>
            현재 단계와 연습 시간은 학습 설정에서 언제든 바꿀 수 있어요. 새
            언어를 선택하면 짧은 레벨 체크로 시작해요.
          </p>
          <button
            className="hm-primary"
            onClick={() => setAssessmentInfo(false)}
          >
            설정으로 돌아가기
          </button>
        </Dialog>
      )}
      {activeUnit && language && (
        <Dialog title={activeUnit.title} onClose={() => setActiveUnit(null)}>
          {error && <p role="alert">{error}</p>}
          <span className="hm-badge">
            LEVEL {activeUnit.level} ·{" "}
            {curriculum.levels[activeUnit.level - 1].title}
          </span>
          <V2Lesson
            key={activeUnit.id}
            unit={activeUnit}
            busy={busy}
            renderPhrase={(phrase) => (
              <PhraseCard language={language} phrase={phrase} vocabulary onVocabularySaved={apply} />
            )}
            onComplete={() =>
              void run({ action: "completeLesson", id: activeUnit.id }).then(
                (data) => {
                  if (data) {
                    setActiveUnit(null);
                    setNotice(
                      `${activeUnit.source === "admin" ? 1 : 10}문장 학습을 마쳤어요. 내일 다시 연습해 봐요.`,
                    );
                  }
                },
              )
            }
          />
          {language === "th" && (
            <p className="hm-muted">
              기본 예문은 남성 화자 기준이에요. ครับ(캅)은 남성 화자의 공손한
              말끝, ผม(폼)은 “저”라는 뜻이에요. 성조는 음성과 함께 확인해 주세요.
            </p>
          )}
        </Dialog>
      )}
    </div>
  );
}
