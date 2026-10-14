// Pure pass/fail rules for the HyperFrames PoC. verify-poc.mjs records measurements and these
// functions turn them into failures; checks.test.mjs feeds deliberately wrong data to prove that
// a mismatch actually fails instead of only being logged.

export const EXPECT = {width: 1080, height: 1920, fps: '30/1'};
// Studio default bottom caption lands at y≈1705–1773 (captionFilter y=h*0.92-text_h, 56px box).
export const CAPTION_BAND = {top: 1690, bottom: 1790};
// Cream paper #f5efdc is ~238 in gray; template content (ink, bars, icons) is far darker.
export const PAPER_MIN_GRAY = 200;

export function compareHashes(a, b) {
  const n = Math.max(a.length, b.length);
  let same = 0; const differing = [];
  for (let i = 0; i < n; i++) { if (a[i] && a[i] === b[i]) same++; else if (differing.length < 10) differing.push(i); }
  return {framesA: a.length, framesB: b.length, identical: same, firstDiffering: differing};
}

// Returns a list of human-readable failure reasons; empty means the output passed.
export function checkVideo(label, probe, expectedFrames) {
  const bad = [];
  if (!probe) return [`${label}: probe missing`];
  if (probe.width !== EXPECT.width || probe.height !== EXPECT.height) bad.push(`${label}: size ${probe.width}x${probe.height} ≠ ${EXPECT.width}x${EXPECT.height}`);
  if (probe.r_frame_rate !== EXPECT.fps) bad.push(`${label}: fps ${probe.r_frame_rate} ≠ ${EXPECT.fps}`);
  if (Number(probe.nb_read_frames) !== expectedFrames) bad.push(`${label}: frames ${probe.nb_read_frames} ≠ ${expectedFrames}`);
  return bad;
}

export function checkReproducibility(label, cmp, expectedFrames) {
  const bad = [];
  if (!cmp) return [`${label}: reproducibility missing`];
  if (cmp.framesA !== expectedFrames || cmp.framesB !== expectedFrames) bad.push(`${label}: hashed frames ${cmp.framesA}/${cmp.framesB} ≠ ${expectedFrames}`);
  if (cmp.identical !== expectedFrames) bad.push(`${label}: only ${cmp.identical}/${expectedFrames} frames identical (first differing ${cmp.firstDiffering.join(',')})`);
  return bad;
}

// bandMinGray: per-frame minimum gray value inside CAPTION_BAND of the template-only render.
// Any frame darker than paper means template content intrudes on the caption band.
export function checkCaptionBandClear(label, bandMinGray, expectedFrames) {
  if (!Array.isArray(bandMinGray) || bandMinGray.length !== expectedFrames) return [`${label}: caption band scanned ${bandMinGray?.length ?? 0}/${expectedFrames} frames`];
  const hits = bandMinGray.map((g, i) => [i, g]).filter(([, g]) => g < PAPER_MIN_GRAY);
  return hits.length ? [`${label}: template content inside caption band on ${hits.length} frame(s), first ${hits[0][0]} (gray ${hits[0][1]})`] : [];
}

// captionRows: per-frame [firstDarkRow, lastDarkRow] of the burned caption box in the final output.
export function checkCaptionPresent(label, captionRows, expectedFrames) {
  if (!Array.isArray(captionRows) || captionRows.length !== expectedFrames) return [`${label}: caption scanned ${captionRows?.length ?? 0}/${expectedFrames} frames`];
  const missing = captionRows.map((r, i) => [i, r]).filter(([, r]) => !r || r[0] < CAPTION_BAND.top || r[1] > CAPTION_BAND.bottom);
  return missing.length ? [`${label}: caption box missing or outside band on ${missing.length} frame(s), first ${missing[0][0]} (${JSON.stringify(missing[0][1])})`] : [];
}
