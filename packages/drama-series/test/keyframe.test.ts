import { describe, expect, it } from 'vitest';
import { keyframeContext, syntheticKeyframeEvidence, keyframeApproval } from './keyframe-fixture.js';
import { bindKeyframe, keyframeDigest, makeKeyframeRequest, parseKeyframeApproval, parseKeyframeEvidence } from '../src/core/keyframe-digest.js';
import { fingerprintOf } from '../src/core/fingerprint.js';
import { contentSha } from '../src/core/release-source.js';
import type { GateContext } from '../src/core/gates/types.js';

it('makes a deterministic image request with background, faces, then outfits',()=>{
  const c=keyframeContext();c.episode.cuts[0]!.cast.push({characterId:'changsik',lookId:'base'});
  c.episode.cuts[0]!.blocking!.push({characterId:'changsik',side:'right'});
  c.series.characters[0]!.looks[0]!.outfitRefAssetId='outfit-a';c.series.characters[1]!.looks[0]!.outfitRefAssetId='outfit-b';
  const r=makeKeyframeRequest(c,'c1');expect(r.authorized).toBe(false);expect(r.aspectRatio).toBe('16:9');
  expect(r.references.map(x=>x.role)).toEqual(['set','face','face','outfit','outfit']);
  expect(r.prompt).toContain('@Image5: outfit of changsik');expect(r.prompt).toContain('START of the first beat');
  expect(r.checklist.some(x=>x.id.startsWith('safety-'))).toBe(true);expect(r).toEqual(makeKeyframeRequest(c,'c1'));
});

const mutations:[string,(c:GateContext)=>void][]=[
  ['action',c=>{c.episode.cuts[0]!.action+=' 바뀜';}],
  ['visual',c=>{c.episode.cuts[0]!.visualEn+=' Different light.';}],
  ['blocking',c=>{c.episode.cuts[0]!.blocking![0]!.side='left';}],
  ['camera',c=>{c.episode.cuts[0]!.cameraMove='push-in';}],
  ['setup camera',c=>{c.series.locations[0]!.setups![0]!.cameraEn+=' high angle';}],
  ['set reference',c=>{c.series.locations[0]!.setups![0]!.refAssetId='new-set';}],
  ['face reference',c=>{c.series.characters[0]!.looks[0]!.refAssetId='new-face';}],
  ['outfit reference',c=>{c.series.characters[0]!.looks[0]!.outfitRefAssetId='new-outfit';}],
  ['look',c=>{c.series.characters[0]!.looks[0]!.description+=' red jacket';}],
  ['first beat',c=>{c.episode.cuts[0]!.beats![0]!.en='Hold box still';}],
  ['used prop',c=>{c.episode.cuts[0]!.usedPropIds!.push('빈 박스 더미');}],
  ['carried prop',c=>{c.episode.cuts[0]!.cast[0]!.carriesPropIds=['가방'];}],
  ['initial state',c=>{c.episode.cuts[0]!.propState!['빈 박스 더미']='무너짐';}],
  ['style',c=>{c.series.styleEn+=' Watercolor.';}],
  ['safety',c=>{Object.values(c.genre.safetyChecks)[0]!.task+=' 변경된 검사';}],
];
it.each(mutations)('invalidates keyframe evidence when %s changes',(name,mutate)=>{
  const c=keyframeContext(),e=syntheticKeyframeEvidence(c),a=keyframeApproval(e);
  mutate(c);expect(keyframeDigest(c,'c1')).not.toBe(e.keyframeDigest);
  expect(()=>bindKeyframe(c,'c1','test-job',e,a)).toThrow(/재승인/);
});
it('pure dialogue wording changes content digest, but not the image approval; speaker/count do',()=>{
  const c=keyframeContext(),cut=c.episode.cuts[0]!;
  cut.lines=[{speaker:'seoyun',text:'안녕.',kind:'dialogue',verification:{status:'unverified'}}];cut.beats![0]!.lines=[0];
  const image=keyframeDigest(c,'c1'),content=fingerprintOf(c.series,c.episode),e=syntheticKeyframeEvidence(c);
  cut.lines[0]!.text='어서 오세요.';cut.lines[0]!.verification={status:'human-approved',approvedBy:'test'};
  expect(keyframeDigest(c,'c1')).toBe(image);expect(fingerprintOf(c.series,c.episode)).not.toBe(content);
  expect(bindKeyframe(c,'c1','test-job',e,keyframeApproval(e)).authorized).toBe(false);
  cut.lines[0]!.speaker='changsik';expect(keyframeDigest(c,'c1')).not.toBe(image);
  cut.lines[0]!.speaker='seoyun';cut.lines.push(structuredClone(cut.lines[0]!));expect(keyframeDigest(c,'c1')).not.toBe(image);
});
it('binds immediate preceding same-location prop state, across episode boundaries too',()=>{
  const c=keyframeContext(),cut=c.episode.cuts[0]!,next=structuredClone(cut);next.id='c2';c.episode.cuts.push(next);
  const initial=keyframeDigest(c,'c2');cut.propState!['빈 박스 더미']='무너짐';expect(keyframeDigest(c,'c2')).not.toBe(initial);
  c.episode.cuts=[next];c.episode.no=2;c.episode.continuesFromEpisode={no:1,cutId:'c1'};
  c.prev={episode:{...structuredClone(c.episode),no:1,continuesFromEpisode:undefined,cuts:[cut]}};
  const cross=keyframeDigest(c,'c2');cut.propState!['빈 박스 더미']='쌓여 있음';expect(keyframeDigest(c,'c2')).not.toBe(cross);
  delete c.prev;expect(()=>keyframeDigest(c,'c2')).toThrow(/prev-episode/);
});
it.each(['9:16','1:1','16:10'])('rejects unsupported ratio %s',ratio=>expect(()=>makeKeyframeRequest(keyframeContext(),'c1',ratio)).toThrow(/16:9/));
it('refuses legacy, unknown cut, missing author, missing/duplicate reference resolution',()=>{
  const c=keyframeContext();expect(()=>makeKeyframeRequest(c,'missing')).toThrow(/컷 없음/);
  delete c.episode.authoredBy;expect(()=>makeKeyframeRequest(c,'c1')).toThrow(/authoredBy/);c.episode.authoredBy='codex';
  delete c.series.locations[0]!.setups![0]!.refAssetId;expect(()=>makeKeyframeRequest(c,'c1')).toThrow(/참조 자산/);
  c.series.locations[0]!.setups![0]!.refAssetId='img-set';c.series.characters[0]!.looks.push(structuredClone(c.series.characters[0]!.looks[0]!));
  expect(()=>makeKeyframeRequest(c,'c1')).toThrow(/중복/);
  delete c.episode.shotPolicy;expect(()=>makeKeyframeRequest(c,'c1')).toThrow(/shot-v1/);
});
it('requires current staging and a unique declared setup',()=>{
  const c=keyframeContext();delete c.episode.cuts[0]!.blocking;expect(()=>makeKeyframeRequest(c,'c1')).toThrow(/blocking/);
  c.episode.cuts[0]!.blocking=[{characterId:'seoyun',side:'center'}];
  c.series.locations[0]!.setups!.push(structuredClone(c.series.locations[0]!.setups![0]!));expect(()=>makeKeyframeRequest(c,'c1')).toThrow(/구도/);
});

