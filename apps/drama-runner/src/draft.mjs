/** Data-only boundary. No provider, approval, budget reservation or legacy state writes. */
import { z } from 'zod';
import { digest, parseStrictJson, createValidator, StateStore, locationRejection } from '../runtime/sdk.mjs';
import { openSync, closeSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { checkDependency, ATOMWORKS_COMMIT } from '../tools/check-dependency.mjs';
const sha = z.string().regex(/^[0-9a-f]{64}$/);
const inputs = z.object({series:sha,episode:sha,gates:z.record(sha).refine(x=>Object.keys(x).length>0)}).strict();
const report = z.object({gate:z.string().min(1),stage:z.string().min(1),ok:z.literal(true),fingerprint:z.string().min(1),findings:z.array(z.unknown())}).strict();
const clip = z.object({
  cutId:z.string().min(1),backend:z.literal('seedance-2-5'),model:z.literal('seedance_2_5'),durationSec:z.number().int().min(4).max(30),
  params:z.record(z.unknown()),medias:z.array(z.object({role:z.literal('image_references'),assetId:z.string().min(1),label:z.string()}).strict()),
  prompt:z.string().min(1),voiceOver:z.array(z.object({speaker:z.string(),text:z.string()}).strict()),
  estCredits:z.number().finite().nonnegative(),startFromCut:z.string().optional(),
}).strict();
const plan = z.object({seriesId:z.string().min(1),episodeNo:z.number().int().positive(),fingerprint:z.string().min(1),clips:z.array(clip).min(1),totalCredits:z.number().finite().nonnegative(),budgetCredits:z.number().finite().positive(),rateMeasuredAt:z.string().min(1),createdAt:z.string().datetime()}).strict();
const bundle = z.object({schemaVersion:z.literal(1),revision:z.string().min(1),inputs,legacyResult:z.object({ok:z.literal(true),plan,reports:z.array(report).min(1)}).strict()}).strict();
const subjectValidator = createValidator('common/SubjectRef.schema.json');
const SCHEMA = 'commerce.drama-plan-preview';
export class RunnerError extends Error {
  constructor(code, exitCode, detail, extra) { super(detail); this.code=code; this.exitCode=exitCode; this.extra=extra; }
}
const digestText = value => digest(value);
export function parseInputs(value) {
  try { return inputs.parse(value); } catch { throw new RunnerError('invalid-input',2,'Expected a SHA-256 input manifest'); }
}
export function makeDraft(input) {
  let b;
  try { b=bundle.parse(input); } catch { throw new RunnerError('invalid-input',2,'Expected a successful legacy PlanResult and SHA-256 input manifest'); }
  const {createdAt, ...p}=b.legacyResult.plan;
  const reports=b.legacyResult.reports;
  if (reports.length !== 4 || !['required-gates','verified-lines','backend','budget'].every(g=>reports.some(r=>r.gate===g)) || reports.some(r=>r.stage!=='plan' || r.fingerprint!==p.fingerprint || r.findings.some(f=>f?.severity==='block')))
    throw new RunnerError('invalid-input',2,'Legacy plan reports missing or contradictory');
  if (new Set(p.clips.map(c=>c.cutId)).size !== p.clips.length || p.totalCredits > p.budgetCredits || Math.abs(p.clips.reduce((n,c)=>n+c.estCredits,0)-p.totalCredits)>1e-8)
    throw new RunnerError('invalid-input',2,'Duplicate cuts or inconsistent estimate');
  let body;
  try {
    const content=digestText({series:b.inputs.series,episode:b.inputs.episode});
    const subject={schemaVersion:1,kind:SCHEMA,subjectId:`${p.seriesId}/episode/${p.episodeNo}`,digests:{
      content,reviewContext:digestText({content,inputs:b.inputs,reports:b.legacyResult.reports}),execution:digestText(p),
    }};
    if (!subjectValidator(subject).ok) throw new Error('invalid SubjectRef');
    body={schemaVersion:1,kind:SCHEMA,status:'unverified-preview',authorized:false,atomworksCommit:ATOMWORKS_COMMIT,revision:b.revision,inputs:b.inputs,subject,plan:p,reports:b.legacyResult.reports};
    // Check the entire semantic DTO (including NFC and finite-number rules).
    digest(body);
  } catch { throw new RunnerError('invalid-input',2,'Input cannot satisfy atomworks canonical/SubjectRef contract'); }
  return body;
}
function validBody(body) {
  try {
    const expected=makeDraft({schemaVersion:1,revision:body.revision,inputs:body.inputs,legacyResult:{ok:true,plan:{...body.plan,createdAt:'2000-01-01T00:00:00.000Z'},reports:body.reports}});
    return digestText(body) === digestText(expected);
  } catch { return false; }
}
export function saveDraft(path, body) {
  checkDependency();
  if (!validBody(body)) throw new RunnerError('invalid-input',2,'Invalid preview body');
  const location=locationRejection(path,[]);
  if (location) return location;
  // Claim a fresh file without truncation. Existing databases must carry this
  // consumer's application_id before StateStore can change anything in them.
  const applicationId=0x44525056; // DRPV
  let fresh=false;
  try { const fd=openSync(path,'wx',0o600);closeSync(fd);fresh=true; }
  catch(e) {
    if(e.code!=='EEXIST') throw new RunnerError('storage-error',2,'Cannot create preview database');
    let probe;
    try {
      probe=new DatabaseSync(path,{readOnly:true});
      if(probe.prepare('PRAGMA application_id').get().application_id!==applicationId) throw new Error('foreign DB');
    } catch(e) {
      if (e.errcode === 5 || e.errcode === 6) return {ok:false,code:'busy',exitCode:75,retryable:true,detail:'Preview database is locked; retry later'};
      if (e.message === 'foreign DB' || e.errcode === 26) throw new RunnerError('foreign-database',2,'Use a fresh dedicated preview DB; legacy databases are never migrated');
      throw new RunnerError('storage-error',1,'Cannot inspect preview database');
    } finally { probe?.close(); }
  }
  const s=StateStore.open({path,knownSchemas:{[SCHEMA]:1},bodyValidators:{[SCHEMA]:{1:validBody}},syncFolderDenylist:[]});
  if (s.ok===false) return s;
  try {
    if(fresh) s.db.exec(`PRAGMA application_id=${applicationId}`);
    const id=digestText(body).slice(7);
    const result=s.casBatch({opId:`drama-preview:${id}`,by:{schemaVersion:1,principalId:'drama-runner',kind:'agent',agent:'drama-runner'},asserts:[],writes:[{collection:'drama-previews',key:id,expectedRevision:'absent',schemaId:SCHEMA,schemaVersion:1,body}]});
    return {...result,...(result.ok ? {previewId:id,authorized:false} : {})};
  } finally { s.close(); }
}
export function parseBundle(text) {
  try { return parseStrictJson(text); } catch { throw new RunnerError('invalid-json',2,'Strict JSON required'); }
}
