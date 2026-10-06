"""Acquisition contract tests; fixtures do not certify model/search quality."""
import json
import os
import tempfile
import threading
import unittest
from pathlib import Path
from unittest.mock import Mock

from client import DiscoveryClient
from server import make_server
from service import (Discovery, Store, Failure, candidate_query, parse_leads,
                     research_query, grounded_candidates)
from test_service import INPUT, KEY, SUBJECT, candidate, pass_result

INITIAL = {'id': 'source-1', 'url': 'https://museum.example/ko/bridge',
           'title': '회전교 안내', 'excerpt': '회전교는 항구의 보행교입니다.'}
DETAIL = {'url': 'https://operator.example/en/bridge', 'title': 'Rotating bridge design',
          'excerpt': 'The bridge deck rotates to allow ships through the harbour.'}
LEAD = {'entity': '회전교', 'question': '상판은 왜 회전하나요?', 'keyword': '구조 원리',
        'evidenceIds': ['source-1']}
QUERY = 'rotating bridge operator design explanation'


class ResearchSearchTests(unittest.TestCase):
    def test_optional_query_keeps_grounded_identity_and_legacy_output(self):
        legacy = parse_leads({'leads': [LEAD]}, [INITIAL])[0]
        self.assertEqual(research_query(legacy, INPUT), candidate_query(LEAD))
        lead = parse_leads({'leads': [{**LEAD, 'searchQuery': QUERY}]}, [INITIAL])[0]
        self.assertEqual(lead['entity'], '회전교')
        self.assertEqual(research_query(lead, INPUT), QUERY)
        with self.assertRaises(Failure) as ctx:
            parse_leads({'leads': [{**LEAD, 'entity': '회전교 (Rotating Bridge)', 'searchQuery': QUERY}]}, [INITIAL])
        self.assertEqual(ctx.exception.code, 'unsubstantiated_research_entity')

    def test_invalid_optional_query_fails_before_search(self):
        for value in ('', '  ', None, 1, [], {}, 'q' * 301):
            with self.subTest(value=value), self.assertRaises(Failure) as ctx:
                parse_leads({'leads': [{**LEAD, 'searchQuery': value}]}, [INITIAL])
            self.assertEqual(ctx.exception.code, 'invalid_research_leads')
        with self.assertRaises(Failure):
            parse_leads({'leads': [{**LEAD, 'unrecognized': QUERY}]}, [INITIAL])

    def test_caller_source_hint_survives_generated_and_legacy_query(self):
        value = {**INPUT, 'brief': '회전교 site:operator.example\n영상 연출 설명'}
        for lead in (LEAD, {**LEAD, 'searchQuery': QUERY + ' site:travel.example'}):
            q = research_query(lead, value)
            self.assertIn('site:operator.example', q)
            self.assertNotIn('travel.example', q)
            self.assertNotIn('영상', q)
        self.assertEqual(research_query({**LEAD, 'searchQuery': QUERY}, INPUT), QUERY)

    def test_original_language_entity_is_preserved_without_alias_translation(self):
        evidence = [{**INITIAL, 'title': 'Rotating Bridge', 'excerpt': 'The harbour bridge.'}]
        lead = {**LEAD, 'entity': 'Rotating Bridge', 'searchQuery': QUERY}
        self.assertEqual(parse_leads({'leads': [lead]}, evidence)[0]['entity'], 'Rotating Bridge')
        with self.assertRaises(Failure):
            parse_leads({'leads': [{**lead, 'entity': '회전교'}]}, evidence)

    def test_query_is_not_citable_evidence_or_a_draft_identity(self):
        lead = parse_leads({'leads': [{**LEAD, 'searchQuery': QUERY}]}, [INITIAL])[0]
        draft = {**candidate(), 'leadId': 'lead-1', 'entity': 'Rotating bridge'}
        with self.assertRaises(Failure):
            grounded_candidates({'candidates': [draft]}, [INITIAL], [lead])
        draft.update(entity=LEAD['entity'], evidenceIds=[QUERY])
        held = grounded_candidates({'candidates': [draft]}, [INITIAL], [lead])[0]
        self.assertEqual(held['decision'], 'held')
        self.assertEqual(held['reasonCodes'], ['unobserved_evidence'])

    def test_real_http_retrieval_reaches_jev_and_replays_without_extra_calls(self):
        with tempfile.TemporaryDirectory(dir=os.environ['DISCOVERY_TEST_DIR']) as root:
            search = Mock(side_effect=lambda q: [DETAIL] if q == QUERY else [INITIAL])
            jev = Mock(side_effect=pass_result)
            service = Discovery(Store(Path(root) / 'state.sqlite'), search, jev)
            server = make_server(('127.0.0.1', 0), service, {'shopshorts': KEY})
            worker = threading.Thread(target=server.serve_forever, daemon=True)
            worker.start()
            try:
                client = DiscoveryClient('http://127.0.0.1:' + str(server.server_port), KEY, SUBJECT, allow_localhost=True)
                generated = []
                def generate(prompt):
                    generated.append(prompt)
                    if len(generated) == 1:
                        return {'leads': [{**LEAD, 'searchQuery': QUERY}]}
                    self.assertIn(DETAIL['excerpt'], prompt)
                    return {'candidates': [{**candidate(), 'leadId': 'lead-1', 'evidenceIds': ['lead-1-source-1']}]}
                value = {**INPUT, 'workflow': 'research-v2', 'reviewMode': 'native-llm-v1'}
                result = client.discover(value, idempotency_key='source-query-http', generate=generate, assert_connection=lambda runtime: None)
                self.assertEqual(result['candidates'][0]['decision'], 'accepted')
                self.assertEqual(result['usage']['searchCalls'], 2)
                self.assertEqual(result['usage']['generationClaims'], 2)
                self.assertEqual(result['usage']['jevCalls'], 1)
                self.assertFalse(result['factChecked'])
                self.assertTrue(result['requiresHumanReview'])
                payload = jev.call_args.args[0]
                self.assertIn(DETAIL['excerpt'], json.dumps(payload, ensure_ascii=False))
                self.assertNotIn(QUERY, json.dumps(payload, ensure_ascii=False))
                again = client.discover(value, idempotency_key='source-query-http', generate=generate, assert_connection=lambda runtime: None)
                self.assertEqual(again['requestId'], result['requestId'])
                self.assertEqual(len(generated), 2)
                self.assertEqual(search.call_count, 2)
                self.assertEqual(jev.call_count, 1)
            finally:
                server.shutdown(); server.server_close(); worker.join(timeout=5)


if __name__ == '__main__':
    unittest.main()