describe('recorded human approval binding (not author authentication)',()=>{
  it('binds target, actual evidence digest, remote ID, all checklist items and quoted decision',()=>{
    const c=keyframeContext(),e=syntheticKeyframeEvidence(c),a=keyframeApproval(e),original=fingerprintOf(c.series,c.episode);
    const b=bindKeyframe(c,'c1','test-job',e,a);expect(b.authorized).toBe(false);expect(b.approvalDigest).toBe(contentSha(a));
    expect(b.fileSha256).toBe(e.image.sha256);expect(fingerprintOf(c.series,c.episode)).toBe(original);
    expect(()=>bindKeyframe(c,'c1','another-job',e,a)).toThrow(/자산/);
    a.subjectDigest='sha256:'+'0'.repeat(64);expect(()=>bindKeyframe(c,'c1','test-job',e,a)).toThrow(/승인 대상/);
  });
  it.each(['approvedBy','userQuote','recordedBy','at','subjectDigest','checks'])('rejects missing approval %s',field=>{
    const a:any=keyframeApproval(syntheticKeyframeEvidence());delete a[field];expect(()=>parseKeyframeApproval(a)).toThrow(/필수/);
  });
  it.each(['composition','cast','wardrobe','props','safety'])('requires true %s confirmation',field=>{
    const a:any=keyframeApproval(syntheticKeyframeEvidence());a.checks[field]=false;expect(()=>parseKeyframeApproval(a)).toThrow(/필수/);
  });
  it('rejects forged digest and aspect even with a recalculated subject',()=>{
    const e=syntheticKeyframeEvidence();e.image.sha256='sha256:'+'c'.repeat(64);expect(()=>parseKeyframeEvidence(e)).toThrow(/지문/);
    e.image.width=90;const {subjectDigest:_,...body}=e;e.subjectDigest=contentSha(body);expect(()=>parseKeyframeEvidence(e)).toThrow(/비율/);
  });
});
