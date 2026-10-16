// Reuse the same bundled Pretendard font and modern-v1 artwork as the studio.
import {readFile, writeFile} from 'node:fs/promises';
import {dirname, resolve} from 'node:path';
import {renderCaptionArtwork} from '../studio-typography.mjs';
import {defaultCaption} from '../public/video-typography.js';
const manifest = resolve(process.argv[2] || '');
try {
 const cues = JSON.parse(await readFile(manifest, 'utf8'));
 if (!Array.isArray(cues)) throw Error('Caption cues must be an array');
 for (const [i,cue] of cues.entries()) {
  if (typeof cue.text!=='string' || !cue.text.trim() || !Number.isFinite(cue.start) || cue.end<=cue.start) throw Error('Invalid caption cue');
  const path=resolve(dirname(manifest),`caption-${String(i).padStart(3,'0')}.png`);
  const art=await renderCaptionArtwork({...defaultCaption(),text:cue.text},'9:16',path);
  if(art.height>192)throw Error('Caption exceeds two lines; revise cue boundaries');
  Object.assign(cue,{file:path,width:art.width,height:art.height});
 }
 await writeFile(manifest,JSON.stringify(cues,null,2));
 console.log(JSON.stringify({captions:cues.length,presentation:'modern-v1',font:'Pretendard SemiBold'}));
} catch(error) { console.error(error.message);process.exitCode=1; }
