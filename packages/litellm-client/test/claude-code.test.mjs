import test from 'node:test';
import assert from 'node:assert/strict';
import { createAccountClient, publicAccountConnections } from '../accounts.mjs';
const url = 'https://claude.com/cai/oauth/authorize?redirect_uri=https%3A%2F%2Fplatform.claude.com%2Foauth%2Fcode%2Fcallback&response_type=code&code_challenge_method=S256&state=' + 's'.repeat(43);
const record = { id: 'a'.repeat(32), provider: 'claude', state: 'authorizing', models: [], challenge: { kind: 'code-entry', url, code: '', expiresAt: Date.now() / 1000 + 900, submittedCode: 'never-expose', submitted: true } };
test('native challenge projection exposes only allowed fields and rejects other origins', () => {
  const connection = publicAccountConnections({connections:[record]})[0];
  assert.equal(connection.challenge.submitted, true);
  assert.equal(connection.challenge.submittedCode, undefined);
  for (const bad of [url.replace('claude.com/cai', 'evil.test/cai'), url.replace('S256', 'plain'), url.replace('platform.claude.com', 'evil.test')]) {
    assert.throws(() => publicAccountConnections({connections:[{...record, challenge:{...record.challenge,url:bad}}]}));
  }
});
test('native login is opt in, authorization is scoped, API key callers stay compatible', async () => {
  const calls=[];
  const client=createAccountClient({baseUrl:'https://accounts.test',apiKey:'f'.repeat(40),subject:'a'.repeat(64),fetch:async (url,init)=>{
    calls.push({url,body:JSON.parse(init.body),headers:init.headers});
    return Response.json(url.endsWith('/authorize')?{ok:true}:record);
  }});
  await assert.rejects(client.connect('claude'));
  await assert.rejects(client.connect('claude',{authMethod:'claude-code',apiKey:'sk-ant-oat01-private'}));
  await client.connect('claude',{authMethod:'claude-code'});
  assert.equal(calls[0].body.authMethod,'claude-code');
  assert.equal(calls[0].body.apiKey,undefined);
  await assert.rejects(client.authorize(record.id,'sk-ant-oat01-private'));
  await client.authorize(record.id,'test-one-time-code#'+'s'.repeat(43));
  assert.equal(calls[1].url,'https://accounts.test/connections/'+record.id+'/authorize');
  assert.equal(calls[1].headers['X-AI-Subject'],'a'.repeat(64));
  await client.connect('claude',{apiKey:'sk-ant-api'+'a'.repeat(30)});
  assert.equal(calls[2].body.authMethod,undefined);
});
