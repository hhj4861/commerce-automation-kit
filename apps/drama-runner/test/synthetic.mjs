import {readFileSync} from 'node:fs';
// Test-only composition of pinned legacy internals, not the consumer's API.
import {parseEpisode,parseSeries} from '../../../packages/drama-series/src/core/model.ts';
import {loadGenre} from '../../../packages/drama-series/src/core/genre.ts';
import {runEpisodeGates} from '../../../packages/drama-series/src/core/gates/registry.ts';
import {fingerprintOf,topicFingerprint} from '../../../packages/drama-series/src/core/fingerprint.ts';
import {toReport} from '../../../packages/drama-series/src/core/report.ts';
import {buildPlan} from '../../../packages/drama-series/src/core/plan.ts';
import {lineHash} from '../../../packages/drama-series/src/core/line-hash.ts';
const fx=n=>JSON.parse(readFileSync(new URL(`../../../packages/drama-series/test/fixtures/${n}.json`,import.meta.url),'utf8'));
export function input() {
  const series=parseSeries(fx('series')), episode=parseEpisode(fx('episode'));
  for(const c of episode.cuts) for(const l of c.lines) l.verification={status:'verified',judgeRef:'synthetic-only',lineHash:lineHash(c,l)};
  const ctx={series,episode,genre:loadGenre(series.genreId)}, fp=fingerprintOf(series,episode);
  const reports=[...runEpisodeGates(ctx),toReport('props','episode',[],fp),toReport('scenario','episode',[],fp),toReport('topic-night-shift','topic',[],topicFingerprint(series.topic,series.genreId))];
  return {schemaVersion:1,revision:'synthetic-r1',inputs:{series:'a'.repeat(64),episode:'b'.repeat(64),gates:{'synthetic.json':'c'.repeat(64)}},legacyResult:buildPlan({ctx,reports,budgetCredits:200,video:{resolution:'480p',draft:true,aspectRatio:'16:9'},now:'2026-10-06T00:00:00Z'})};
}
