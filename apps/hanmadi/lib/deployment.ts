export function isAdminDeployment(
  env: Record<string, string | undefined> = process.env,
): boolean {
  return env.HANMADI_DEPLOYMENT === "admin";
}

export function adminPath(
  pathname: string,
): "public" | "owner" | "redirect" | "closed" {
  if (pathname === "/" || pathname === "/login") return "redirect";
  if (["/admin-login", "/api/auth", "/api/deployment", "/api/study/diagnostics/cron"].includes(pathname))
    return "public";
  if (
    pathname === "/study/admin" ||
    pathname === "/api/study/admin" ||
    pathname === "/api/study/admin/learning" ||
    pathname === "/api/study/admin/videos" ||
    pathname === "/api/study/admin/diagnostics"
  )
    return "owner";
  return "closed";
}

export function learningAppHref(
  env: Record<string, string | undefined> = process.env,
): string {
  if (!isAdminDeployment(env)) return "/study";
  const url = new URL(env.HANMADI_APP_URL || "https://hanmadi-lake.vercel.app");
  if (url.protocol !== "https:" || url.username || url.password)
    throw new Error("HANMADI_APP_URL must be an HTTPS application URL");
  return new URL("/study", url.origin).href;
}
