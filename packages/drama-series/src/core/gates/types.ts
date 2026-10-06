import type { DramaEpisode, DramaFinding, DramaGateStage, DramaSeries } from '@cak/contracts';
import type { GenrePack } from '../genre.js';

export interface GateContext {
  series: DramaSeries;
  episode: DramaEpisode;
  genre: GenrePack;
}

export interface DeterministicGate {
  id: string;
  stage: DramaGateStage;
  run(ctx: GateContext): DramaFinding[];
}
