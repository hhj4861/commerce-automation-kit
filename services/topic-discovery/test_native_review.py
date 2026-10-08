import copy
import json
import time
import unittest
from unittest.mock import Mock
import test_service as fixtures
from service import Discovery, Failure, RESEARCH_VERSION, validate_input, normalize, role_review, scoped_review
from native_review import MODE, VERSION, REQUIRED, eligible, build_prompt, apply_reviews


def low_result(payload, choice='pass',confidence=.5):
    response=fixtures.pass_result(payload)
    response['answers']['support_openingVisual']=fixtures.choice_result(payload['questions']['support_openingVisual'],choice,confidence)
    return response

def valid_output(data):
    reviews=[]
    for c in data['candidates']:
        if not eligible(c): continue
        e=next(e for e in data['evidence'] if e['id'] in c['evidenceIds'])
        checks={name:{'choice':'pass','issue':'none','rationale':'Fixture protocol check, not semantic quality.','citations':[{'evidenceId':e['id'],'quote':e['excerpt']}]} for name in REQUIRED}
        reviews.append({'candidateId':c['id'],'checks':checks})
    return {'reviews':reviews}

class NativeReviewTests(unittest.TestCase):
    setUp=fixtures.Tests.setUp
    tearDown=fixtures.Tests.tearDown
    start=fixtures.Tests.start
    finish_action=fixtures.Tests.finish_action
    lead_output=fixtures.Tests.lead_output
    draft_output=fixtures.Tests.draft_output

    def review_stage(self,key='hybrid-test',n=1,suffix=''):
        self.search.return_value=[{**fixtures.SOURCE,'title':'회전교1 회전교2 회전교3 공식 설명'}]
        first=self.start(key=key,value={**fixtures.INPUT,'workflow':'research-v2','reviewMode':MODE})
        second,_=self.finish_action(first,self.lead_output(n))
        draft=self.draft_output(n)
        for candidate in draft['candidates']:candidate['title']+=suffix
        review,body=self.finish_action(second,draft)
        return first,second,review,body

    def test_role_review_preserves_all_text_and_business_fact_contract(self):
        state={'request':fixtures.INPUT,'candidate':fixtures.candidate(),'prior':[],'evidence':[fixtures.SOURCE]}
        original=scoped_review(state);revised=role_review(state)
        self.assertEqual(set(revised['questions']),set(original['questions']))
        self.assertEqual(revised['state'],original['state'])
        for field in fixtures.SUPPORT_FIELDS:
            self.assertEqual(revised['questions']['support_'+field]['instructions']['text'],state['candidate'][field])
        self.assertIn('HYPOTHETICAL VIEWER PREDICTION',revised['questions']['support_expectedAnswer']['instructions']['task'])
        business=copy.deepcopy(state);business['request']['profile']='business'
        business_check=role_review(business)['questions']['support_expectedAnswer']
        self.assertNotIn('not_applicable',business_check['criteria'])
        self.assertIn('EXISTING customer alternative',business_check['instructions']['task'])
        self.assertIn('not_applicable',scoped_review(business)['questions']['support_expectedAnswer']['criteria'])

    def test_business_alternative_cannot_be_exempted_as_nonfactual(self):
        from service import score_review
        state={'request':{**fixtures.INPUT,'profile':'business'},'candidate':fixtures.candidate(),'prior':[],'evidence':[fixtures.SOURCE]}
        payload=role_review(state);response=fixtures.pass_result(payload)
        response['answers']['support_expectedAnswer'].update(choice='not_applicable',probabilities={'not_applicable':1})
        with self.assertRaises(Failure):score_review(response,payload['questions'],VERSION)

    def test_existing_v24_request_keeps_original_questions_and_review_stage(self):
        self.search.return_value=[{**fixtures.SOURCE,'title':'회전교1 공식 설명'}]
        self.jev.side_effect=low_result
        first=self.start(key='pinned-old-native',value={**fixtures.INPUT,'workflow':'research-v2','reviewMode':MODE})
        scope=self.d.scope('shopshorts',fixtures.SUBJECT)
        with self.store.db() as db:
            data=json.loads(db.execute('SELECT data FROM requests WHERE id=?',(first['requestId'],)).fetchone()[0])
            data['rubricVersion']='discovery-v2.4'
            db.execute('UPDATE requests SET data=? WHERE id=?',(json.dumps(data),first['requestId']))
        second,_=self.finish_action(first,self.lead_output())
        review,_=self.finish_action(second,self.draft_output())
        self.assertEqual(review['rubricVersion'],'discovery-v2.4')
        task=self.jev.call_args.args[0]['questions']['support_expectedAnswer']['instructions']['task']
        self.assertNotIn('HYPOTHETICAL VIEWER PREDICTION',task)
        self.assertEqual(review['action']['stage'],'review')
        final,_=self.finish_action(review,valid_output(review))
        self.assertEqual(final['usage']['generationClaims'],3)
        self.assertEqual(final['candidates'][0]['decision'],'accepted')

    def test_opt_in_only_and_protocol_constraints(self):
        for value in ({**fixtures.INPUT,'reviewMode':MODE},{**fixtures.INPUT,'workflow':'research-v2','reviewMode':'invented'}):
            with self.assertRaises(Failure):validate_input(value)
        self.jev.side_effect=low_result
        _,_,review,_=self.review_stage()
        self.assertEqual(review['rubricVersion'],VERSION)
        self.assertEqual(review['action']['stage'],'review')
        self.assertEqual(review['usage']['generationClaims'],2)
        self.assertEqual(review['action']['runtime'],fixtures.INPUT['runtime'])
        self.assertEqual(RESEARCH_VERSION,'discovery-v2.2')
        self.assertEqual(self.d.research_version,RESEARCH_VERSION)

    def test_promotion_preserves_raw_checks_and_has_one_durable_review(self):
        self.jev.side_effect=low_result
        first,second,review,draft_body=self.review_stage()
        original=copy.deepcopy(review['candidates'][0]);out=valid_output(review)
        final,body=self.finish_action(review,out)
        c=final['candidates'][0]
        self.assertEqual(c['decision'],'accepted');self.assertEqual(c['jevDecision'],'held')
        self.assertEqual(c['checks'],original['checks'])
        for field in fixtures.SUPPORT_FIELDS:self.assertEqual(c[field],original[field])
        self.assertEqual(final['usage']['generationClaims'],3)
        self.assertEqual(final['usage']['jevCalls'],1)
        self.assertTrue(final['requiresHumanReview']);self.assertFalse(final['factChecked'])
        fresh=Discovery(self.store,self.search,self.jev)
        self.assertEqual(fresh.complete('shopshorts',fixtures.SUBJECT,final['requestId'],body),final)
        self.assertEqual(fresh.complete('shopshorts',fixtures.SUBJECT,final['requestId'],draft_body),review)
        self.assertEqual(self.jev.call_count,1)
        with self.assertRaises(Failure):self.store.claim(self.d.scope('shopshorts',fixtures.SUBJECT),final['requestId'],review['action']['id'])
        self.assertEqual(len(self.store.history(self.d.scope('shopshorts',fixtures.SUBJECT),'content')),1)

    def test_low_uncertainty_resolves_but_factual_reject_stays_held(self):
        for i,choice in enumerate(('uncertain','reject')):
            self.jev.side_effect=lambda p:low_result(p,choice)
            _,_,review,_=self.review_stage('nonpromotable-'+str(i),suffix=str(i))
            final,_=self.finish_action(review,valid_output(review))
            self.assertEqual(final['candidates'][0]['decision'],'accepted' if choice=='uncertain' else 'held')
            if choice=='reject':self.assertIn('jev_unresolved_preserved',final['candidates'][0]['reasonCodes'])

    def test_only_content_prediction_role_mismatch_can_resolve_low_reject(self):
        self.jev.side_effect=low_result
        _,_,review,_=self.review_stage()
        data=copy.deepcopy(review);c=data['candidates'][0]
        c['checks']['support_expectedAnswer']=copy.deepcopy(c['checks']['support_openingVisual'])
        c['checks']['support_expectedAnswer'].update(choice='reject',probabilities={'reject':.6})
        c['reasonCodes'].append('support_expectedAnswer_uncertain')
        out=valid_output(data)
        check=out['reviews'][0]['checks']['support_expectedAnswer']
        check.update(choice='not_applicable',issue='nonfactual',citations=[])
        self.assertEqual(apply_reviews(data,out)[0]['decision'],'accepted')
        # A cited factual assertion, business alternative or JEV semantic uncertainty
        # cannot use the narrow role correction to bypass factual evidence.
        check['citations']=valid_output(data)['reviews'][0]['checks']['support_expectedAnswer']['citations']
        self.assertEqual(apply_reviews(data,out)[0]['decision'],'held')
        check['citations']=[]
        data['input']['profile']='business'
        self.assertEqual(apply_reviews(data,out)[0]['decision'],'held')
        data['input']['profile']='content'
        c['checks']['support_expectedAnswer'].update(choice='uncertain',probabilities={'uncertain':.6})
        self.assertEqual(apply_reviews(data,out)[0]['decision'],'accepted')
        prompt=build_prompt(data,[])
        self.assertIn('hypothetical viewer prediction',prompt)
        self.assertIn('EXISTING real-world alternative',prompt)

    def test_adjudication_policy_is_pinned_and_never_overrides_unresolved_review(self):
        self.jev.side_effect=lambda p:low_result(p,'uncertain')
        _,_,review,_=self.review_stage()
        out=valid_output(review)
        for version in ('discovery-v2.4','discovery-v2.5'):
            old=copy.deepcopy(review);old['rubricVersion']=version
            self.assertEqual(apply_reviews(old,out)[0]['decision'],'held')
        self.assertEqual(apply_reviews(review,out)[0]['decision'],'accepted')
        check=out['reviews'][0]['checks']['support_openingVisual']
        check.update(choice='uncertain',issue='missing_evidence',citations=[])
        self.assertEqual(apply_reviews(review,out)[0]['decision'],'held')
        out=valid_output(review);check=out['reviews'][0]['checks']['support_openingVisual']
        check.update(choice='reject',issue='contradiction')
        self.assertEqual(apply_reviews(review,out)[0]['decision'],'rejected')
        data=copy.deepcopy(review);c=data['candidates'][0]
        c['checks']['value']=copy.deepcopy(c['checks']['support_openingVisual'])
        c['checks']['value'].update(choice='reject',probabilities={'reject':.6})
        c['reasonCodes']=['value_uncertain']
        self.assertEqual(apply_reviews(data,valid_output(data))[0]['decision'],'accepted')
        c['checks']['value'].update(confidence=.95,margin=.9,probabilities={'reject':.95})
        self.assertFalse(eligible(c))

    def test_confident_reject_uncertainty_errors_and_accepted_do_not_request_review(self):
        for i,(choice,confidence,decision) in enumerate((('reject',.95,'rejected'),('uncertain',.95,'held'),('pass',.95,'accepted'))):
            self.jev.side_effect=lambda p:low_result(p,choice,confidence)
            _,_,final,_=self.review_stage('no-extra-'+str(i))
            self.assertEqual(final['state'],'complete');self.assertIsNone(final['action'])
            self.assertEqual(final['candidates'][0]['decision'],decision)
            self.assertEqual(final['usage']['generationClaims'],2)
        self.jev.side_effect=RuntimeError('transport')
        _,_,final,_=self.review_stage('no-extra-error')
        self.assertEqual(final['state'],'complete');self.assertIsNone(final['action'])

    def test_guaranteed_profit_rejected_and_conflicting_evidence_held(self):
        self.jev.side_effect=lambda p:low_result(p,'uncertain',.52)
        _,_,review,_=self.review_stage()
        out=valid_output(review);check=out['reviews'][0]['checks']['support_whyItMatters']
        check.update(choice='reject',issue='unsupported_guarantee',citations=[])
        final,_=self.finish_action(review,out)
        self.assertEqual(final['candidates'][0]['decision'],'rejected')
        self.assertEqual(final['candidates'][0]['nativeReview']['checks']['support_whyItMatters']['issue'],'unsupported_guarantee')
        self.jev.side_effect=low_result
        _,_,review,_=self.review_stage('conflict-review')
        out=valid_output(review);c=out['reviews'][0]['checks']['support_location']
        cites=[{'evidenceId':e['id'],'quote':e['excerpt']} for e in review['evidence'] if e['id'] in review['candidates'][0]['evidenceIds']]
        c.update(choice='uncertain',issue='conflicting_sources',citations=cites)
        final,_=self.finish_action(review,out)
        self.assertEqual(final['candidates'][0]['decision'],'held')

    def test_row_isolation_and_quote_source_validation(self):
        self.jev.side_effect=low_result
        _,_,review,_=self.review_stage(n=2)
        out=valid_output(review)
        out['reviews'][0]['checks']['support_location']['citations'][0]['quote']='invented quote'
        final,_=self.finish_action(review,out)
        self.assertEqual([c['decision'] for c in final['candidates']],['held','accepted'])
        self.assertEqual(final['candidates'][0]['nativeReview']['reason'],'invalid_native_review_citation')
        self.assertEqual(self.jev.call_count,2)

    def test_malformed_missing_foreign_and_nonfactual_bypass_hold(self):
        self.jev.side_effect=low_result
        _,_,review,_=self.review_stage()
        for mutation in ('missing','duplicate','foreign','quote','required_nonfactual','business_alternative','unknown_issue','extra','no_citation'):
            data=copy.deepcopy(review);out=valid_output(data)
            check=out['reviews'][0]['checks']['support_entity']
            if mutation=='missing':out['reviews'][0]['checks'].pop('value')
            elif mutation=='duplicate':out['reviews']*=2
            elif mutation=='foreign':check['citations'][0]['evidenceId']='foreign-id'
            elif mutation=='quote':check['citations'][0]['quote']='wrong'
            elif mutation=='required_nonfactual':check.update(choice='not_applicable',issue='nonfactual',citations=[])
            elif mutation=='business_alternative':
                data['input']['profile']='business';out['reviews'][0]['checks']['support_expectedAnswer'].update(choice='not_applicable',issue='nonfactual',citations=[])
            elif mutation=='unknown_issue':check['issue']='autoapprove'
            elif mutation=='extra':out['reviews'][0]['secret']='unexpected'
            elif mutation=='no_citation':check['citations']=[]
            result=apply_reviews(data,out)
            self.assertEqual(result[0]['decision'],'held',mutation)

    def test_review_failure_preserves_already_accepted_siblings(self):
        count=0
        def review_fn(payload):
            nonlocal count
            count+=1
            return fixtures.pass_result(payload) if count==1 else low_result(payload)
        self.jev.side_effect=review_fn
        _,_,review,_=self.review_stage(n=2)
        self.assertEqual([c['decision'] for c in review['candidates']],['accepted','held'])
        final,_=self.finish_action(review,None,generationError=True)
        self.assertEqual(final['state'],'complete')
        self.assertEqual([c['decision'] for c in final['candidates']],['accepted','held'])

    def test_wrong_runtime_expiry_and_concurrent_claim_do_not_replay_review(self):
        self.jev.side_effect=low_result
        _,_,review,_=self.review_stage()
        scope=self.d.scope('shopshorts',fixtures.SUBJECT);rid=review['requestId'];action=review['action']['id']
        self.store.claim(scope,rid,action)
        with self.assertRaises(Failure):self.store.claim(scope,rid,action)
        with self.assertRaises(Failure):self.d.complete('shopshorts',fixtures.SUBJECT,rid,{'actionId':action,'runtime':{'provider':'claude','model':'other'},'output':valid_output(review)})
        with self.store.db() as db:db.execute('UPDATE requests SET expires=? WHERE id=?',(time.time()-1,rid))
        with self.assertRaises(Failure):self.d.complete('shopshorts',fixtures.SUBJECT,rid,{'actionId':action,'runtime':fixtures.INPUT['runtime'],'output':valid_output(review)})
        self.assertEqual(self.store.get(scope,rid)['reasonCodes'],['request_expired'])

    def test_identical_promoted_siblings_cannot_both_pass(self):
        self.jev.side_effect=low_result
        _,_,review,_=self.review_stage(n=2)
        data=copy.deepcopy(review);data['candidates'][1]['title']=data['candidates'][0]['title']
        result=apply_reviews(data,valid_output(data))
        self.assertEqual([c['decision'] for c in result],['accepted','rejected'])
        self.assertEqual(result[1]['reasonCodes'],['native_exact_duplicate_rejected'])

    def test_real_python_http_review_and_revoke_before_third_claim(self):
        from client import DiscoveryClient
        from server import make_server
        import threading
        self.search.return_value=[{**fixtures.SOURCE,'title':'회전교1 공식 설명'}]
        self.jev.side_effect=low_result
        server=make_server(('127.0.0.1',0),self.d,{'shopshorts':fixtures.KEY})
        thread=threading.Thread(target=server.serve_forever,daemon=True);thread.start()
        client=DiscoveryClient('http://127.0.0.1:'+str(server.server_port),fixtures.KEY,fixtures.SUBJECT,allow_localhost=True)
        input={**fixtures.INPUT,'workflow':'research-v2','reviewMode':MODE}
        calls=[];generation_tag='first'
        def generate(prompt):
            calls.append(prompt)
            if len(calls)==1:return self.lead_output()
            if len(calls)==2:
                output=self.draft_output();output['candidates'][0]['title']+=' '+generation_tag;return output
            context=json.loads(prompt.rsplit('\n',1)[1])
            return {'reviews':[{'candidateId':item['candidateId'],'checks':{name:{'choice':'pass','issue':'none','rationale':'HTTP fixture','citations':[{'evidenceId':item['evidence'][0]['id'],'quote':item['evidence'][0]['excerpt']}]} for name in item['requiredChecks']}} for item in context['items']]}
        connection=Mock()
        try:
            result=client.discover(input,idempotency_key='python-native',generate=generate,assert_connection=connection)
            self.assertEqual(result['candidates'][0]['decision'],'accepted');self.assertEqual(len(calls),3)
            self.assertEqual(connection.call_count,10)
            replay=client.discover(input,idempotency_key='python-native',generate=generate,assert_connection=connection)
            self.assertEqual(replay,result);self.assertEqual(len(calls),3)
            calls.clear();n=0;generation_tag='second'
            def revoked(runtime):
                nonlocal n
                n+=1
                if n==8:raise RuntimeError('revoked')
            with self.assertRaisesRegex(RuntimeError,'revoked'):
                client.discover(input,idempotency_key='python-revoked',generate=generate,assert_connection=revoked)
            self.assertEqual(len(calls),2)
            with self.store.db() as db:
                row=json.loads(db.execute("SELECT data FROM requests WHERE idem='python-revoked'").fetchone()[0])
            self.assertEqual(row['usage']['generationClaims'],2)
            self.assertEqual(row['action']['stage'],'review')
        finally:server.shutdown();server.server_close();thread.join()

    def test_prompt_full_text_evidence_and_bounded_input(self):
        self.jev.side_effect=low_result
        _,_,review,_=self.review_stage()
        prompt=review['action']['prompt'];self.assertIn(review['candidates'][0]['openingVisual'],prompt)
        self.assertIn('unsupported_guarantee',prompt);self.assertNotIn('confidence":',prompt)
        with self.assertRaises(ValueError):build_prompt(review,[{'title':'x'*350000}])

    def test_v27_uncertain_fact_needs_cited_pass_not_nonfactual_relabel(self):
        self.jev.side_effect=lambda p:low_result(p,'uncertain')
        _,_,review,_=self.review_stage()
        self.assertEqual(review['rubricVersion'],VERSION)
        self.assertEqual(VERSION,'discovery-v2.7')
        out=valid_output(review)
        out['reviews'][0]['checks']['support_openingVisual'].update(choice='not_applicable',issue='nonfactual',citations=[])
        final=apply_reviews(review,out)[0]
        self.assertEqual(final['decision'],'held')
        self.assertIn('jev_unresolved_preserved',final['reasonCodes'])
        old=copy.deepcopy(review);old['rubricVersion']='discovery-v2.6'
        self.assertEqual(apply_reviews(old,out)[0]['decision'],'accepted')
        self.assertEqual(apply_reviews(review,valid_output(review))[0]['decision'],'accepted')

    def test_v27_name_only_quotes_do_not_count_as_support(self):
        self.jev.side_effect=lambda p:low_result(p,'uncertain')
        _,_,review,_=self.review_stage()
        out=valid_output(review)
        out['reviews'][0]['checks']['support_answer']['citations'][0]['quote']='회전교1'
        final=apply_reviews(review,out)[0]
        self.assertEqual(final['decision'],'held')
        self.assertIn('invalid_native_review_citation',final['reasonCodes'])
        old=copy.deepcopy(review);old['rubricVersion']='discovery-v2.6'
        self.assertEqual(apply_reviews(old,out)[0]['decision'],'accepted')
        # A short fact (e.g. a city) is valid support; only the bare name is not.
        out['reviews'][0]['checks']['support_answer']['citations'][0]['quote']='상판이 회전'
        self.assertEqual(apply_reviews(review,out)[0]['decision'],'accepted')
        self.assertIn('not only the entity name',review['action']['prompt'])
        self.assertNotIn('not only the entity name',build_prompt(old,[]))

    def test_v27_business_value_reject_is_not_promoted(self):
        self.jev.side_effect=lambda p:low_result(p,'uncertain')
        _,_,review,_=self.review_stage()
        data=copy.deepcopy(review);c=data['candidates'][0]
        c['checks']['value']=copy.deepcopy(c['checks']['support_openingVisual'])
        c['checks']['value'].update(choice='reject',probabilities={'reject':.6})
        c['reasonCodes']=['value_uncertain']
        self.assertEqual(apply_reviews(data,valid_output(data))[0]['decision'],'accepted')
        data['input']['profile']='business'
        self.assertEqual(apply_reviews(data,valid_output(data))[0]['decision'],'held')

    def test_v27_draft_prompt_omits_unlocated_leads_instead_of_writing_unknown(self):
        from service import grounded_prompt
        self.jev.side_effect=low_result
        _,second,_,_=self.review_stage()
        draft=second['action']['prompt']
        self.assertNotIn('precise location is not established',draft)
        self.assertIn('omit that lead',draft)
        legacy=grounded_prompt(second['input'],second['evidence'],[],[],'discovery-v2.6')
        self.assertIn('precise location is not established',legacy)

if __name__=='__main__':unittest.main()
