import { NextResponse } from "next/server";
import { isLanguage } from "@/lib/courses";
import { LEARNING_LANGUAGE_COOKIE, learningDestination } from "@/lib/learning-language";
/** Public, non-secret browser preference; never grants conversation access. */
export async function POST(req: Request) {
  const expected = new URL(req.url);
  // Next dev normalizes req.url; preserve the browser host for both checks and redirects.
  if (req.headers.get("host")) expected.host = req.headers.get("host")!;
  if (req.headers.get("origin") !== expected.origin)
    return NextResponse.json({ error: "같은 사이트에서 언어를 선택해 주세요." }, { status: 403 });
  let form: FormData;
  try { form = await req.formData(); }
  catch { return NextResponse.json({ error: "언어를 다시 선택해 주세요." }, { status: 400 }); }
  const language = form.get("language");
  if (!isLanguage(language)) return NextResponse.json({ error: "지원하는 언어를 선택해 주세요." }, { status: 400 });
  const response = NextResponse.redirect(new URL(learningDestination(form.get("from"), language), expected.origin), 303);
  response.cookies.set(LEARNING_LANGUAGE_COOKIE, language, {
    httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 60 * 60 * 24 * 365,
  });
  return response;
}
