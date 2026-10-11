"""Dialogue, original Foley and modern typography; bounded-disk video composition."""
import argparse,json,subprocess,math,hashlib,io,re,shutil
from pathlib import Path
import numpy as np
from PIL import Image,ImageDraw,ImageFont
P=argparse.ArgumentParser();P.add_argument('mode',choices=['prepare','assemble','verify','sheet']);P.add_argument('--cache',type=Path,required=True);A=P.parse_args();C=A.cache;HERE=Path(__file__).parent;W,H,FPS,SR=1080,1920,24,48000
FONT=Path('/Users/admin/Downloads/vedio/drama/fonts/Pretendard-SemiBold.otf');F=Path('/Users/admin/Downloads/vedio/crime-thriller-ep1.mp4')
def run(args):
 p=subprocess.run([str(x)for x in args],capture_output=True)
 if p.returncode:raise RuntimeError(p.stderr.decode(errors='replace')[-2000:])
 return p.stdout
def probe(f):return json.loads(run(['ffprobe','-v','error','-show_streams','-show_format','-of','json',f]))
def font(n):return ImageFont.truetype(str(FONT),n)
def save_pcm(p,x):
 subprocess.run(['ffmpeg','-v','error','-y','-f','f32le','-ar',str(SR),'-ac',str(x.shape[1] if x.ndim>1 else 1),'-i','pipe:0','-c:a','pcm_s16le',str(p)],input=x.astype('<f4').tobytes(),check=True)
def pcm(p,filter=None):
 args=['ffmpeg','-v','error','-i',p];args+=['-af',filter]if filter else[]
 return np.frombuffer(run(args+['-ac','1','-ar',SR,'-f','f32le','-']),dtype='<f4').copy()
def art():
 (C/'art').mkdir(exist_ok=True)
 im=Image.new('RGB',(1024,640),(211,220,215));d=ImageDraw.Draw(im);d.rectangle((0,0,1024,112),fill=(30,55,60));d.text((58,26),'신분 확인',font=font(54),fill='white');d.text((730,42),'드라마 소품',font=font(30),fill=(195,207,207))
 d.rounded_rectangle((50,154,318,548),radius=12,fill=(121,134,136));d.ellipse((123,211,254,363),fill=(69,80,83));d.rounded_rectangle((74,345,296,548),radius=83,fill=(55,71,77));d.text((390,220),'김도현',font=font(80),fill=(27,40,42));d.text((392,354),'2187',font=font(83),fill=(34,54,57));d.line((390,465,944,465),fill=(130,150,149),width=3);d.text((392,501),'가상 인물 · 재현용',font=font(31),fill=(85,104,105));im.save(C/'art/id.png')
 for mode in ['call','record','sent']:
  im=Image.new('RGB',(540,1080),(14,26,33));d=ImageDraw.Draw(im);d.text((42,38),'23:17',font=font(28),fill=(185,210,214))
  if mode=='call':
   d.text((270,185),'112',font=font(92),fill='white',anchor='mt');d.text((270,327),'통화 중',font=font(43),fill=(102,226,204),anchor='mt');d.text((270,407),'00:08',font=font(31),fill=(172,193,197),anchor='mt')
   for x in [128,270,410]:d.ellipse((x-34,598,x+34,666),fill=(45,61,70))
   d.ellipse((211,849,329,967),fill=(185,61,67));d.text((270,885),'종료',font=font(29),fill='white',anchor='mt')
  elif mode=='record':
   d.text((270,171),'증거 사진',font=font(56),fill='white',anchor='mt');mini=Image.open(C/'art/id.png').resize((460,288));im.paste(mini,(40,354));d.text((270,722),'전송 중…',font=font(45),fill=(117,222,202),anchor='mt')
  else:
   d.ellipse((178,254,362,438),outline=(116,233,205),width=7);d.line((223,344,260,380,325,310),fill=(130,246,217),width=13);d.text((270,510),'전송 완료',font=font(52),fill='white',anchor='mt');d.text((270,608),'사진 1장',font=font(38),fill=(140,180,184),anchor='mt')
  im.save(C/f'art/phone-{mode}.png')
