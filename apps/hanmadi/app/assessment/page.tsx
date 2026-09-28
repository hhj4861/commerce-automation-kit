import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import Link from "next/link";
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
  try { await conversationActor(params.s); }
  catch (e) { notice = e instanceof ConversationError ? e.message : "학습 기록에 연결하지 못했어요. 잠시 후 다시 열어 주세요."; }
  return <main className="mx-auto max-w-2xl px-5 py-12">
    <Link href={languageSelectionHref(`/learn?${new URLSearchParams({ ...(params.s ? { s: params.s } : {}) })}`)} className="text-sm text-accent underline">학습 언어 변경</Link>
    <p className="mt-8 text-sm text-accent">{languages[language].name} · 약 3~5분</p>
    <h1 className="mt-3 font-display text-4xl">나에게 맞는 시작점 찾기</h1>
    <p className="mt-4 text-ink-soft">짧게 확인하고, 지금 편하게 말할 수 있는 단계부터 시작해요. 언어마다 결과를 따로 저장해요.</p>
    {notice ? <div role="status" className="mt-8 rounded-xl border border-ink-faint p-6"><p>{notice}</p><Link href={`/login?from=${encodeURIComponent(`/learn?language=${language}`)}`} className="mt-4 inline-block text-accent underline">로그인하고 시작하기</Link></div> : <AssessmentStudio initialLessonId={initialLessonId} language={language} studentSlug={params.s} questions={assessmentQuestions(language)} />}
  </main>;
}
