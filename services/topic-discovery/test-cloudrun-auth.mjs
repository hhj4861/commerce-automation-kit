import test from 'node:test';
import assert from 'node:assert/strict';
import {cloudRunFetch} from './cloudrun-auth.mjs';
const audience = 'https://shared-ai-stg-test-uc.a.run.app';
test('VM path is unchanged without an audience', () => {
  const fetcher = () => {};
  assert.equal(cloudRunFetch('http://127.0.0.1:4100', undefined, fetcher), fetcher);
});
test('metadata identity preserves the distinct application key and body', async () => {
  const calls = [];
  const fetcher = async (url, options) => {
    calls.push({url, options});
    return new Response(calls.length === 1 ? 'test.identity.signature' : '{}');
  };
  await cloudRunFetch(audience + '/llm', audience, fetcher)(audience + '/llm/typesafe/v1/systemone',
    {method:'POST', headers:{Authorization:'Bearer synthetic-provider-key'}, body:'original-body'});
  assert.equal(calls.length, 2);
  assert.equal(calls[0].options.headers['Metadata-Flavor'], 'Google');
  assert.equal(calls[1].options.headers.Authorization, 'Bearer synthetic-provider-key');
  assert.equal(calls[1].options.headers['X-Serverless-Authorization'], 'Bearer test.identity.signature');
  assert.equal(calls[1].options.body, 'original-body');
});
test('reject another origin before reading identity', async () => {
  let calls=0;
  const fetcher=async()=>{calls++;};
  assert.throws(()=>cloudRunFetch('https://example.com', audience, fetcher));
  await assert.rejects(cloudRunFetch(audience, audience, fetcher)('https://example.com'));
  assert.equal(calls, 0);
});
test('invalid metadata never reaches the provider; there is no retry', async () => {
  let calls=0;
  await assert.rejects(cloudRunFetch(audience,audience,async()=>{calls++;return new Response('not-a-token');})(audience+'/llm'));
  assert.equal(calls, 1);
});
