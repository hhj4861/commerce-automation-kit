import { LearningStudio } from "@/components/learning-studio";
import { isLanguage } from "@/lib/courses";
export const metadata = { title: "한국어 · 태국어 · 일본어 학습" };
export default async function LearnPage({
  searchParams,
}: {
  searchParams: Promise<{ language?: string; s?: string }>;
}) {
  const params = await searchParams;
  return (
    <LearningStudio
      key={`${params.language ?? "ko"}:${params.s ?? "guest"}`}
      initialLanguage={isLanguage(params.language) ? params.language : "ko"}
      studentSlug={params.s}
    />
  );
}
