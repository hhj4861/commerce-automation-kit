import React from "react";

/**
 * 마크다운 라이트 렌더러 — 외부 라이브러리 없이 콘텐츠에 필요한 최소 문법만.
 * 지원: **굵게**, *기울임*, `코드`, [링크](url), "- " 목록, 빈 줄 문단 구분.
 */

const INLINE = /(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`|\[[^\]]+\]\([^)\s]+\))/g;

export function Inline({ text }: { text: string }) {
  const parts = text.split(INLINE);
  return (
    <>
      {parts.map((part, i) => {
        if (part.startsWith("**") && part.endsWith("**")) {
          return <strong key={i}>{part.slice(2, -2)}</strong>;
        }
        if (part.startsWith("*") && part.endsWith("*") && part.length > 2) {
          return <em key={i}>{part.slice(1, -1)}</em>;
        }
        if (part.startsWith("`") && part.endsWith("`")) {
          return (
            <code
              key={i}
              className="rounded bg-accent-wash px-1.5 py-0.5 font-mono text-[0.85em] text-accent-strong"
            >
              {part.slice(1, -1)}
            </code>
          );
        }
        const link = /^\[([^\]]+)\]\(([^)\s]+)\)$/.exec(part);
        if (link) {
          return (
            <a
              key={i}
              href={link[2]}
              className="text-accent underline decoration-ink-faint underline-offset-2 hover:decoration-accent"
            >
              {link[1]}
            </a>
          );
        }
        return <React.Fragment key={i}>{part}</React.Fragment>;
      })}
    </>
  );
}

export function Markdown({
  text,
  className = "",
}: {
  text: string;
  className?: string;
}) {
  const chunks = text.trim().split(/\n{2,}/);
  return (
    <div className={`space-y-3 ${className}`}>
      {chunks.map((chunk, i) => {
        const lines = chunk.split("\n");
        if (lines.every((l) => l.trimStart().startsWith("- "))) {
          return (
            <ul key={i} className="list-disc space-y-1 pl-5">
              {lines.map((l, j) => (
                <li key={j}>
                  <Inline text={l.trimStart().slice(2)} />
                </li>
              ))}
            </ul>
          );
        }
        return (
          <p key={i} className="leading-relaxed">
            <Inline text={lines.join(" ")} />
          </p>
        );
      })}
    </div>
  );
}
