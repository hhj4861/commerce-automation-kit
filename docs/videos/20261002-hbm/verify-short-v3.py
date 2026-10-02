"""Playback, sentence edit boundaries, captions, and independently transcribed ending."""
import sys
sys.dont_write_bytecode=True
import argparse,subprocess,json,re,hashlib,math,os
from pathlib import Path
p=argparse.ArgumentParser();p.add_argument('--cache',type=Path,required=True);p.add_argument('--model-dir',type=Path);p.add_argument('--font',type=Path);p.add_argument('--asr',action='store_true');a=p.parse_args();c=a.cache/'short-v3';m=json.loads((c/'project.json').read_text());video=Path(m['path'])
def digest(p):
 with p.open('rb')as f:return hashlib.file_digest(f,'sha256').hexdigest()
if a.asr:
 os.environ['NUMBA_CACHE_DIR']=str(c/'numba-cache')
 import torch,whisper
 torch.set_num_threads(4);model=whisper.load_model('small',device='cpu',download_root=str(a.model_dir))
 result=model.transcribe(str(video),language='ko',fp16=False,temperature=0,word_timestamps=True)
 (c/'independent-asr.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n');print(result['text'],flush=True);sys.exit(0)
from PIL import Image,ImageDraw,ImageFont
media=json.loads(subprocess.check_output(['ffprobe','-v','error','-show_streams','-of','json',str(video)]));v=next(x for x in media['streams']if x['codec_type']=='video');au=next(x for x in media['streams']if x['codec_type']=='audio');d=float(v['duration']);assert(v['width'],v['height'],v['avg_frame_rate'])==(1080,1920,'24/1');assert abs(d-float(au['duration']))<.05;assert abs(d-m['duration'])<.05
log=subprocess.run(['ffmpeg','-hide_banner','-i',str(video),'-vf','blackdetect=d=0.3:pix_th=0.1:pic_th=0.98','-af','silencedetect=noise=-40dB:d=1.3,ebur128=peak=true','-f','null','-'],capture_output=True,text=True,check=True).stderr;(c/'playback.log').write_text(log);assert 'black_start:'not in log and 'silence_start:'not in log
qa=c/'qa';qa.mkdir(exist_ok=True);frames=[];count=0
for n,s in enumerate(m['segments']):
 for key,at in [('startPause',s['sourceStart']),('endPause',s['sourceEnd'])]:
  if s[key]:assert s[key][0]<=at<=s[key][1]
 assert s['narration'][-1]in'.!?'
 for text in Path(s['caption']).read_text().splitlines():
  if not text.startswith('Dialogue:'):continue
  fields=text.split(',',9);st,en=[sum(float(x)*u for x,u in zip(t.split(':'),[3600,60,1]))for t in fields[1:3]];assert 0<=st<en<=s['duration']+.011
  content=fields[9]
  if r'\p1'in content:continue
  pos=re.search(r'\\pos\((\d+),(\d+)\)',content);size=re.search(r'\\fs(\d+)',content);size=int(size[1])if size else(24 if fields[3]=='Note'else 62);plain=re.sub(r'\{[^}]*\}','',content);font=ImageFont.truetype(str(a.font),size);width=max(font.getlength(t)for t in plain.split(r'\N'));bound=980 if not pos else min(int(pos[1])*2,(1080-int(pos[1]))*2)-8;assert width<=bound,(s['id'],plain,width,bound)
  if fields[3]=='Caption'and not pos:count+=1
 for fraction in [.15,.55,.92]:
  sec=s['start']+s['duration']*fraction;f=qa/f'{n}-{fraction}.jpg';subprocess.run(['ffmpeg','-v','error','-y','-ss',str(sec),'-i',str(video),'-frames:v','1','-q:v','3',str(f)],check=True);frames.append((f,f"{s['id']} {sec:.2f}s"))
last=m['segments'][-1];assert last['narration'].endswith('함께 가는 겁니다.')and last['tail']>=1
f=qa/'last-frame.jpg';subprocess.run(['ffmpeg','-v','error','-y','-sseof','-0.1','-i',str(video),'-frames:v','1',str(f)],check=True);frames.append((f,'final 0.1s'))
for k in range(0,len(frames),9):
 group=frames[k:k+9];sheet=Image.new('RGB',(972,math.ceil(len(group)/3)*608),(20,24,30));draw=ImageDraw.Draw(sheet)
 for j,(f,title)in enumerate(group):
  im=Image.open(f);im.thumbnail((324,576));x=j%3*324;y=j//3*608;sheet.paste(im,(x,y));draw.text((x+5,y+578),title,font=ImageFont.truetype(str(a.font),19),fill='white')
 sheet.save(qa/f'sheet-{k//9}.jpg',quality=92)
preserved=[]
for item in json.loads((Path(__file__).parent/'revision-v2.json').read_text())['outputs']:
 assert digest(Path(item['path']))==item['sha256'];preserved.append({'path':item['path'],'sha256':item['sha256']})
report={'revision':3,'path':str(video),'duration':d,'resolution':[1080,1920],'fps':24,'voiceId':m['voiceId'],'speed':1.0,'newPaidGenerations':0,'fullDecode':'passed','audioVideoDurationDifference':abs(d-float(au['duration'])),'blackOver0_3s':False,'silenceOver1_3s':False,'sentenceBoundaryCuts':'measured silence midpoints','lastNarration':last['narration'],'finalHoldSeconds':last['tail'],'captionCount':count,'captionLayout':'passed','sampleFrames':len(frames),'preservedV2':preserved,'sha256':digest(video),'visualReview':'pending','independentAsr':'pending'}
asr_path=c/'independent-asr.json'
if asr_path.exists():
 asr=json.loads(asr_path.read_text());normalize=lambda t:re.sub(r'[^가-힣a-z0-9]','',t.lower());assert normalize(asr['text']).endswith(normalize(last['narration']))
 observed=asr['segments'][-1]['end'];assert d-observed>=.7
 report['independentAsr']={'model':'Whisper small local','lastSentenceComplete':True,'nextSentenceLeak':False,'lastSpeechEnd':observed,'timeAfterLastRecognizedWord':d-observed,'transcript':asr['text']}
(c/'verification.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n');print(json.dumps(report,ensure_ascii=False),flush=True)
