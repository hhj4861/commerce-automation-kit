import json
import os
import tempfile
import threading
import unittest
from pathlib import Path
from unittest.mock import Mock
from service import Discovery, Store, Failure, questions, VERSION
from server import make_server
from client import DiscoveryClient, DiscoveryError

KEY='k'*40
SUBJECT='a'*64
INPUT={'profile':'content','category':'건축학','brief':'국내 실제 건축물의 의외의 구조를 설명할 영상', 'runtime':{'provider':'codex','model':'test-model'}}
SOURCE={'url':'https://operator.example/bridge','title':'운영기관의 교량 설명','excerpt':'이 다리는 선박이 지나가면 상판이 회전합니다.'}
def candidate(title='다리가 돌아가는 이유'):
    return {'title':title,'entity':'회전교','location':'한국','question':'다리는 왜 돌아갈까?','expectedAnswer':'들어올릴 것 같다','answer':'선박의 통과를 위해 상판을 회전한다','whyItMatters':'물류와 통행을 함께 유지','direction':'회전 전후를 비교','keyword':'회전교','openingVisual':'움직이는 다리','evidenceIds':['source-1']}
def pass_result(payload):
    return {'answers':{k:{'type':'choice','choice':'pass','confidence':.95,'probabilities':{'pass':.95,'reject':.025,'uncertain':.025}} for k in payload['questions']}}
