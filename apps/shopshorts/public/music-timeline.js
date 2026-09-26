import {FPS, videoFrames} from './editor-model.js';

// Missing means legacy full-length music. An explicit [] means no music.
export function musicClips(edit) {
  return edit.musicClips ?? (edit.music ? [{id:'music-legacy',assetId:edit.music,startFrame:0,inFrame:0,outFrame:videoFrames(edit),volume:edit.musicVolume,fadeInFrames:0,fadeOutFrames:0}] : []);
}
export function validateMusic(clips, assets, maxFrames) {
  if(!Array.isArray(clips)||clips.length>32)throw Error('배경음은 최대 32개 구간입니다.');
  const ids=new Set();
  return clips.map(c=>{
    if(!c||typeof c.id!=='string'||!/^[a-zA-Z0-9-]{1,80}$/.test(c.id)||ids.has(c.id))throw Error('배경음 구간 ID를 확인하세요.');
    ids.add(c.id);
    if(typeof c.assetId!=='string'||assets[c.assetId]?.kind!=='audio'||assets[c.assetId]?.purpose==='narration')throw Error('등록한 배경음 파일을 선택하세요.');
    const duration=c.outFrame-c.inFrame;
    if(![c.startFrame,c.inFrame,c.outFrame,c.fadeInFrames,c.fadeOutFrames].every(Number.isInteger)||c.startFrame<0||c.inFrame<0||duration<1||c.outFrame>maxFrames||c.startFrame+duration>maxFrames||c.fadeInFrames<0||c.fadeOutFrames<0||c.fadeInFrames+c.fadeOutFrames>duration||!Number.isFinite(c.volume)||c.volume<0||c.volume>1)throw Error('배경음 시간·페이드·음량을 확인하세요.');
    return {id:c.id,assetId:c.assetId,startFrame:c.startFrame,inFrame:c.inFrame,outFrame:c.outFrame,volume:c.volume,fadeInFrames:c.fadeInFrames,fadeOutFrames:c.fadeOutFrames};
  });
}
export function musicGain(clip,frame) {
  const local=frame-clip.startFrame,length=clip.outFrame-clip.inFrame;
  if(local<0||local>=length)return 0;
  return clip.volume*Math.min(1,clip.fadeInFrames?local/clip.fadeInFrames:1,clip.fadeOutFrames?(length-local)/clip.fadeOutFrames:1);
}
export function splitMusic(edit,id,frame,newId) {
  const e=structuredClone(edit);e.musicClips=structuredClone(musicClips(e));
  const i=e.musicClips.findIndex(c=>c.id===id),c=e.musicClips[i],offset=frame-c?.startFrame;
  if(!c||!Number.isInteger(offset)||offset<=0||offset>=c.outFrame-c.inFrame)throw Error('배경음 구간 안에 재생 헤드를 놓으세요.');
  const cut=c.inFrame+offset;
  e.musicClips.splice(i,1,{...c,outFrame:cut,fadeInFrames:Math.min(c.fadeInFrames,offset),fadeOutFrames:0},{...c,id:newId,startFrame:frame,inFrame:cut,fadeInFrames:0,fadeOutFrames:Math.min(c.fadeOutFrames,c.outFrame-cut)});
  return e;
}

// Shared timing contract: source trim, clip fades, then absolute timeline delay.
export function musicFilter(clips) {
  const chains=clips.map((c,i)=>{
    const duration=(c.outFrame-c.inFrame)/FPS;
    return `[${i+1}:a]atrim=start=${c.inFrame/FPS}:end=${c.outFrame/FPS},asetpts=PTS-STARTPTS,aresample=44100,volume=${c.volume}`+
      (c.fadeInFrames?`,afade=t=in:st=0:d=${c.fadeInFrames/FPS}`:'')+
      (c.fadeOutFrames?`,afade=t=out:st=${duration-c.fadeOutFrames/FPS}:d=${c.fadeOutFrames/FPS}`:'')+
      `,adelay=${c.startFrame*1470}S:all=1[m${i}]`; // 44.1kHz / 30fps, sample-exact.
  });
  return chains.join(';')+`;[0:a]${clips.map((_,i)=>`[m${i}]`).join('')}amix=inputs=${clips.length+1}:duration=first:normalize=0,alimiter=limit=0.95:level=0:latency=1[a]`;
}

export function createMusicPlayback(makeAudio, resolve, onError) {
  const players=new Map();
  function stop(){for(const p of players.values()){p.active=false;p.audio.pause();}}
  function sync(clips,frame,playing){
    const ids=new Set(clips.map(c=>c.id));
    for(const [id,p] of players)if(!ids.has(id)){p.audio.pause();p.audio.removeAttribute('src');p.audio.load();players.delete(id);}
    for(const c of clips){
      let p=players.get(c.id);
      const active=playing&&frame>=c.startFrame&&frame<c.startFrame+c.outFrame-c.inFrame;
      if(!p&&!active)continue;
      if(!p){p={audio:makeAudio(),active:false,failed:false};players.set(c.id,p);}
      p.frame=frame;p.clip=c;p.active=active;
      const a=p.audio,src=resolve(c.assetId);
      const apply=()=>{
        if(!p.active){a.pause();return;}
        if(!Number.isFinite(a.duration)||a.duration<=0)return;
        const wanted=(p.clip.inFrame+p.frame-p.clip.startFrame)/FPS%a.duration;
        if(a.paused||Math.abs(a.currentTime-wanted)>.08)a.currentTime=wanted;
        a.volume=musicGain(p.clip,p.frame);
      };
      if(p.src!==src){p.src=src;p.failed=false;a.src=src;a.loop=true;a.onloadedmetadata=apply;a.onerror=()=>{if(!p.failed){p.failed=true;onError('배경음을 불러오지 못했어요. 음원 파일을 확인해 주세요.');}};}
      apply();
      if(active&&a.paused&&!p.failed)a.play().catch(()=>{if(p.active&&!p.failed){p.failed=true;onError('배경음을 재생하지 못했어요. 재생 버튼을 다시 눌러 주세요.');}});
      else if(!active)a.pause();
    }
  }
  return {sync,stop,destroy(){stop();for(const {audio} of players.values()){audio.onloadedmetadata=null;audio.onerror=null;audio.removeAttribute('src');audio.load();}players.clear();}};
}
