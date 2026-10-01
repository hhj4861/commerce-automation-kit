// Original episode artwork and animation. No third-party footage or cloned voices.
import {readFile,writeFile,mkdir,access,rename} from 'node:fs/promises';
import {dirname,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
import {createHash} from 'node:crypto';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
const out=dirname(fileURLToPath(import.meta.url));
const brief=JSON.parse(await readFile(join(out,'brief.json'),'utf8'));
const cloud='/Users/admin/Library/Mobile Documents/com~apple~CloudDocs/gpt 작업/commerce-automation-kit';
const cache=process.env.VIDEO_CACHE||join(cloud,'20261001-single-loneliness');
const final=process.env.VIDEO_FINAL||'/Users/admin/Downloads/vedio/single-loneliness-kyle-100x.mp4';
const font=process.env.VIDEO_FONT||join(cloud,'20260930-yeosu-realistic/fonts/Pretendard-SemiBold.otf');
const require=createRequire(join(cache,'runtime/package.json'));const {Resvg}=require('@resvg/resvg-js');
const save=async(p,v)=>{await mkdir(dirname(p),{recursive:true});await writeFile(p,v);};
const exists=p=>access(p).then(()=>true,()=>false);
const run=(bin,args)=>new Promise((ok,no)=>{const p=spawn(bin,args,{stdio:['ignore','pipe','pipe']});let o='',e='';p.stdout.on('data',d=>o+=d);p.stderr.on('data',d=>e=(e+d).slice(-6000));p.once('error',no);p.once('close',c=>c?no(Error(e)):ok(o));});
const duration=async p=>Number(await run('ffprobe',['-v','error','-show_entries','format=duration','-of','csv=p=0',p]));
const scenes=[];let total=0;
for(const [i,s] of brief.scenes.entries()){
 const raw=join(cache,'remote-narration',`beat-${String(i).padStart(2,'0')}.mp3`),meta=JSON.parse(await readFile(raw+'.json','utf8'));
 if(meta.text!==s.narration||meta.voiceId!==brief.voice)throw Error('Narration mismatch '+s.id);
 const voice=join(cache,s.id+'.wav');
 if(!await exists(voice))await run('ffmpeg',['-y','-v','error','-i',raw,'-af','silenceremove=start_periods=1:start_duration=0.02:start_threshold=-50dB','-ar','44100','-ac','2','-c:a','pcm_s16le',voice]);
 const speech=await duration(voice),frames=Math.ceil((speech+.2)*12),seconds=frames/12;
 scenes.push({...s,voice,speechSeconds:speech,duration:seconds,sourceFrames:frames,start:total});total+=seconds;
}
if(total<540||total>1080)throw Error('Unexpected longform duration '+total);
console.log(JSON.stringify({scenes:scenes.length,totalSeconds:total,speed:1}));
// Short two-line captions. Timings are proportional to spoken text, not phoneme alignment.
function cards(s){const result=[];for(const sentence of s.match(/[^.!?]+[.!?]?/gu)||[]){let line='';for(const word of sentence.trim().split(/\s+/)){if((line+' '+word).trim().length>44){result.push(line);line=word;}else line=(line+' '+word).trim();}if(line)result.push(line);}return result.map(s=>{if(s.length<=25)return s;const words=s.split(' ');let best;for(let i=1;i<words.length;i++){const a=words.slice(0,i).join(' '),b=words.slice(i).join(' ');if(a.length<=27&&b.length<=27&&(!best||Math.abs(a.length-b.length)<best.cost))best={text:a+'\n'+b,cost:Math.abs(a.length-b.length)};}if(!best)throw Error('Caption too wide '+s);return best.text;});}
for(const s of scenes){const parts=cards(s.narration),weights=parts.map(x=>x.replace(/\s/g,'').length),sum=weights.reduce((a,b)=>a+b,0);let used=0;s.captions=parts.map((text,i)=>{const start=used/sum*s.speechSeconds;used+=weights[i];return {text,start,end:used/sum*s.speechSeconds};});}
const C={paper:'#f6f0e5',ink:'#293d3c',sage:'#779a8d',mint:'#c9d9c8',clay:'#bd765c',rose:'#dfab91',gold:'#d2ad64',cream:'#fffbf3',muted:'#737f73',skin:'#e9bea0',hair:'#44413c'};
const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]));
const txt=(s,x,y,size=22,color=C.ink,anchor='middle')=>`<text x="${x}" y="${y}" font-family="Pretendard" font-weight="600" font-size="${size}" fill="${color}" text-anchor="${anchor}">${esc(s)}</text>`;
const path=(d,fill='none',stroke=C.ink,w=3)=>`<path d="${d}" fill="${fill}" stroke="${stroke}" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round"/>`;
const rect=(x,y,w,h,fill,rx=12)=>`<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${rx}" fill="${fill}"/>`;
const circle=(x,y,r,fill)=>`<circle cx="${x}" cy="${y}" r="${r}" fill="${fill}"/>`;
const ease=v=>1-(1-Math.max(0,Math.min(1,v)))**3;
const reveal=(art,t,d=0)=>`<g opacity="${ease((t-d)/.8)}" transform="translate(0 ${(1-ease((t-d)/.8))*14})">${art}</g>`;
function plant(x,y,t,scale=1){return `<g transform="translate(${x} ${y}) scale(${scale})">${path(`M0 0Q${5*Math.sin(t)}-72 0-160`,'none',C.sage,5)}${[-1,1].map((a,i)=>path(`M0 ${-45-i*40}Q${a*90} ${-58-i*40} ${a*54} ${-100-i*38}Q${a*4} ${-105-i*28}0 ${-45-i*40}`,i?C.mint:C.sage,'none')).join('')}${path('M-35-18L-25 40H25L35-18Z',C.clay,'none')}</g>`;}
function person(x,y,t,{female=false,scale=1,worried=false,speaking=false,walk=false,gesture=false,coat}={}){const bob=Math.sin(t*1.6)*1.8,blink=Math.sin(t*1.27)>.99,hand=gesture?Math.sin(t*1.8)*16:0,stride=walk?Math.sin(t*4)*17:0;return `<g transform="translate(${x} ${y+bob}) scale(${scale})">${female?path('M-48-125Q-10-177 40-136Q69-98 52-25H-54Z',C.hair,'none'):''}${path('M-34-11Q-62 14-57 84Q-4 98 55 84L48 0Q0-22-34-11Z',coat||(female?C.sage:C.clay),'none')}${path(`M-26 87L${-29+stride} 155M25 87L${29-stride} 155`,'none',C.ink,21)}${path(`M${-29+stride} 157L${-45+stride} 157M${29-stride} 157L${44-stride} 157`,'none',C.hair,13)}${path(`M-44 9Q-83 38-75 ${64+hand}M45 9Q83 39 87 ${20-hand}`,'none',C.skin,13)}${rect(-13,-34,26,29,C.skin,7)}<ellipse cx="0" cy="-76" rx="44" ry="52" fill="${C.skin}"/>${path(female?'M-43-69Q-66-127-10-136Q46-148 46-83Q16-111 8-121Q-9-88-43-69Z':'M-45-84Q-54-147 6-133Q50-137 48-85L22-111L-11-111Z',C.hair,'none')}${blink?path('M-21-76H-12M11-76H20','none',C.ink,2):circle(-16,-77,2.5,C.ink)+circle(16,-77,2.5,C.ink)}${speaking?`<ellipse cx="0" cy="-49" rx="6" ry="${2+Math.abs(Math.sin(t*10))*4}" fill="#985f52"/>`:path(worried?'M-10-47Q0-55 10-47':'M-9-54Q0-45 9-54','none',C.ink,2)}${path('M0-72L-3-61H1','none','#bd927c',1.5)}${circle(-26,-61,6,'#df9d85')}${circle(26,-61,6,'#df9d85')}</g>`;}
function phone(x,y,t,{active=false,scale=1}={}){return `<g transform="translate(${x} ${y}) rotate(${active?Math.sin(t*7)*1.2:0}) scale(${scale})">${rect(-58,-103,116,206,C.ink,18)}${rect(-51,-93,102,183,C.cream,12)}${rect(-15,-89,30,5,C.ink,3)}${[0,1,2].map(i=>reveal(rect(-38,-61+i*43,76,30,i%2?C.mint:'#e9ddc9',8),t%8,i*.8)).join('')}${circle(0,97,3,C.cream)}</g>`;}
function cup(x,y,t){return `<g transform="translate(${x} ${y})">${path('M-22-24H22V7Q20 30 0 30Q-20 30-22 7Z',C.cream,C.clay,2)}${path('M22-16Q51-18 40 7Q34 14 22 9','none',C.clay,3)}${[0,1].map(i=>path(`M${-9+i*17}-40Q${-20+i*23+Math.sin(t*2)*6}-59 ${-9+i*17}-75`,'none',C.muted,2)).join('')}</g>`;}
function windowArt(x,y,t,warm=false){return `<g transform="translate(${x} ${y})">${rect(-150,-170,300,286,'#e4ddcc',100)}${rect(-139,-159,278,264,warm?'#ead4a8':'#d9dfd5',90)}${circle(70,-91,29,warm?C.gold:C.cream)}${[-1,0,1].map((a,i)=>rect(-135+i*88,-42-a*19,76,143+a*19,['#afbab0','#9daea1','#bbc5b8'][i],0)).join('')}${path('M0-156V105M-140-27H140','none',C.paper,8)}${rect(-160,102,320,15,C.sage,4)}</g>`;}
function sofa(x,y){return `<g transform="translate(${x} ${y})">${rect(-178,-92,356,109,'#b9cabb',22)}${rect(-191,-33,382,83,'#a4bda9',18)}${rect(-190,-65,36,112,C.sage,15)}${rect(153,-65,36,112,C.sage,15)}${path('M-152 50V71M155 50V71','none',C.hair,9)}${rect(-129,-78,90,60,C.cream,12)}</g>`;}
function table(x,y){return `<g transform="translate(${x} ${y})">${path('M-145 0H145M-115 8L-137 111M115 8L137 111','none','#9e8268',11)}</g>`;}
function calendar(x,y,t){return `<g transform="translate(${x} ${y})">${rect(-125,-105,250,208,C.cream,16)}${rect(-125,-105,250,45,C.clay,16)}${[-1,0,1].map(i=>path(`M${i*68}-120V-91`,'none',C.ink,6)).join('')}${Array.from({length:15},(_,i)=>circle(-88+(i%5)*44,-31+Math.floor(i/5)*44,7,'#d9d9ca')).join('')}${reveal(path('M-55 11L-37 29L1-19','none',C.sage,8),t,1)}${txt('30분',69,68,25,C.clay)}</g>`;}
function book(x,y,t,scale=1){return `<g transform="translate(${x} ${y}) scale(${scale})">${path('M0-48Q-58-68-111-43V72Q-57 52 0 76Q59 51 111 72V-43Q56-68 0-48Z',C.cream,C.sage,3)}${path('M0-48V76','none',C.sage,2)}${[-1,1].map(a=>[0,1,2].map(i=>path(`M${a*20} ${-20+i*21}L${a*89} ${-25+i*21}`,'none','#c7c9b7',3)).join('')).join('')}</g>`;}
function bench(x,y){return `<g transform="translate(${x} ${y})">${rect(-190,-68,380,70,'#ba9474',7)}${rect(-199,16,398,19,'#a48264',5)}${path('M-165 32V100M163 32V100','none',C.ink,9)}</g>`;}
function sceneSvg(s,t,i){let art='';const v=s.visual,act=t/ s.duration,phase=t%9;const female=i%2===0;
 if(['home','homewarm','dinner','lamp','window','mask','mirror'].includes(v)){
  art=windowArt(913,296,t,v==='homewarm'||v==='dinner')+sofa(357,421)+plant(1125,461,t,.7)+rect(74,517,1110,4,'#d7d1bf',2);
  if(v==='dinner'){art+=table(645,421)+cup(720,394,t)+`<ellipse cx="614" cy="413" rx="55" ry="13" fill="${C.cream}"/>`+person(542,311,t,{female:true,scale:.77,speaking:true});}
  else if(v==='lamp'){art+=path('M682 276V498','none',C.gold,8)+path('M638 205H726L752 283H612Z',C.gold,'none')+book(910,478,t,.55)+person(378,325,t,{scale:.72});}
  else if(v==='mirror'){art+=`<ellipse cx="754" cy="318" rx="119" ry="148" fill="#d3ddd2" stroke="${C.gold}" stroke-width="9"/>`+person(754,368,t,{female:true,scale:.65})+person(556,388,t+1,{female:true,scale:.84,gesture:true});}
  else{art+=person(v==='mask'?653:458,356,t,{female:true,scale:.94,worried:v==='home',gesture:v==='homewarm'});if(v==='mask')art+=reveal(rect(833,423,126,65,C.gold,15)+path('M870 430V414Q896 392 918 415V430','none',C.ink,3),t,1);else art+=table(730,464)+cup(730,438,t);}
 }else if(['city','crowd','roads','compare'].includes(v)){
  art=rect(88,497,1104,5,'#c3cabb');for(let j=0;j<7;j++){let h=115+(j%3)*54;art+=rect(90+j*159,479-h,127,h,j%2?'#d4dacb':'#e2ddce',8);for(let k=0;k<6;k++)art+=rect(109+j*159+(k%2)*53,493-h+Math.floor(k/2)*39,26,18,C.cream,2);}
  if(v==='roads')art+=path('M646 510Q468 389 305 211M646 510Q789 350 1015 211','none',C.cream,34)+person(646,370,t,{scale:.78});
  else if(v==='compare')art+=phone(888,309,t,{active:true,scale:1.33})+person(417,361,t,{female:true,scale:1,worried:true})+reveal(path('M584 289Q675 218 756 287','none',C.gold,4),t,1);
  else{for(let j=0;j<5;j++)art+=person(253+j*196,353+(j%2)*24,t+j,{female:j%2===0,scale:j===2?.95:.68,walk:v==='city',coat:j===2?C.clay:'#aebbb0',worried:j===2});}
 }else if(['phone','message','calendar','journal','plan'].includes(v)){
  art=rect(146,466,988,7,'#d6c9b0',4)+plant(1093,461,t,.75)+person(329,350,t,{female:true,scale:.95,gesture:true});
  if(v==='calendar'||v==='plan')art+=calendar(741,293,t)+cup(961,435,t);
  else if(v==='journal'){art+=book(756,340,t,1.4)+path(`M833 251L${820+Math.sin(t*2)*8} 362`,'none',C.clay,11)+cup(1010,430,t);}
  else art+=phone(770,303,t,{active:v==='message',scale:1.45})+reveal(circle(950,245,35,C.mint)+path('M934 245L947 258L970 230','none',C.sage,4),t,2);
 }else if(['coffee','help','support','boundary'].includes(v)){
  art=windowArt(641,300,t,true)+plant(1120,460,t,.75)+person(348,342,t,{female:true,scale:1,speaking:Math.floor(t/4)%2===0,gesture:true})+person(928,342,t+1,{scale:1,speaking:Math.floor(t/4)%2===1,gesture:true})+table(640,417)+cup(566,389,t)+cup(706,389,t+1);
  if(v==='boundary')art+=reveal(path('M616 166Q643 140 670 166V213Q645 250 616 213Z',C.mint,C.sage,3),t,1);
 }else if(['walk','bench','rain','books'].includes(v)){
  art=path('M70 457Q341 382 654 439Q950 388 1211 460V525H70Z','#dce3ce','none')+plant(159,429,t,.95)+plant(1090,432,t,1.2)+circle(959,179,46,'#e7c986');
  if(v==='books')art+=bench(641,410)+person(477,293,t,{female:true,scale:.74})+person(800,293,t,{scale:.74})+book(644,350,t,.7);
  else if(v==='walk')art+=person(513+Math.sin(t*.3)*26,342,t,{female:true,scale:.92,walk:true})+person(757+Math.sin(t*.3)*26,342,t+1,{scale:.92,walk:true});
  else{art+=bench(644,393)+person(587,291,t,{female:true,scale:.8})+person(792,291,t+1,{scale:.8});if(v==='rain')for(let j=0;j<17;j++)art+=path(`M${120+j*64} ${139+(t*95+j*29)%300}l-5 14`,'none','#a8b5aa',2);}
 }else if(v==='network'){
  const center=[644,304],points=[[350,205],[940,205],[354,444],[936,444]];for(const [j,p] of points.entries())art+=reveal(path(`M${center[0]} ${center[1]}Q${p[0]} ${center[1]} ${p[0]} ${p[1]}`,'none',C.sage,3)+circle(p[0],p[1],71,'#e3e6d6')+person(p[0],p[1]+10,t+j,{female:!!(j%2),scale:.38}),t,j*.55);art+=circle(...center,89,C.mint)+person(center[0],center[1]+6,t,{female:true,scale:.5});
 }
 const zoom=1+Math.min(.018,t/s.duration*.018),cx=640,cy=338;
 return `<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="720" viewBox="0 0 1280 720"><rect width="1280" height="720" fill="${C.paper}"/><defs><filter id="grain"><feTurbulence type="fractalNoise" baseFrequency=".6" numOctaves="2" stitchTiles="stitch"/><feColorMatrix type="saturate" values="0"/><feComponentTransfer><feFuncA type="linear" slope=".025"/></feComponentTransfer></filter></defs>${txt('혼자 잘 사는 어른들을 위한 마음의 연결',55,41,16,C.muted,'start')}${txt(s.chapter,1225,41,16,C.muted,'end')}${txt(s.title,55,94,30,C.ink,'start')}${rect(56,111,43,4,C.clay,2)}<g transform="translate(${cx} ${cy}) scale(${zoom}) translate(${-cx} ${-cy})">${reveal(art,t)}</g>${txt('창작 사례 · 심리교육 애니메이션',55,691,14,C.muted,'start')}${txt(String(i+1).padStart(2,'0')+' / '+scenes.length,1224,691,14,C.muted,'end')}<rect x="0" y="716" width="${1280*(s.start+t)/total}" height="4" fill="${C.sage}"/></svg>`;
}
const png=(s,t,i,width=1280)=>new Resvg(sceneSvg(s,t,i),{fitTo:{mode:'width',value:width},font:{fontFiles:[font],loadSystemFonts:false,defaultFontFamily:'Pretendard'}}).render().asPng();
const mode=process.argv[2]||'render';
if(mode==='measure'){console.log(JSON.stringify(scenes.map(s=>({id:s.id,seconds:s.duration}))));process.exit(0);}
if(mode==='preview'){for(const [i,s] of scenes.entries())await save(join(cache,`preview-${i}.png`),png(s,5,i));console.log('Previews complete');process.exit(0);}
const stamp=v=>{let n=Math.round(v*100);return `${Math.floor(n/360000)}:${String(Math.floor(n/6000)%60).padStart(2,'0')}:${String(Math.floor(n/100)%60).padStart(2,'0')}.${String(n%100).padStart(2,'0')}`;};
const header=`[Script Info]\nScriptType: v4.00+\nPlayResX: 1920\nPlayResY: 1080\nWrapStyle: 2\n\n[V4+ Styles]\nFormat: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding\nStyle: Default,Pretendard SemiBold,45,&H003C3D29,&H003C3D29,&H00E5F0F6,&H70000000,0,0,0,0,100,100,0,0,1,2,0,5,110,110,0,1\n\n[Events]\nFormat: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\n`;
const assFor=(s,offset=0)=>s.captions.map(c=>`Dialogue: 0,${stamp(c.start+offset)},${stamp(c.end+offset)},Default,,0,0,0,,{\\pos(960,928)}${c.text.replace(/\n/g,'\\N')}`).join('\n');
await save(join(cache,'captions.ass'),header+scenes.map(s=>assFor(s,s.start)).join('\n')+'\n');
const hash=createHash('sha256').update(await readFile(fileURLToPath(import.meta.url))).update(JSON.stringify(brief)).digest('hex').slice(0,12),segments=[];
for(const [i,s] of scenes.entries()){
 const target=join(cache,`${s.id}-${hash}.mov`);segments.push(target);if(await exists(target)){console.log('Cached '+s.id);continue;}
 const ass=join(cache,s.id+'.ass');await save(ass,header+assFor(s)+'\n');
 const pending=target+'.pending.mov';const p=spawn('ffmpeg',['-y','-v','error','-f','image2pipe','-framerate','12','-vcodec','png','-i','pipe:0','-i',s.voice,'-vf',`fps=24,scale=1920:1080:flags=lanczos,ass=filename='${ass}':fontsdir='${dirname(font)}'`,'-af','apad','-t',String(s.duration),'-map','0:v','-map','1:a','-c:v','libx264','-preset','veryfast','-crf','19','-pix_fmt','yuv420p','-c:a','pcm_s16le',pending],{stdio:['pipe','ignore','pipe']});
 let error='',failure;p.stderr.on('data',d=>error=(error+d).slice(-2000));p.stdin.on('error',e=>failure=e);const done=new Promise((ok,no)=>{p.once('error',no);p.once('close',c=>c?no(Error(error)):ok());});done.catch(e=>failure=e);
 try{for(let f=0;f<s.sourceFrames;f++){if(failure)throw failure;if(!p.stdin.write(png(s,f/12,i)))await Promise.race([once(p.stdin,'drain'),done]);if(f%12===0)await new Promise(r=>setImmediate(r));}p.stdin.end();await done;await rename(pending,target);}catch(e){p.kill('SIGTERM');await done.catch(()=>{});throw e;}
 console.log(`Rendered ${i+1}/${scenes.length} (${s.duration.toFixed(2)}s)`);
}
const list=join(cache,'concat.txt');await save(list,segments.map(x=>`file '${x}'`).join('\n'));
await mkdir(dirname(final),{recursive:true});
await run('ffmpeg',['-y','-v','error','-f','concat','-safe','0','-i',list,'-c:v','copy','-af','loudnorm=I=-16:TP=-1.5:LRA=8','-c:a','aac','-b:a','192k','-ar','44100','-ac','2','-movflags','+faststart',final]);
await save(join(out,'project.json'),JSON.stringify({...brief,artifact:final,cache,totalSeconds:total,animationFps:12,subtitleTiming:'character-weighted approximation',scenes:scenes.map(({voice,...s})=>s)},null,2)+'\n');
console.log('COMPLETE '+final);
