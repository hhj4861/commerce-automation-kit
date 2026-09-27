import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { LearningStudio } from "@/components/learning-studio";
import { LEARNING_LANGUAGE_COOKIE, languageSelectionHref, resolveLearningLanguage } from "@/lib/learning-language";
export const metadata = { title: "언어 학습", referrer: "no-referrer" };
export default async function LearnPage({ searchParams }: { searchParams: Promise<{ language?: string; s?: string }> }) {
  const params = await searchParams;
  const language = resolveLearningLanguage(params.language, (await cookies()).get(LEARNING_LANGUAGE_COOKIE)?.value);
  if (!language) redirect(languageSelectionHref(`/learn?${new URLSearchParams(params)}`));
  return <LearningStudio key={`${language}:${params.s ?? "guest"}`} initialLanguage={language} studentSlug={params.s} />;
}
