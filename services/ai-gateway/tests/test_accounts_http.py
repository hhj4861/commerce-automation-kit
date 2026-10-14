"""Unmodified JS consumer -> real HTTP -> v2 API -> PostgreSQL -> fake provider.

Provider calls are synthetic; this proves transport/lifecycle, not paid provider or UI E2E.
"""
import json
import os
from pathlib import Path
import socket
import subprocess
import sys
import threading
import time
import unittest
import uuid

import uvicorn
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from accounts_v2 import create_app
from accounts_store import AccountsStore, Keyring
from test_accounts_store import KEYS
from test_accounts_v2 import FakeProvider

ROOT=Path(__file__).resolve().parents[3]


@unittest.skipUnless(os.environ.get('ACCOUNTS_TEST_DATABASE_URL'),'real PostgreSQL required (mandatory in CI)')
class HTTPContractTest(unittest.TestCase):
    def test_shared_client_roundtrip_then_new_process_state(self):
        schema='test_http_'+uuid.uuid4().hex
        store=AccountsStore(os.environ['ACCOUNTS_TEST_DATABASE_URL'],Keyring(KEYS,1),schema)
        store.migrate()
        from psycopg import sql
        def cleanup():
            with store.db() as db:
                db.execute(sql.SQL('DROP SCHEMA {} CASCADE').format(sql.Identifier(schema)))
        self.addCleanup(cleanup)
        env={'ACCOUNT_PLATFORM_KEYS':json.dumps({'hanmadi':'h'*40,'festa':'f'*40}),
             'ACCOUNT_MODELS':json.dumps({'openai':['gpt-test'],'claude':['claude-test']})}
        id=None
        for phase in ('create','recover'):
            # New app/store/server instance. There is no shared runtime account state.
            recovered=AccountsStore(store.url,Keyring(KEYS,1),schema)
            app=create_app(env,recovered,FakeProvider())
            sock=socket.socket()
            sock.bind(('127.0.0.1',0))
            port=sock.getsockname()[1]
            server=uvicorn.Server(uvicorn.Config(app,log_level='critical',access_log=False))
            thread=threading.Thread(target=server.run,kwargs={'sockets':[sock]},daemon=True)
            thread.start()
            try:
                for _ in range(100):
                    if server.started:
                        break
                    time.sleep(.02)
                self.assertTrue(server.started)
                script='''
import assert from 'node:assert/strict';
import {createAccountClient} from CLIENT_PATH;
const baseUrl=process.env.TEST_BASE;
const options={baseUrl,allowLocalhost:true,apiKey:'h'.repeat(40),subject:'a'.repeat(64)};
const client=createAccountClient(options);
if (process.env.TEST_PHASE==='create') {
  const openai=await client.connect('openai',{apiKey:'sk-proj-'+'fixture'.repeat(8)});
  const claude=await client.connect('claude',{apiKey:'sk-ant-api'+'fixture'.repeat(8)});
  assert.equal(await client.client(openai.id+':gpt-test').completeText({messages:[{role:'user',content:'hello'}]}),'Hello');
  assert.deepEqual(await client.client(claude.id+':claude-test').generateJSON({messages:[{role:'user',content:'hello'}],name:'reply',schema:{type:'object',properties:{ok:{type:'boolean'}},required:['ok'],additionalProperties:false}}),{ok:true});
  for(const other of [{...options,subject:'b'.repeat(64)},{...options,apiKey:'f'.repeat(40)}]) {
    const foreign=createAccountClient(other);
    assert.deepEqual(await foreign.list(),[]);
    await assert.rejects(foreign.disconnect(openai.id));
  }
  console.log(openai.id);
} else {
  const rows=await client.list();
  assert.equal(rows.length,2);
  const id=process.env.TEST_ID;
  const connection=client.client(id+':gpt-test');
  assert.equal(await connection.completeText({messages:[{role:'user',content:'hello'}]}),'Hello');
  await client.disconnect(id);
  await assert.rejects(connection.completeText({messages:[{role:'user',content:'hello'}]}));
  console.log('PASS: JS client, real HTTP, PostgreSQL recovery and revocation');
}
'''.replace('CLIENT_PATH',json.dumps((ROOT/'packages/litellm-client/index.mjs').as_uri()))
                result=subprocess.run(['node','--input-type=module','-e',script],env={**os.environ,'TEST_BASE':f'http://127.0.0.1:{port}','TEST_PHASE':phase,'TEST_ID':id or ''},text=True,capture_output=True,timeout=30)
                self.assertEqual(result.returncode,0,result.stderr)
                if phase=='create':
                    id=result.stdout.strip()
                    self.assertRegex(id,'^[a-f0-9]{32}$')
            finally:
                server.should_exit=True
                thread.join(timeout=5)
                sock.close()
                self.assertFalse(thread.is_alive())
