"use client";
import {
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
  type Ref,
} from "react";
import type { Language } from "@/lib/courses";

export type VoiceHandle = { answer: (text: string) => void; reset: () => void };
export function ConversationVoice({
  ref,
  language,
  studentSlug,
  onTranscript,
  onBusyChange,
  disabled,
  canRecord,
  canSpeak,
}: {
  ref: Ref<VoiceHandle>;
  language: Language;
  studentSlug?: string;
  onTranscript: (text: string) => void;
  onBusyChange: (busy: boolean) => void;
  disabled: boolean;
  canRecord: boolean;
  canSpeak: boolean;
}) {
  const [status, setStatus] = useState<
    "idle" | "permission" | "recording" | "transcribing"
  >("idle");
  const [note, setNote] = useState("");
  const [autoListen, setAutoListen] = useState(true);
  const [speechBusy, setSpeechBusy] = useState(false);
  const [lastAnswer, setLastAnswer] = useState("");
  const [audioUrl, setAudioUrl] = useState("");
  const recorder = useRef<MediaRecorder | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const request = useRef<AbortController | null>(null);
  const speechRequest = useRef<AbortController | null>(null);
  const sequence = useRef(0);
  const active = useRef(false);
  const player = useRef<HTMLAudioElement | null>(null);
  const currentUrl = useRef("");
  const cachedText = useRef("");

  function stopTracks() {
    stream.current?.getTracks().forEach((t) => t.stop());
    stream.current = null;
  }
  function cancelRecording() {
    sequence.current++;
    active.current = false;
    if (timer.current) clearTimeout(timer.current);
    if (recorder.current?.state === "recording") recorder.current.stop();
    stopTracks();
    request.current?.abort();
    setStatus("idle");
    onBusyChange(false);
  }
  function stopAudio() {
    speechRequest.current?.abort();
    speechRequest.current = null;
    player.current?.pause();
    setSpeechBusy(false);
  }
  function reset() {
    cancelRecording();
    stopAudio();
    setNote("");
    setLastAnswer("");
    setAudioUrl("");
    cachedText.current = "";
    if (currentUrl.current) URL.revokeObjectURL(currentUrl.current);
    currentUrl.current = "";
  }
  useEffect(
    () => () => {
      sequence.current++;
      if (timer.current) clearTimeout(timer.current);
      if (recorder.current?.state === "recording") recorder.current.stop();
      stream.current?.getTracks().forEach((t) => t.stop());
      request.current?.abort();
      speechRequest.current?.abort();
      if (currentUrl.current) URL.revokeObjectURL(currentUrl.current);
    },
    [],
  );

  async function play(text: string) {
    if (!canSpeak || active.current) return;
    stopAudio();
    setNote("");
    if (cachedText.current === text && currentUrl.current && player.current) {
      player.current.currentTime = 0;
      await player.current
        .play()
        .catch(() => setNote("아래 재생 버튼을 눌러 답변을 들어 주세요."));
      return;
    }
    const controller = new AbortController();
    speechRequest.current = controller;
    setSpeechBusy(true);
    const timeout = setTimeout(() => controller.abort(), 40000);
    try {
      const response = await fetch("/api/conversation/speech", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ language, studentSlug, text }),
        signal: controller.signal,
      });
      if (!response.ok) {
        const result = await response.json();
        throw new Error(result.error || "답변 음성을 받지 못했어요.");
      }
      const blob = await response.blob();
      if (controller.signal.aborted) return;
      if (currentUrl.current) URL.revokeObjectURL(currentUrl.current);
      const url = URL.createObjectURL(blob);
      currentUrl.current = url;
      cachedText.current = text;
      setAudioUrl(url);
      if (player.current) {
        player.current.src = url;
        await player.current
          .play()
          .catch(() => setNote("아래 재생 버튼을 눌러 답변을 들어 주세요."));
      }
    } catch (error) {
      if (speechRequest.current === controller)
        setNote(
          controller.signal.aborted
            ? "음성 생성 시간이 길어졌어요. 다시 듣기를 눌러 주세요."
            : error instanceof Error
              ? error.message
              : "답변 음성을 받지 못했어요.",
        );
    } finally {
      clearTimeout(timeout);
      if (speechRequest.current === controller) {
        speechRequest.current = null;
        setSpeechBusy(false);
      }
    }
  }
  useImperativeHandle(ref, () => ({
    answer(text) {
      setLastAnswer(text);
      if (autoListen) void play(text);
    },
    reset,
  }));

  async function startRecording() {
    if (disabled || active.current || !canRecord) return;
    if (
      !navigator.mediaDevices?.getUserMedia ||
      typeof MediaRecorder === "undefined"
    ) {
      setNote(
        "이 브라우저에서는 녹음할 수 없어요. HTTPS로 접속하거나 텍스트로 연습해 주세요.",
      );
      return;
    }
    const mimeType = [
      "audio/webm;codecs=opus",
      "audio/mp4",
      "audio/ogg;codecs=opus",
    ].find((t) => MediaRecorder.isTypeSupported(t));
    if (!mimeType) {
      setNote(
        "이 브라우저의 녹음 형식을 지원하지 않아요. 다른 브라우저나 텍스트 입력을 사용해 주세요.",
      );
      return;
    }
    active.current = true;
    onBusyChange(true);
    stopAudio();
    setNote("");
    setStatus("permission");
    const token = ++sequence.current;
    try {
      const media = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (token !== sequence.current) {
        media.getTracks().forEach((t) => t.stop());
        return;
      }
      stream.current = media;
      const recording = new MediaRecorder(media, {
        mimeType,
        audioBitsPerSecond: 64000,
      });
      recorder.current = recording;
      const chunks: Blob[] = [];
      let bytes = 0;
      recording.ondataavailable = (e) => {
        if (token !== sequence.current) return;
        bytes += e.data.size;
        if (bytes > 2.8 * 1024 * 1024) {
          cancelRecording();
          setNote("녹음이 너무 커요. 더 짧게 다시 말해 주세요.");
          return;
        }
        if (e.data.size) chunks.push(e.data);
      };
      recording.onerror = () => {
        if (token === sequence.current) {
          cancelRecording();
          setNote("녹음을 완료하지 못했어요. 마이크 연결을 확인해 주세요.");
        }
      };
      recording.onstop = async () => {
        if (token !== sequence.current) return;
        if (timer.current) clearTimeout(timer.current);
        stopTracks();
        setStatus("transcribing");
        const controller = new AbortController();
        request.current = controller;
        const timeout = setTimeout(() => controller.abort(), 40000);
        try {
          const blob = new Blob(chunks, { type: mimeType });
          if (!blob.size)
            throw new Error("녹음된 소리가 없어요. 다시 말해 주세요.");
          const form = new FormData();
          form.set("file", blob, "recording");
          form.set("language", language);
          if (studentSlug) form.set("studentSlug", studentSlug);
          const response = await fetch("/api/conversation/transcribe", {
            method: "POST",
            body: form,
            signal: controller.signal,
          });
          const result = await response.json();
          if (!response.ok || typeof result.text !== "string")
            throw new Error(result.error || "음성을 인식하지 못했어요.");
          if (token === sequence.current) {
            onTranscript(result.text);
            setNote("인식한 문장을 확인하고 보내기를 눌러 주세요.");
          }
        } catch (error) {
          if (token === sequence.current)
            setNote(
              controller.signal.aborted
                ? "음성 인식 시간이 길어졌어요. 다시 녹음하거나 직접 입력해 주세요."
                : error instanceof Error
                  ? error.message
                  : "음성을 인식하지 못했어요.",
            );
        } finally {
          clearTimeout(timeout);
          if (token === sequence.current) {
            active.current = false;
            setStatus("idle");
            onBusyChange(false);
            request.current = null;
          }
        }
      };
      recording.start(1000);
      setStatus("recording");
      timer.current = setTimeout(() => {
        if (recording.state === "recording") recording.stop();
      }, 45000);
    } catch {
      if (token === sequence.current) {
        cancelRecording();
        setNote(
          "마이크를 사용할 수 없어요. 브라우저의 마이크 권한과 연결을 확인하거나 텍스트로 입력해 주세요.",
        );
      }
    }
  }
  return (
    <div className="mt-5 rounded-xl border border-ink-faint p-4">
      <div className="flex flex-wrap items-center gap-3">
        {status === "recording" ? (
          <button
            type="button"
            onClick={() => {
              if (recorder.current?.state === "recording")
                recorder.current.stop();
            }}
            className="min-h-11 rounded-full bg-accent px-5 text-white"
          >
            녹음 끝내고 문장 확인
          </button>
        ) : (
          <button
            type="button"
            onClick={() => void startRecording()}
            disabled={disabled || status !== "idle" || !canRecord}
            className="min-h-11 rounded-full border border-accent px-5 text-accent disabled:opacity-50"
          >
            {status === "permission"
              ? "마이크 권한 기다리는 중"
              : status === "transcribing"
                ? "음성 인식 중…"
                : "마이크로 말하기"}
          </button>
        )}
        {status !== "idle" && (
          <button
            type="button"
            onClick={cancelRecording}
            className="min-h-11 px-3 text-sm underline"
          >
            녹음 취소
          </button>
        )}
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={autoListen}
            disabled={!canSpeak}
            onChange={(e) => setAutoListen(e.target.checked)}
          />
          답변 자동 듣기
        </label>
        {lastAnswer && (
          <button
            type="button"
            disabled={!canSpeak || speechBusy || status !== "idle"}
            onClick={() => void play(lastAnswer)}
            className="min-h-11 px-3 text-sm underline disabled:opacity-50"
          >
            {speechBusy ? "음성 만드는 중…" : "마지막 답변 다시 듣기"}
          </button>
        )}
      </div>
      <p className="mt-3 text-xs leading-relaxed text-ink-soft">
        최대 45초씩 녹음해요. 녹음 종료 후 음성이 AI 제공업체로 전송되며, 앱에는
        저장하지 않아요. 답변 음성은 AI가 만든 소리예요.
      </p>
      {(!canRecord || !canSpeak) && (
        <p className="mt-2 text-sm text-amber">
          {!canRecord ? "음성 인식" : ""}
          {!canRecord && !canSpeak ? "·" : ""}
          {!canSpeak ? "답변 듣기" : ""} 연결을 준비 중이에요. 텍스트 회화는
          이용할 수 있어요.
        </p>
      )}
      {status === "recording" && (
        <p role="status" className="mt-3 text-sm text-accent">
          녹음 중 · 말을 마치면 ‘녹음 끝내고 문장 확인’을 눌러 주세요.
        </p>
      )}
      {note && (
        <p role="status" className="mt-3 text-sm text-amber">
          {note}
        </p>
      )}
      <audio
        ref={player}
        controls
        hidden={!audioUrl}
        className="mt-3 w-full"
        aria-label="AI 답변 음성"
        onError={() =>
          setNote("음성을 재생할 수 없어요. 텍스트 답변을 확인해 주세요.")
        }
      />
    </div>
  );
}
