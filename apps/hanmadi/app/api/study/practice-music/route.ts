import { learningMusic } from "@/lib/owned-music-store";
import { studyIdentity } from "@/lib/learner-auth";
import { assertConversationOrigin, conversationJson, conversationFailure, readConversationJson } from "@/lib/conversation-http";
import { readStudy, changeStudy, saveExpression } from "@/lib/v2-store";
import { practiceSongs, songProgress, parseSongAction, updateSongProgress, songLearningPhrase } from "@/lib/original-music";
export const runtime = "nodejs";

export async function GET() {
  try {
    const { actor } = await studyIdentity();
    const [state, managed] = await Promise.all([readStudy(actor), learningMusic()]);
    const songs = [...practiceSongs, ...managed];
    return conversationJson({ songs, progress: Object.fromEntries(songs.map(song =>
      [song.id, songProgress(song, state.originalMusicProgress?.[song.id])])) });
  } catch (error) { return conversationFailure(error); }
}
export async function POST(req: Request) {
  try {
    assertConversationOrigin(req);
    const { actor } = await studyIdentity();
    const { song, input } = parseSongAction(await readConversationJson(req), [...practiceSongs, ...await learningMusic()]);
    if (input.action === "save-word" || input.action === "save-expression") {
      const before = await readStudy(actor);
      const result = await saveExpression(actor, song.language, songLearningPhrase(song, input.index, input.action), "music", before.saveEpoch, false, input.action === "save-word");
      return conversationJson(result);
    }
    let correct: boolean | undefined;
    const state = await changeStudy(actor, state => {
      const result = updateSongProgress(song, state.originalMusicProgress?.[song.id], input);
      correct = result.correct;
      state.originalMusicProgress = { ...state.originalMusicProgress, [song.id]: result.progress };
    });
    return conversationJson({ progress: state.originalMusicProgress![song.id], correct });
  } catch (error) { return conversationFailure(error); }
}
