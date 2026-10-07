"""Reuse existing media, add one causal bridge, finish actual 3D shots without truncation."""
import argparse,math,json,subprocess,hashlib,shutil,wave,re,os
from pathlib import Path
import numpy as np
from PIL import Image,ImageDraw,ImageFont
P=argparse.ArgumentParser();P.add_argument('mode',choices=['plan','assemble','verify','preview','clips']);P.add_argument('--cache',type=Path,required=True);a=P.parse_args();C=a.cache;V=C/'v2';FPS=24;W,H,SR=1080,1920,44100
os.environ['TMPDIR']=str(V/'tmp')
S=json.loads((Path(__file__).parent/'story.json').read_text());OUT=Path('/Users/admin/Downloads/vedio/elbphilharmonie-webtoon-3d-v2.mp4')
fonts={n:ImageFont.truetype(str(C/'fonts/Pretendard-SemiBold.otf'),n)for n in [24,28,32,36,46,50,54]}
def run(args):
 r=subprocess.run([str(x)for x in args],capture_output=True)
 if r.returncode:raise RuntimeError(r.stderr.decode(errors='replace')[-1800:])
 return r.stdout

def probe(f):return json.loads(run(['ffprobe','-v','error','-show_streams','-show_format','-of','json',f]))
def wrap(s,size=54,width=950):
 lines=['']
 for w in s.split():
  t=(lines[-1]+' '+w).strip()
  if fonts[size].getlength(t)>width and lines[-1]:lines.append(w)
  else:lines[-1]=t
 if len(lines)>2:raise ValueError('Too many caption lines: '+s)
 return lines

def plan():
 old=json.loads((C/'timeline.json').read_text());extra=next(b for b in S['scenes']if b['id']=='transmission');src=V/'voice/transmission.mp3';meta=json.loads(src.with_suffix('.mp3.json').read_text());assert meta['text']==extra['narration'] and meta['voiceId']==S['voiceId']
 y=np.frombuffer(run(['ffmpeg','-v','error','-i',src,'-af',f'atempo={S["speed"]}','-ar',SR,'-ac','1','-f','f32le','-']),dtype='<f4');dur=math.ceil((len(y)/SR+.28)*FPS)/FPS
 insert=next(b['start'] for b in old['beats']if b['id']=='separate');tl=json.loads(json.dumps(old));tl['duration']+=dur;tl['frames']+=round(dur*FPS)
 for b in tl['beats']:
  if b['start']>=insert:b['start']+=dur
 tl['beats'].insert(2,{**extra,'text':extra['narration'],'start':insert,'duration':dur,'speechDuration':len(y)/SR})
 for cap in tl['captions']:
  if cap['start']>=insert:cap['start']+=dur;cap['end']+=dur
 tl['captions'].append({'start':insert,'end':insert+len(y)/SR,'text':extra['narration']});tl['captions'].sort(key=lambda c:c['start'])
 # Rebalance dangling one-word caption tails, retaining exact spoken coverage.
 for i in range(1,len(tl['captions'])):
  cur=tl['captions'][i];prev=tl['captions'][i-1]
  if len(cur['text'])<8 and not prev['text'].endswith(('.', '?','!')):
   words=prev['text'].split();moved=words[-3:];new=' '.join(moved+[cur['text']]);ratio=len(' '.join(moved))/len(prev['text']);split=prev['end']-(prev['end']-prev['start'])*ratio
   prev['text']=' '.join(words[:-3]);prev['end']=split;cur['text']=new;cur['start']=split
 for cap in tl['captions']:wrap(cap['text'])
 chunks=[]
 for b in tl['beats']:
  src=V/'voice/transmission.mp3' if b['id']=='transmission' else C/'voice'/(b['id']+'.mp3')
  raw=np.frombuffer(run(['ffmpeg','-v','error','-i',src,'-af',f'atempo={S["speed"]}','-ar',SR,'-ac','1','-f','f32le','-']),dtype='<f4').copy();target=round(b['duration']*SR);assert target>=len(raw);chunks.append(np.pad(raw,(0,target-len(raw))))
 audio=np.concatenate(chunks);t=np.arange(len(audio))/SR;bed=np.zeros_like(audio)
 for start in np.arange(0,tl['duration'],1.75):
  idx=int(start*SR);n=min(int(1.4*SR),len(audio)-idx);u=np.arange(n)/SR;freq=[220,329.63,293.66,246.94][int(start/1.75)%4];bed[idx:idx+n]+=(.006*np.sin(2*np.pi*freq*u)+.003*np.sin(4*np.pi*freq*u))*np.exp(-u*5)
 audio=audio*.9+bed;audio*=min(1,.92/max(abs(audio)));audio*=np.minimum(1,np.minimum(t/.1,(tl['duration']-t)/.7))
 with wave.open(str(V/'audio-raw.wav'),'wb')as f:f.setnchannels(1);f.setsampwidth(2);f.setframerate(SR);f.writeframes((np.clip(audio,-1,1)*32767).astype('<i2').tobytes())
 run(['ffmpeg','-y','-v','error','-i',V/'audio-raw.wav','-af','loudnorm=I=-16:TP=-1.5:LRA=9','-ar',SR,V/'audio.wav']);tl['bridgeDuration']=dur
 (V/'timeline.json').write_text(json.dumps(tl,ensure_ascii=False,indent=2));print('PLAN',tl['duration'],tl['frames'],'bridge',dur,flush=True)

