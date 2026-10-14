import {KandinskyClient, MAX_IMAGE, videoUrl} from './kandinsky-api.js';
const $ = id => document.getElementById(id), receiptKey = 'shopshorts.kandinsky.receipt.v1';
let receipt = null, controller = null, preview = null, downloadUrl = null, working = false;
function persist(value) {
  // Only this tab's receipt/results; never token, image bytes or submitted prompt.
  if (value) sessionStorage.setItem(receiptKey, JSON.stringify(value)); else sessionStorage.removeItem(receiptKey);
  receipt = value;
}
function error(e) {
  $('error').textContent = e?.name === 'AbortError' ? '결과 대기만 중단했습니다. 서버에서 생성은 계속될 수 있습니다.' : e?.name === 'TimeoutError' ? '응답 시간이 초과됐습니다. 접수된 영상은 결과 확인을 다시 누르세요.' : e instanceof TypeError ? '공식 데모에 연결하지 못했습니다. 네트워크나 서비스 상태를 확인하세요.' : e.message;
  $('error').hidden = false;
}
function render() {
  $('generate').disabled = working || !!receipt;
  $('generate').textContent = working ? '처리 중…' : '영상 생성';
  $('resume').hidden = working || !receipt?.eventId || !!receipt?.url;
  $('stop').hidden = !working;
  $('new').hidden = working || !receipt;
  $('download').hidden = !receipt?.url;
  $('download').disabled = working;
  $('empty').hidden = !!receipt?.url;
  $('result-video').hidden = !receipt?.url;
  if (receipt?.url) {
    if ($('result-video').src !== receipt.url) $('result-video').src = receipt.url;
    $('used-prompt').hidden = !receipt.prompt;
    $('used-prompt-text').textContent = receipt.prompt || '';
  } else {
    $('result-video').removeAttribute('src'); $('result-video').load(); $('used-prompt').hidden = true;
  }
  if (!working) $('status').textContent = receipt?.url ? '생성 완료. 미리보기에서 확인한 뒤 MP4를 다운로드하세요.' : receipt?.eventId ? '생성 접수 번호를 보관했습니다. 결과를 다시 확인할 수 있습니다.' : receipt ? '접수 여부가 불확실합니다. 중복 생성을 막기 위해 자동으로 다시 보내지 않습니다.' : '장면 설명을 입력하고 영상을 생성하세요.';
}
function client() {
  if (receipt?.authenticated && !$('hf-token').value.trim()) {
    $('connection-settings').open = true;
    throw new Error('이 영상의 결과를 확인하려면 생성할 때 사용한 무료 계정 토큰을 다시 입력하세요.');
  }
  return new KandinskyClient({token: $('hf-token').value, signal: controller.signal});
}
async function wait(c) {
  $('status').textContent = '공식 데모에서 대기하거나 생성 중입니다. 몇 분 걸릴 수 있습니다.';
  const result = await c.wait(receipt.eventId, () => {
    $('status').textContent = '공식 데모와 연결되어 있습니다. 영상 생성을 기다리고 있어요.';
  });
  persist({...receipt, ...result, phase:'complete'});
}
async function run(action) {
  if (working) return;
  working = true; controller = new AbortController(); $('error').hidden = true; render();
  try { await action(); } catch(e) { error(e); }
  finally { working = false; controller = null; render(); }
}
$('generate-form').addEventListener('submit', event => {
  event.preventDefault(); if(receipt) return;
  // Capture the submitted fields; edits during the request cannot change its identity.
  const input = {prompt:$('prompt').value, seed:$('seed').value, beautify:$('beautify').checked}, image = $('image').files[0];
  run(async () => {
    const c = client();
    $('status').textContent = '무료 계정과 공식 데모의 연결을 확인하고 있습니다.';
    // Storage must work before sending; otherwise reload could silently duplicate generation.
    sessionStorage.setItem(receiptKey, JSON.stringify({phase:'checking'})); sessionStorage.removeItem(receiptKey);
    const eventId = await c.submit(input, image, () => persist({phase:'uncertain', authenticated:!!c.token, createdAt:Date.now()}));
    persist({...receipt, eventId, phase:'submitted'});
    await wait(c);
  });
});
$('resume').addEventListener('click', () => run(async () => { await wait(client()); }));
$('stop').addEventListener('click', () => controller?.abort());
$('new').addEventListener('click', () => {
  if (!receipt?.url && !confirm('이전 요청은 서버에서 계속 생성 중일 수 있습니다. 접수 기록을 지우고 새 영상을 만들까요?')) return;
  try { persist(null); $('error').hidden = true; render(); $('prompt').focus(); } catch(e) { error(e); }
});
$('download').addEventListener('click', () => run(async () => {
  $('status').textContent = 'MP4 파일을 다운로드하고 있습니다.';
  const blob = await client().download(receipt.url);
  if(downloadUrl) URL.revokeObjectURL(downloadUrl);
  downloadUrl = URL.createObjectURL(blob);
  const link = document.createElement('a'); link.href = downloadUrl; link.download = `kandinsky-${receipt.eventId}.mp4`; link.click();
}));
$('example').addEventListener('click', () => {
  $('prompt').value = '섬세한 웹툰 그림체. 비 오는 창가에서 고양이가 기지개를 켠다. 카메라는 천천히 다가가고, 빗소리와 조용한 골골거림이 들린다.'; $('prompt').focus();
});
function clearImage() {
  if(preview) URL.revokeObjectURL(preview); preview = null;
  $('image-preview').removeAttribute('src'); $('image-preview').hidden = true; $('clear-image').hidden = true;
}
$('image').addEventListener('change', () => {
  clearImage(); const file = $('image').files[0]; if(!file) return;
  if(!['image/png','image/jpeg','image/webp'].includes(file.type) || file.size > MAX_IMAGE || !file.size) { $('image').value = ''; error(new Error('10MB 이하 PNG·JPG·WebP 이미지를 선택하세요.')); return; }
  preview = URL.createObjectURL(file); $('image-preview').src = preview; $('image-preview').hidden = false; $('clear-image').hidden = false;
});
$('clear-image').addEventListener('click', () => { $('image').value = ''; clearImage(); });
$('result-video').addEventListener('error', () => { if(receipt?.url) error(new Error('미리보기를 불러오지 못했습니다. MP4 다운로드를 시도하세요. 데모 파일이 만료됐을 수 있습니다.')); });
window.addEventListener('pagehide', () => { controller?.abort(); clearImage(); if(downloadUrl) URL.revokeObjectURL(downloadUrl); $('hf-token').value = ''; });
try {
  const saved = JSON.parse(sessionStorage.getItem(receiptKey) || 'null');
  if(saved && ['uncertain','submitted','complete'].includes(saved.phase)) {
    if(saved.eventId && !/^[a-zA-Z0-9_-]{1,128}$/.test(saved.eventId)) throw new Error('보관한 접수 번호가 손상됐습니다.');
    if(saved.url) videoUrl(saved.url);
    receipt = saved;
  }
} catch(e) { error(new Error('이 탭의 접수 기록을 읽지 못했습니다. 공식 데모에서 진행 중인 작업을 확인하세요.')); receipt = {phase:'uncertain'}; }
render();
