import { readFileSync } from 'node:fs';
import { dirname, isAbsolute, resolve } from 'node:path';
import type { AssembleSpec } from '../core/assemble-args.js';

/** CLI에서 절대경로로 확정한 style 파일을 읽는다. */
export function loadAssembleStyles(styleFile: string): NonNullable<AssembleSpec['styles']> {
  const styles = JSON.parse(readFileSync(styleFile, 'utf8')) as NonNullable<AssembleSpec['styles']>;
  for (const role of ['title', 'kicker', 'subtitle', 'caption', 'label'] as const) {
    const style = styles[role];
    if (style?.fontFile !== undefined && !isAbsolute(style.fontFile)) {
      style.fontFile = resolve(dirname(styleFile), style.fontFile);
    }
  }
  return styles;
}
