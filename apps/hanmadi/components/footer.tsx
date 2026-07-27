"use client";

import { usePathname } from "next/navigation";

export function Footer() {
  const pathname = usePathname();
  if (
    pathname === "/trial" ||
    pathname === "/live" ||
    pathname === "/login" ||
    pathname === "/register" ||
    pathname === "/level-test"
  )
    return null;

  return (
    <footer className="mt-20 border-t border-ink-faint">
      <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3 px-5 py-8">
        <p className="font-display text-[15px]">
          Hanmadi{" "}
          <span className="font-sans text-sm text-ink-soft">
            — Korean, one phrase at a time · 한마디씩, 확실하게
          </span>
        </p>
        <p className="font-mono text-[11px] text-ink-soft">
          Romanization: National Institute of Korean Language (RR)
        </p>
      </div>
    </footer>
  );
}
