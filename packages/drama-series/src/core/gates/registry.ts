import type { DramaGateReport } from '@cak/contracts';
import { fingerprintOf } from '../fingerprint.js';
import { toReport } from '../report.js';
import { continuityGate } from './continuity.js';
import { dialogueLintGate } from './dialogue-lint.js';
import { schemaGate } from './schema.js';
import type { DeterministicGate, GateContext } from './types.js';

/** 새 결정적 관문은 여기에 추가한다. 순서가 보고서 순서다. */
export const EPISODE_GATES: DeterministicGate[] = [schemaGate, dialogueLintGate, continuityGate];

export function runEpisodeGates(ctx: GateContext): DramaGateReport[] {
  const fp = fingerprintOf(ctx.series, ctx.episode);
  return EPISODE_GATES.map((g) => toReport(g.id, g.stage, g.run(ctx), fp));
}
