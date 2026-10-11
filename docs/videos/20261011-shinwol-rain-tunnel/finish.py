"""Bounded-disk assembly, Kyle speech timing and the approved modern typography."""
import argparse,subprocess,json,math,re,hashlib
from pathlib import Path
import numpy as np
from PIL import Image,ImageDraw,ImageFont
P=argparse.ArgumentParser();P.add_argument('mode',choices=['prepare','align','sheet','assemble','verify']);P.add_argument('--cache',type=Path,required=True);A=P.parse_args();C=A.cache;HERE=Path(__file__).parent;W,H,FPS,SR=1080,1920,24,48000
F=Path('/Users/admin/Downloads/vedio/shinwol-rain-tunnel-short.mp4');FONT=Path('/Users/admin/Downloads/vedio/drama/fonts/Pretendard-SemiBold.otf');STORY=json.loads((HERE/'story.json').read_text())
def run(args):
 p=subprocess.run([str(x)for x in args],capture_output=True)
 if p.returncode:raise RuntimeError(p.stderr.decode(errors='replace')[-1600:])
 return p.stdout
def probe(p):return json.loads(run(['ffprobe','-v','error','-show_streams','-show_format','-of','json',p]))
def pcm(p):return np.frombuffer(run(['ffmpeg','-v','error','-i',p,'-ac','1','-ar',SR,'-f','f32le','-']),dtype='<f4').copy()
def save_audio(p,x):subprocess.run(['ffmpeg','-v','error','-y','-f','f32le','-ar',str(SR),'-ac','1','-i','pipe:0','-c:a','pcm_s16le',str(p)],input=x.astype('<f4').tobytes(),check=True)
if A.mode=='prepare':
 shots=[];captions=[];lines=[];now=0;waves=[]
 for s in STORY['scenes']:
  x=pcm(C/'voice'/f"{s['id']}.mp3");window=240;energy=np.sqrt(np.mean(x[:len(x)//window*window].reshape(-1,window)**2,axis=1));active=np.flatnonzero(energy>.0025)
  if not len(active):raise ValueError('Silent source '+s['id'])
  lo=max(0,int(active[0]*window)-3840);hi=min(len(x),int((active[-1]+1)*window)+5760);x=x[lo:hi];x*=min(2,.12/max(.001,np.sqrt(np.mean(x*x))));x=np.clip(x,-.85,.85)
  lead=.16;tail=.75 if s['id']=='payoff' else .18;duration=math.ceil((lead+len(x)/SR+tail)*FPS)/FPS;frames=round(duration*FPS);waves.append((round((now+lead)*SR),x))
  lines.append({'id':s['id'],'text':s['narration'],'start':now+lead,'end':now+lead+len(x)/SR,'trimStart':lo/SR,'duration':len(x)/SR});shots.append({'id':s['id'],'start':now,'duration':duration,'frames':frames})
  # Semantic phrases are kept intact; punctuation separators remain within the narration.
  pieces=[p.strip() for p in re.findall(r'[^.!?]+[.!?]*',s['narration'])if p.strip()];chunks=[]
  for p in pieces:
   if len(p)>38 and ', 'in p:chunks.extend([z.strip()+(','if i<len(p.split(', '))-1 else '')for i,z in enumerate(p.split(', '))])
   else:chunks.append(p)
  weights=[len(p.replace(' ',''))for p in chunks];used=0
  for p,w in zip(chunks,weights):captions.append({'text':p,'start':now+lead+used/sum(weights)*len(x)/SR,'end':now+lead+(used+w)/sum(weights)*len(x)/SR});used+=w
  now+=duration
 N=round(now*SR);voice=np.zeros(N,dtype=np.float32)
 for i,x in waves:voice[i:i+len(x)]+=x
 # Original restrained rain/flow ambience; narration remains dominant. No stock music.
 rng=np.random.default_rng(440);noise=rng.normal(0,1,N).astype(np.float32);noise=np.convolve(noise,np.ones(32)/32,mode='same').astype(np.float32);t=np.arange(N)/SR;env=np.minimum(1,t)*np.minimum(1,(now-t)/1.0);amb=noise*.014*env
 save_audio(C/'dialogue-reference.wav',voice);save_audio(C/'mix.wav',voice+amb)
 run(['ffmpeg','-v','error','-y','-i',C/'mix.wav','-af','loudnorm=I=-16:TP=-1.5:LRA=9','-ar',SR,'-ac','2',C/'audio.wav'])
 TL={'fps':FPS,'duration':now,'frames':round(now*FPS),'shots':shots,'captions':captions,'dialogues':lines,'voice':STORY['voice'],'voiceSpeed':1.1,'higgsfieldCredits':0,'opening':'user-approved all-Blender'};(C/'timeline.json').write_text(json.dumps(TL,ensure_ascii=False,indent=2));print(json.dumps({'duration':now,'shots':len(shots),'captions':len(captions)}));raise SystemExit()
TL=json.loads((C/'timeline.json').read_text())
if A.mode=='align':
 import whisper,torch,difflib
 torch.set_num_threads(4);model=whisper.load_model('small',download_root='/Users/admin/.cache/whisper');report=[];aligned=[]
 norm=lambda x:re.sub(r'[^가-힣A-Za-z0-9]','',x)
 for line in TL['dialogues']:
  result=model.transcribe(str(C/'voice'/f"{line['id']}.mp3"),language='ko',fp16=False,verbose=False,word_timestamps=True)
  chars=[];times=[]
  for seg in result['segments']:
   for word in seg.get('words',[]):
    letters=norm(word['word']);n=len(letters)
    for i,c in enumerate(letters):chars.append(c);times.append((word['start']+(word['end']-word['start'])*i/max(n,1),word['start']+(word['end']-word['start'])*(i+1)/max(n,1)))
  src=norm(line['text']);rec=''.join(chars);mapping={}
  for block in difflib.SequenceMatcher(None,src,rec,autojunk=False).get_matching_blocks():
   for i in range(block.size):mapping[block.a+i]=block.b+i
  coverage=len(mapping)/len(src);assert coverage>=.80,(line['id'],coverage)
  caps=[c for c in TL['captions']if line['start']-.01<=c['start']<line['end']];offset=0
  for cap in caps:
   text=norm(cap['text']);indices=[mapping[i]for i in range(offset,offset+len(text))if i in mapping];assert indices
   start=max(line['start'],line['start']+times[min(indices)][0]-line['trimStart']-.035)
   end=min(line['end']+.08,line['start']+times[max(indices)][1]-line['trimStart']+.06)
   assert end>start;aligned.append({'text':cap['text'],'start':start,'end':end});offset+=len(text)
  assert offset==len(src);report.append({'id':line['id'],'alignmentCoverage':coverage,'recognized':result['text']})
 for i in range(len(aligned)-1):aligned[i]['end']=min(aligned[i]['end'],aligned[i+1]['start'])
 TL['captions']=aligned;TL['captionTiming']='local Whisper word timestamps aligned to unchanged reviewed text';(C/'timeline.json').write_text(json.dumps(TL,ensure_ascii=False,indent=2));(C/'qa/caption-alignment.json').write_text(json.dumps(report,ensure_ascii=False,indent=2));print(json.dumps(report,ensure_ascii=False));raise SystemExit()
def font(sz):return ImageFont.truetype(str(FONT),sz)
def overlay(t):
 im=Image.new('RGBA',(W,H));d=ImageDraw.Draw(im)
 if t<3.5:
  for y in range(620):d.line((0,y,W,y),fill=(5,11,18,max(0,int(172*(1-y/620)))))
  d.rounded_rectangle((69,156,75,365),radius=3,fill=(127,237,218,255))
  for i,line in enumerate(STORY['header']):
   sz=88
   while font(sz).getlength(line)>868:sz-=2
   d.text((105,174+i*110),line,font=font(sz),fill='white'if i==0 else(146,240,218,255))
 c=next((x for x in TL['captions']if x['start']<=t<x['end']),None)
 if c:
  text=c['text'];words=text.split();chosen=None
  for sz in range(62,47,-1):
   f=font(sz)
   if f.getlength(text)<=880:chosen=[text];break
   pairs=[[' '.join(words[:i]),' '.join(words[i:])]for i in range(1,len(words))];pairs=[p for p in pairs if max(f.getlength(z)for z in p)<=880]
   if pairs:chosen=min(pairs,key=lambda p:abs(f.getlength(p[0])-f.getlength(p[1])));break
  if not chosen:raise ValueError('Caption needs semantic split: '+text)
  width=max(f.getlength(z)for z in chosen);height=len(chosen)*(sz+16)+25;top=H*.74-height/2
  d.rounded_rectangle(((W-width)/2-28,top,(W+width)/2+28,top+height),radius=20,fill=(12,20,27,222))
  for i,z in enumerate(chosen):d.text((W/2,top+12+i*(sz+16)),z,font=f,fill='white',anchor='mt')
 d.text((58,1775),'원리 재구성 · 신월 빗물터널',font=font(25),fill=(222,234,233,230),stroke_width=1,stroke_fill=(20,31,35,170))
 return im
if A.mode=='sheet':
 sheets=[]
 for s in TL['shots']:
  p=C/'qa'/f"{s['id']}.png"
  if not p.exists():continue
  t=s['start']+s['duration']*.48;im=Image.open(p).convert('RGBA').resize((W,H));im.alpha_composite(overlay(t));im.convert('RGB').resize((270,480)).save(C/'qa'/f"{s['id']}-caption.jpg",quality=90);sheets.append((s['id'],im.convert('RGB').resize((270,480))))
 sheet=Image.new('RGB',(270*4,515*math.ceil(len(sheets)/4)),(16,25,31));d=ImageDraw.Draw(sheet)
 for i,(name,im)in enumerate(sheets):x=i%4*270;y=i//4*515;sheet.paste(im,(x,y));d.text((x+8,y+483),name,font=font(21),fill='white')
 sheet.save(C/'qa/contact.jpg',quality=90);print(C/'qa/contact.jpg');raise SystemExit()
if A.mode=='assemble':
 manifest=json.loads((C/'clips/render-manifest.json').read_text());digest=hashlib.sha256((HERE/'scene.py').read_bytes()).hexdigest()
 for s in TL['shots']:
  p=C/'clips'/f"{s['id']}.mp4";m=manifest[s['id']];assert m['sourceHash']==digest and m['frames']==s['frames']and m['percent']==100 and m['sha256']==hashlib.sha256(p.read_bytes()).hexdigest()
 listing=''.join("file '"+str(C/'clips'/f"{s['id']}.mp4").replace("'","'\\''")+"'\n"for s in TL['shots']);(C/'clips/list.txt').write_text(listing)
 decoder=subprocess.Popen(['ffmpeg','-v','error','-f','concat','-safe','0','-i',str(C/'clips/list.txt'),'-f','rawvideo','-pix_fmt','rgb24','-'],stdout=subprocess.PIPE)
 encoder=subprocess.Popen(['ffmpeg','-v','error','-y','-f','rawvideo','-pixel_format','rgb24','-video_size','1080x1920','-framerate','24','-i','pipe:0','-i',str(C/'audio.wav'),'-map','0:v:0','-map','1:a:0','-c:v','libx264','-preset','fast','-crf','18','-pix_fmt','yuv420p','-c:a','aac','-b:a','192k','-ar','48000','-ac','2','-disposition:a:0','default','-metadata:s:a:0','language=kor','-movflags','+faststart','-t',str(TL['duration']),str(F)],stdin=subprocess.PIPE)
 cache={}
 try:
  for i in range(TL['frames']):
   raw=decoder.stdout.read(W*H*3)
   if len(raw)!=W*H*3:raise ValueError('Frame shortage '+str(i))
   t=i/FPS;idx=next((j for j,x in enumerate(TL['captions'])if x['start']<=t<x['end']),-1);key=(idx,t<3.5)
   if key not in cache:cache={key:overlay(t)}
   im=Image.frombytes('RGB',(W,H),raw).convert('RGBA');im.alpha_composite(cache[key]);encoder.stdin.write(im.convert('RGB').tobytes())
   if i%240==0:print('ASSEMBLE',i,TL['frames'],flush=True)
  encoder.stdin.close();assert encoder.wait()==0;decoder.stdout.close();assert decoder.wait()==0
 except BaseException:
  decoder.kill();encoder.kill();decoder.wait();encoder.wait();raise
 print('FINAL',F);raise SystemExit()
if A.mode=='verify':
 meta=probe(F);v=next(x for x in meta['streams']if x['codec_type']=='video');au=next(x for x in meta['streams']if x['codec_type']=='audio');assert(v['width'],v['height'])==(W,H);assert abs(float(meta['format']['duration'])-TL['duration'])<.1;assert int(v['nb_frames'])==TL['frames'];run(['ffmpeg','-v','error','-i',F,'-f','null','-'])
 x=pcm(F);ref=pcm(C/'audio.wav');n=min(len(x),len(ref));corr=float(np.corrcoef(x[:n],ref[:n])[0,1]);assert corr>.99
 checks=[]
 for l in TL['dialogues']:
  seg=x[round(l['start']*SR):round(l['end']*SR)];rms=float(np.sqrt(np.mean(seg*seg)));assert rms>.015;checks.append({'id':l['id'],'rms':rms,'seconds':l['duration']})
 # Check every exact caption can be laid out; frame QA is distinct from this mechanical check.
 for c in TL['captions']:overlay((c['start']+c['end'])/2)
 black=subprocess.run(['ffmpeg','-hide_banner','-i',str(F),'-vf','blackdetect=d=0.25:pix_th=0.10','-an','-f','null','-'],capture_output=True,text=True);events=[z for z in black.stderr.splitlines()if 'black_start:'in z];assert not events
 result={'file':str(F),'sha256':hashlib.sha256(F.read_bytes()).hexdigest(),'bytes':F.stat().st_size,'duration':TL['duration'],'frames':TL['frames'],'width':W,'height':H,'fps':FPS,'audio':au['codec_name'],'selectedVoice':STORY['voice'],'voiceSpeed':1.1,'audioCorrelation':corr,'dialogueChecks':checks,'captionCount':len(TL['captions']),'decodePassed':True,'blackEvents':events,'higgsfieldCredits':0,'visualQA':'See contact sheet and final-frame reviews; not a physical fluid simulation'};(C/'qa/verification.json').write_text(json.dumps(result,ensure_ascii=False,indent=2));print(json.dumps(result,ensure_ascii=False))