class Tests(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory(prefix='shared-discovery-test-',dir=os.environ['DISCOVERY_TEST_DIR'])
        self.store=Store(Path(self.tmp.name)/'state.sqlite')
        self.search=Mock(return_value=[SOURCE]);self.jev=Mock(side_effect=pass_result)
        self.d=Discovery(self.store,self.search,self.jev)
    def tearDown(self):self.tmp.cleanup()
    def start(self,key='test-key-001',subject=SUBJECT,value=None):
        return self.d.start('shopshorts',subject,key,value or INPUT)
    def complete(self,request,items=None,subject=SUBJECT):
        scope=self.d.scope('shopshorts',subject)
        self.store.claim(scope,request['requestId'],request['action']['id'])
        body={'actionId':request['action']['id'],'runtime':INPUT['runtime'],'output':{'candidates':items or [candidate()]}}
        return self.d.complete('shopshorts',subject,request['requestId'],body),body
    def test_success_and_semantic_rubric(self):
        result,_=self.complete(self.start())
        self.assertEqual(result['candidates'][0]['decision'],'accepted')
        self.assertFalse(result['factChecked']);self.assertTrue(result['requiresHumanReview'])
        self.assertIn('duplicate',self.jev.call_args.args[0]['questions'])
        self.assertEqual(result['usage']['searchCalls'],2)
        self.assertIsNone(result['usage']['costUsd'])
    def test_idempotent_start_and_completion_no_second_spend(self):
        first=self.start();same=self.start();self.assertEqual(first['requestId'],same['requestId']);self.assertEqual(self.search.call_count,1)
        result,body=self.complete(first)
        self.assertEqual(self.d.complete('shopshorts',SUBJECT,first['requestId'],body),result)
        self.assertEqual(self.jev.call_count,1)
        with self.assertRaises(Failure):self.start(value={**INPUT,'brief':'다른 내용'})
        with self.assertRaises(Failure):self.d.complete('shopshorts',SUBJECT,first['requestId'],{**body,'output':{'candidates':[candidate('다른제목')]}})
    def test_single_claim_and_same_subject_lock(self):
        r=self.start();scope=self.d.scope('shopshorts',SUBJECT)
        with self.assertRaises(Failure):self.start(key='second-key')
        self.store.claim(scope,r['requestId'],r['action']['id'])
        with self.assertRaises(Failure):self.store.claim(scope,r['requestId'],r['action']['id'])
    def test_fabricated_evidence_cannot_pass(self):
        c=candidate();c['evidenceIds']=['invented']
        result,_=self.complete(self.start(),[c]);self.assertEqual(result['candidates'][0]['decision'],'held');self.jev.assert_not_called()
    def test_sdk_failure_or_uncertainty_is_held(self):
        self.jev.side_effect=TimeoutError()
        result,_=self.complete(self.start());self.assertEqual(result['candidates'][0]['decision'],'held')
        def uncertain(p):
            value=pass_result(p);value['answers']['support']['confidence']=.5;return value
        self.jev.side_effect=uncertain
        result,_=self.complete(self.start(key='second-key'));self.assertEqual(result['candidates'][0]['decision'],'held')
    def test_persisted_history_not_erased_by_empty_client_history(self):
        self.complete(self.start())
        self.d=Discovery(Store(Path(self.tmp.name)/'state.sqlite'),self.search,self.jev)
        result,_=self.complete(self.start(key='second-key',value={**INPUT,'history':[]}))
        self.assertEqual(result['candidates'][0]['reasonCodes'],['exact_duplicate'])
        self.assertEqual(self.jev.call_count,1)
    def test_scope_isolation(self):
        r=self.start()
        with self.assertRaises(Failure):self.store.get(self.d.scope('shopshorts','b'*64),r['requestId'])
        with self.assertRaises(Failure):self.store.get(self.d.scope('blog',SUBJECT),r['requestId'])
        self.complete(r)
        result,_=self.complete(self.start(key='other-key',subject='b'*64),subject='b'*64)
        self.assertEqual(result['candidates'][0]['decision'],'accepted')
    def test_runtime_mutation_rejected(self):
        r=self.start();self.store.claim(self.d.scope('shopshorts',SUBJECT),r['requestId'],r['action']['id'])
        with self.assertRaises(Failure):self.d.complete('shopshorts',SUBJECT,r['requestId'],{'actionId':r['action']['id'],'runtime':{'provider':'claude','model':'test-model'},'output':{'candidates':[candidate()]}})
    def test_expiry_no_reexecution(self):
        r=self.start()
        with self.store.db() as db:db.execute('UPDATE requests SET expires=0 WHERE id=?',(r['requestId'],))
        self.assertEqual(self.start()['state'],'held')
        with self.assertRaises(Failure):self.store.claim(self.d.scope('shopshorts',SUBJECT),r['requestId'],r['action']['id'])
        self.assertEqual(self.search.call_count,1)
    def test_different_business_rubric(self):
        self.assertNotEqual(questions('content')['value'],questions('business')['value'])
        self.assertIn('profit',questions('business')['value']['instructions'])
    def test_search_failure_no_generation_and_budget(self):
        self.search.side_effect=TimeoutError();self.assertEqual(self.start()['state'],'held')
        self.d.per_day=1
        with self.assertRaises(Failure) as ctx:self.start(key='second-key')
        self.assertEqual(ctx.exception.code,'skipped_by_budget')
    def test_malformed_row_does_not_block_other_candidates(self):
        bad=candidate('잘못된 후보');bad['evidenceIds']=['invented']
        result,_=self.complete(self.start(),[bad,candidate()])
        self.assertEqual([c['decision'] for c in result['candidates']],['held','accepted'])
        self.assertEqual(self.jev.call_count,1)
    def test_failed_draft_does_not_veto_corrected_same_title(self):
        for first in ('uncertain', 'reject'):
            count = 0
            def review(payload):
                nonlocal count
                count += 1
                result = pass_result(payload)
                if count == 1:
                    result['answers']['support'] = {'choice': first, 'confidence': .95,
                        'probabilities': {k: .95 if k == first else .025 for k in ('pass','reject','uncertain')}}
                else:
                    self.assertFalse(any(p['title'] == payload['state']['candidate']['title'] for p in payload['state']['prior']))
                return result
            self.jev.side_effect = review
            original = candidate('동일 제목 ' + first)
            corrected = {**original, 'answer': '공식 설명에 맞춰 수정된 원리'}
            result,_ = self.complete(self.start(key='same-title-'+first), [original, corrected])
            self.assertEqual([c['decision'] for c in result['candidates']],
                ['held' if first == 'uncertain' else 'rejected', 'accepted'])
            self.assertEqual(count, 2)
    def test_expiry_during_review_cannot_resurrect_or_unlock_new_request(self):
        for concurrent_read in (False, True):
            subject = ('c' if concurrent_read else 'd') * 64
            entered, release = threading.Event(), threading.Event()
            def delayed(payload):
                entered.set()
                if not release.wait(5): raise RuntimeError('test synchronization failed')
                return pass_result(payload)
            self.jev.side_effect = delayed
            request = self.start(key='race-key', subject=subject)
            result = []
            worker = threading.Thread(target=lambda: result.append(self.complete(request, subject=subject)[0]))
            worker.start()
            try:
                self.assertTrue(entered.wait(5))
                with self.store.db() as db:
                    db.execute('UPDATE requests SET expires=0 WHERE id=?', (request['requestId'],))
                scope = self.d.scope('shopshorts',subject)
                if concurrent_read:
                    self.assertEqual(self.store.get(scope,request['requestId'])['state'],'held')
                    newer = self.start(key='newer-key', subject=subject)
                release.set();worker.join(5)
                self.assertFalse(worker.is_alive())
                self.assertEqual(result[0]['state'],'held')
                self.assertEqual(result[0]['reasonCodes'],['request_expired'])
                self.assertFalse(result[0]['candidates'])
                if concurrent_read:
                    self.assertEqual(self.store.get(scope,newer['requestId'])['state'],'awaiting_generation')
                    with self.assertRaises(Failure): self.start(key='third-key',subject=subject)
            finally:
                release.set();worker.join(5)
    def test_expiry_during_search_stops_followup_external_calls(self):
        request = self.start()
        def expire_search(query):
            with self.store.db() as db: db.execute('UPDATE requests SET expires=0 WHERE id=?',(request['requestId'],))
            return [SOURCE]
        self.search.side_effect = expire_search
        result,_ = self.complete(request)
        self.assertEqual(result['state'],'held');self.jev.assert_not_called()
        self.assertEqual(self.search.call_count,2)
    def test_expired_completion_is_rejected_in_transition_transaction(self):
        request = self.start();scope=self.d.scope('shopshorts',SUBJECT)
        self.store.claim(scope,request['requestId'],request['action']['id'])
        with self.store.db() as db: db.execute('UPDATE requests SET expires=0 WHERE id=?',(request['requestId'],))
        with self.assertRaises(Failure):
            self.d.complete('shopshorts',SUBJECT,request['requestId'],{'actionId':request['action']['id'],'runtime':INPUT['runtime'],'output':{'candidates':[candidate()]}})
        with self.store.db() as db:
            self.assertEqual(db.execute('SELECT state FROM requests WHERE id=?',(request['requestId'],)).fetchone()[0],'held')
        self.jev.assert_not_called()
    def test_native_sdk_bridge_with_synthetic_upstream(self):
        from service import Jev
        from http.server import BaseHTTPRequestHandler,ThreadingHTTPServer
        class Upstream(BaseHTTPRequestHandler):
            def log_message(self,*args):pass
            def do_POST(self):
                if self.path!='/typesafe/v1/systemone' or self.headers.get('Authorization')!='Bearer synthetic-jev-key':
                    self.send_response(401);self.end_headers();return
                payload=json.loads(self.rfile.read(int(self.headers['Content-Length'])))
                response={**pass_result(payload),'model':'jev-1.13.0','usage':{'input_tokens':100,'output_tokens':4}}
                self.send_response(200);self.send_header('Content-Type','application/json');self.end_headers();self.wfile.write(json.dumps(response).encode())
        server=ThreadingHTTPServer(('127.0.0.1',0),Upstream)
        thread=threading.Thread(target=server.serve_forever,daemon=True);thread.start()
        try:
            self.d.jev=Jev({'PATH':os.environ['PATH'],'JEV_BASE_URL':'http://127.0.0.1:'+str(server.server_port),'JEV_API_KEY':'synthetic-jev-key','JEV_ALLOW_LOCALHOST':'1'})
            result,_=self.complete(self.start());self.assertEqual(result['candidates'][0]['decision'],'accepted')
        finally:server.shutdown();server.server_close();thread.join()
    def test_http_python_adapter_and_auth(self):
        server=make_server(('127.0.0.1',0),self.d,{'shopshorts':KEY,'blog':'b'*40})
        thread=threading.Thread(target=server.serve_forever,daemon=True);thread.start()
        try:
            root='http://127.0.0.1:'+str(server.server_port)
            client=DiscoveryClient(root,KEY,SUBJECT,allow_localhost=True)
            checks=Mock();generate=Mock(return_value={'candidates':[candidate()]})
            result=client.discover(INPUT,idempotency_key='http-test-key',generate=generate,assert_connection=checks)
            self.assertEqual(result['candidates'][0]['decision'],'accepted');self.assertEqual(checks.call_count,3)
            again=client.discover(INPUT,idempotency_key='http-test-key',generate=generate,assert_connection=checks)
            self.assertEqual(result['requestId'],again['requestId']);self.assertEqual(generate.call_count,1)
            wrong=DiscoveryClient(root,'x'*40,SUBJECT,allow_localhost=True)
            with self.assertRaises(DiscoveryError):wrong.request('/v1/discover/'+result['requestId'])
            other=DiscoveryClient(root,'b'*40,SUBJECT,allow_localhost=True)
            with self.assertRaises(DiscoveryError):other.request('/v1/discover/'+result['requestId'])
        finally:server.shutdown();server.server_close();thread.join()
if __name__=='__main__':unittest.main()
