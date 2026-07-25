/**
 * CLI argv 보조 (순수). node:util.parseArgs 는 `--lufs -14` 처럼 값이 '-'로 시작하면
 * 그 값을 옵션으로 오인해 던진다. LUFS 타깃은 본질적으로 음수라, 문서에 적힌 공백 문법을
 * 지키려면 `--lufs -14` → `--lufs=-14` 로 미리 합쳐준다.
 */

/** 지정한 숫자 플래그 뒤의 음수 값을 `--flag=값` 형태로 합친다. */
export function normalizeNegativeFlags(args: string[], numericFlags: readonly string[]): string[] {
  const out: string[] = [];
  for (let i = 0; i < args.length; i++) {
    const a = args[i]!;
    if (a.startsWith('--')) {
      const name = a.slice(2);
      const next = args[i + 1];
      if (numericFlags.includes(name) && next !== undefined && /^-(\d|\.\d)/.test(next)) {
        out.push(`${a}=${next}`);
        i++;
        continue;
      }
    }
    out.push(a);
  }
  return out;
}
