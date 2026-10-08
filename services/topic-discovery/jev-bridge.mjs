import {createJevClient} from '../../packages/litellm-client/jev.mjs';
// Only the SDK's fixed error code crosses the process boundary; never upstream text.
const CODES=new Set(['timeout','cancelled','rate_limited','authentication_failed','overloaded','redirect_rejected','upstream_error','network_error','invalid_response','response_too_large','request_too_large','invalid_config','invalid_input']);
let input='';
try {
  for await (const chunk of process.stdin) {input+=chunk; if(Buffer.byteLength(input)>1048576) throw Error();}
  // jevModel is the request's pinned model; it is not part of the TypeSafe body.
  const {jevModel,...request}=JSON.parse(input);
  const client=createJevClient({baseUrl:process.env.JEV_BASE_URL,apiKey:process.env.JEV_API_KEY,
    allowLocalhost:process.env.JEV_ALLOW_LOCALHOST==='1',timeoutMs:5000,...(jevModel?{model:jevModel}:{})});
  process.stdout.write(JSON.stringify(await client.evaluate(request)));
} catch(e) {process.stderr.write('jev_unavailable'+(CODES.has(e?.code)?':'+e.code:'')+'\n');process.exitCode=1;}
