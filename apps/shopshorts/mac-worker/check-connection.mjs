// Read-only connection check. Never claims work, synthesizes speech or prints credentials.
import {pathToFileURL} from 'node:url';
import {resolve} from 'node:path';
import {createPrivateKey} from 'node:crypto';
import {readFile} from 'node:fs/promises';
const [source,key]=process.argv.slice(2);
try {
 const jwk=JSON.parse(await readFile(key,'utf8'));
 if(jwk.kty!=='OKP'||jwk.crv!=='Ed25519'||!jwk.d)throw Error();
 createPrivateKey({key:jwk,format:'jwk'});
 const {runnerRequest}=await import(pathToFileURL(resolve(source,'apps/credential-broker/runner-client.mjs')));
 const {values}=await runnerRequest('https://cak-credential-broker.guswhd1085.workers.dev',key,'/runner/secrets',{});
 if(!values.ELEVENLABS_API_KEY||!values.SHOPSHORTS_TOKEN||!values.SHOPSHORTS_CLOUD_URL)throw Error();
 const cloud=new URL(values.SHOPSHORTS_CLOUD_URL);
 if(cloud.protocol!=='https:')throw Error();
 const voice=await fetch('https://api.elevenlabs.io/v1/user',{headers:{'xi-api-key':values.ELEVENLABS_API_KEY},signal:AbortSignal.timeout(15000)});
 await voice.body?.cancel();
 if(!voice.ok)throw Error();
 const api=await fetch(new URL('/api/studio',cloud),{headers:{authorization:`Bearer ${values.SHOPSHORTS_TOKEN}`},signal:AbortSignal.timeout(15000)});
 await api.body?.cancel();
 if(!api.ok)throw Error();
 console.log('Cloudflare 인증·제작 API·ElevenLabs 연결 정상. 생성 요청은 하지 않았습니다.');
}catch{
 console.error('연결 점검 실패: 워커 키·Cloudflare·ElevenLabs 및 네트워크 인증서를 확인하세요. 인증 값은 출력하지 않았습니다.');
 process.exitCode=1;
}
