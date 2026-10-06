import type { DramaFinding } from '@cak/contracts';
import type { DeterministicGate } from './types.js';

export const continuityGate: DeterministicGate = {
  id: 'continuity',
  stage: 'episode',
  run({ series, episode }) {
    const f: DramaFinding[] = [];
    const locs = new Map(series.locations.map((l) => [l.id, l]));
    for (const id of new Set(episode.cuts.map((c) => c.locationId))) {
      const l = locs.get(id);
      if (l && !l.refAssetId)
        f.push({ severity: 'review', message: `장소 참조 이미지 없음: ${l.name} (컷 간 배경 일관성을 보장할 수 없음)` });
    }
    episode.cuts.forEach((cut, i) => {
      const loc = locs.get(cut.locationId);
      if (!loc) return;
      for (const prop of Object.keys(cut.propState ?? {}))
        if (!loc.props.includes(prop))
          f.push({ severity: 'block', message: `장소에 없는 소품: ${prop} (${loc.name} 소품 목록에 추가하거나 제거)`, cutId: cut.id });
      const prev = episode.cuts[i - 1];
      if (prev && prev.locationId === cut.locationId) {
        const next = cut.propState ?? {};
        for (const k of Object.keys(prev.propState ?? {}))
          if (!(k in next))
            f.push({ severity: 'block', message: `앞 컷(${prev.id}) 소품 상태 미반영: ${k}=${prev.propState?.[k] ?? ''}`, cutId: cut.id });
      }
    });
    return f;
  },
};
