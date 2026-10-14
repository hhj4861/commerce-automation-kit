// Shared by the source editor and server validation. No server imports or lyrics provider.
export type SourceLine = { text: string; startSeconds?: number; endSeconds?: number };
export function parseMusicSource(source: string): SourceLine[] {
  if (typeof source !== "string" || source.length > 12000) throw new Error("원문은 12,000자까지 등록할 수 있어요.");
  const text = source.replace(/^\uFEFF/, "").replace(/\r/g, "").trim();
  const seconds = (v: string) => v.replace(",", ".").split(":").reduce((sum, n) => sum * 60 + Number(n), 0);
  let lines: SourceLine[];
  if (text.includes("-->")) {
    const cue = /^(?:\d{2}:)?\d{2}:[0-5]\d[.,]\d{3}$/;
    lines = text.split(/\n\s*\n/).flatMap(block => {
      const rows = block.split("\n"), i = rows.findIndex(r => r.includes("-->"));
      if (i < 0) {
        if (/^(WEBVTT|NOTE|STYLE|REGION)(\s|$)/.test(block)) return [];
        throw new Error("자막의 시간 형식을 확인해 주세요.");
      }
      const [a, rest] = rows[i].split(/\s*-->\s*/), b = rest?.split(/\s/)[0];
      if (!cue.test(a) || !cue.test(b ?? "")) throw new Error("자막 시간을 읽지 못했어요.");
      return [{ text: rows.slice(i + 1).join(" ").replace(/<[^>]*>/g, "").trim(), startSeconds: seconds(a), endSeconds: seconds(b) }];
    });
  } else if (/^\[\d+:|^\[(?:ar|ti|al|by|offset):/im.test(text)) {
    const cues: { text: string; startSeconds: number }[] = [];
    let offset = 0;
    for (const row of text.split("\n").filter(r => r.trim())) {
      if (/^\[offset:[+-]?\d+\]$/i.test(row)) { offset = Number(row.slice(8, -1)) / 1000; continue; }
      if (/^\[(?:ar|ti|al|by|re|ve):.*\]$/i.test(row)) continue;
      const match = row.match(/^((?:\[\d{1,3}:[0-5]\d(?:\.\d{1,3})?\])+)(.*)$/);
      if (!match) throw new Error("LRC 시간은 [분:초.소수] 형식으로 입력해 주세요.");
      for (const tag of match[1].matchAll(/\[([^\]]+)\]/g)) cues.push({ text: match[2].trim(), startSeconds: seconds(tag[1]) });
    }
    cues.sort((a, b) => a.startSeconds - b.startSeconds);
    if (cues.some((c, i) => i > 0 && c.startSeconds === cues[i - 1].startSeconds)) throw new Error("같은 시작 시간의 LRC 줄이 있어요. 시간을 나눠 주세요.");
    lines = cues.flatMap((c, i) => c.text ? [{ text: c.text, startSeconds: c.startSeconds + offset,
      ...(cues[i + 1] ? { endSeconds: cues[i + 1].startSeconds + offset } : {}) }] : []);
  } else lines = text.split("\n").map(t => ({ text: t.trim() })).filter(l => l.text);
  if (lines.length < 2 || lines.length > 100 || lines.some((l, i) => !l.text || l.text.length > 250 ||
    (l.startSeconds !== undefined && (!Number.isFinite(l.startSeconds) || l.startSeconds < 0 || l.startSeconds >= 3600 ||
      (l.endSeconds !== undefined && (!Number.isFinite(l.endSeconds) || l.endSeconds <= l.startSeconds || l.endSeconds > 3600 || l.endSeconds - l.startSeconds > 120)) ||
      (i > 0 && l.startSeconds < (lines[i - 1].endSeconds ?? lines[i - 1].startSeconds ?? 0))))))
    throw new Error("원문은 2~100줄, 한 줄 250자 이내로 나눠 주세요. 시간은 겹치지 않는 2분 이하 구간이어야 해요.");
  return lines;
}
export function formatCueTime(seconds: number): string {
  const ms = Math.round(seconds * 1000);
  return `${String(Math.floor(ms / 3600000)).padStart(2, "0")}:${String(Math.floor(ms / 60000) % 60).padStart(2, "0")}:${String(Math.floor(ms / 1000) % 60).padStart(2, "0")}.${String(ms % 1000).padStart(3, "0")}`;
}
export function timedSource(lines: SourceLine[]): string {
  if (lines.some(l => !Number.isFinite(l.startSeconds) || !Number.isFinite(l.endSeconds))) throw new Error("모든 줄의 시작·끝 시간을 입력해 주세요. 마지막 줄의 끝도 필요해요.");
  const source = "WEBVTT\n\n" + lines.map(l => `${formatCueTime(l.startSeconds!)} --> ${formatCueTime(l.endSeconds!)}\n${l.text}`).join("\n\n");
  parseMusicSource(source);
  return source;
}
