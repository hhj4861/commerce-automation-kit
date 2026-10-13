import test from "node:test";
import assert from "node:assert/strict";
import { practiceSongs, parseSongAction, updateSongProgress, songProgress, type SongAction } from "./original-music";
for (const song of practiceSongs) test(`${song.language}: original song practice, wrong/correct review, persistence and repeat`, () => {
  const action = (index: number, action: SongAction["action"], answer?: string): SongAction => ({ trackId: song.id, revision: song.revision, index, action, answer });
  assert.equal(song.lines.length, 4);
  assert.equal(new Set(song.lines.map(x => x.id)).size, 4);
  assert(song.lines.every(x => /[가-힣]/u.test(x.meaning) && /[가-힣]/u.test(x.reading)));
  let saved = songProgress(song);
  assert.throws(() => updateSongProgress(song, saved, action(0, "answer", "line-1")), /먼저/);
  for (let i = 0; i < 4; i++) saved = updateSongProgress(song, saved, action(i, "practice")).progress;
  saved = updateSongProgress(song, saved, action(3, "practice")).progress;
  assert.equal(saved.practiced.length, 4);
  assert.equal(saved.phase, "practice", "reload must not skip the first three review questions");
  saved = updateSongProgress(song, saved, action(0, "review")).progress;
  assert.equal(saved.phase, "review"); assert.equal(saved.index, 0);
  const wrong = updateSongProgress(song, saved, action(0, "answer", "line-2"));
  assert.equal(wrong.correct, false); assert.equal(wrong.progress.completedAt, undefined);
  for (let i = 0; i < 4; i++) saved = updateSongProgress(song, saved, action(i, "answer", `line-${i + 1}`), 12345).progress;
  assert.equal(saved.completedAt, 12345); assert.equal(saved.dueAt, 86412345);
  assert.deepEqual(songProgress(song, JSON.parse(JSON.stringify(saved))), saved);
  const duplicate = updateSongProgress(song, saved, action(3, "answer", "line-4"), 99999).progress;
  assert.deepEqual(duplicate, saved, "lost response retry must not clear a completed review");
  saved = updateSongProgress(song, saved, action(0, "review"), 99999).progress;
  saved = updateSongProgress(song, saved, action(0, "answer", "line-1"), 99999).progress;
  assert.deepEqual(saved.reviewed, ["line-1"]);
  assert.equal(saved.completedAt, 12345, "new round is incomplete");
});
test("invalid targets and stale revisions cannot mutate progress", () => {
  const song = practiceSongs[0], base = { trackId: song.id, revision: song.revision, index: 0, action: "move" };
  for (const b of [null, {}, {...base,trackId:"pretender"}, {...base,index:-1}, {...base,index:4}, {...base,index:0.5}, {...base,action:"admin"}, {...base,action:"answer",answer:"other"}]) assert.throws(() => parseSongAction(b));
  assert.throws(() => parseSongAction({...base,revision:"old"}), /바뀌었어요/);
  assert.equal(parseSongAction(base).song.id, song.id);
});
test("revision reset and invalid saved indices/line IDs are isolated", () => {
  const song=practiceSongs[0];
  assert.deepEqual(songProgress(song,{revision:"old",index:3,practiced:["line-1"],reviewed:[]}).practiced,[]);
  const result=songProgress(song,{revision:song.revision,index:300,practiced:["line-1","line-1","bad"],reviewed:[]});
  assert.equal(result.index,0); assert.deepEqual(result.practiced,["line-1"]);
  assert.equal(new Set(practiceSongs.map(s=>s.id)).size,4);
});

import { musicLanguageLessons, musicConversationPrompt } from "./music-language";
import { songLearningPhrase } from "./original-music";
import { safePractice } from "./v2";
for (const song of practiceSongs) test(`${song.language}: words come from the lyric and transfer to a speakable daily exchange`, () => {
  const lessons = musicLanguageLessons[song.language];
  assert.equal(lessons.length, song.lines.length);
  assert.equal(new Set(lessons.map(x => x.word.meaning)).size, 4, "quiz choices must be distinct");
  for (const [index, lesson] of lessons.entries()) {
    assert(song.lines[index].text.toLowerCase().includes(lesson.word.text.toLowerCase()));
    assert(lesson.answer.text.toLowerCase().includes(lesson.word.text.toLowerCase()));
    for (const phrase of [lesson.word, lesson.question, lesson.answer]) assert(safePractice(phrase));
    assert.deepEqual(songLearningPhrase(song, index, "save-word"), lesson.word);
    assert.deepEqual(songLearningPhrase(song, index, "save-expression"), lesson.answer);
    const prompt = musicConversationPrompt(song.title, lesson);
    assert(prompt.includes(lesson.word.text) && prompt.includes(lesson.situation) && prompt.includes(lesson.answer.text));
    assert(prompt.length < 2000);
  }
});
test("vocabulary/conversation progress is independent, retry-safe and preserves earlier song completion", () => {
  const song = practiceSongs[0];
  const base = { trackId: song.id, revision: song.revision, index: 0 };
  let saved = { ...songProgress(song), completedAt: 100, dueAt: 86400100 };
  const wrong = updateSongProgress(song, saved, { ...base, action: "word-answer", answer: "line-2" });
  assert.equal(wrong.correct, false); assert.equal(wrong.progress.wordsReviewed?.length, 0);
  for (let i = 0; i < 2; i++) saved = updateSongProgress(song, saved, { ...base, action: "word-answer", answer: "line-1" }).progress as typeof saved;
  assert.deepEqual(saved.wordsReviewed, ["line-1"]); assert.deepEqual(saved.practiced, []);
  for (const confidence of ["help", "alone"] as const) saved = updateSongProgress(song, saved, { ...base, action: "conversation", confidence }).progress as typeof saved;
  assert.deepEqual(saved.conversations, { "line-1": "alone" });
  assert.equal(saved.completedAt, 100); assert.equal(saved.dueAt, 86400100);
  assert.deepEqual(songProgress(song, JSON.parse(JSON.stringify(saved))), saved);
  for (const input of [{...base,action:"word-answer",answer:"bad"}, {...base,action:"conversation",confidence:"perfect"}, {...base,action:"conversation"}]) assert.throws(() => parseSongAction(input));
  const legacy = songProgress(song, { revision: song.revision, index: 2, practiced: ["line-2"], reviewed: [] });
  assert.deepEqual(legacy.wordsReviewed, []); assert.deepEqual(legacy.conversations, {}); assert.deepEqual(legacy.practiced, ["line-2"]);
});
