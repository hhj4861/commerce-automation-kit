import { createHash } from 'node:crypto';
import type { DramaCut, DramaLine } from '@cak/contracts';
import { canonical } from './fingerprint.js';

/** 대사 지문. 판정·승인 결과는 이 지문에 묶인다 — 문구나 장면이 바뀌면 다시 판정해야 한다. */
export function lineHash(cut: DramaCut, line: DramaLine): string {
  return createHash('sha256')
    .update(canonical({ cut: cut.id, action: cut.action, speaker: line.speaker, kind: line.kind, text: line.text }))
    .digest('hex')
    .slice(0, 16);
}

/** 지금 이 문구 그대로 검증(JEV)되었거나 사람이 승인한 대사인지. */
export function isLineCleared(cut: DramaCut, line: DramaLine): boolean {
  const v = line.verification;
  return (v.status === 'verified' || v.status === 'human-approved') && v.lineHash === lineHash(cut, line);
}
