import {MAX_IMAGE,validateInput} from './kandinsky-api.js';
import {accountRequest,KANDINSKY_API} from './huggingface-settings.js';
const $=id=>document.getElementById(id);
let job=null,configured=false,known=false,working=false,controller=null,preview=null,activity='account';
function error(e){$('error').textContent=e.name==='AbortError'?'대기만 중단했습니다. 생성 접수 기록은 서버에 보관됩니다.':e instanceof TypeError?'Shopshorts 연결을 확인하지 못했습니다. 새로고침해 서버 접수 상태를 확인하세요.':e.message;$('error').hidden=false;render();}
function render(){
  $('generate').disabled=working||!known||!configured||!!job||!$('prompt').value.trim();
  $('generate').textContent=working&&activity!=='account'?'생성 결과 확인 중…':'영상 생성';
  $('generate-help').textContent=!known?'계정 연결 상태를 먼저 확인하세요.':!configured?'위의 토큰 설정에서 계정을 연결하세요.':job?'최근 결과를 확인한 뒤 새 영상 만들기를 눌러주세요.':!$('prompt').value.trim()?'장면 설명을 입력하거나 예시를 선택하세요.':'무료 한도 내 생성 · 유료 전환 없음';
  $('prompt-count').textContent=`${$('prompt').value.length.toLocaleString('en-US')} / 4,000`;
  $('connection-title').textContent=!known?'계정 확인 필요':configured?'Hugging Face 계정 연결됨':'Hugging Face 계정 연결 필요';
  $('connection-dot').dataset.state=!known?'unknown':configured?'connected':'missing';
  $('account-state').textContent=!known?'계정 연결을 확인해야 합니다.':configured?'설정에 저장한 Hugging Face 계정을 사용합니다.':'설정에서 무료 Hugging Face 계정을 먼저 연결하세요.';
  $('refresh-connection').disabled=working;
  $('resume').hidden=working||job?.phase!=='submitted';$('stop').hidden=!working||activity==='account';
  $('new').hidden=working||!job;$('download').hidden=job?.phase!=='complete';
  const complete=job?.phase==='complete';$('empty').hidden=complete;$('result-video').hidden=!complete;
  if(complete){const src=`${KANDINSKY_API}/media?id=${encodeURIComponent(job.id)}`;if($('result-video').getAttribute('src')!==src)$('result-video').src=src;$('download').href=src;$('download').download=`kandinsky-${job.id}.mp4`;}
  else {$('result-video').removeAttribute('src');$('result-video').load();}
  $('used-prompt').hidden=!job?.prompt;$('used-prompt-text').textContent=job?.prompt||'';
  const failed=!$('error').hidden||job?.phase==='failed',busy=working&&activity!=='account';
  const phase=complete?'complete':busy?'working':failed?'error':job?'pending':'idle';
  $('phase-badge').dataset.phase=phase;$('preview-frame').dataset.phase=phase;
  $('phase-badge').textContent=complete?'생성 완료':busy?'생성 확인 중':failed?'확인 필요':job?'접수 기록 있음':'입력 대기';
  $('preview-title').textContent=busy?'장면을 준비하고 있어요':failed?'생성을 이어가기 전에 확인해 주세요':job?'이전 요청을 확인해 주세요':'첫 장면은 어떤 모습인가요?';
  $('preview-description').textContent=busy?'공유 GPU 상황에 따라 몇 분 걸릴 수 있습니다.':failed?'아래 오류 안내에서 원인과 다음 행동을 확인하세요.':job?'접수 기록은 보관되어 있어요. 같은 요청을 자동으로 다시 보내지 않습니다.':'장면을 설명하거나 예시를 골라 시작하세요. 완성된 영상은 여기에서 재생할 수 있어요.';
  document.querySelector('.k-output').setAttribute('aria-busy',String(busy));
  const step=complete?2:job?.phase==='submitted'||activity==='wait'&&busy?1:busy?0:-1;
  ['step-check','step-create','step-done'].forEach((id,i)=>{$(id).dataset.state=i<step?'done':i===step?'active':'idle';if(i===step)$(id).setAttribute('aria-current','step');else $(id).removeAttribute('aria-current');});
  if(!working)$('status').textContent=!known?'연결 상태를 확인하지 못했습니다. 위의 연결 다시 확인을 눌러주세요.':complete?'생성 완료. MP4를 다운로드한 뒤 새 영상을 만들 수 있습니다.':job?.phase==='submitted'?'요청이 접수되었습니다. 결과 확인을 이어갈 수 있습니다.':job?.phase==='failed'?'연결 확인에 실패한 기록입니다. 계정과 공식 데모 상태를 확인한 뒤 새 영상 만들기로 다시 시작하세요.':job?'접수 여부가 불확실합니다. 공식 데모 상태를 확인한 뒤 새 요청을 결정하세요.':failed?'입력이나 연결 상태를 확인한 뒤 다시 시도하세요.':!configured?'토큰을 한 번 저장하면 다음 생성에서도 사용할 수 있습니다.':'장면 설명을 입력하고 영상을 생성하세요.';
}
async function refresh(){const data=await accountRequest();configured=data.configured;job=data.job;known=true;return data;}
async function wait(){
  activity='wait';render();
  $('status').textContent='공식 데모에서 대기하거나 생성 중입니다. 몇 분 걸릴 수 있습니다.';
  const response=await fetch(`${KANDINSKY_API}/result?id=${encodeURIComponent(job.id)}`,{signal:controller.signal,cache:'no-store'});
  if(!response.ok)throw Error((await response.json()).error);
  const reader=response.body.getReader(),decoder=new TextDecoder();let pending='';
  try{for(;;){const {value,done}=await reader.read();pending+=decoder.decode(value,{stream:!done});if(pending.length>100000)throw Error('결과 응답이 너무 큽니다.');
    let index;while((index=pending.indexOf('\n\n'))>=0){const block=pending.slice(0,index);pending=pending.slice(index+2);if(!block.startsWith('data: '))continue;const data=JSON.parse(block.slice(6));
      if(data.error)throw Error(data.error);if(data.complete){await refresh();return;}
      $('status').textContent='공식 데모와 연결되어 있습니다. 생성 결과를 기다립니다.';
    }if(done)throw Error('결과 연결이 끊겼습니다. 결과 확인 다시 하기를 눌러 이어가세요.');
  }}finally{await reader.cancel().catch(()=>{});}
}
async function run(action,kind='account'){if(working)return;working=true;activity=kind;controller=new AbortController();$('error').hidden=true;render();try{await action();}catch(e){error(e);}finally{working=false;controller=null;render();}}
$('generate-form').addEventListener('submit',event=>{event.preventDefault();if(job||!known||!configured)return;
  const input={prompt:$('prompt').value,seed:$('seed').value,beautify:$('beautify').checked},image=$('image').files[0];
  run(async()=>{
    validateInput(input);const form=new FormData();form.set('prompt',input.prompt);form.set('seed',input.seed);form.set('beautify',String(input.beautify));if(image)form.set('image',image);
    $('status').textContent='저장된 계정으로 공식 데모 연결을 확인하고 있습니다.';
    try{const data=await accountRequest('generate',{method:'POST',body:form,signal:controller.signal});job=data.job;}
    catch(e){try{await refresh();}catch{known=false;}throw e;}
    await wait();
  },'generate');
});
$('resume').addEventListener('click',()=>run(wait,'wait'));
$('stop').addEventListener('click',()=>controller?.abort());
$('refresh-connection').addEventListener('click',()=>run(async()=>{try{await refresh();}catch(e){known=false;throw e;}}));
$('new').addEventListener('click',()=>run(async()=>{
  if(job.phase!=='complete'&&job.phase!=='failed'&&!confirm('이전 요청이 공식 데모에서 계속 생성 중일 수 있습니다. 접수 기록만 지우고 새 영상을 만들까요?'))return;
  await accountRequest('clear',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({id:job.id})});await refresh();$('prompt').focus();
}));
const examples={cat:'섬세한 웹툰 그림체. 비 오는 창가에서 고양이가 기지개를 켠다. 카메라는 천천히 다가가고, 빗소리와 조용한 골골거림이 들린다.',product:'나무 테이블 위 투명한 향수병. 부드러운 햇빛이 유리 표면에 반사된다. 카메라가 병을 중심으로 천천히 오른쪽으로 이동한다. 잔잔한 바람 소리.',landscape:'새벽 바닷가, 분홍빛 하늘 아래 파도가 모래 위로 부드럽게 밀려온다. 낮은 위치의 카메라가 수평선을 향해 천천히 다가간다. 파도와 멀리서 들리는 갈매기 소리.'};
document.querySelectorAll('[data-example]').forEach(button=>button.addEventListener('click',()=>{const text=examples[button.dataset.example];if($('prompt').value.trim()&&$('prompt').value!==text&&!confirm('작성한 장면 설명을 선택한 예시로 바꿀까요?'))return;$('prompt').value=text;render();$('prompt').focus();}));
$('prompt').addEventListener('input',render);
function clearImage(){if(preview)URL.revokeObjectURL(preview);preview=null;$('image-preview').removeAttribute('src');$('image-preview').hidden=true;$('clear-image').hidden=true;}
$('image').addEventListener('change',()=>{clearImage();const file=$('image').files[0];if(!file)return;if(!['image/png','image/jpeg','image/webp'].includes(file.type)||!file.size||file.size>MAX_IMAGE){$('image').value='';error(Error('10MB 이하 PNG·JPG·WebP 이미지를 선택하세요.'));return;}preview=URL.createObjectURL(file);$('image-preview').src=preview;$('image-preview').hidden=false;$('clear-image').hidden=false;});
$('clear-image').addEventListener('click',()=>{$('image').value='';clearImage();});
$('result-video').addEventListener('error',()=>{if(job?.phase==='complete')error(Error('영상을 불러오지 못했습니다. 데모 파일이 만료됐거나 서버 연결을 확인해야 합니다.'));});
window.addEventListener('pagehide',()=>{controller?.abort();clearImage();});
run(refresh);
