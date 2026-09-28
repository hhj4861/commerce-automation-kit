import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { LearningStudio } from "@/components/learning-studio";
import { LEARNING_LANGUAGE_COOKIE, languageSelectionHref, resolveLearningLanguage } from "@/lib/learning-language";
import { conversationActor } from "@/lib/conversation-http";
import { ConversationError } from "@/lib/conversation";
import { readLearningProfile } from "@/lib/learning-profile";
import { assessmentHref, studyPlan } from "@/lib/adaptive-learning";
export const metadata = { title: "언어 학습", referrer: "no-referrer" };
export default async function LearnPage({ searchParams }: { searchParams: Promise<{ language?: string; s?: string; lesson?: string }> }) {
  const params = await searchParams;
  const language = resolveLearningLanguage(params.language, (await cookies()).get(LEARNING_LANGUAGE_COOKIE)?.value);
  if (!language) redirect(languageSelectionHref(`/learn?${new URLSearchParams(params)}`));
  let actor: string | null = null;
  try { actor = await conversationActor(params.s); }
  catch (e) {
    if (!(e instanceof ConversationError) || e.status !== 401) return <div role="status" className="mx-auto max-w-2xl px-5 py-12"><p>{e instanceof ConversationError ? e.message : "학습 기록을 불러오지 못했어요. 잠시 후 다시 열어 주세요."}</p><Link href="/languages" className="mt-4 inline-block text-accent underline">학습 언어 선택으로</Link></div>;
  }
  const profile = actor ? await readLearningProfile(actor, language) : null;
  if (actor && !profile) redirect(assessmentHref(language, params.s, `/learn?${new URLSearchParams(params)}`));
  if (profile && !profile.confirmed) redirect(`/conversation?${new URLSearchParams({ language, ...(params.s ? { s: params.s } : {}) })}`);
  const plan = profile ? studyPlan(language, profile) : undefined;
  return <LearningStudio key={`${language}:${params.s ?? actor ?? "guest"}:${profile?.revision ?? "preview"}`} initialLanguage={language}
    initialLessonId={params.lesson ?? plan?.[0]?.lessonId} studentSlug={params.s} initialProfile={profile} initialPlan={plan} />;
}
