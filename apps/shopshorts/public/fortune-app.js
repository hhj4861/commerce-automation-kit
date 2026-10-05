const $=id=>document.getElementById(id);let project=null,config=null,poll=null,epoch=0;
const status=(message,error=false)=>{$('status').textContent=message;$('status').classList.toggle('error',error)};
async function request(path,body){const r=await fetch('/api/studio/'+path,{...(body?{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)}:{}),cache:'no-store'});const data=await r.json();if(!r.ok)throw Error(data.error||'요청에 실패했습니다.');return data;}
const asset=(scene)=>`/api/studio/${project.id}/assets/${scene}`;
function show(){
 $('episode').hidden=false;$('title').textContent=project.title;
 $('fortune').textContent=`${project.fortune.sourceStatus==='EXAMPLE'?'예시 운세':'입력한 운세'}: ${project.fortune.input.fortune.summary}`;
 $('script').replaceChildren(...project.scenes.filter(s=>project.fortune.sceneIds.includes(s.id)).map((s,i)=>{const p=document.createElement('p');p.textContent=`${i+1}. ${s.narration}`;return p;}));
 const scenes=project.scenes.filter(s=>project.fortune.sceneIds.includes(s.id));
 $('art').replaceChildren(...scenes.filter(s=>project.assets[s.id]).map(s=>{const article=document.createElement('article');const media=document.createElement(s.kind==='video'?'video':'img');media.src=asset(s.id);if(s.kind==='video'){media.controls=true;media.playsInline=true;}else media.alt=s.narration;const p=document.createElement('p');p.textContent=s.narration;article.append(media,p);return article;}));
 $('voiceUsage').textContent=`음성 선택 시 원문 ${scenes.reduce((n,s)=>n+s.narration.length,0)}자 · ElevenLabs 별도 사용량 · 완료 음성 재사용`;
 const complete=scenes.every(s=>project.assets[s.id]);const busy=['queued','running'].includes(project.task?.state);
 $('generate').disabled=busy||complete;$('generate').textContent=complete?'그림·영상 생성 완료':busy?'장면 생성 중…':'내 그림·영상 생성';
 $('renderControls').hidden=!complete||project.fortune.input.output==='webtoon';$('render').disabled=busy;
 $('downloadComic').hidden=!complete||scenes.some(s=>s.kind!=='image');
 $('video').hidden=!project.render;$('download').hidden=!project.render;
 if(project.render){const url=asset('final');if($('video').getAttribute('src')!==url)$('video').src=url;$('download').href=url;$('download').download='my-fortune-drama.mp4';}
 if(project.task?.state==='failed')status(project.task.error||'생성 실패. 완성된 장면은 보존됩니다.',true);
 else if(busy)status(`${project.task.action==='render'?'최종 영상 렌더링':'장면 생성'} 중 · ${scenes.filter(s=>project.assets[s.id]).length}/${scenes.length} 장면 완료`);
 else status(complete?'나의 장면이 완성됐습니다.':'대본을 확인한 뒤 생성 크레딧 상한을 정해 주세요.');
}
function watch(){clearTimeout(poll);if(!project||!['queued','running'].includes(project.task?.state))return;const captured=epoch,id=project.id;poll=setTimeout(async()=>{try{const data=await request('fortune/'+id);if(captured!==epoch)return;project=data.project;if(project.task?.action==='narration'&&project.task.state==='done'){const rendered=await request(`fortune/${id}/render`,{revision:project.revision,voice:project.voicePreference});if(captured!==epoch)return;project=rendered.project;}show();watch();}catch(e){if(captured===epoch)status(e.message,true)}},2500)}
$('profile').elements.date.value=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Seoul'}).format(new Date());
$('profile').addEventListener('input',()=>{epoch++;clearTimeout(poll);project=null;$('episode').hidden=true;$('video').pause();$('video').removeAttribute('src');$('art').replaceChildren();});
$('profile').addEventListener('submit',async e=>{e.preventDefault();const token=++epoch;const values=Object.fromEntries(new FormData(e.target));const profile={};for(const key of ['name','gender','hair','clothes','life','setting'])profile[key]=values[key];profile.age=Number(values.age);const button=e.submitter;button.disabled=true;
 try{const data=await request('fortune',{profile,date:values.date,output:values.output,fortune:{theme:values.theme,source:values.source,summary:values.summary,tip:values.tip}});if(token!==epoch)return;project=data.project;show();watch();}catch(error){$('episode').hidden=false;status(error.message,true)}finally{button.disabled=false;}});
