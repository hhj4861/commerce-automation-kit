export type TimeRange = { startSeconds: number; endSeconds: number };
export function activeMusicLine(lines: TimeRange[], seconds: number): number {
  return Number.isFinite(seconds) ? lines.findIndex(l => l.endSeconds > l.startSeconds && seconds >= l.startSeconds && seconds < l.endSeconds) : -1;
}
export function segmentAction(seconds: number, range: TimeRange | null, loop: boolean): "continue" | "repeat" | "pause" {
  return range && range.endSeconds > range.startSeconds && seconds >= range.endSeconds ? loop ? "repeat" : "pause" : "continue";
}
