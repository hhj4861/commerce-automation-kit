/** Raw-byte input check. Each named file is rehashed by atomworks verifyArtifact (one descriptor, O_NOFOLLOW|O_NONBLOCK,
 * stat before/after). Bytes are never decoded or normalized, and results name inputs only — never paths. */
import { z } from 'zod';
import { lstatSync, readFileSync } from 'node:fs';
import { dirname, isAbsolute, resolve } from 'node:path';
import { parseStrictJson, createValidator, verifyArtifact } from '../runtime/sdk.mjs';
import { RunnerError, parseInputs } from './draft.mjs';
const path = z.string().min(1);
const manifest = z.object({series:path,episode:path,gates:z.record(path)}).strict();
const artifactValidator = createValidator('common/ArtifactRef.schema.json');
const REASONS = {'missing-file':'missing','unreadable-file':'unreadable','sha-mismatch':'sha-mismatch','size-mismatch':'changed','file-changed':'changed'};
/** files.json has the inputs shape with paths; relative paths resolve against the manifest's own directory. */
export function loadInputFiles(file) {
  let text, raw, m;
  try { text=readFileSync(file,'utf8'); } catch { throw new RunnerError('input-unreadable',2,'Cannot read files manifest'); }
  try { raw=parseStrictJson(text); } catch { throw new RunnerError('invalid-json',2,'Strict JSON files manifest required'); }
  try { m=manifest.parse(raw); } catch { throw new RunnerError('invalid-input',2,'Files manifest must be {series, episode, gates:{name:path}}'); }
  const base=dirname(resolve(file)), at=p=>isAbsolute(p) ? p : resolve(base,p);
  return {series:at(m.series),episode:at(m.episode),gates:Object.fromEntries(Object.entries(m.gates).map(([k,v])=>[k,at(v)]))};
}
async function check(name, sha256, file) {
  let bytes;
  // Only the final path component is refused when it is a link; ancestor directory links are followed.
  try { const st=lstatSync(file); if (!st.isFile()) return 'not-regular-file'; bytes=st.size; }
  catch(e) { return e?.code==='ENOENT' ? 'missing' : 'unreadable'; }
  // The observed size is only an open-time guard: a different size at open means the file changed in between.
  const ref={schemaVersion:1,artifactId:`drama-input:${name}`,role:'drama-input',sha256:`sha256:${sha256}`,bytes,mediaType:'application/octet-stream',locators:[{kind:'local-file',path:file}]};
  if (!artifactValidator(ref).ok) throw new RunnerError('invalid-input',2,'Input cannot form an atomworks ArtifactRef');
  const r=await verifyArtifact(ref);
  return r.ok ? null : REASONS[r.code] ?? 'unreadable';
}
/** Compares every declared SHA with the current bytes. A pass is a point-in-time check, not a lock against later edits. */
export async function verifyInputs(declared, files) {
  const want=parseInputs(declared), names=Object.keys(want.gates), got=files?.gates ?? {};
  if (typeof files?.series!=='string' || typeof files?.episode!=='string' || Object.keys(got).length!==names.length || names.some(k=>!Object.hasOwn(got,k) || typeof got[k]!=='string'))
    throw new RunnerError('input-manifest-mismatch',2,'Files manifest must name exactly the bundle inputs');
  const failures=[];
  for (const [name,sha256,file] of [['series',want.series,files.series],['episode',want.episode,files.episode],...names.map(k=>[`gates/${k}`,want.gates[k],got[k]])]) {
    const reason=await check(name,sha256,file);
    if (reason) failures.push({name,reason});
  }
  if (!failures.length) return {method:'sha256-raw-bytes',series:true,episode:true,gates:names.length};
  if (failures.some(f=>!['sha-mismatch','changed'].includes(f.reason))) throw new RunnerError('input-unreadable',2,'Input is missing, unreadable or not a regular file',{failures});
  if (failures.some(f=>f.reason==='sha-mismatch')) throw new RunnerError('input-mismatch',2,'Input bytes differ from the bundle SHA-256 manifest',{failures});
  throw new RunnerError('input-changed',75,'Input changed while hashing; retry later',{retryable:true,failures});
}
