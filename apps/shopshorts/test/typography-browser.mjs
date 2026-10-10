// Offline editor E2E: browser SVG artwork, font load, caption edit/delete/save.
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile,mkdir} from 'node:fs/promises';
import {resolve,sep} from 'node:path';
import {chromium} from 'playwright';
import {createProject,validateEdit} from '../lib/studio.js';
import {normalizeEdit,scriptCaption} from '../public/editor-model.js';
const output=process.env.TYPOGRAPHY_QA_DIR;if(!output)throw Error('Set TYPOGRAPHY_QA_DIR to the approved artifact directory.');await mkdir(output,{recursive:true});
const root=resolve(import.meta.dirname,'../public');
let p=createProject({category:'과학',topic:'배가 들어와도 무게는 그대로?',format:'short',duration:16});
p.scenes=[{id:'scene-1',kind:'image',duration:5,narration:'배의 무게만큼 물이 밀려납니다.',prompt:'original test drawing'}];
p.assets={'scene-1':{kind:'image',key:'fixture'}};p.approved=true;p.edit=scriptCaption(normalizeEdit(p),'clip-1',p.scenes[0].narration,'script-one').edit;p.edit.voice='none';
const server=createServer(async(req,res)=>{try{
 const path=new URL(req.url,'http://localhost').pathname;
 if(path==='/'){res.setHeader('content-type','text/html');res.end(`<link rel="stylesheet" href="/studio.css"><main id="app"></main><script type="module">import {createEditor} from '/editor.js';const p=await(await fetch('/project')).json();window.editor=createEditor(document.querySelector('#app'),p,{voices:[{id:'none',name:'없음'}],capabilities:{}},{dirty(){},toast(){},save:async edit=>{const r=await fetch('/save',{method:'POST',body:JSON.stringify(edit)});if(!r.ok)throw Error(await r.text());return r.json();}});</script>`);return;}
 if(path==='/project'){res.setHeader('content-type','application/json');res.end(JSON.stringify(p));return;}
 if(path==='/save'){let data='';for await(const c of req)data+=c;p.edit=validateEdit(JSON.parse(data),p);res.setHeader('content-type','application/json');res.end(JSON.stringify(p));return;}
 if(path.startsWith('/api/studio/')){res.setHeader('content-type','image/svg+xml');res.end('<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1920"><rect width="1080" height="1920" fill="#496b79"/><circle cx="540" cy="850" r="270" fill="#97c5b8"/></svg>');return;}
 const file=resolve(root,path.slice(1));if(!file.startsWith(root+sep))throw Error('not found');res.setHeader('content-type',file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':'font/otf');res.end(await readFile(file));
 }catch(e){res.statusCode=500;res.end(e.message);}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const browser=await chromium.launch({headless:true,channel:'chrome'});
try{
 const page=await browser.newPage({viewport:{width:1440,height:1100}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(`http://127.0.0.1:${server.address().port}`);await page.waitForSelector('[data-overlay-caption="opening-question"] svg');await page.evaluate(()=>document.fonts.ready);
 assert.equal(await page.evaluate(()=>document.fonts.check('600 62px "Studio Pretendard"')),true);
 assert.equal(await page.locator('[data-overlay-caption="script-one"] svg rect').getAttribute('rx'),'20');
 await page.screenshot({path:resolve(output,'editor-modern.png'),fullPage:true});
 await page.locator('[data-text="script-one"]').click();await page.locator('#dockCaptionText').fill('자막의 편집과 저장을 확인해요');await page.evaluate(()=>window.editor.save());
 assert.equal(p.edit.captions.find(c=>c.id==='script-one').text,'자막의 편집과 저장을 확인해요');
 assert.equal(p.edit.captions.find(c=>c.id==='script-one').presentation,'modern-v1');
 await page.locator('[data-text="opening-question"]').click();await page.locator('#dockDeleteCaption').click();await page.evaluate(()=>window.editor.save());
 await page.reload();await page.waitForSelector('#monitor');assert.equal(await page.locator('[data-overlay-caption="opening-question"]').count(),0);
 assert.deepEqual(errors,[]);console.log(JSON.stringify({ok:true,fontLoaded:true,editable:true,headerDeletionPersists:true,screenshot:resolve(output,'editor-modern.png')}));
}finally{await browser.close();await new Promise(r=>server.close(r));}
