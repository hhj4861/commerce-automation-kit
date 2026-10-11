import { randomUUID } from 'node:crypto';
import { mkdirSync, chmodSync, writeFileSync, lstatSync } from 'node:fs';
import { resolve, join } from 'node:path';
import type { DramaVisualEvidence, DramaVisualRequest } from '@cak/contracts';
import type { GateContext } from '../core/gates/types.js';
import { contentSha } from '../core/release-source.js';
import { evaluateVisualResponse, makeVisualRequest, parseVisualEvidence, sampleOrdinals, VisualVerdictError } from '../core/visual-verdict.js';
import { readStrictJsonFile, inspectFile, media, pixelFrames, probe, videoInput, imageInput } from './media-evidence.js';

const same=(a:unknown,b:unknown)=>contentSha(a)===contentSha(b);
function assertDirectory(root:string):void {
  const stat=lstatSync(root);
  if(!stat.isDirectory() || stat.isSymbolicLink())throw new VisualVerdictError('증거 디렉터리 형식 오류');
}
/** A fresh private directory is the boundary; failed partial output is retained. */
export function prepareVisualVerdict(ctx:GateContext,cutId:string,jobId:string,clip:string,directory:string):DramaVisualRequest {
  const root=resolve(directory),requestId=randomUUID();
  // Validate context/job before creating any output; real evidence replaces this placeholder.
  makeVisualRequest(ctx,cutId,jobId,requestId,{clip:{sha256:'sha256:'+'0'.repeat(64),bytes:1},frameCount:1,frames:[{id:'f0',ordinal:0,file:'frame-0.png',sha256:'sha256:'+'0'.repeat(64),bytes:1,pixelSha256:'sha256:'+'0'.repeat(64)}]});
  mkdirSync(root,{mode:0o700});
  const snapshot=join(root,'clip.mp4'),clipInfo=inspectFile(clip,snapshot);
  chmodSync(snapshot,0o400);probe(snapshot);
  const pixels=pixelFrames(videoInput(snapshot)), frames:DramaVisualEvidence['frames']=[];
  for(const ordinal of sampleOrdinals(pixels.length)){
    const file=`frame-${ordinal}.png`, path=join(root,file);
    media('ffmpeg',['-v','error','-nostdin','-xerror','-n',...videoInput(snapshot),'-map','0:v:0','-an','-sn','-dn','-vf',`format=rgb24,select=eq(n\\,${ordinal})`,'-fps_mode','passthrough','-frames:v','1','-threads','1','-c:v','png',path]);
    const decoded=pixelFrames(imageInput(path));
    if(decoded.length!==1 || decoded[0]!==pixels[ordinal])throw new VisualVerdictError('추출 프레임 픽셀 불일치');
    frames.push({id:`f${ordinal}`,ordinal,file,...inspectFile(path),pixelSha256:decoded[0]!});chmodSync(path,0o400);
  }
  if(!same(clipInfo,inspectFile(snapshot)))throw new VisualVerdictError('추출 중 클립 변경');
  const request=makeVisualRequest(ctx,cutId,jobId,requestId,{clip:clipInfo,frameCount:pixels.length,frames});
  writeFileSync(join(root,'request.json'),JSON.stringify(request,null,2)+'\n',{flag:'wx',mode:0o400});
  return request;
}

/** Verify current source bytes AND regenerate every question; never trust the saved request. */
export function applyVisualVerdict(ctx:GateContext,cutId:string,jobId:string,directory:string,rawResponse:unknown) {
  const root=resolve(directory);assertDirectory(root);
  const path=join(root,'request.json'),before=inspectFile(path);
  if(before.bytes>1024*1024)throw new VisualVerdictError('요청 크기 초과');
  const parsed=readStrictJsonFile(path);
  if(!parsed || typeof parsed!=='object' || Array.isArray(parsed))throw new VisualVerdictError('요청 형식 오류');
  const raw=parsed as Record<string,unknown>;
  const evidence=parseVisualEvidence(raw.evidence);
  const clip=join(root,'clip.mp4');
  if(!same(evidence.clip,inspectFile(clip)))throw new VisualVerdictError('실제 클립 바이트 불일치');
  probe(clip);
  const pixels=pixelFrames(videoInput(clip));
  if(pixels.length!==evidence.frameCount)throw new VisualVerdictError('실제 프레임 수 불일치');
  for(const f of evidence.frames){
    const image=join(root,f.file);
    if(!same({sha256:f.sha256,bytes:f.bytes},inspectFile(image)))throw new VisualVerdictError('실제 프레임 바이트 불일치');
    const decoded=pixelFrames(imageInput(image));
    if(decoded.length!==1 || decoded[0]!==pixels[f.ordinal] || decoded[0]!==f.pixelSha256)throw new VisualVerdictError('실제 ordinal 프레임 불일치');
  }
  if(typeof raw.requestId!=='string')throw new VisualVerdictError('요청 ID 형식 오류');
  const expected=makeVisualRequest(ctx,cutId,jobId,raw.requestId,evidence);
  const result=evaluateVisualResponse(expected,raw,rawResponse);
  // Detect changes during the entire verification window, including request metadata.
  if(!same(before,inspectFile(path)) || !same(evidence.clip,inspectFile(clip)) || evidence.frames.some(f=>!same({sha256:f.sha256,bytes:f.bytes},inspectFile(join(root,f.file)))))
    throw new VisualVerdictError('검증 중 증거 변경');
  return result;
}
