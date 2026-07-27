"use client";

import { useEffect, type ReactNode } from "react";
import { prefetchSpeak, speak } from "./speak";

/**
 * 한국어 문구를 누르면 발음이 나오는 공용 버튼 — 앱의 모든 🔊이 같은
 * 음성(components/speak.ts)을 쓰도록 이것 하나로 통일한다.
 * 서버 컴포넌트(학생 포털 등)에서도 그대로 import해 쓸 수 있다.
 */
export function SpeakableKo({
  ko,
  className,
  prefetch = false,
  children,
}: {
  /** 재생할 한국어 문구 */
  ko: string;
  className?: string;
  /** true면 화면에 뜨자마자 mp3를 받아둔다 — 첫 탭 즉시 재생 */
  prefetch?: boolean;
  /** 표시 내용 — 생략하면 ko 텍스트 그대로 */
  children?: ReactNode;
}) {
  useEffect(() => {
    if (prefetch) prefetchSpeak(ko);
  }, [prefetch, ko]);

  return (
    <button
      type="button"
      lang="ko"
      onClick={() => speak(ko)}
      className={`cursor-pointer text-left transition-transform active:scale-[0.98] ${className ?? ""}`}
      aria-label={`Play pronunciation: ${ko}`}
    >
      {children ?? ko}{" "}
      <span aria-hidden="true" className="align-middle text-[0.55em] opacity-50">
        🔊
      </span>
    </button>
  );
}
