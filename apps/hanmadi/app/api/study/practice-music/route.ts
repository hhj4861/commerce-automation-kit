import { studyIdentity } from "@/lib/learner-auth";
import { assertConversationOrigin, conversationJson, conversationFailure, readConversationJson } from "@/lib/conversation-http";
import { readStudy, changeStudy } from "@/lib/v2-store";
import { practiceSongs, songProgress, parseSongAction, updateSongProgress } from "@/lib/original-music";
export const runtime = "nodejs";

export async function GET() {
  try {
    const { actor } = await studyIdentity();
    const state = await readStudy(actor);
    return conversationJson({ songs: practiceSongs, progress: Object.fromEntries(practiceSongs.map(song =>
      [song.id, songProgress(song, state.originalMusicProgress?.[song.id])])) });
  } catch (error) { return conversationFailure(error); }
}
export async function POST(req: Request) {
  try {
    assertConversationOrigin(req);
    const { actor } = await studyIdentity();
    const { song, input } = parseSongAction(await readConversationJson(req));
    let correct: boolean | undefined;
    const state = await changeStudy(actor, state => {
      const result = updateSongProgress(song, state.originalMusicProgress?.[song.id], input);
      correct = result.correct;
      state.originalMusicProgress = { ...state.originalMusicProgress, [song.id]: result.progress };
    });
    return conversationJson({ progress: state.originalMusicProgress![song.id], correct });
  } catch (error) { return conversationFailure(error); }
}
