import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { LEARNING_LANGUAGE_COOKIE, languageSelectionHref, resolveLearningLanguage } from "@/lib/learning-language";
import Link from "next/link";
import { GuidedSpeakingRoom } from "@/components/guided-speaking-room";
import { ConversationRoom } from "@/components/conversation-room";
import { courses, getLesson } from "@/lib/courses";
import { getConversationProvider } from "@/lib/conversation-provider";
import { audioConfig } from "@/lib/conversation-audio";
import { conversationActor } from "@/lib/conversation-http";
import { readLearningProfile } from "@/lib/learning-profile";
import { assessmentHref } from "@/lib/adaptive-learning";
import { ConversationError } from "@/lib/conversation";
export const metadata = { title: "AI 회화", referrer: "no-referrer" };
export default async function ConversationPage({
  searchParams,
}: {
  searchParams: Promise<{ language?: string; lesson?: string; s?: string; mode?: string }>;
}) {
  const params = await searchParams;
  const language = resolveLearningLanguage(params.language, (await cookies()).get(LEARNING_LANGUAGE_COOKIE)?.value);
  if (!language) redirect(languageSelectionHref(`/conversation?${new URLSearchParams(params)}`));
  const lesson =
    getLesson(language, params.lesson ?? "") ?? courses[language][0];
  let notice = "";
  let actor: string | null = null;
  try { actor = await conversationActor(params.s); }
  catch (e) { notice = e instanceof ConversationError ? e.message : "학습 정보를 불러오지 못했어요. 잠시 후 다시 열어 주세요."; }
  const profile = actor ? await readLearningProfile(actor, language) : null;
  if (actor && !profile) redirect(assessmentHref(language, params.s, `/conversation?${new URLSearchParams(params)}`));
  let canRecord = false;
  let canSpeak = false;
  let storesConversation = false;
  try {
    audioConfig("transcribe");
    canRecord = true;
  } catch {
    /* Text remains available. */
  }
  try {
    audioConfig("speech");
    canSpeak = true;
  } catch {
    /* Text remains available. */
  }
  if (actor) {
    try {
      storesConversation = getConversationProvider().provider === "dify";
    } catch {
      notice = "AI 회화 연결을 준비 중이에요. 튜터에게 문의해 주세요.";
    }
  }
  const guided = language !== "ko" && profile?.level === "beginner" && params.mode !== "free";
  const Room = guided ? GuidedSpeakingRoom : ConversationRoom;
  return (
    <div lang="ko" className="mx-auto max-w-3xl px-5 py-6 sm:py-12">
      <Link
        href={profile && !profile.confirmed ? assessmentHref(language, params.s, `/conversation?${new URLSearchParams({ language, lesson: lesson.id })}`) : `/learn?${new URLSearchParams({ language, lesson: lesson.id, ...(params.s ? { s: params.s } : {}) })}#lesson`}
        className="text-sm text-accent underline"
      >
        {profile && !profile.confirmed ? "레벨 체크 결과 보기" : "연습하던 수업으로 돌아가기"}
      </Link>
      <h1 className="mt-6 font-display text-4xl">{guided ? "듣고 말하는 첫 한마디" : "AI와 한마디"}</h1>
      <p className="mt-3 text-ink-soft">
        {guided ? "글자를 몰라도 괜찮아요. 듣고, 따라 말하고, 한마디씩 주고받아요." : "틀려도 괜찮아요. 배운 표현으로 짧은 대화를 시작해요."}
      </p>
      {notice ? (
        <div className="mt-8 rounded-xl border border-ink-faint bg-card p-6">
          <p role="status">{notice}</p>
          {!actor && (
            <Link
              href={`/login?from=${encodeURIComponent(`/conversation?language=${language}&lesson=${lesson.id}`)}`}
              className="mt-4 inline-block text-accent underline"
            >
              튜터 로그인
            </Link>
          )}
        </div>
      ) : (
        <Room
          key={`${language}:${lesson.id}:${params.s ?? actor}:${profile?.revision ?? "legacy"}`}
          cacheKey={`${guided ? "hanmadi:speaking:v1" : "hanmadi:conversation:v2"}:${actor}:${language}:${lesson.id}:${profile?.revision ?? "legacy"}`}
          language={language}
          lesson={lesson}
          studentSlug={params.s}
          learningProfile={profile}
          canRecord={canRecord}
          canSpeak={canSpeak}
          storesConversation={storesConversation}
        />
      )}
    </div>
  );
}
