import { FPS } from './editor-model.js';

export const narrationId = sceneId => `narration-${sceneId}`;
export function narrationAsset(project, scene, voice) {
  const asset = project.assets[narrationId(scene.id)];
  return asset?.purpose === 'narration' && asset.voice === voice && asset.text === scene.narration && asset.key ? asset : null;
}
export function narrationScenes(project, edit) {
  const ids = new Set(edit.clips.map(c => c.sceneId));
  return project.scenes.filter(s => ids.has(s.id));
}
export function narrationReady(project, edit) {
  return edit.voice === 'none' || narrationScenes(project, edit).every(s => narrationAsset(project, s, edit.voice));
}

// Audio uses the same source-frame offsets as the final render. Never loop speech.
export function createNarrationPlayback(audio, onError) {
  let source = '', desired = null, pending = false, failed = false, generation = 0;
  function apply() {
    if (!desired || !audio.readyState || failed) return;
    const { seconds, playing } = desired;
    if (Number.isFinite(audio.duration) && seconds >= audio.duration) { audio.pause(); return; }
    if (!playing || Math.abs(audio.currentTime - seconds) > .15) audio.currentTime = seconds;
    if (!playing) { audio.pause(); return; }
    if (audio.paused && !pending) {
      pending = true;
      const current = generation;
      Promise.resolve(audio.play()).catch(() => {
        if (current !== generation) return;
        failed = true;
        onError('대본 음성을 재생하지 못했어요. 다시 재생해 주세요.');
      }).finally(() => { if (current === generation) pending = false; });
    }
  }
  audio.onloadedmetadata = apply;
  audio.onerror = () => { if (desired && !failed) { failed = true; onError('대본 음성을 불러오지 못했어요. 연결을 확인하고 다시 재생해 주세요.'); } };
  return {
    sync(src, at, playing) {
      if (!src) { this.stop(); return; }
      desired = { seconds: (at.clip.inFrame + at.local) / FPS, playing };
      if (source !== src) {
        generation++; pending = false; failed = false;
        audio.pause(); source = src; audio.src = src; audio.loop = false; audio.load();
      }
      apply();
    },
    stop() { generation++; desired = null; pending = false; failed = false; audio.pause(); },
    destroy() { this.stop(); audio.onloadedmetadata = null; audio.onerror = null; audio.removeAttribute('src'); audio.load(); },
  };
}
