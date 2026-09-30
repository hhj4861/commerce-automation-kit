// Episode caption redesign only. Uses existing clean footage and copies original audio.
import {readFile,writeFile,mkdir,access} from 'node:fs/promises';
import {dirname,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawn} from 'node:child_process';
const out=dirname(fileURLToPath(import.meta.url));
const cache=process.env.MODULAR_VIDEO_CACHE||'/private/tmp/cak-modular-height-20260930';
const work=join(cache,'work/modular-height-20260930');
const temp=join(cache,'caption-v2');await mkdir(temp,{recursive:true});
const project=JSON.parse(await readFile(join(out,'project.json'),'utf8'));
const font='/System/Library/Fonts/AppleSDGothicNeo.ttc';await access(font);
const run=(bin,args,input)=>new Promise((resolve,reject)=>{
 const p=spawn(bin,args,{stdio:['pipe','pipe','pipe']});let stdout='',stderr='';
 p.stdout.on('data',d=>stdout+=d);p.stderr.on('data',d=>stderr=(stderr+d).slice(-6000));
 p.once('error',reject);p.once('close',code=>code?reject(Error(`${bin} exit ${code}: ${stderr}`)):resolve({stdout,stderr}));
 p.stdin.end(input);
});
const groups=[
 ['공장에서 만든 방을\n하나씩 쌓았습니다.','그런데 무려\n오십 층입니다.','맨 아래 방은\n위에 쌓인 무게에','찌그러지지 않을까요?'],
 ['모듈러 건축은\n방 같은 입체 공간을','공장에서 만들고,\n현장에서 조립하는 방식입니다.','창문과 내부 마감까지\n갖춘 방이','공장을 나올 수도 있죠.'],
 ['영국 런던의\n칼리지 로드는','실제로 오십 층,','높이 백육십삼 미터까지\n지어졌습니다.','그렇다면 같은 방을\n계속 쌓기만 하면 될까요?'],
 ['아닙니다.\n먼저 방의 겉면을 벗겨 보죠.','무게를 받는 건\n벽지나 가구가 아니라,','설계된 구조입니다.','철골 모듈에서는\n보와 기둥, 연결부를 통해','힘이 아래로 전달됩니다.'],
 ['아래쪽은 위에서 내려오는\n무게까지 받아야 합니다.','칼리지 로드도\n각 층의 하중에 맞춰','모듈의 철골을\n조정했습니다.','겉모습이 같다고\n구조까지 전부 같은 건 아닙니다.'],
 ['그리고 높은 건물에는\n옆에서 미는 바람도 작용합니다.','이런 고층 모듈러는\n콘크리트 코어 같은 구조와','함께 설계할 수 있습니다.','방만 쌓는 게 아니라,','건물 전체를 묶어\n버티게 하는 거죠.'],
 ['그렇다면\n백 층도 될까요?','오십 층은 실제 사례이지,\n정해진 한계가 아닙니다.','더 높이 지으려면\n구조와 연결부,','바람과 화재 안전까지\n함께 검토해야 합니다.'],
 ['모듈러 건축의 비밀은','상자를 얼마나 많이\n쌓느냐가 아닙니다.','무게와 흔들림을\n어디로 보내느냐에 있습니다.','레고처럼 조립하지만,','레고처럼 똑같이\n만들지는 않습니다.']
];
const normalize=s=>s.replace(/\s/gu,'');
for(let i=0;i<groups.length;i++)if(normalize(groups[i].join(''))!==normalize(project.scenes[i].narration))throw Error(`Caption text mismatch: ${i+1}`);
const all=groups.flat();
const measures=JSON.parse((await run('python3',['-c',`import sys,json\nfrom PIL import ImageFont\nf=ImageFont.truetype('${font}',82,index=6)\nprint(json.dumps([max(f.getlength(line) for line in s.split('\\n')) for s in json.load(sys.stdin)]))`],JSON.stringify(all))).stdout);
const sizes=measures.map(w=>Math.min(82,Math.floor(880*82/w)));
if(Math.min(...sizes)<68)throw Error('A caption needs a shorter line');
const accents=['오십 층','백 층','백육십삼 미터','찌그러지지','설계된 구조','철골','코어','하중','무게','흔들림','한계','똑같이','공장','바람','연결부'];
const assTime=frame=>{const cs=Math.round(frame/30*100),h=Math.floor(cs/360000),m=Math.floor(cs/6000)%60,s=Math.floor(cs/100)%60;return `${h}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}.${String(cs%100).padStart(2,'0')}`;};
const escape=s=>s.replace(/\\/g,'').replace(/[{}]/g,'').replace(/\n/g,'\\N');
const accent=s=>{const key=accents.find(k=>s.includes(k));return key?s.replace(key,`{\\c&H68AAD2&}${key}{\\c&HF5F9FA&}`):s;};
let ass=`[Script Info]\nScriptType: v4.00+\nPlayResX: 1080\nPlayResY: 1920\nWrapStyle: 2\nScaledBorderAndShadow: yes\n\n[V4+ Styles]\nFormat: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding\nStyle: Main,Apple SD Gothic Neo,82,&H00F5F9FA,&H00F5F9FA,&H400A100C,&H60000000,-1,0,0,0,100,100,0,0,1,1.4,0,5,85,85,0,1\nStyle: Shadow,Apple SD Gothic Neo,82,&H65000000,&H65000000,&H65000000,&H65000000,-1,0,0,0,100,100,0,0,1,7,0,5,85,85,0,1\nStyle: Disclosure,Apple SD Gothic Neo,24,&H10FFFFFF,&H10FFFFFF,&H20000000,&H60000000,0,0,0,0,100,100,0,0,1,1,1,2,50,50,100,1\n\n[Events]\nFormat: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\n`;
const captions=[];let cursor=0,k=0;
for(let i=0;i<groups.length;i++){
 const scene=project.scenes[i],cards=groups[i];
 const weights=cards.map(c=>normalize(c).length),sum=weights.reduce((a,b)=>a+b,0),speechEnd=Math.ceil(scene.measuredSpeechSeconds*30);let used=0;
 for(let j=0;j<cards.length;j++,k++){
  const start=cursor+Math.round(used/sum*speechEnd);used+=weights[j];const end=cursor+Math.round(used/sum*speechEnd);
  if(end-start<18)throw Error('Caption display is shorter than 0.6 seconds');
  const size=sizes[k],base=`\\an5\\fs${size}\\fad(60,70)`;
  ass+=`Dialogue: 0,${assTime(start)},${assTime(end)},Shadow,,0,0,0,,{${base}\\pos(540,964)\\blur5}${escape(cards[j])}\n`;
  ass+=`Dialogue: 1,${assTime(start)},${assTime(end)},Main,,0,0,0,,{${base}\\pos(540,960)}${accent(escape(cards[j]))}\n`;
  captions.push({sceneId:scene.id,text:cards[j],startFrame:start,endFrame:end,fontSize:size,measuredWidth:measures[k]*size/82,x:540,y:960,accent:accents.find(a=>cards[j].includes(a))||null});
 }
 if(!['load','floor','core'].includes(scene.visual))ass+=`Dialogue: 2,${assTime(cursor)},${assTime(cursor+scene.frames)},Disclosure,,0,0,0,,AI 재현 · 실제 현장 촬영 아님\n`;
 cursor+=scene.frames;
}
await writeFile(join(out,'captions-modern.ass'),ass);
await writeFile(join(out,'captions-v2.json'),JSON.stringify({font:'Apple SD Gothic Neo Bold (macOS system font; not redistributed)',style:'white with restrained gold accents, fine outline, soft shadow, no box',captions},null,2)+'\n');
const sources=project.scenes.map(s=>join(work,`${s.id}.source`));
for(const source of sources)await access(source);
const filters=project.scenes.map((s,i)=>`[${i}:v]scale=1080:1920:flags=lanczos,setsar=1,fps=30,tpad=stop_mode=clone:stop_duration=1,trim=end_frame=${s.frames},setpts=PTS-STARTPTS[v${i}]`).join(';')+';'+project.scenes.map((_,i)=>`[v${i}]`).join('')+`concat=n=${sources.length}:v=1:a=0,ass=filename='${join(out,'captions-modern.ass')}'[video]`;
const videoOnly=join(temp,'picture.mp4');
const args=['-y','-v','warning','-filter_complex_threads','1',...sources.flatMap(s=>['-threads','2','-i',s]),'-filter_complex',filters,'-map','[video]','-an','-c:v','libx264','-threads','4','-preset','fast','-crf','18','-pix_fmt','yuv420p','-frames:v',String(cursor),'-movflags','+faststart',videoOnly];
if(process.argv[2]==='preview'){
 const filter=`scale=1080:1920,setsar=1,setpts=PTS-STARTPTS+1/TB,ass=filename='${join(out,'captions-modern.ass')}'`;
 await run('ffmpeg',['-y','-v','warning','-ss','1','-i',sources[0],'-vf',filter,'-frames:v','1',join(out,'caption-preview.jpg')]);
 console.log('PREVIEW COMPLETE');
}else{
 await run('ffmpeg',args);
 await run('ffmpeg',['-y','-v','warning','-i',videoOnly,'-i',join(out,'modular-height.mp4'),'-map','0:v:0','-map','1:a:0','-c','copy','-movflags','+faststart',join(out,'modular-height-captions-v2.mp4')]);
 console.log(JSON.stringify({output:'modular-height-captions-v2.mp4',captions:captions.length,minFontSize:Math.min(...sizes),maxFontSize:Math.max(...sizes),audio:'stream copied from original',additionalGenerationCost:0}));
}
