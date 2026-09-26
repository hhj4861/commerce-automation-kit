import Link from "next/link";
import { ConversationRoom } from "@/components/conversation-room";
import { courses, getLesson, isLanguage } from "@/lib/courses";
import { getLiteLLMConfig } from "@/lib/conversation";
import { audioConfig } from "@/lib/conversation-audio";
import { getConversationTutor } from "@/lib/conversation-access";
import { getStoredStudent } from "@/lib/store";
export const metadata = { title: "AI 회화", referrer: "no-referrer" };
export default async function ConversationPage({
  searchParams,
}: {
  searchParams: Promise<{ language?: string; lesson?: string; s?: string }>;
}) {
  const params = await searchParams;
  const language = isLanguage(params.language) ? params.language : "ko";
  const lesson =
    getLesson(language, params.lesson ?? "") ?? courses[language][0];
  const tutor = await getConversationTutor();
  const student =
    !tutor && params.s && /^[a-zA-Z0-9가-힣_-]{1,100}$/.test(params.s)
      ? await getStoredStudent(params.s)
      : null;
  let notice = "";
  let canRecord = false;
  let canSpeak = false;
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
  if (!tutor && !student)
    notice =
      "튜터로 로그인하거나 튜터에게 받은 학생 포털에서 AI 회화를 열어 주세요.";
  else {
    try {
      getLiteLLMConfig();
    } catch {
      notice = "AI 회화 연결을 준비 중이에요. 튜터에게 문의해 주세요.";
    }
  }
  return (
    <div lang="ko" className="mx-auto max-w-3xl px-5 py-12">
      <Link
        href={`/learn?${new URLSearchParams({ language, ...(params.s ? { s: params.s } : {}) })}`}
        className="text-sm text-accent underline"
      >
        언어 학습으로 돌아가기
      </Link>
      <h1 className="mt-6 font-display text-4xl">AI와 한마디</h1>
      <p className="mt-3 text-ink-soft">
        틀려도 괜찮아요. 배운 표현으로 짧은 대화를 시작해요.
      </p>
      {notice ? (
        <div className="mt-8 rounded-xl border border-ink-faint bg-card p-6">
          <p role="status">{notice}</p>
          {!tutor && !student && (
            <Link
              href={`/login?from=${encodeURIComponent(`/conversation?language=${language}&lesson=${lesson.id}`)}`}
              className="mt-4 inline-block text-accent underline"
            >
              튜터 로그인
            </Link>
          )}
        </div>
      ) : (
        <ConversationRoom
          key={`${language}:${lesson.id}:${student?.slug ?? "tutor"}`}
          language={language}
          lesson={lesson}
          studentSlug={student?.slug}
          canRecord={canRecord}
          canSpeak={canSpeak}
        />
      )}
    </div>
  );
}
