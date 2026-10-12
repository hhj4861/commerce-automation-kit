import asyncio
import json
import os
from pathlib import Path
import sys
import threading
import time
import unittest
import uuid
from unittest.mock import patch

import httpx
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from accounts_provider import Provider, ProviderError
from accounts_store import AccountsStore, Keyring, StoreError
from accounts_v2 import create_app
from test_accounts_store import KEYS, SECRET, SCOPE


class MemoryStore:
    """Unit-test substitute only. CI repeats these API cases against PostgreSQL."""
    def __init__(self):
        self.rows = {}
        self.keyring = Keyring(KEYS,1)
        self.lock = threading.RLock()

    def create(self,scope,provider,ttl=None):
        with self.lock:
            if any((r['platform'],r['subject'],r['provider'])==(*scope,provider) and r['state']!='disconnected' for r in self.rows.values()):
                raise StoreError(409,'disconnect_before_reconnecting')
            row = dict(id=uuid.uuid4().hex,platform=scope[0],subject=scope[1],provider=provider,state='authorizing',models=[],secret_ct=None,key_id=1)
            self.rows[row['id']] = row
            return row.copy()

    def get(self,id,scope):
        with self.lock:
            row = self.rows.get(id)
            if not row or (row['platform'],row['subject'])!=scope:
                raise StoreError(404,'connection_not_found')
            return row.copy()

    def list(self,scope):
        return [r.copy() for r in self.rows.values() if (r['platform'],r['subject'])==scope and r['state']!='disconnected']

    def finish(self,id,scope,secret=None,models=()):
        with self.lock:
            row = self.get(id,scope)
            if row['state']!='authorizing':
                raise StoreError(409,'connection_unavailable')
            row.update(state='connected' if secret else 'error',models=list(models))
            if secret:
                row['key_id'],row['secret_ct']=self.keyring.seal(row,secret)
            self.rows[id]=row
            return row.copy()

    def disconnect(self,id,scope):
        with self.lock:
            self.get(id,scope)
            self.rows[id].update(state='disconnected',secret_ct=None,models=[])

    def fail(self,id,scope,state):
        with self.lock:
            if self.get(id,scope)['state']=='connected':
                self.rows[id].update(state=state,secret_ct=None,models=[])

    def secret(self,id,scope):
        row=self.get(id,scope)
        if row['state']!='connected':
            raise StoreError(409,'connection_'+row['state'])
        return row,self.keyring.open(row)


class FakeProvider:
    def __init__(self):
        self.calls=[]
        self.verify_error=None
        self.chat_error=None
        self.started=None
        self.resume=None

    async def verify(self,provider,key,models):
        self.calls.append(('verify',provider))
        if self.verify_error:
            raise self.verify_error
        return models[:1]

    async def complete(self,provider,key,model,messages,options):
        self.calls.append(('chat',provider,model,messages,options))
        if self.started:
            self.started.set()
            await self.resume.wait()
        if self.chat_error:
            raise self.chat_error
        return '{"ok":true}' if options.get('response_format') else 'Hello'


