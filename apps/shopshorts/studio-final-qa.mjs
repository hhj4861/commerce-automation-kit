import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {join} from 'node:path';
import {PIPELINE_VERSION} from './lib/production-pipeline.js';
import {normalizeEdit,clipSpans,frameCount,FPS} from './public/editor-model.js';
import {narrationAsset} from './public/narration-audio.js';
const exec=promisify(execFile);
export async function verifyFinalVideo(file,job,work,{run=exec}={}) {
 const execute=(binary,args)=>run(binary,args,{timeout:600000,maxBuffer:16*1024*1024});
 const meta=JSON.parse((await execute('ffprobe',['-v','error','-show_streams','-show_format','-of','json',file])).stdout);
 const edit=normalizeEdit(job),expected=frameCount(edit)/FPS,v=meta.streams?.find(s=>s.codec_type==='video'),a=meta.streams?.find(s=>s.codec_type==='audio');
 const dimensions=job.brief.aspect==='9:16'?[1080,1920]:[1920,1080];
 if(!v||v.width!==dimensions[0]||v.height!==dimensions[1]||!Number.isFinite(Number(meta.format?.duration))||Math.abs(Number(meta.format.duration)-expected)>.15)throw Error('완성본의 화면 크기 또는 길이가 편집 타임라인과 다릅니다.');
 if(edit.voice!=='none'&&!a)throw Error('완성본에 음성이 없습니다.');
 const decode=await execute('ffmpeg',['-v','error','-xerror','-i',file,'-f','null','-']);
 if(String(decode.stderr||'').trim())throw Error('완성본 디코딩 검사에 실패했습니다.');
 const black=await execute('ffmpeg',['-hide_banner','-i',file,'-vf','blackdetect=d=0.25:pix_th=0.10','-an','-f','null','-']);
 const gaps=[];let cursor=0;
 const spans=clipSpans(edit).sort((x,y)=>x.start-y.start);
 for(const s of spans){if(s.start>cursor)gaps.push([cursor/FPS,s.start/FPS]);cursor=s.end;}
 if(cursor<frameCount(edit))gaps.push([cursor/FPS,expected]);
 const events=[...String(black.stderr).matchAll(/black_start:([\d.]+) black_end:([\d.]+) black_duration:([\d.]+)/g)].map(m=>({start:Number(m[1]),end:Number(m[2])}));
 if(events.some(e=>!gaps.some(([lo,hi])=>e.start>=lo-.08&&e.end<=hi+.08)))throw Error('장면 안에 0.25초 이상 검은 화면이 있습니다.');
 const speech=[];
 if(edit.voice!=='none')for(const {clip,start} of spans){
  const scene=job.scenes.find(s=>s.id===clip.sceneId),voice=narrationAsset(job,scene,edit.voice);
  if(!voice)throw Error('선택한 대본과 목소리에 맞는 음성을 확인할 수 없습니다.');
  // Explicit manual trims are allowed; an untrimmed automatic clip must hold all speech.
  if(!job.manualTimeline&&clip.inFrame===0&&clip.outFrame/FPS<voice.duration-.05)throw Error(`장면 ${scene.id}의 대사 끝이 잘립니다. 길이를 늘려 주세요.`);
  const duration=Math.min((clip.outFrame-clip.inFrame)/FPS,voice.duration-clip.inFrame/FPS);
  if(duration<=0)continue;
  const volume=await execute('ffmpeg',['-hide_banner','-ss',String(start/FPS),'-t',String(duration),'-i',file,'-vn','-af','volumedetect','-f','null','-']);
  const m=String(volume.stderr).match(/mean_volume:\s*(-?[\d.]+|-inf) dB/),db=m?Number(m[1]):-Infinity;
  if(!Number.isFinite(db)||db < -50)throw Error(`장면 ${scene.id}의 음성이 없거나 너무 작습니다.`);
  speech.push({sceneId:scene.id,meanDb:db});
 }
 const sha256=createHash('sha256').update(await readFile(file)).digest('hex');
 const report={version:PIPELINE_VERSION,passed:true,sha256,duration:Number(meta.format.duration),dimensions,decode:true,blackEvents:events,speech,visualReview:'human-required',checkedAt:new Date().toISOString()};
 await writeFile(join(work,'final-verification.json'),JSON.stringify(report,null,2));
 return report;
}
