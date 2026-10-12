import io
import sys
import threading
import unittest
import urllib.request
import urllib.error
from pathlib import Path
from unittest.mock import Mock
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "poc"))
from app_proxy import make_server


class ProxyTest(unittest.TestCase):
    def setUp(self):
        self.response = io.BytesIO(b'data: first\n\ndata: [DONE]\n\n')
        self.response.status = 200
        self.response.headers = {"Content-Type": "text/event-stream"}
        self.transport = Mock()
        self.transport.open.return_value = self.response
        self.identity = Mock(return_value="synthetic-identity")
        self.server = make_server("https://shared-ai-stg-test-uc.a.run.app", self.identity, opener=self.transport)
        self.thread = threading.Thread(target=self.server.serve_forever)
        self.thread.start()

    def tearDown(self):
        self.server.shutdown()
        self.server.server_close()
        self.thread.join()

    def call(self, path, method="POST", headers=None, body=b'{"original":true}'):
        request = urllib.request.Request(f"http://127.0.0.1:{self.server.server_port}"+path,
            data=body if method=="POST" else None, method=method,
            headers={"Authorization":"Bearer synthetic-app-key", "Content-Type":"application/json", **(headers or {})})
        try:
            with urllib.request.urlopen(request, timeout=5) as response:
                return response.status, response.read()
        except urllib.error.HTTPError as error:
            with error:
                return error.code, error.read()

    def test_preserves_body_and_application_authorization(self):
        code, body = self.call('/llm/v1/chat/completions')
        self.assertEqual(code,200)
        self.assertEqual(body,b'data: first\n\ndata: [DONE]\n\n')
        request = self.transport.open.call_args.args[0]
        self.assertEqual(request.data,b'{"original":true}')
        self.assertEqual(request.get_header('Authorization'),'Bearer synthetic-app-key')
        self.assertEqual(request.get_header('X-serverless-authorization'),'Bearer synthetic-identity')
        self.assertEqual(self.transport.open.call_count,1)

    def test_preserves_discovery_identity_and_idempotency(self):
        self.call('/discovery/v1/discover',headers={'X-Discovery-Subject':'a'*64,'Idempotency-Key':'test-request'})
        request = self.transport.open.call_args.args[0]
        self.assertEqual(request.get_header('X-discovery-subject'),'a'*64)
        self.assertEqual(request.get_header('Idempotency-key'),'test-request')

    def test_blocks_browser_dns_rebinding_and_admin_before_token_lookup(self):
        for path,headers in [('/llm/key/generate',{}),('/llm/v1/models',{'Origin':'https://evil.example'}),('/llm/v1/models',{'Host':'evil.example'})]:
            code,_=self.call(path,method='GET',headers=headers)
            self.assertIn(code,(403,404))
        self.identity.assert_not_called()
        self.transport.open.assert_not_called()

    def test_upstream_failure_does_not_leak_secrets_or_retry(self):
        self.transport.open.side_effect=ValueError('synthetic-secret')
        self.assertEqual(self.call('/llm/v1/chat/completions'),(502,b''))
        self.assertEqual(self.transport.open.call_count,1)

    def test_rejects_other_hosts_and_ambiguous_paths(self):
        with self.assertRaises(ValueError):make_server('https://shared-ai-production.a.run.app',self.identity)
        for path in ['/llm/v1/models?target=evil','//evil.example/llm/v1/models','/llm/../key/generate','/accounts/connections']:
            self.assertEqual(self.call(path)[0],404)
        self.transport.open.assert_not_called()