def load():return json.loads((V/'timeline.json').read_text())
def shots():return json.loads((V/'shots.json').read_text())
def check_clips():
 result=[]
 for b in shots():
  f=V/'clips'/(b['id']+'.mp4')
  if not f.exists():result.append({'id':b['id'],'valid':False,'reason':'missing'});continue
  try:
   p=probe(f);v=next(s for s in p['streams']if s['codec_type']=='video');ok=int(v.get('nb_frames',0))==b['frames'] and v['width']==W and v['height']==H
  except Exception:ok=False
  result.append({'id':b['id'],'valid':ok,'expectedFrames':b['frames']})
 return result

SHADE=Image.new('RGBA',(W,H));dd=ImageDraw.Draw(SHADE)
for y in range(H):dd.line((0,y,W,y),fill=(5,14,21,int(120*max(0,1-y/430)+185*max(0,(y-1450)/470))))
def text(d,s,xy,size=54,fill='#fff5e5',anchor='mm'):d.text(xy,s,font=fonts[size],anchor=anchor,fill=fill,stroke_width=2 if size>=46 else 1,stroke_fill='#101b24')
def overlay(im,t,tl,shot):
 im=Image.alpha_composite(im.convert('RGBA'),SHADE);d=ImageDraw.Draw(im)
 text(d,'ELBPHILHARMONIE',(60,135),24,'#e6c99b','lm');text(d,'웹툰형 3D 재현',(1020,135),24,'#e6c99b','rm')
 titles={'hook':'공연장이 스프링 위에?','approach':'소음은 구조를 타고도 옵니다','transmission':'벽의 진동이, 실내 소음으로','cutaway':'건물 안의 독립된 공연장','spring_detail':'스프링 묶음 362개','comparison':'같은 진동, 다른 전달','rigid':'단단한 받침은 함께 움직이고','spring_action':'스프링은 사이에서 변형됩니다','mass':'무거운 방은 덜 따라 움직입니다','isolation':'무게와 진동 특성에 맞춘 설계','air':'공기음에는 이중 벽도 필요합니다','interior':'작은 연주에 집중할 수 있게','closing':'음악에 끼어드는 흔들림을 줄이기','ending':'그래서, 스프링 위의 공연장'}
 text(d,titles.get(shot,''),(540,275),50)
 if shot in ['comparison','mass']:
  text(d,'단단한 연결',(255,580),32,'#c4d1d9');text(d,'스프링 지지',(815,690),32,'#f4cc8d')
 if shot=='transmission':text(d,'벽 → 실내 공기 → 관객',(540,1420),36,'#a3dbe5')
 text(d,'설명용 단면 · 실제 배치/축척 아님 · 움직임 과장·감속',(540,1525),24,'#c5cecb')
 cap=next((x for x in tl['captions']if x['start']<=t<x['end']),None)
 if cap:
  lines=wrap(cap['text'])
  for i,line in enumerate(lines):text(d,line,(540,1630+i*70),54)
 if tl['duration']-t<.6:im=Image.blend(Image.new('RGBA',(W,H),'#08121a'),im,max(0,(tl['duration']-t)/.6))
 return im.convert('RGB')

