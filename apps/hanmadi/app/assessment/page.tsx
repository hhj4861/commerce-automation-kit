import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import Link from "next/link";
import { readLearningProfile } from "@/lib/learning-profile";
import { AssessmentStudio } from "@/components/assessment-studio";
import { assessmentQuestions } from "@/lib/learning-assessment";
import { conversationActor } from "@/lib/conversation-http";
import { ConversationError } from "@/lib/conversation";
import { languages, getLesson } from "@/lib/courses";
import { learningDestination, languageSelectionHref, LEARNING_LANGUAGE_COOKIE, resolveLearningLanguage } from "@/lib/learning-language";
export const metadata = { title: "나에게 맞는 시작점", referrer: "no-referrer" };
export default async function AssessmentPage({ searchParams }: { searchParams: Promise<{ language?: string; s?: string; from?: string }> }) {
  const params = await searchParams;
  const language = resolveLearningLanguage(params.language, (await cookies()).get(LEARNING_LANGUAGE_COOKIE)?.value);
  if (!language) redirect(languageSelectionHref());
  const from = new URL(learningDestination(params.from, language), "https://hanmadi.invalid");
  const initialLessonId = getLesson(language, from.searchParams.get("lesson") ?? "")?.id;
  let notice = "";
  let actor: string | null = null;
  let profile = null;
  try { actor = await conversationActor(params.s); profile = await readLearningProfile(actor, language); }
  catch (e) { notice = e instanceof ConversationError ? e.message : "학습 기록에 연결하지 못했어요. 잠시 후 다시 열어 주세요."; }
  return <div className="mx-auto max-w-2xl px-5 py-6 sm:py-12">
    <Link href={languageSelectionHref(`/learn?${new URLSearchParams({ ...(params.s ? { s: params.s } : {}) })}`)} className="text-sm text-accent underline">학습 언어 변경</Link>
    <p className="mt-4 text-sm text-accent">{languages[language].name} · 약 3~5분</p>
    <h1 className="mt-2 font-display text-3xl sm:text-4xl">나에게 맞는 시작점</h1>
    <p className="mt-3 text-base text-ink-soft">편하게 말할 수 있는 단계부터 시작해요. 결과는 언어별로 따로 저장돼요.</p>
    {notice ? <div role="status" className="mt-8 rounded-xl border border-ink-faint p-6"><p>{notice}</p><Link href={`/login?from=${encodeURIComponent(`/learn?language=${language}`)}`} className="mt-4 inline-block text-accent underline">로그인하고 시작하기</Link></div> : <AssessmentStudio cacheKey={`hanmadi:assessment:v2:${actor}:${language}:${profile?.assessmentId ?? "new"}`} existingProfile={profile} initialLessonId={initialLessonId} language={language} studentSlug={params.s} questions={assessmentQuestions(language)} />}
  </div>;
}