$('generate').onclick=async()=>{if(!project)return;const captured=epoch;$('generate').disabled=true;try{const data=await request(`fortune/${project.id}/generate`,{revision:project.revision,maxCredits:Number($('credits').value),approved:$('approved').checked});if(captured!==epoch)return;project=data.project;show();watch();}catch(error){if(captured===epoch){status(error.message,true);$('generate').disabled=false;}}};
$('render').onclick=async()=>{if(!project)return;const captured=epoch;$('render').disabled=true;try{const data=await request(`fortune/${project.id}/render`,{revision:project.revision,voice:$('voice').value});if(captured!==epoch)return;project=data.project;show();watch();}catch(error){if(captured===epoch){status(error.message,true);$('render').disabled=false;}}};
$('downloadComic').onclick=async()=>{
 const saved=project,captured=epoch;if(!saved)return;
 try{const scenes=saved.scenes.filter(s=>saved.fortune.sceneIds.includes(s.id));const images=await Promise.all(scenes.map(s=>new Promise((resolve,reject)=>{const image=new Image();image.onload=()=>resolve(image);image.onerror=()=>reject(Error('그림을 불러오지 못했습니다.'));image.src=`/api/studio/${saved.id}/assets/${s.id}`;})));if(captured!==epoch)return;
 const canvas=document.createElement('canvas');canvas.width=1080;const panel=700,gap=35,header=240;canvas.height=header+scenes.length*(panel+180+gap)+160;const ctx=canvas.getContext('2d');ctx.fillStyle='#f8f6f0';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.fillStyle='#17494a';ctx.font='bold 42px sans-serif';ctx.fillText(saved.title,40,65);ctx.font='28px sans-serif';
 const wrap=(text,y,max=1000)=>{let line='';for(const char of text){if(ctx.measureText(line+char).width>max){ctx.fillText(line,40,y);y+=40;line=char;}else line+=char;}ctx.fillText(line,40,y);return y+40};wrap(saved.fortune.input.fortune.summary,125);
 images.forEach((image,i)=>{const y=header+i*(panel+180+gap);ctx.fillStyle='#e3ebe8';ctx.fillRect(40,y,1000,panel);const scale=Math.min(1000/image.width,panel/image.height);const w=image.width*scale,h=image.height*scale;ctx.drawImage(image,40+(1000-w)/2,y+(panel-h)/2,w,h);ctx.fillStyle='#17494a';wrap(`${i+1}. ${scenes[i].narration}`,y+panel+45);});wrap(saved.fortune.input.fortune.tip,canvas.height-110);const a=document.createElement('a');a.download='my-fortune-webtoon.png';a.href=canvas.toDataURL('image/png');a.click();
 }catch(error){status(error.message,true)}
};
async function init(){try{const values=await Promise.all([request('fortune/config'),request('config')]);config=values[0];const studio=values[1];const caps=config.capabilities;const online=config.execution!=='cloud-worker'||(Number.isFinite(Date.parse(caps.workerAt))&&Date.now()-Date.parse(caps.workerAt)<=90000);$('connection').textContent=`생성 제공자: ${caps.mediaProvider||'미연결'} · 제작 워커: ${online?'온라인':'오프라인'} · 운세 엔진: ${caps.fortuneEngine===1?'연결됨':'워커 업데이트 필요'}`;for(const voice of studio.voices||[]){if(voice.id==='none')continue;const option=document.createElement('option');option.value=voice.id;option.textContent=voice.name;$('voice').append(option);}}catch(error){$('connection').textContent=error.message;}}
init();
