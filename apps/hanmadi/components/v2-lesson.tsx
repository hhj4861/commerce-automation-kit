"use client";
import { useState, type ReactNode } from "react";
import { lessonPhrases, lessonPlan } from "@/lib/v2-lesson";
import type { Phrase, Unit } from "@/lib/v2";

export function V2Lesson({
  unit,
  busy,
  renderPhrase,
  onComplete,
}: {
  unit: Unit;
  busy: boolean;
  renderPhrase: (phrase: Phrase) => ReactNode;
  onComplete: () => void;
}) {
  const [index, setIndex] = useState(0);
  const phrases = lessonPhrases(unit);
  const plan = lessonPlan(unit);
  return (
    <section className="hm-lesson">
      <p className="hm-lesson-count" role="status">
        문장 {index + 1} / {phrases.length}
      </p>
      <progress aria-label="수업 진행" value={index + 1} max={phrases.length} />
      <p>{plan?.goal ?? "듣고, 편하게 따라 말해 보세요."}</p>
      <small>
        {plan?.cues[index] ??
          (index === 0
            ? "이 단계의 핵심 표현"
            : "같은 상황에서 함께 쓰는 표현")}
      </small>
      <div key={index}>{renderPhrase(phrases[index])}</div>
      <div className="hm-lesson-navigation">
        <button
          disabled={busy || index === 0}
          onClick={() => setIndex(index - 1)}
        >
          이전
        </button>
        <button
          className="hm-primary"
          disabled={busy}
          onClick={() =>
            index < phrases.length - 1 ? setIndex(index + 1) : onComplete()
          }
        >
          {busy
            ? "저장 중…"
            : index < phrases.length - 1
              ? "다음"
              : "학습 마치기"}
        </button>
      </div>
    </section>
  );
}
