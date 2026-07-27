"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/** 말풍선 안의 한 — Hanmadi 마크 */
export function Logo({ size = 26 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 26 26" aria-hidden="true">
      <path
        d="M3 6.5 A4 4 0 0 1 7 2.5 h12 a4 4 0 0 1 4 4 v9 a4 4 0 0 1-4 4 h-7.5 L6.5 23.5 v-4 H7 a4 4 0 0 1-4-4 Z"
        fill="var(--accent)"
      />
      <text
        x="13"
        y="11.4"
        textAnchor="middle"
        dominantBaseline="middle"
        fontSize="10.5"
        fontWeight="700"
        fill="#fff"
      >
        한
      </text>
    </svg>
  );
}

/** 튜터 전용 내비 — 학생에게는 한 링크도 보이지 않는다 */
const TUTOR_NAV = [
  { href: "/trial", label: "체험수업" },
  { href: "/live", label: "라이브 노트" },
  { href: "/library", label: "학습 팩" },
  { href: "/admin/students", label: "학생 관리" },
];

/**
 * 상단 크롬.
 *
 * 내비는 로그인한 튜터에게만 보인다. isTutor는 서버(app/layout.tsx)가 쿠키 세션을
 * 확인해 내려준다 — 이 컴포넌트는 클라이언트라 세션을 직접 읽을 수 없다.
 * /library는 학생에게도 열려 있으므로(lib/auth.ts의 isOpenPath) 여기서 가리지 않으면
 * 튜터 전용 링크가 학생에게 그대로 노출된다.
 */
export function Header({ isTutor = false }: { isTutor?: boolean }) {
  const pathname = usePathname();

  // 로그인·등록·체험수업은 자체 크롬을 가진 전체화면 — 글로벌 헤더 숨김.
  // 특히 /trial은 학생에게 공유되는 공개 페이지라 튜터 내비가 보이면 안 된다.
  if (
    pathname === "/login" ||
    pathname === "/register" ||
    pathname === "/trial" ||
    pathname === "/level-test"
  ) {
    return null;
  }

  // 학생 포털은 로고만 + 상단 고정 없음 (학생 화면은 콘텐츠 우선)
  const isPortal = pathname?.startsWith("/s/") ?? false;

  // 포털은 제자리 링크, 튜터는 홈, 학생은 로그인으로 튕기지 않게 학습 팩으로
  const homeHref = isPortal ? pathname! : isTutor ? "/" : "/library";

  return (
    <header
      className={`border-b border-ink-faint bg-paper/90 ${
        isPortal ? "" : "sticky top-0 z-50 backdrop-blur"
      }`}
    >
      <div className="mx-auto flex h-16 max-w-5xl items-center justify-between gap-3 px-5">
        <Link
          href={homeHref}
          className="flex shrink-0 items-center gap-2.5"
        >
          <Logo />
          <span className="font-display text-xl tracking-tight">Hanmadi</span>
          <span className="mt-1 hidden font-mono text-[10px] tracking-[0.2em] text-ink-soft sm:inline">
            한마디
          </span>
        </Link>

        {isPortal || !isTutor ? (
          <p className="shrink-0 font-mono text-[10px] text-ink-soft sm:text-[11px]">
            Korean, one phrase at a time
          </p>
        ) : (
          // 링크 4개 — 좁은 화면에서는 줄바꿈 대신 가로 스크롤로 흘린다
          <nav className="-mx-1 flex min-w-0 items-center gap-0.5 overflow-x-auto px-1 text-[13px] [scrollbar-width:none] sm:gap-1 sm:text-[15px] [&::-webkit-scrollbar]:hidden">
            {TUTOR_NAV.map((item) => (
              <HeaderLink
                key={item.href}
                href={item.href}
                active={isActive(pathname, item.href)}
              >
                {item.label}
              </HeaderLink>
            ))}
          </nav>
        )}
      </div>
    </header>
  );
}

/** 정확히 일치하거나 하위 경로면 활성 (/admin/students/{slug} 포함) */
function isActive(pathname: string | null, href: string): boolean {
  if (!pathname) return false;
  return pathname === href || pathname.startsWith(`${href}/`);
}

function HeaderLink({
  href,
  active,
  children,
}: {
  href: string;
  active: boolean;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className={`inline-flex h-11 shrink-0 items-center whitespace-nowrap rounded-full px-2.5 font-medium transition-colors sm:px-3.5 ${
        active
          ? "bg-accent-wash text-accent"
          : "text-ink-soft hover:bg-accent-wash/60 hover:text-ink"
      }`}
    >
      {children}
    </Link>
  );
}
