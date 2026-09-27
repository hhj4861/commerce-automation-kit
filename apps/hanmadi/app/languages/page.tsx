import { cookies } from "next/headers";
import { languages, type Language } from "@/lib/courses";
import { LEARNING_LANGUAGE_COOKIE, learningDestination, resolveLearningLanguage } from "@/lib/learning-language";
export const metadata = { title: "학습 언어 선택", referrer: "same-origin" };
export default async function LanguagesPage({ searchParams }: { searchParams: Promise<{ from?: string }> }) {
  const { from } = await searchParams;
  const selected = resolveLearningLanguage(undefined, (await cookies()).get(LEARNING_LANGUAGE_COOKIE)?.value);
  return (
    <div className="mx-auto max-w-4xl px-5 py-16 sm:py-24">
      <p className="text-sm font-medium tracking-widest text-accent">한마디씩, 새로운 언어로</p>
      <h1 className="mt-4 font-display text-4xl sm:text-5xl">어떤 언어를 배울까요?</h1>
      <p className="mt-5 text-ink-soft">설명은 한국어로, 표현과 AI 회화는 선택한 언어로 연습해요. 언제든 언어를 바꿀 수 있어요.</p>
      <form action="/api/learning-language" method="post" className="mt-10 grid gap-4 sm:grid-cols-3">
        <input type="hidden" name="from" value={learningDestination(from)} />
        {(Object.keys(languages) as Language[]).map((code) => (
          <button key={code} type="submit" name="language" value={code}
            className="group rounded-2xl border border-ink-faint bg-card p-7 text-left transition hover:border-accent hover:bg-accent-wash focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent">
            <span lang={code} className="block font-display text-3xl text-accent">{languages[code].greeting}</span>
            <span className="mt-6 block text-xl font-medium">{languages[code].name} 시작하기</span>
            <span className="mt-3 block text-sm text-ink-soft">{selected === code ? "최근 선택한 언어 · " : ""}인사부터 일상 회화까지 →</span>
          </button>
        ))}
      </form>
    </div>
  );
}
