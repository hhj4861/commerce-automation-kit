import type { DramaFinding, DramaGateReport, DramaGateStage } from '@cak/contracts';

export function toReport(gate: string, stage: DramaGateStage, findings: DramaFinding[], fingerprint: string): DramaGateReport {
  return { gate, stage, ok: !findings.some((f) => f.severity === 'block'), fingerprint, findings };
}
