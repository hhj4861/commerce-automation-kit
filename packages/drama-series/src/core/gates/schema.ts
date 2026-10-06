import type { DramaFinding } from '@cak/contracts';
import type { DeterministicGate } from './types.js';

const TOKEN = /\{([a-z0-9-]+)\}/g;

export const schemaGate: DeterministicGate = {
  id: 'schema',
  stage: 'episode',
  run({ series, episode }) {
    const f: DramaFinding[] = [];
    const block = (message: string, cutId?: string, lineIndex?: number) =>
      f.push({ severity: 'block', message, cutId, lineIndex });
    if (episode.seriesId !== series.id) block(`회차 seriesId(${episode.seriesId})가 시리즈 id(${series.id})와 다름`);
    const dup = (ids: string[]) => ids.filter((x, i) => ids.indexOf(x) !== i);
    for (const d of dup(series.characters.map((c) => c.id))) block(`인물 id 중복: ${d}`);
    for (const d of dup(series.locations.map((l) => l.id))) block(`장소 id 중복: ${d}`);
    const chars = new Map(series.characters.map((c) => [c.id, c]));
    const locs = new Set(series.locations.map((l) => l.id));
    const seen = new Set<string>();
    for (const cut of episode.cuts) {
      if (seen.has(cut.id)) block(`컷 id 중복: ${cut.id}`, cut.id);
      seen.add(cut.id);
      if (!locs.has(cut.locationId)) block(`없는 장소: ${cut.locationId}`, cut.id);
      const castIds = new Set<string>();
      for (const m of cut.cast) {
        const c = chars.get(m.characterId);
        if (!c) {
          block(`없는 인물: ${m.characterId}`, cut.id);
          continue;
        }
        if (!c.looks.some((l) => l.id === m.lookId)) block(`${c.name}에게 없는 모습: ${m.lookId}`, cut.id);
        castIds.add(m.characterId);
      }
      for (const m of cut.visualEn.matchAll(TOKEN)) {
        const tok = m[1];
        if (tok && tok !== 'location' && !castIds.has(tok)) block(`visualEn 토큰 {${tok}}이 출연진에 없음`, cut.id);
      }
      cut.lines.forEach((l, i) => {
        if (!chars.has(l.speaker)) block(`없는 화자: ${l.speaker}`, cut.id, i);
      });
    }
    return f;
  },
};
