import { randomUUID } from 'node:crypto';
import { chmodSync, linkSync, lstatSync, mkdirSync, unlinkSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import type { DramaKeyframeEvidence } from '@cak/contracts';
import type { GateContext } from '../core/gates/types.js';
import { contentSha } from '../core/release-source.js';
import { bindKeyframe, keyframeAssetId, KeyframeError, makeKeyframeRequest, parseKeyframeApproval, parseKeyframeEvidence } from '../core/keyframe-digest.js';
import { imageInput, inspectFile, media, pixelFrames, readStrictJsonFile } from './media-evidence.js';

const same=(a:unknown,b:unknown)=>contentSha(a)===contentSha(b);
const MAX_JSON_BYTES=1_048_576; // same bound as readStrictJsonFile
function encodeJson(data:unknown):string {
  const encoded=JSON.stringify(data,null,2)+'\n';
  if(Buffer.byteLength(encoded,'utf8')>MAX_JSON_BYTES)throw new KeyframeError('키프레임 JSON 출력은 1MiB 이하여야 함');
  return encoded;
}
/** Complete JSON appears atomically, never overwrites a path (including a symlink). */
function writeNewJson(path:string,data:unknown):void {
  const encoded=encodeJson(data);
  const temporary=join(dirname(path),`.keyframe-${randomUUID()}.tmp`);
  writeFileSync(temporary,encoded,{flag:'wx',mode:0o400});
  try {linkSync(temporary,path);} finally {unlinkSync(temporary);}
}
function checkRoot(directory:string):string {
  const root=resolve(directory),stat=lstatSync(root);
  if(!stat.isDirectory() || stat.isSymbolicLink())throw new KeyframeError('키프레임 증거 디렉터리 필요(심볼릭 링크 금지)');
  return root;
}
function imageEvidence(file:string):DramaKeyframeEvidence['image'] {
  const before=inspectFile(file);
  const info=JSON.parse(media('ffprobe',['-v','error',...imageInput(file),'-show_entries','stream=codec_name,width,height','-of','json']));
  const s=info.streams?.[0];
  if(info.streams?.length!==1 || s?.codec_name!=='png' || !Number.isInteger(s.width) || !Number.isInteger(s.height)
      || s.width<1 || s.height<1 || s.width>4096 || s.height>4096 || s.width*9!==s.height*16)
    throw new KeyframeError('실제 PNG 크기 1~4096px 및 16:9 필요');
  const frames=pixelFrames(imageInput(file));
  if(frames.length!==1)throw new KeyframeError('키프레임은 단일 PNG 프레임이어야 함');
  if(!same(before,inspectFile(file)))throw new KeyframeError('PNG 검사 중 파일 변경');
  return {...before,width:s.width as number,height:s.height as number,pixelSha256:frames[0]!};
}
export function writeKeyframeRequest(ctx:GateContext,cutId:string,aspect:string,path:string) {
  const request=makeKeyframeRequest(ctx,cutId,aspect);
  writeNewJson(resolve(path),request);
  return request;
}

/** Fresh directory only. Failed/incomplete output is retained, never treated as a valid bundle. */
export function prepareKeyframeEvidence(ctx:GateContext,cutId:string,assetId:string,png:string,directory:string):DramaKeyframeEvidence {
  keyframeAssetId.parse(assetId);
  const request=makeKeyframeRequest(ctx,cutId),root=resolve(directory);
  encodeJson(request); // reject before creating any partial evidence directory
  mkdirSync(root,{mode:0o700});
  const file=join(root,'image.png'),snapshot=inspectFile(png,file);
  chmodSync(file,0o400);
  const image=imageEvidence(file);
  if(!same(snapshot,{sha256:image.sha256,bytes:image.bytes}))throw new KeyframeError('PNG 사본 지문 불일치');
  const body={schemaVersion:1 as const,kind:'drama-keyframe-evidence' as const,authorized:false as const,
    target:request.target,aspectRatio:request.aspectRatio,keyframeDigest:request.keyframeDigest,assetId,image};
  const evidence=parseKeyframeEvidence({...body,subjectDigest:contentSha(body)});
  writeNewJson(join(root,'request.json'),request);
  writeNewJson(join(root,'evidence.json'),evidence); // completion marker, last
  return evidence;
}

export function verifyKeyframeEvidence(ctx:GateContext,cutId:string,assetId:string,directory:string):DramaKeyframeEvidence {
  keyframeAssetId.parse(assetId);
  const root=checkRoot(directory),manifest=join(root,'evidence.json'),requestFile=join(root,'request.json');
  const manifestInfo=inspectFile(manifest),requestInfo=inspectFile(requestFile);
  const evidence=parseKeyframeEvidence(readStrictJsonFile(manifest)),request=makeKeyframeRequest(ctx,cutId);
  if(!same(readStrictJsonFile(requestFile),request) || evidence.keyframeDigest!==request.keyframeDigest || !same(evidence.target,request.target) || evidence.assetId!==assetId)
    throw new KeyframeError('키프레임 장면·대상·자산 변경 — 다시 준비/승인 필요');
  if(!same(evidence.image,imageEvidence(join(root,'image.png'))))throw new KeyframeError('키프레임 실제 파일/픽셀과 증거 불일치');
  if(!same(manifestInfo,inspectFile(manifest)) || !same(requestInfo,inspectFile(requestFile)))throw new KeyframeError('검사 중 키프레임 메타데이터 변경');
  return evidence;
}

/** Records a supplied human approval; does not invent a decision or authenticate its author.
 * Copies all evidence into a self-contained new bundle, leaving the episode/source unchanged. */
export function approveKeyframeEvidence(ctx:GateContext,cutId:string,assetId:string,source:string,rawApproval:unknown,directory:string) {
  const evidence=verifyKeyframeEvidence(ctx,cutId,assetId,source),approval=parseKeyframeApproval(rawApproval);
  const binding=bindKeyframe(ctx,cutId,assetId,evidence,approval),root=resolve(directory);
  mkdirSync(root,{mode:0o700});
  const image=join(root,'image.png');
  const copied=inspectFile(join(resolve(source),'image.png'),image);chmodSync(image,0o400);
  if(!same(copied,{sha256:evidence.image.sha256,bytes:evidence.image.bytes}) || !same(imageEvidence(image),evidence.image))
    throw new KeyframeError('승인 사본 복사 중 PNG 변경');
  writeNewJson(join(root,'request.json'),makeKeyframeRequest(ctx,cutId));
  writeNewJson(join(root,'evidence.json'),evidence);
  writeNewJson(join(root,'approval.json'),approval);
  writeNewJson(join(root,'binding.json'),binding); // approval completion marker, last
  return binding;
}
export function checkKeyframeApproval(ctx:GateContext,cutId:string,assetId:string,directory:string) {
  const root=checkRoot(directory),approvalFile=join(root,'approval.json'),bindingFile=join(root,'binding.json');
  const approvalInfo=inspectFile(approvalFile),bindingInfo=inspectFile(bindingFile);
  const evidence=verifyKeyframeEvidence(ctx,cutId,assetId,root);
  const binding=bindKeyframe(ctx,cutId,assetId,evidence,readStrictJsonFile(approvalFile));
  if(!same(binding,readStrictJsonFile(bindingFile)))throw new KeyframeError('저장된 키프레임 승인 결합 기록 불일치');
  if(!same(approvalInfo,inspectFile(approvalFile)) || !same(bindingInfo,inspectFile(bindingFile))
      || !same({sha256:evidence.image.sha256,bytes:evidence.image.bytes},inspectFile(join(root,'image.png'))))
    throw new KeyframeError('승인 검사 중 파일 변경');
  return {ok:true as const,authorized:false as const,binding,
    blockers:['기록된 사용자 승인과 실제 PNG 결합만 검사 — 승인자 신원/원격 assetId 출처 미인증','전체 컷·실행 상태·출시 승인 미구현 — 영상 생성/조립 권한 없음']};
}
