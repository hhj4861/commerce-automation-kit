import { studyIdentity } from "@/lib/learner-auth";
import { conversationFailure, conversationJson } from "@/lib/conversation-http";
import { ConversationError } from "@/lib/conversation";
import { studyLanguages, starterUnits, isStudyLanguage, curriculum } from "@/lib/v2";
import { musicUnits } from "@/lib/v2-music";
import { publishedUnits } from "@/lib/v2-store";
import { lessonPhrases } from "@/lib/v2-lesson";
import { wordPacks } from "@/lib/word-study";
import { musicLanguageLessons } from "@/lib/music-language";
export const runtime = "nodejs";
export async function GET(req: Request) {
  try {
    await studyIdentity();
    const language = new URL(req.url).searchParams.get("language");
    if (!isStudyLanguage(language)) throw new ConversationError(400, "학습 언어를 선택해 주세요.");
    const units = [...starterUnits(language), ...musicUnits(language), ...(await publishedUnits()).filter(u => u.language === language)];
    return conversationJson({ languages: studyLanguages, scenes: curriculum.scenes.map(s => ({ id: s.id, title: s.title })),
      units: units.map(u => ({ ...u, phrases: lessonPhrases(u) })), wordPacks: wordPacks(language), musicLessons: musicLanguageLessons[language] });
  } catch (e) { return conversationFailure(e); }
}
