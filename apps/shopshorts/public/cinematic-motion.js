export const CAMERAS = ['locked', 'push-in', 'pull-out', 'pan-left', 'pan-right'];
export const SHOTS = ['wide', 'medium', 'close', 'detail'];
export const cinematic = brief => brief?.productionStyle === 'cinematic';

// The browser and renderer use the same bounded, source-frame camera path.
export function cameraPath(camera, frame, frames) {
  const t = Math.max(0, Math.min(1, frame / Math.max(1, frames - 1)));
  const zoom = camera === 'push-in' ? 1 + .06*t : camera === 'pull-out' ? 1.06 - .06*t : camera?.startsWith('pan-') ? 1.06 : 1;
  const x = camera === 'pan-left' ? 1-t : camera === 'pan-right' ? t : .5;
  return {zoom, x, y:.5};
}

export function cameraFilter(camera, frames, w, h) {
  const t = `min(on/${Math.max(1, frames-1)},1)`;
  const z = camera === 'push-in' ? `1+0.06*${t}` : camera === 'pull-out' ? `1.06-0.06*${t}` : camera?.startsWith('pan-') ? '1.06' : '1';
  const x = camera === 'pan-left' ? `(iw-iw/zoom)*(1-${t})` : camera === 'pan-right' ? `(iw-iw/zoom)*${t}` : '(iw-iw/zoom)/2';
  return `scale=${w*2}:${h*2}:force_original_aspect_ratio=increase:flags=lanczos,crop=${w*2}:${h*2},zoompan=z='${z}':x='${x}':y='(ih-ih/zoom)/2':d=1:s=${w}x${h}:fps=30,setsar=1`;
}
