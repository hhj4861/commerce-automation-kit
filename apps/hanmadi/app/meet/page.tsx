import type { Metadata } from "next";
import Link from "next/link";

/**
 * link-in-bio 착지 페이지 (공개) — 틱톡/릴스/쇼츠 프로필 링크가 여기로 온다.
 * 퍼널: 숏폼 → 프로필 → /meet → Preply 체험 신청 (ops/tiktok-shortform-funnel.md §8).
 * 결제·연락은 반드시 Preply 안에서만 — 외부 결제 유도 금지(퍼널 가이드 §10).
 */

// 튜터 프로필 직행 (영어권 타깃이라 /en/ 로케일 — 공유 단축링크 preply.in/HYUNJONG…는
// /ko/ 페이지로 고정 리다이렉트되어 쓰지 않는다). 프로필 ID 8265428.
const PREPLY_URL = "https://preply.com/en/tutor/8265428";

// 친구 추천 링크 — 학생이 첫 수업 30% 할인을 받는다 (Preply 일반 페이지로 이동)
const PREPLY_REFERRAL_URL =
  "https://preply.com/ko/?pref=MzEzMDEzOTU=&id=1785312403.457966&ep=w1";

export const metadata: Metadata = {
  title: "Learn Korean with me — Hanmadi",
  description:
    "Korean, one phrase at a time. Book a trial lesson, or try a free 5-minute interactive lesson right now.",
};

const LINKS = [
  ...(PREPLY_URL
    ? [
        {
          href: PREPLY_URL,
          primary: true,
          en: "Book a trial lesson on Preply",
          sub: "1:1 lessons — you get your own notes page after every lesson",
        },
      ]
    : []),
  {
    href: "/trial",
    primary: !PREPLY_URL,
    en: "Try a free 5-minute lesson",
    sub: "Read Korean in 5 minutes. No sign-up, just tap",
  },
  // /library는 수업 자료(팩) 성격이라 뺐다 — 전환 집중(체험→예약).
  // 학생에게 팩이 필요한 순간(체험 마지막·학생 포털)에는 이미 연결돼 있다.
  {
    href: PREPLY_REFERRAL_URL,
    primary: false,
    en: "New to Preply? Get 30% off",
    sub: "My invite link — 30% off your first lesson on Preply",
  },
];

export default function MeetPage() {
  return (
    <div className="mx-auto flex min-h-[80vh] max-w-md flex-col justify-center px-6 py-14 text-center">
      <p className="font-mono text-[12px] tracking-[0.25em] text-accent uppercase">
        Hanmadi · 한마디
      </p>
      <h1 className="mt-3 font-display text-4xl leading-tight">
        Korean, one phrase at a time
      </h1>
      <p className="mt-3 text-[17px] text-ink-soft">
        I type out everything you say in real time — so every lesson ends with
        your own personal notes page you can review anytime.
      </p>

      <div className="mt-8 space-y-4">
        {LINKS.map((link) => {
          const external = link.href.startsWith("http");
          const className = `block rounded-2xl px-6 py-5 transition-transform active:scale-[0.98] ${
            link.primary
              ? "bg-accent text-white hover:bg-accent-strong"
              : "soft-card hover:border-accent/50"
          }`;
          const inner = (
            <>
              <span className="block text-lg font-medium">{link.en}</span>
              <span
                className={`mt-1 block text-[14px] ${
                  link.primary ? "text-white/80" : "text-ink-soft"
                }`}
              >
                {link.sub}
              </span>
            </>
          );
          return external ? (
            <a
              key={link.en}
              href={link.href}
              target="_blank"
              rel="noopener noreferrer"
              className={className}
            >
              {inner}
            </a>
          ) : (
            <Link key={link.en} href={link.href} className={className}>
              {inner}
            </Link>
          );
        })}
      </div>

      <p className="mt-8 text-[13px] text-ink-soft">
        Lessons and payments are handled on Preply only.
      </p>
    </div>
  );
}
