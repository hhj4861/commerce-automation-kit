// Official Gradio HTTP client, shared with the authenticated server relay. No automatic retry.
export class KandinskyError extends Error {}
export const SPACE = 'https://huggingface.co/spaces/kandinskylab/Kandinsky-6.0-Pro-distill-5s';
export const HOST = 'https://kandinskylab-kandinsky-6-0-pro-distill-5s.hf.space';
export const MAX_IMAGE = 10 * 1024 * 1024;
export function validateInput({prompt, seed, beautify = false}) {
  if (typeof prompt !== 'string' || !prompt.trim() || prompt.length > 4000) throw new KandinskyError('장면 설명을 1~4,000자로 입력하세요.');
  if (seed === '' || !Number.isSafeInteger(Number(seed)) || Number(seed) < 0 || Number(seed) > 2147483647) throw new KandinskyError('시드는 0~2147483647 사이의 정수로 입력하세요.');
  return {prompt: prompt.trim(), seed: Number(seed), beautify: beautify === true};
}
export function videoUrl(value) {
  const file = value?.video ?? value;
  const url = new URL(typeof file === 'string' ? file : file?.url);
  if (url.origin !== HOST || !url.pathname.startsWith('/gradio_api/file=') || url.username || url.password) throw new KandinskyError('공식 데모의 영상 주소를 확인하지 못했습니다.');
  return url.href;
}
export function providerError(value) {
  const raw = typeof value === 'string' ? value : JSON.stringify(value ?? '');
  if (/quota|exceed|GPU.*duration|daily.*limit/i.test(raw)) return '무료 GPU 한도가 부족합니다. 한도 회복 후 다시 시도하거나 공식 데모에서 계정 한도를 확인하세요.';
  if (/queue.*full|too many|429/i.test(raw)) return '생성 대기열이 가득 찼습니다. 잠시 후 직접 다시 시도하세요.';
  if (/401|403|unauthoriz|forbidden|token/i.test(raw)) return 'Hugging Face 연결 권한을 확인하세요. 토큰을 다시 입력하거나 공식 데모를 이용하세요.';
  return '공식 데모에서 생성하지 못했습니다. 공식 데모의 상태를 확인한 뒤 다시 시도하세요.';
}
export class KandinskyClient {
  constructor({token = '', fetchImpl = (...args) => globalThis.fetch(...args), signal} = {}) {
    this.token = token.trim(); this.fetch = fetchImpl; this.signal = signal;
    if (this.token && !/^hf_[A-Za-z0-9]{10,200}$/.test(this.token)) throw new KandinskyError('Hugging Face 읽기 토큰 형식을 확인하세요.');
  }
  async request(url, init = {}, timeout = 30000) {
    const headers = new Headers(init.headers);
    if (this.token) headers.set('authorization', `Bearer ${this.token}`);
    const signal = this.signal ? AbortSignal.any([this.signal, AbortSignal.timeout(timeout)]) : AbortSignal.timeout(timeout);
    const response = await this.fetch(url, {...init, headers, signal, credentials: 'omit', redirect: 'error', cache: 'no-store'});
    if (!response.ok) {
      const body = (await response.text()).slice(0, 2000);
      throw new KandinskyError(providerError(`${response.status} ${body}`));
    }
    return response;
  }
  async checkFreeAccount() {
    if (!this.token) return {anonymous: true};
    const user = await (await this.request('https://huggingface.co/api/whoami-v2')).json();
    // Refuse unknown/billable accounts rather than silently consume prepaid credits.
    if (user.type !== 'user' || user.isPro !== false || user.canPay !== false || !Array.isArray(user.orgs) || user.orgs.some(o => o.canPay !== false)) {
      throw new KandinskyError('이 메뉴는 무료 계정만 연결합니다. 결제 가능한 계정이거나 무료 여부를 확인할 수 없습니다. 공식 데모에서 직접 이용하세요.');
    }
    return {anonymous: false, name: user.name};
  }
  async checkSchema() {
    const info = await (await this.request(`${HOST}/gradio_api/info`)).json();
    const endpoint = info.named_endpoints?.['/generate'];
    const names = endpoint?.parameters?.map(p => p.parameter_name);
    if (JSON.stringify(names) !== JSON.stringify(['prompt', 'use_beautifier', 'seed', 'image']) || endpoint?.returns?.length !== 4) {
      throw new KandinskyError('공식 데모의 입력 규격이 변경됐습니다. 자동 전송을 멈췄습니다. 공식 데모를 이용하세요.');
    }
  }
  async upload(image) {
    if (!image) return null;
    if (!['image/png','image/jpeg','image/webp'].includes(image.type) || image.size <= 0 || image.size > MAX_IMAGE) throw new KandinskyError('첫 프레임은 10MB 이하 PNG·JPG·WebP만 사용할 수 있습니다.');
    const form = new FormData(); form.append('files', image);
    const paths = await (await this.request(`${HOST}/gradio_api/upload`, {method: 'POST', body: form})).json();
    if (!Array.isArray(paths) || paths.length !== 1 || typeof paths[0] !== 'string' || !paths[0].startsWith('/') || paths[0].length > 4096) throw new KandinskyError('이미지 업로드 결과를 확인하지 못했습니다.');
    return {path: paths[0], meta: {_type: 'gradio.FileData'}};
  }
  async submit(input, image, beforeSubmit = () => {}) {
    const valid = validateInput(input);
    await this.checkFreeAccount(); await this.checkSchema();
    const file = await this.upload(image);
    await beforeSubmit(); // Persist uncertain submission before network I/O. Never replay POST automatically.
    const result = await (await this.request(`${HOST}/gradio_api/call/generate`, {
      method: 'POST', headers: {'content-type': 'application/json'},
      body: JSON.stringify({data: [valid.prompt, valid.beautify, valid.seed, file]}),
    })).json();
    if (!/^[a-zA-Z0-9_-]{1,128}$/.test(result.event_id ?? '')) throw new KandinskyError('접수 여부를 확인할 수 없습니다. 자동 재전송하지 않습니다.');
    return result.event_id;
  }
  async wait(eventId, onProgress = () => {}) {
    if (!/^[a-zA-Z0-9_-]{1,128}$/.test(eventId ?? '')) throw new KandinskyError('생성 접수 번호가 올바르지 않습니다.');
    const response = await this.request(`${HOST}/gradio_api/call/generate/${eventId}`, {}, 20 * 60 * 1000);
    const reader = response.body.getReader(), decoder = new TextDecoder();
    let pending = '';
    try {
      while (true) {
        const {value, done} = await reader.read();
        pending += decoder.decode(value, {stream: !done});
        if (pending.length > 1024 * 1024) throw new KandinskyError('응답이 너무 큽니다. 결과 확인을 중단했습니다.');
        let match;
        while ((match = /\r?\n\r?\n/.exec(pending))) {
          const block = pending.slice(0, match.index); pending = pending.slice(match.index + match[0].length);
          const lines = block.split(/\r?\n/), event = lines.find(l => l.startsWith('event:'))?.slice(6).trim();
          const raw = lines.filter(l => l.startsWith('data:')).map(l => l.slice(5).trimStart()).join('\n');
          if (event === 'error') throw new KandinskyError(providerError(raw));
          if (event === 'complete') {
            const data = JSON.parse(raw);
            if (!Array.isArray(data) || data.length !== 4) throw new KandinskyError('영상 결과 형식이 변경됐습니다.');
            return {url: videoUrl(data[0]), prompt: typeof data[1] === 'string' ? data[1].slice(0, 16000) : ''};
          }
          if (event === 'heartbeat' || event === 'generating') onProgress();
        }
        if (done) throw new KandinskyError('연결이 끊겼습니다. 접수 번호는 보관했습니다. 결과 확인을 다시 누르세요.');
      }
    } finally { await reader.cancel().catch(() => {}); }
  }
  async download(url) {
    const response = await this.request(videoUrl(url), {}, 120000);
    const reader = response.body.getReader(), chunks = []; let size = 0;
    try {
      while (true) {
        const {value, done} = await reader.read(); if (done) break;
        size += value.length;
        if (size > 60 * 1024 * 1024) throw new KandinskyError('영상이 60MB를 넘어 다운로드를 중단했습니다.');
        chunks.push(value);
      }
    } finally { await reader.cancel().catch(() => {}); }
    const blob = new Blob(chunks, {type:'video/mp4'});
    const head = new Uint8Array(await blob.slice(0,12).arrayBuffer());
    if (String.fromCharCode(...head.slice(4,8)) !== 'ftyp') throw new KandinskyError('MP4 영상이 아닌 응답입니다. 공식 데모에서 결과를 확인하세요.');
    return blob;
  }
}