if A.mode=='prepare':
 art();story=json.loads((HERE/'story.json').read_text());lines=json.loads((C/'lines.json').read_text());shots=[];caps=[];dialogues=[];now=0
 for scene in story['scenes']:
  sid=scene['id'];items=[l for l in lines if l['scene']==sid];local=1.18 if sid=='knock'else .65
  for l in items:
   filters='highpass=f=110,lowpass=f=3400'if l['speaker']=='문밖 남자'else 'highpass=f=290,lowpass=f=3400'if l['speaker']=='상담원'else 'highpass=f=85'
   x=pcm(C/f"voice/{l['id']}.mp3",filters);window=240;energy=np.sqrt(np.mean(x[:len(x)//window*window].reshape(-1,window)**2,axis=1));active=np.flatnonzero(energy>.003)
   if not len(active):raise ValueError('Silent dialogue '+l['id'])
   lo=max(0,int(active[0]*window)-2400);hi=min(len(x),int((active[-1]+1)*window)+4800);x=x[lo:hi];rms=np.sqrt(np.mean(x*x));x*=.12/max(rms,.0001);x=np.clip(x,-.80,.80)
   length=len(x)/SR;line={**l,'start':round(now+local,4),'end':round(now+local+length,4),'trimStart':lo/SR,'duration':length};dialogues.append(line);save_pcm(C/f"voice/{l['id']}.wav",x)
   phrases=[z for z in re.findall(r'[^.!?…]+[.!?…]*',l['text'])if z.strip()];weights=[len(z)for z in phrases];used=0
   for phrase,w in zip(phrases,weights):
    caps.append({'text':phrase.strip(),'speaker':l['speaker'],'start':now+local+used/sum(weights)*length,'end':now+local+(used+w)/sum(weights)*length});used+=w
   local+=length+.45
  duration=max(scene['duration'],math.ceil((local+.65)*FPS)/FPS);frames=round(duration*FPS);shots.append({'id':sid,'start':now,'duration':frames/FPS,'frames':frames});now+=frames/FPS
 TL={'fps':FPS,'duration':now,'frames':round(now*FPS),'shots':shots,'dialogues':dialogues,'captions':caps,'voiceRate':1.0,'higgsfieldCredits':0,'openingOverride':'User explicitly approved all-Blender on2026-10-11'};(C/'timeline.json').write_text(json.dumps(TL,ensure_ascii=False,indent=2))
 # Original deterministic Foley and sparse underscore; no stock downloads.
 rng=np.random.default_rng(1103);N=round(now*SR);dry=np.zeros(N,dtype=np.float32);bed=np.zeros(N,dtype=np.float32)
 def add(at,x,gain=1):
  off=round(at*SR);n=min(len(x),N-off)
  if n>0:bed[off:off+n]+=x[:n]*gain
 def knock(at):
  t=np.arange(int(.38*SR))/SR;x=(np.sin(2*np.pi*83*t)+.45*np.sin(2*np.pi*177*t))*np.exp(-t*20);x+=rng.normal(0,.2,len(t))*np.exp(-t*65);add(at,x,.12)
 def metal(at,g=.04):
  t=np.arange(int(.7*SR))/SR;x=sum(np.sin(2*np.pi*f*t)*np.exp(-t*k)for f,k in [(1750,12),(2710,18),(3990,25)]);add(at,x,g)
 def scrape(at,dur):
  x=rng.normal(0,1,int(dur*SR));x=np.convolve(x,np.ones(12)/12,mode='same');t=np.arange(len(x))/SR;add(at,x*np.sin(np.pi*t/dur)**2*.07)
 starts={s['id']:s['start']for s in shots}
 for at in [.16,.46,.81]:knock(at)
 metal(4.8,.018);scrape(starts['identity']+3,1.7);metal(starts['pressure']+1,.03);knock(starts['pressure']+1.45)
 scrape(starts['brace']+.8,3.0)
 for at in [.5,1.1,3.5,5.8,8.4]:metal(starts['key']+at,.025)
 metal(starts['turn']+.2,.026);metal(starts['turn']+1.8,.045);scrape(starts['turn']+2.5,.8);metal(starts['turn']+3.55,.07)
 t=np.arange(N)/SR;fade=np.minimum(1,t/2)*np.minimum(1,(now-t)/1.5);bed+=(np.sin(2*np.pi*55*t)+.35*np.sin(2*np.pi*82.41*t))*fade*.006
 for l in dialogues:
  x=pcm(C/f"voice/{l['id']}.wav");i=round(l['start']*SR);dry[i:i+len(x)]+=x[:N-i];lo=max(0,i-1200);hi=min(N,i+len(x)+4800);bed[lo:hi]*=.45
 mix=np.stack([dry+bed,dry+bed*.96],axis=1);peak=np.max(abs(mix));mix*=min(1,.89/peak);save_pcm(C/'audio.wav',mix);save_pcm(C/'dialogue-reference.wav',dry)
 print(json.dumps({'duration':now,'shots':len(shots),'dialogues':len(dialogues),'captionCount':len(caps),'peak':float(np.max(abs(mix)))},ensure_ascii=False));raise SystemExit()
TL=json.loads((C/'timeline.json').read_text())
def typography(caption=None,header=False,end=False):
 im=Image.new('RGBA',(W,H));d=ImageDraw.Draw(im)
 if header:
  for y in range(620):d.line((0,y,W,y),fill=(5,11,18,max(0,int(160*(1-y/620)))))
  d.rounded_rectangle((76,161,82,357),radius=3,fill=(126,238,216,255));d.text((113,174),'문을 열어도',font=font(88),fill='white');d.text((113,280),'될까?',font=font(88),fill=(148,245,226,255))
 if caption:
  text=caption['text'];words=text.split();chosen=None
  for sz in range(62,47,-1):
   f=font(sz)
   if f.getlength(text)<=860:chosen=[text];break
   pairs=[[' '.join(words[:i]),' '.join(words[i:])]for i in range(1,len(words))];pairs=[q for q in pairs if max(f.getlength(z)for z in q)<=860]
   if pairs:chosen=min(pairs,key=lambda q:abs(f.getlength(q[0])-f.getlength(q[1])));break
  if not chosen:raise ValueError('Caption needs semantic split: '+text)
  width=max(f.getlength(z)for z in chosen);height=len(chosen)*(sz+15)+70;top=H*.74-height/2
  d.rounded_rectangle(((W-width)/2-32,top,(W+width)/2+32,top+height),radius=20,fill=(13,22,29,222));d.text(((W-width)/2,top+12),{'상담원':'112 상담원'}.get(caption['speaker'],caption['speaker']),font=font(26),fill=(158,229,215,255))
  for i,z in enumerate(chosen):d.text((W/2,top+50+i*(sz+15)),z,font=f,fill='white',anchor='mt')
 if end:
  d.rounded_rectangle((128,1510,952,1650),radius=20,fill=(8,15,20,228));d.text((W/2,1530),'문밖의 형사 · 1화',font=font(54),anchor='mt',fill='white');d.text((W/2,1603),'계속',font=font(28),anchor='mt',fill=(143,223,205))
 return im
if A.mode=='assemble':
 manifests=json.loads((C/'clips/render-manifest.json').read_text());digest=hashlib.sha256((HERE/'scene.py').read_bytes()).hexdigest()
 for s in TL['shots']:
  p=C/f"clips/{s['id']}.mp4";m=manifests[s['id']];assert m['sourceHash']==digest and m['frames']==s['frames'] and m['sha256']==hashlib.sha256(p.read_bytes()).hexdigest();v=probe(p)['streams'][0];assert(v['width'],v['height'])==(W,H)
 listing=''.join("file '"+str(C/f"clips/{s['id']}.mp4").replace("'","'\\''")+"'\n"for s in TL['shots']);(C/'clips/list.txt').write_text(listing)
 # One decoded frame and one graphics state in memory; no giant RGBA movie/cache.
 decoder=subprocess.Popen(['ffmpeg','-v','error','-f','concat','-safe','0','-i',str(C/'clips/list.txt'),'-f','rawvideo','-pix_fmt','rgb24','-'],stdout=subprocess.PIPE)
 encoder=subprocess.Popen(['ffmpeg','-v','error','-y','-f','rawvideo','-pixel_format','rgb24','-video_size','1080x1920','-framerate','24','-i','pipe:0','-i',str(C/'audio.wav'),'-map','0:v:0','-map','1:a:0','-c:v','libx264','-preset','fast','-crf','18','-pix_fmt','yuv420p','-c:a','aac','-b:a','192k','-ar','48000','-ac','2','-disposition:a:0','default','-metadata:s:a:0','language=kor','-movflags','+faststart','-t',str(TL['duration']),str(F)],stdin=subprocess.PIPE)
 overlays={}
 try:
  for n in range(TL['frames']):
   t=n/FPS;data=decoder.stdout.read(W*H*3);assert len(data)==W*H*3
   ci=next((i for i,c in enumerate(TL['captions'])if c['start']<=t<c['end']),None);state=(ci,t<3.5,t>TL['duration']-1.6)
   if state not in overlays:
    overlays.clear();overlays[state]=typography(TL['captions'][ci]if ci is not None else None,state[1],state[2])
   base=Image.frombytes('RGB',(W,H),data).convert('RGBA');base.alpha_composite(overlays[state]);encoder.stdin.write(base.convert('RGB').tobytes())
  encoder.stdin.close();assert encoder.wait()==0;assert decoder.wait()==0
 finally:
  for p in [decoder,encoder]:
   if p.poll()is None:p.kill();p.wait()
 print('FINAL',F);raise SystemExit()
if A.mode=='sheet':
 sheet=Image.new('RGB',(270*4,480*2))
 for i,s in enumerate(TL['shots']):
  path=C/f"qa/final-{s['id']}.jpg";run(['ffmpeg','-v','error','-y','-ss',s['start']+s['duration']*.55,'-i',F,'-frames:v','1','-vf','scale=270:480',path]);sheet.paste(Image.open(path),((i%4)*270,(i//4)*480))
 sheet.save(C/'qa/final-contact.jpg');print(C/'qa/final-contact.jpg');raise SystemExit()
q=probe(F);v=next(z for z in q['streams']if z['codec_type']=='video');a=next(z for z in q['streams']if z['codec_type']=='audio');assert(v['width'],v['height'],int(v['nb_frames']))==(W,H,TL['frames']);assert a['codec_name']=='aac'and a['channels']==2
run(['ffmpeg','-v','error','-i',F,'-f','null','-']);ref=pcm(C/'audio.wav');out=pcm(F);n=min(len(ref),len(out));cor=float(np.corrcoef(ref[:n],out[:n])[0,1]);assert cor>.97
levels=[]
for l in TL['dialogues']:
 x=out[round(l['start']*SR):round(l['end']*SR)];rms=float(np.sqrt(np.mean(x*x)));assert rms>.035;levels.append({'id':l['id'],'speaker':l['speaker'],'rms':rms,'duration':l['duration']})
checks=[]
for i,c in enumerate(TL['captions']):
 t=(c['start']+c['end'])/2;raw=run(['ffmpeg','-v','error','-ss',t,'-i',F,'-frames:v','1','-f','image2pipe','-vcodec','png','-']);im=np.array(Image.open(io.BytesIO(raw)).convert('RGB'));expected=np.array(typography(c));mask=(expected[:,:,:3].min(axis=2)>245)&(expected[:,:,3]==255);ratio=float((im[mask].min(axis=1)>180).mean());assert ratio>.80,(i,ratio);checks.append({'caption':i,'glyphMatch':ratio})
result={'file':str(F),'sha256':hashlib.sha256(F.read_bytes()).hexdigest(),'duration':float(v['duration']),'frames':int(v['nb_frames']),'dimensions':[W,H],'fullDecode':'pass','audioCorrelation':cor,'dialogues':levels,'captions':checks,'higgsfieldCredits':0,'voiceRate':1.0,'renderManifest':json.loads((C/'clips/render-manifest.json').read_text()),'visualReview':'pending','note':'Original fictional all-Blender first-person thriller, explicitly approved opening exception. Not lip-sync animation.'};(C/'qa/verification.json').write_text(json.dumps(result,ensure_ascii=False,indent=2));print(json.dumps({'duration':result['duration'],'correlation':cor,'captions':len(checks),'sha256':result['sha256']}))
