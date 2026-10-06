import sys,json,urllib.request,urllib.error,time,datetime,signal
sys.path.insert(0,'/opt/shared-ai/repo/services/ai-gateway')
from gateway import read_env,ROOT
master=read_env(ROOT/'.env')['LITELLM_MASTER_KEY']
base='http://127.0.0.1:4100'
def api(path,token,body=None,timeout=12):
 req=urllib.request.Request(base+path,headers={'Authorization':'Bearer '+token,'Content-Type':'application/json'},data=None if body is None else json.dumps(body).encode())
 with urllib.request.urlopen(req,timeout=timeout) as res:return res.status,json.load(res)
def emit(x):print(json.dumps(x),flush=True)
def alarm(*args):raise TimeoutError('session_timeout')
signal.signal(signal.SIGALRM,alarm);signal.alarm(240)
key=None;count=0;last=0
alias='minidrama-jev-dialogue-'+str(int(time.time()))
policy={'models':['jev-1.13.0'],'allowed_routes':['/typesafe/v1/systemone'],'duration':'1h','max_budget':0.01,'budget_duration':'1d','rpm_limit':10}
try:
 _,issued=api('/key/generate',master,{'key_alias':alias,**policy});key=issued['key']
 emit({'event':'ready','alias':alias,'policy':policy,'maxRequests':1,'startedUtc':datetime.datetime.now(datetime.timezone.utc).isoformat()})
 for line in sys.stdin:
  body=json.loads(line)
  if count>=1 or body.get('model')!='jev-1.13.0':raise ValueError('request_guard')
  time.sleep(max(0,6.2-(time.monotonic()-last)));last=time.monotonic();count+=1;t=time.monotonic()
  try:
   status,response=api('/typesafe/v1/systemone',key,body)
   emit({'event':'response','status':status,'elapsedMs':round((time.monotonic()-t)*1000),'body':{k:response.get(k) for k in ['model','answers','usage']}})
  except urllib.error.HTTPError as e:
   emit({'event':'response','status':e.code,'elapsedMs':round((time.monotonic()-t)*1000),'body':{}});break
  except Exception as e:
   emit({'event':'response','status':502,'error':type(e).__name__,'body':{}});break
except Exception as e:emit({'event':'failure','error':type(e).__name__})
finally:
 signal.alarm(0)
 out={'event':'cleanup','alias':alias,'requests':count,'revoked':False}
 if key:
  try:
   _,listed=api('/key/list?return_full_object=true',master)
   rows=listed.get('keys',[]) if isinstance(listed,dict) else listed
   match=next((r for r in rows if isinstance(r,dict) and r.get('key_alias')==alias),None)
   if match:out['policyAndSpend']={k:match.get(k) for k in ['models','allowed_routes','spend','max_budget','budget_duration','rpm_limit','expires']}
  except Exception as e:out['spendReadError']=type(e).__name__
  try:api('/key/delete',master,{'keys':[key]});out['revoked']=True
  except Exception as e:out['revokeError']=type(e).__name__
  try:out['afterRevokeStatus']=api('/v1/models',key)[0]
  except urllib.error.HTTPError as e:out['afterRevokeStatus']=e.code
  except Exception as e:out['afterRevokeError']=type(e).__name__
 out['finishedUtc']=datetime.datetime.now(datetime.timezone.utc).isoformat();emit(out)