def sources(tl):
 sh=shots();segments=[{'id':'hook','startFrame':0,'endFrame':144,'file':C/'opening.mp4'}]
 first=min(x['startFrame']for x in sh);segments.append({'id':'hook','startFrame':144,'endFrame':first,'image':C/'art/hero.png'})
 for b in sh:segments.append({**b,'file':V/'clips'/(b['id']+'.mp4')})
 # Fill the human payoff with the preserved interior art; return to the established building.
 segments.sort(key=lambda x:x['startFrame']);filled=[];cursor=0
 for b in segments:
  if b['startFrame']>cursor:filled.append({'id':'interior','startFrame':cursor,'endFrame':b['startFrame'],'image':C/'art/interior.png'})
  assert b['startFrame']==cursor or b['startFrame']>cursor
  filled.append(b);cursor=b['endFrame']
 if cursor<tl['frames']:filled.append({'id':'ending','startFrame':cursor,'endFrame':tl['frames'],'image':C/'art/hero.png'})
 assert sum(b['endFrame']-b['startFrame']for b in filled)==tl['frames'];return filled

def assemble():
 tl=load();checks=check_clips();assert all(x['valid']for x in checks),checks
 # Revalidate exact current draft and quoted evidence, not just a cached boolean.
 validator=Path(__file__).resolve().parents[3]/'apps/shopshorts/lib/explanation-depth.js'
 review_code="""import {readFile} from 'node:fs/promises';import {pathToFileURL} from 'node:url';const {validateDepthReview}=await import(pathToFileURL(process.argv[1]));const story=JSON.parse(await readFile(process.argv[2]));const review=JSON.parse(await readFile(process.argv[3]));if(!(await validateDepthReview(review,story.brief,story)).passed)process.exit(1);"""
 run(['node','--input-type=module','-e',review_code,validator,Path(__file__).parent/'story.json',V/'review.json'])
 part=V/'final.partial.mp4';log=open(V/'logs/assemble.log','wb');enc=subprocess.Popen(['ffmpeg','-y','-v','error','-f','rawvideo','-pix_fmt','rgb24','-s',f'{W}x{H}','-r',str(FPS),'-i','-','-i',str(V/'audio.wav'),'-map','0:v','-map','1:a','-c:v','libx264','-preset','fast','-crf','18','-threads','4','-pix_fmt','yuv420p','-c:a','aac','-b:a','192k','-t',str(tl['duration']),'-movflags','+faststart',str(part)],stdin=subprocess.PIPE,stderr=log);dec=None
 try:
  for seg in sources(tl):
   n=seg['endFrame']-seg['startFrame'];still=None
   if 'file'in seg:dec=subprocess.Popen(['ffmpeg','-v','error','-i',str(seg['file']),'-vf',f'scale={W}:{H}:force_original_aspect_ratio=increase,crop={W}:{H},fps={FPS}','-frames:v',str(n),'-f','rawvideo','-pix_fmt','rgb24','-'],stdout=subprocess.PIPE,stderr=subprocess.DEVNULL)
   else:still=Image.open(seg['image']).convert('RGB').resize((W,H),Image.Resampling.LANCZOS)
   for k in range(n):
    if dec:
     raw=dec.stdout.read(W*H*3);assert len(raw)==W*H*3,'Truncated clip '+seg['id'];im=Image.frombytes('RGB',(W,H),raw)
    else:
     # Restrained camera crop for the brief visual closure, not a substitute for body animation.
     q=k/max(n-1,1);inset=int(12*q);im=still.crop((inset,inset,W-inset,H-inset)).resize((W,H),Image.Resampling.BICUBIC) if inset else still
    t=(seg['startFrame']+k)/FPS;enc.stdin.write(overlay(im,t,tl,seg['id']).tobytes())
   if dec:assert dec.wait()==0;dec=None
   print('ASSEMBLED',seg['id'],n,flush=True)
  enc.stdin.close();assert enc.wait()==0;log.close();shutil.copy2(part,OUT);part.unlink();print('FINAL',OUT,flush=True)
 except BaseException:
  enc.kill();enc.wait()
  if dec:dec.kill();dec.wait()
  raise