class APITest(unittest.IsolatedAsyncioTestCase):
    def make_store(self):
        return MemoryStore()

    async def asyncSetUp(self):
        self.store=self.make_store()
        self.provider=FakeProvider()
        self.env={'ACCOUNT_PLATFORM_KEYS':json.dumps({'hanmadi':'h'*40,'festa':'f'*40}),
                  'ACCOUNT_MODELS':json.dumps({'openai':['gpt-test','gpt-denied'],'claude':['claude-test']})}
        self.app=create_app(self.env,self.store,self.provider)
        self.client=httpx.AsyncClient(transport=httpx.ASGITransport(app=self.app),base_url='http://test')
        self.addAsyncCleanup(self.client.aclose)
        self.headers={'Authorization':'Bearer '+'h'*40,'X-AI-Subject':'a'*64}

    async def connect(self):
        r=await self.client.post('/connections',headers=self.headers,json={'provider':'openai','apiKey':SECRET})
        self.assertEqual(r.status_code,202,r.text)
        return r.json()

    def chat_body(self,id):
        return {'model':id+':gpt-test','messages':[{'role':'user','content':'hello'}]}

    async def test_connect_list_chat_disconnect_no_secret(self):
        row=await self.connect()
        self.assertEqual(row['models'],['gpt-test'])
        self.assertEqual(row['state'],'connected')
        self.assertNotIn(SECRET,json.dumps(row))
        listing=await self.client.get('/connections',headers=self.headers)
        self.assertEqual(listing.headers['cache-control'],'no-store')
        self.assertNotIn('secret',listing.text)
        self.assertNotIn(SECRET,self.store.get(row['id'],SCOPE)['secret_ct'].decode(errors='ignore'))
        r=await self.client.post('/v1/chat/completions',headers=self.headers,json=self.chat_body(row['id']))
        self.assertEqual(r.status_code,200,r.text)
        self.assertEqual(r.json()['choices'][0]['message']['content'],'Hello')
        self.assertEqual((await self.client.delete('/connections/'+row['id'],headers=self.headers)).status_code,200)
        self.assertIsNone(self.store.get(row['id'],SCOPE)['secret_ct'])
        self.assertEqual((await self.client.post('/v1/chat/completions',headers=self.headers,json=self.chat_body(row['id']))).status_code,409)

    async def test_owner_isolation_and_no_auth(self):
        row=await self.connect()
        for headers in [{**self.headers,'X-AI-Subject':'b'*64},{**self.headers,'Authorization':'Bearer '+'f'*40}]:
            self.assertEqual((await self.client.get('/connections',headers=headers)).json()['connections'],[])
            self.assertEqual((await self.client.delete('/connections/'+row['id'],headers=headers)).status_code,404)
            self.assertEqual((await self.client.post('/v1/chat/completions',headers=headers,json=self.chat_body(row['id']))).status_code,404)
        self.assertEqual((await self.client.get('/connections')).status_code,401)
        self.assertEqual((await self.client.get('/health')).status_code,200)

    async def test_duplicate_and_invalid_requests_never_call_provider(self):
        await self.connect()
        self.assertEqual((await self.client.post('/connections',headers=self.headers,json={'provider':'openai','apiKey':SECRET})).status_code,409)
        for data in [{'provider':'codex'}, {'provider':'claude','authMethod':'claude-code'}, {'provider':'openai','apiKey':'bad'},
                     {'provider':'claude','apiKey':'sk-ant-oat01-'+'a'*100}, {'provider':'openai','apiKey':SECRET,'ttlSeconds':True}]:
            self.assertEqual((await self.client.post('/connections',headers=self.headers,json=data)).status_code,400)
        self.assertEqual(len(self.provider.calls),1)
        self.assertEqual((await self.client.post('/connections',headers=self.headers,content='x'*64001)).status_code,413)

    async def test_validation_failure_stores_error_without_key(self):
        self.provider.verify_error=ProviderError(401)
        row=await self.connect()
        self.assertEqual(row['state'],'error')
        self.assertIsNone(self.store.get(row['id'],SCOPE)['secret_ct'])
        self.assertEqual((await self.client.post('/v1/chat/completions',headers=self.headers,json=self.chat_body(row['id']))).status_code,409)

    async def test_model_restriction_options_and_no_extra_fields(self):
        row=await self.connect()
        body=self.chat_body(row['id'])
        body['model']=row['id']+':gpt-denied'
        self.assertEqual((await self.client.post('/v1/chat/completions',headers=self.headers,json=body)).status_code,403)
        body['model']=row['id']+':gpt-test'
        for field,value in [('stream',True),('max_tokens',3000),('response_format',{'type':'text'}),('messages',[{'role':'tool','content':'bad'}])]:
            self.assertEqual((await self.client.post('/v1/chat/completions',headers=self.headers,json={**body,field:value})).status_code,400)
        body.update(max_tokens=1100,response_format={'type':'json_schema','json_schema':{'name':'result','schema':{'type':'object'}}},base_url='https://evil.test')
        body['messages'][0]['api_key']='ignored'
        self.assertEqual((await self.client.post('/v1/chat/completions',headers=self.headers,json=body)).status_code,200)
        self.assertEqual(self.provider.calls[-1][-1]['max_tokens'],1100)
        self.assertNotIn('api_key',self.provider.calls[-1][-2][0])

    async def test_late_chat_response_does_not_escape_disconnect(self):
        row=await self.connect()
        self.provider.started,self.provider.resume=asyncio.Event(),asyncio.Event()
        task=asyncio.create_task(self.client.post('/v1/chat/completions',headers=self.headers,json=self.chat_body(row['id'])))
        await asyncio.wait_for(self.provider.started.wait(),2)
        await self.client.delete('/connections/'+row['id'],headers=self.headers)
        self.provider.resume.set()
        self.assertEqual((await task).status_code,409)
        self.assertEqual(self.store.get(row['id'],SCOPE)['state'],'disconnected')

    async def test_provider_quota_and_auth_failures_clear_secret(self):
        for status,state in [(401,'expired'),(403,'expired'),(429,'quota_exceeded')]:
            row=await self.connect()
            self.provider.chat_error=ProviderError(status)
            r=await self.client.post('/v1/chat/completions',headers=self.headers,json=self.chat_body(row['id']))
            self.assertEqual(r.status_code,status)
            record=self.store.get(row['id'],SCOPE)
            self.assertEqual(record['state'],state)
            self.assertIsNone(record['secret_ct'])
            await self.client.delete('/connections/'+row['id'],headers=self.headers)

    async def test_deadline_cancels_validation_and_never_stores_late_key(self):
        cancelled=asyncio.Event()
        async def slow(*_):
            try:
                await asyncio.sleep(5)
                return ['gpt-test']
            finally:
                cancelled.set()
        self.provider.verify=slow
        start=time.monotonic()
        with patch('accounts_v2.CONNECT_DEADLINE', .5):
            r=await self.client.post('/connections',headers=self.headers,json={'provider':'openai','apiKey':SECRET})
        self.assertEqual(r.status_code,504)
        self.assertLess(time.monotonic()-start,2)
        self.assertTrue(cancelled.is_set())
        for row in self.store.list(SCOPE):
            self.assertIsNone(row['secret_ct'])

    async def test_unexpected_error_never_leaks_secret(self):
        row=await self.connect()
        self.provider.chat_error=RuntimeError('do not expose '+SECRET)
        with self.assertNoLogs(level='ERROR'):
            r=await self.client.post('/v1/chat/completions',headers=self.headers,json=self.chat_body(row['id']))
        self.assertEqual(r.status_code,503)
        self.assertNotIn(SECRET,r.text)


