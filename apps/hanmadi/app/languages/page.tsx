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
      <p className="mt-5 text-ink-soft">언어를 고르고 짧은 레벨 체크를 하면, 나에게 맞는 회화와 학습 계획이 시작돼요. 이미 체크한 언어는 이어서 배워요.</p>
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
