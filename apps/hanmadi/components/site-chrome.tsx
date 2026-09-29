"use client";
import { usePathname } from "next/navigation";
export function SiteChrome({
  children,
  chrome,
}: {
  children: React.ReactNode;
  chrome: React.ReactNode;
}) {
  const path = usePathname();
  return path === "/study" || path.startsWith("/study/") ? children : chrome;
}