@unittest.skipUnless(os.environ.get('ACCOUNTS_TEST_DATABASE_URL'),'real PostgreSQL required (mandatory in CI)')
class PostgresAPITest(APITest):
    def make_store(self):
        from psycopg import sql
        schema='test_api_'+uuid.uuid4().hex
        store=AccountsStore(os.environ['ACCOUNTS_TEST_DATABASE_URL'],Keyring(KEYS,1),schema)
        store.migrate()
        def cleanup():
            with store.db() as db:
                db.execute(sql.SQL('DROP SCHEMA {} CASCADE').format(sql.Identifier(schema)))
        self.addCleanup(cleanup)
        return store


class ProviderTest(unittest.IsolatedAsyncioTestCase):
    async def test_real_adapter_shapes_models_and_text(self):
        calls=[]
        def respond(req):
            calls.append(req)
            if req.url.path=='/v1/models':
                return httpx.Response(200,json={'data':[{'id':'gpt-test'},{'id':'claude-test'}]})
            if req.url.host=='api.openai.com':
                return httpx.Response(200,json={'choices':[{'finish_reason':'stop','message':{'content':'OK'}}]})
            return httpx.Response(200,json={'stop_reason':'end_turn','content':[{'type':'text','text':'OK'}]})
        provider=Provider(httpx.MockTransport(respond))
        for name,model in [('openai','gpt-test'),('claude','claude-test')]:
            self.assertEqual(await provider.verify(name,SECRET,[model,'no-access']),[model])
            self.assertEqual(await provider.complete(name,SECRET,model,[{'role':'system','content':'rules'},{'role':'user','content':'hello'}],{'max_tokens':700}),'OK')
        self.assertEqual(calls[0].headers['authorization'],'Bearer '+SECRET)
        self.assertEqual(calls[2].headers['x-api-key'],SECRET)
        self.assertEqual(calls[2].headers['anthropic-version'],'2023-06-01')
        self.assertEqual(json.loads(calls[3].content)['system'],'rules')
        self.assertNotIn('system',[m['role'] for m in json.loads(calls[3].content)['messages']])
        self.assertEqual(json.loads(calls[1].content)['max_completion_tokens'],700)

    async def test_claude_structured_reply_and_incomplete_rejection(self):
        observed=[]
        def respond(req):
            observed.append(json.loads(req.content))
            return httpx.Response(200,json={'stop_reason':'end_turn','content':[{'type':'text','text':'{"ok":true}'}]})
        options={'max_tokens':100,'response_format':{'type':'json_schema','json_schema':{'name':'result','schema':{'type':'object'}}}}
        reply=await Provider(httpx.MockTransport(respond)).complete('claude',SECRET,'claude-test',[{'role':'user','content':'ok'}],options)
        self.assertEqual(json.loads(reply),{'ok':True})
        self.assertEqual(observed[0]['output_config']['format'],{'type':'json_schema','schema':{'type':'object'}})
        self.assertNotIn('tools',observed[0])
        for value in [{'choices':[]},{'choices':[{'finish_reason':'length','message':{'content':'cut'}}]}, {'choices':[{'finish_reason':'stop','message':{'refusal':'no','content':'no'}}]}]:
            with self.assertRaises(ProviderError):
                await Provider(httpx.MockTransport(lambda _:httpx.Response(200,json=value))).complete('openai',SECRET,'gpt-test',[{'role':'user','content':'ok'}],{'max_tokens':100})

    async def test_errors_redirects_oversize_timeout_are_bounded_and_sanitized(self):
        for status in [302,401,429,500]:
            calls=[]
            def respond(req):
                calls.append(req)
                return httpx.Response(status,text=SECRET,headers={'location':'https://evil.test'})
            with self.assertRaises(ProviderError) as e:
                await Provider(httpx.MockTransport(respond)).verify('openai',SECRET,['gpt-test'])
            self.assertNotIn(SECRET,str(e.exception))
            self.assertEqual(len(calls),1)
        with self.assertRaises(ProviderError):
            await Provider(httpx.MockTransport(lambda _:httpx.Response(200,content=b'x'*1048577))).verify('openai',SECRET,['gpt-test'])
        async def slow(_):
            await asyncio.sleep(1)
            return httpx.Response(200,json={})
        with self.assertRaises(ProviderError) as e:
            await Provider(httpx.MockTransport(slow)).request('openai',SECRET,'/v1/models',timeout=.01)
        self.assertEqual(e.exception.status,504)


if __name__=='__main__':
    unittest.main()
