"""One-shot, quota-aware finalization of the approved Gateshead video. No credential retry loop."""
import argparse,datetime,json,os,plistlib,subprocess,time
from pathlib import Path
p=argparse.ArgumentParser();p.add_argument('--work',type=Path,required=True);p.add_argument('--out',type=Path,required=True);p.add_argument('--plan',action='store_true');a=p.parse_args()
here=Path(__file__).resolve().parent;root=a.work.resolve();node='/Users/admin/.nvm/versions/node/v20.19.3/bin/node';plan=root/'visual-timeline.json'
beats=json.loads(plan.read_text())['beats'];wanted=[b['id'] for b in beats]
last=json.loads((root/'credential-failure.json').read_text()) if (root/'credential-failure.json').exists() else {}
now=datetime.datetime.now(datetime.timezone.utc);resume=now
if last.get('cloudflareError')=='1027':
 failed=datetime.datetime.fromisoformat(last['time'].replace('Z','+00:00'))
 resume=max(now,(failed+datetime.timedelta(days=1)).replace(hour=0,minute=0,second=5,microsecond=0))
if a.plan:
 print(json.dumps({'resumeUTC':resume.isoformat(),'renderShots':wanted,'output':str(a.out),'credentialAttempts':1}));raise SystemExit()
def status(state,**info):
 data={'state':state,'at':datetime.datetime.now(datetime.timezone.utc).isoformat(),**info};(root/'finish-status.json').write_text(json.dumps(data,ensure_ascii=False,indent=2));print(json.dumps(data,ensure_ascii=False),flush=True)
try:
 status('waiting_for_daily_reset',resumeUTC=resume.isoformat())
 while datetime.datetime.now(datetime.timezone.utc)<resume:time.sleep(min(30,max(.1,(resume-datetime.datetime.now(datetime.timezone.utc)).total_seconds())))
 env={**os.environ,**plistlib.loads(Path('/Users/admin/Library/LaunchAgents/com.cak.studio-production.plist').read_bytes()).get('EnvironmentVariables',{})}
 env.update(TMPDIR=str(root/'tmp'),TMP=str(root/'tmp'),TEMP=str(root/'tmp'));env['PATH']='/Users/admin/.nvm/versions/node/v20.19.3/bin:/opt/homebrew/bin:'+env['PATH']
 status('generating_voice')
 with (root/'voice.log').open('a') as log:subprocess.run([node,str(here/'produce.mjs'),'--action','voice','--work',str(root)],env=env,cwd=here,stdout=log,stderr=subprocess.STDOUT,check=True)
 status('waiting_for_render');deadline=time.monotonic()+4*3600;observed=[]
 while True:
  manifest=root/'render/render-manifest.json'
  try:done=[x['id'] for x in json.loads(manifest.read_text())['shots']]
  except (FileNotFoundError,json.JSONDecodeError):done=[]
  if done!=observed:status('waiting_for_render',completed=done);observed=done
  if all(x in done for x in wanted):break
  if time.monotonic()>deadline:raise TimeoutError('Render incomplete after 4 hours')
  time.sleep(20)
 status('composing')
 with (root/'compose.log').open('w') as log:subprocess.run([node,str(here/'produce.mjs'),'--action','compose','--work',str(root),'--out',str(a.out)],env=env,cwd=here,stdout=log,stderr=subprocess.STDOUT,check=True)
 probe=json.loads(subprocess.check_output(['ffprobe','-v','error','-show_streams','-show_format','-of','json',str(a.out)],env=env,text=True));v=next(s for s in probe['streams'] if s['codec_type']=='video');audio=next(s for s in probe['streams'] if s['codec_type']=='audio')
 timeline=json.loads((root/'timeline.json').read_text());expected=sum(b['duration'] for b in timeline['beats']);actual=float(probe['format']['duration'])
 assert v['width']==1080 and v['height']==1920 and abs(actual-expected)<.15
 assert all(b['alignment']['coverage']>=.8 for b in timeline['beats'])
 check=subprocess.run(['ffmpeg','-v','error','-i',str(a.out),'-f','null','-'],env=env,capture_output=True,text=True);assert check.returncode==0,check.stderr
 loud=subprocess.run(['ffmpeg','-hide_banner','-i',str(a.out),'-vn','-af','volumedetect','-f','null','-'],env=env,capture_output=True,text=True)
 (root/'delivery-audio-check.log').write_text(loud.stderr);assert 'max_volume: -inf' not in loud.stderr
 for name,t in [('start',1),('middle',actual/2),('closing',max(0,actual-1))]:subprocess.run(['ffmpeg','-v','error','-y','-ss',str(t),'-i',str(a.out),'-frames:v','1',str(root/(name+'-final.png'))],env=env,check=True)
 (root/'delivery-check.json').write_text(json.dumps({'file':str(a.out),'duration':actual,'expected':expected,'video':[v['width'],v['height'],v['codec_name']],'audioCodec':audio['codec_name'],'decodePassed':True,'minimumAlignmentCoverage':min(b['alignment']['coverage'] for b in timeline['beats']),'humanVisualReview':'pending'},indent=2))
 status('file_ready_review_pending',file=str(a.out),duration=actual)
except Exception as e:
 status('failed',errorType=type(e).__name__,error=str(e));raise
