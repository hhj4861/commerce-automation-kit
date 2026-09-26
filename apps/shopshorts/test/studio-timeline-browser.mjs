// Offline browser fixture: synthetic media only, no provider or production writes.
import {createServer} from 'node:http';
import {readFile,mkdtemp} from 'node:fs/promises';
import {resolve,sep,join} from 'node:path';
import {tmpdir} from 'node:os';
import {localStudioStore,startLocalStudio} from '../studio-local.mjs';
import {studioApi} from '../lib/studio-api.js';
import {createProject} from '../lib/studio.js';
import {normalizeEdit} from '../public/editor-model.js';
import {command,executeStudioTask} from '../studio-runner.mjs';
const dataDir=await mkdtemp(join(tmpdir(),'studio-timeline-ui-')),store=localStudioStore(dataDir,{});
const project=createProject({category:'심리학',topic:'하루를 바꾸는 작은 쉼',format:'short',duration:16});
project.scenes=[
 {id:'scene-1',narration:'잠깐 멈춰도 괜찮아요.',prompt:'A quiet moment',duration:4,kind:'image'},
 {id:'scene-2',narration:'숨을 고르고 내 감정을 바라보세요.',prompt:'Notice your feelings',duration:5,kind:'image'},
 {id:'scene-3',narration:'다시 시작할 힘은 작은 쉼에서 나옵니다.',prompt:'Begin again',duration:4,kind:'image'}
];project.approved=true;
for(const [i,color] of ['0x466a75','0x92795c','0x526f62'].entries()){
 const file=join(dataDir,`scene-${i}.png`),id=project.scenes[i].id,key=`studio/${project.id}/${id}.png`;
 await command('ffmpeg',['-y','-v','error','-f','lavfi','-i',`color=c=${color}:s=360x640`,'-vf',`drawbox=x=30:y=60:w=300:h=520:color=white@0.1:t=2,drawtext=text=SCENE 0${i+1}:fontsize=28:fontcolor=white:x=(w-tw)/2:y=(h-th)/2`,'-frames:v','1',file],{});
 await store.writeAsset(key,await readFile(file),'image/png');project.assets[id]={key,kind:'image',type:'image/png'};
}
for(const [i,name] of ['잔잔한 리듬','따뜻한 여운'].entries()){
 const file=join(dataDir,`music-${i}.wav`),id=`music-${i}`,key=`studio/${project.id}/${id}.wav`;
 await command('ffmpeg',['-y','-v','error','-f','lavfi','-i',`sine=frequency=${220+i*110}:sample_rate=48000:duration=3`,file],{});
 await store.writeAsset(key,await readFile(file),'audio/wav');project.assets[id]={key,kind:'audio',type:'audio/wav',name};
}
project.edit=normalizeEdit(project);
project.edit.musicClips=[{id:'music-first',assetId:'music-0',startFrame:30,inFrame:0,outFrame:150,volume:.3,fadeInFrames:30,fadeOutFrames:30}];
project.edit.captions=[{id:'caption-first',clipId:'clip-1',text:'잠깐 멈춰도 괜찮아요',startFrame:0,endFrame:120,font:'gothic',size:56,color:'#ffffff',position:'bottom',background:true}];
await store.create(project);
const worker=startLocalStudio(store,{},async(...args)=>{if(args[0].task.action!=='render')throw Error('Offline fixture permits rendering only.');return executeStudioTask(...args);});
const origin = 'http://127.0.0.1:5203', publicRoot = resolve(import.meta.dirname, '../public');
const server = createServer(async (req, res) => {
  try {
    const path = new URL(req.url, origin).pathname; let result;
    if (path === '/auth/status') result = Response.json({ authenticated: true });
    else if (path.startsWith('/api/studio')) {
      if (path.includes('/llm/')) result = Response.json({ items: [], unreadCount: 0, connected: false });
      else {
        const chunks = []; for await (const chunk of req) chunks.push(chunk);
        result = await studioApi(new Request(new URL(req.url, origin), { method: req.method, headers: req.headers, ...(['GET', 'HEAD'].includes(req.method) ? {} : { body: Buffer.concat(chunks) }) }), {}, store);
      }
    } else if (path.startsWith('/api/')) result = Response.json({}, { status: 404 });
    else {
      const file = resolve(publicRoot, path === '/studio' ? 'studio.html' : path.slice(1));
      if (!file.startsWith(publicRoot + sep)) throw Error('not found');
      result = new Response(await readFile(file), { headers: { 'content-type': file.endsWith('.js') ? 'text/javascript' : file.endsWith('.css') ? 'text/css' : file.endsWith('.html') ? 'text/html' : 'application/octet-stream' } });
    }
    res.writeHead(result.status, Object.fromEntries(result.headers)); res.end(Buffer.from(await result.arrayBuffer()));
  } catch { res.writeHead(500); res.end('test server error'); }
});
await new Promise(r => server.listen(5203, '127.0.0.1', r));
console.log(JSON.stringify({ url: `${origin}/studio?id=${project.id}`, productionChanged: false, fixture:true }));
for (const signal of ['SIGTERM', 'SIGINT']) process.once(signal, () => { worker.stop(); server.close(); });