def verify():
 tl=load();pr=probe(OUT);v=next(s for s in pr['streams']if s['codec_type']=='video');au=next(s for s in pr['streams']if s['codec_type']=='audio');assert (v['width'],v['height'])==(W,H) and int(v['nb_frames'])==tl['frames'];assert abs(float(au['duration'])-tl['duration'])<.1
 run(['ffmpeg','-v','error','-xerror','-i',OUT,'-f','null','-'])
 text_expected=''.join(b['narration']for b in S['scenes']);text_actual=''.join(x['text']for x in tl['captions']);assert re.sub(r'\s','',text_expected)==re.sub(r'\s','',text_actual)
 last=tl['beats'][-1];tail=tl['duration']-last['start']-last['speechDuration'];assert tail>2.7
 r=subprocess.run(['ffmpeg','-hide_banner','-i',str(OUT),'-af','volumedetect,silencedetect=noise=-45dB:d=1.5','-vf','blackdetect=d=.5:pix_th=.05','-f','null','-'],capture_output=True);assert r.returncode==0;(V/'logs/av-analysis.log').write_bytes(r.stderr)
 times=[1]+[(x['startFrame']+x['endFrame'])/FPS/2 for x in shots()]+[tl['duration']-1.1];sheet=Image.new('RGB',(1080,math.ceil(len(times)/4)*480),'#111c25')
 for i,t in enumerate(times):
  f=V/'qa'/f'final-{i}.jpg';run(['ffmpeg','-y','-v','error','-ss',t,'-i',OUT,'-frames:v','1','-vf','scale=270:480',f]);sheet.paste(Image.open(f),((i%4)*270,(i//4)*480))
 sheet.save(V/'qa/final-review.jpg',quality=92)
 result={'final':str(OUT),'duration':tl['duration'],'frames':tl['frames'],'resolution':[W,H],'fps':FPS,'bytes':OUT.stat().st_size,'sha256':hashlib.sha256(OUT.read_bytes()).hexdigest(),'checks':{'decode':True,'audioVideoDuration':True,'completeNarrationCaptionCoverage':True,'endingHoldSeconds':tail,'clipFrames':check_clips()},'paidMedia':{'higgsfieldNewCalls':0,'ttsNewSentences':1},'reusedVoiceClips':6,'voiceId':S['voiceId'],'speed':S['speed'],'limitations':['Illustrative geometric reconstruction, not construction drawings or acoustic simulation.','Actual visual inspection and independent speech check recorded separately.']}
 (V/'verification.json').write_text(json.dumps(result,ensure_ascii=False,indent=2));print(json.dumps(result,ensure_ascii=False))

if a.mode=='plan':plan()
elif a.mode=='clips':print(json.dumps(check_clips()))
elif a.mode=='assemble':assemble()
elif a.mode=='verify':verify()
else:
 tl=load();sheet=Image.new('RGB',(1080,math.ceil(len(shots())/4)*480),'#111c25')
 for i,b in enumerate(shots()):
  f=V/'qa'/(b['id']+'.png')
  if f.exists():
   im=overlay(Image.open(f).convert('RGB').resize((W,H)),(b['startFrame']+b['endFrame'])/FPS/2,tl,b['id']);im.thumbnail((270,480));sheet.paste(im,((i%4)*270,(i//4)*480))
 sheet.save(V/'qa/overlay-preview.jpg')
