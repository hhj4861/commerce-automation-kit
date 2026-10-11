import type { DramaFinding, DramaFindingSeverity } from '@cak/contracts';
import { continuationFindings, previousCutOf } from '../continuation.js';
import { beatWindows, chainsFromV1, completeBlocking, SHOT_V1, speechSeconds } from '../shot-policy.js';
import type { DeterministicGate } from './types.js';

export const shotGate: DeterministicGate = {
  id: 'shot', stage: 'episode',
  run(ctx) {
    const { series, episode } = ctx;
    const strict = episode.shotPolicy !== undefined;
    const findings: DramaFinding[] = [];
    const add = (severity: DramaFindingSeverity, message: string, cutId?: string) =>
      findings.push({ severity: strict ? severity : 'info', message, ...(cutId ? { cutId } : {}) });
    if (strict && (episode.shotPolicy?.version !== 'shot-v1' || episode.shotPolicy.strict !== true))
      add('block', '지원하지 않는 shotPolicy');
    if (strict && !['claude', 'codex'].includes(episode.authoredBy ?? '')) add('block', 'shot-v1 authoredBy 필수');
    if (strict && episode.no > 1 && !episode.startsFresh && !episode.continuesFromEpisode)
      add('block', 'shot-v1 2화 이후에는 startsFresh 또는 continuesFromEpisode 필수');
    const linkIssues = continuationFindings(ctx);
    for (const f of linkIssues) add('block', f.message);
    for (const loc of series.locations) {
      const ids = new Set<string>();
      for (const setup of loc.setups ?? []) {
        if (ids.has(setup.id)) add('block', `구도 id 중복: ${loc.id}/${setup.id}`);
        ids.add(setup.id);
        for (const prop of setup.visiblePropIds)
          if (!loc.props.includes(prop)) add('block', `구도에 장소 미등록 소품: ${setup.id}/${prop}`);
      }
    }
    episode.cuts.forEach((cut, i) => {
      const emit = (severity: DramaFindingSeverity, message: string) => add(severity, message, cut.id);
      const beats = cut.beats ?? [], loc = series.locations.find(l => l.id === cut.locationId);
      const prev = linkIssues.length ? undefined : previousCutOf(ctx, i);
      const sameLocation = prev?.locationId === cut.locationId;
      const prevIsLegacy = i === 0 && !!episode.continuesFromEpisode && ctx.prev?.episode.shotPolicy === undefined;
      if (cut.durationSec > SHOT_V1.maxSec) emit('block', `컷 길이 ${cut.durationSec}초 > ${SHOT_V1.maxSec}초`);
      else if (cut.durationSec > SHOT_V1.reviewSec) emit('review', `컷 길이 ${cut.durationSec}초: 10초 초과 검토`);
      if (cut.lines.length > SHOT_V1.maxLines) emit('block', '컷당 대사 3줄 초과');
      else if (cut.lines.length > SHOT_V1.reviewLines) emit('review', '컷당 대사 2줄 초과 검토');
      if (cut.cast.length > SHOT_V1.maxCast) emit('block', '화면 인물 3명 초과');
      if (!beats.length || beats.length > SHOT_V1.maxBeats) emit('block', '비트는 컷당 1~2개 필수');
      const assigned = beats.flatMap(b => b.lines ?? []);
      if (assigned.some(n => !Number.isInteger(n) || n < 0 || n >= cut.lines.length)
          || new Set(assigned).size !== assigned.length || cut.lines.some((_, n) => !assigned.includes(n)))
        emit('block', '비트 lines 인덱스 범위 밖·중복·누락');
      if (assigned.some((n, j) => j > 0 && n <= assigned[j - 1]!)) emit('block', '비트 대사 순서가 대본 순서와 다름');
      if (beats.reduce((n, b) => n + (b.sec ?? 0), 0) > cut.durationSec) emit('block', '비트 sec 합이 컷 길이 초과');
      const required = cut.lines.reduce((n, l) => n + speechSeconds(l.text), beats.length * SHOT_V1.actionSecPerBeat);
      if (required > cut.durationSec + 1e-9) emit('block', `발화+동작 ${required.toFixed(2)}초가 컷 ${cut.durationSec}초 초과`);
      else if (cut.durationSec - required < SHOT_V1.reviewSpareSec) emit('review', '발화+동작 뒤 여유 1초 미만');
      for (const b of beatWindows(cut))
        if (b.endSec - b.startSec + 1e-9 < b.requiredSec) emit('block', `비트 ${b.index + 1} 발화+동작 ${b.requiredSec.toFixed(2)}초가 구간 길이 초과`);
      if (!completeBlocking(cut)) emit('block', 'blocking은 cast와 같은 인물 집합이어야 함(누락·중복·미등록 금지)');
      const setup = loc?.setups?.find(s => s.id === cut.setupId);
      if ((loc?.setups?.length && !cut.setupId) || (cut.setupId && !setup)) emit('block', 'setupId 누락 또는 없는 구도');
      const used = new Set(cut.usedPropIds ?? []);
      const allowed = new Set([...(setup?.visiblePropIds ?? []), ...cut.cast.flatMap(c => c.carriesPropIds ?? []),
        ...(sameLocation ? Object.keys(prev?.propState ?? {}) : [])]);
      for (const prop of used) if (!allowed.has(prop)) emit('block', `사용 소품의 시작 근거 없음: ${prop}`);
      const prose = [cut.action, ...beats.map(b => b.en)].join('\n').normalize('NFC');
      for (const prop of loc?.props ?? []) if (prose.includes(prop.normalize('NFC')) && !used.has(prop))
        emit('review', `행동에 언급한 소품이 usedPropIds에 없음: ${prop}`);
      // 앞 장면이 없을 때 종료 상태 중 변화 없는 항목은 초기 설정으로 취급한다.
      // 앞 장면이 있으면 새 소품도 changes로 선언해야 하며, 모든 변경은 순서대로 누적한다.
      const changed = new Set(beats.flatMap(b => Object.keys(b.changes ?? {})));
      const state = new Map(Object.entries(sameLocation ? prev?.propState ?? {} : cut.propState ?? {}).filter(([p]) => sameLocation || !changed.has(p)));
      const known = new Set([...(loc?.props ?? []), ...cut.cast.flatMap(c => c.carriesPropIds ?? [])]);
      for (const b of beats) for (const [prop, value] of Object.entries(b.changes ?? {})) {
        if (!known.has(prop) || !used.has(prop)) emit('block', `소품 변화는 등록된 usedPropIds만 허용: ${prop}`);
        state.set(prop, value);
      }
      const end = new Map(Object.entries(cut.propState ?? {}));
      if (state.size !== end.size || [...state].some(([p, value]) => end.get(p) !== value))
        emit('block', '시작 소품 상태 + 비트 changes가 종료 propState와 다름');
      if (cut.continuesFromPrev && !chainsFromV1(prev, cut, prevIsLegacy))
        emit('block', 'continuesFromPrev: 앞 컷·같은 장소/구도·전환 cut·호환 blocking 필요');
      if (sameLocation && (cut.transitionIn ?? 'cut') === 'cut' && cut.continuesFromPrev === undefined)
        emit('review', '같은 장소 연속 컷: continuesFromPrev 또는 독립 구도/전환 의도 확인');
      if (sameLocation && prev?.setupId === cut.setupId && !cut.blockingChange) {
        const before = new Map(prev?.blocking?.map(b => [b.characterId, b.side]));
        const swappedLeft = cut.blocking?.some(b => b.side === 'right' && before.get(b.characterId) === 'left');
        const swappedRight = cut.blocking?.some(b => b.side === 'left' && before.get(b.characterId) === 'right');
        if (swappedLeft && swappedRight) emit('review', '같은 구도 좌우 반전: blockingChange 필요(transitionIn으로 면제 안 됨)');
      }
    });
    return findings;
  },
};
