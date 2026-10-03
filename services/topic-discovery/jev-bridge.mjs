import {createJevClient} from '../../packages/litellm-client/jev.mjs';
let input='';
try {
  for await (const chunk of process.stdin) {input+=chunk; if(Buffer.byteLength(input)>1048576) throw Error();}
  const client=createJevClient({baseUrl:process.env.JEV_BASE_URL,apiKey:process.env.JEV_API_KEY,
    allowLocalhost:process.env.JEV_ALLOW_LOCALHOST==='1',timeoutMs:5000});
  process.stdout.write(JSON.stringify(await client.evaluate(JSON.parse(input))));
} catch {process.stderr.write('jev_unavailable\n');process.exitCode=1;}
