"""Original webtoon motion reconstruction. Streaming frames, no PNG frame cache.
The aqueduct is a simplified structural diagram, not a surveyed engineering model.
"""
import argparse,json,math,os,subprocess,hashlib,shutil,wave,re
from pathlib import Path
import numpy as np
from PIL import Image,ImageDraw,ImageFont,ImageEnhance,ImageFilter
P=argparse.ArgumentParser();P.add_argument('mode',choices=['align','plan','preview','draft-preview','render','verify']);P.add_argument('--cache',type=Path,required=True);A=P.parse_args();C=A.cache
for d in ['tmp','logs','alignment','fonts','qa']: (C/d).mkdir(parents=True,exist_ok=True)
os.environ['TMPDIR']=str(C/'tmp');os.environ['NUMBA_CACHE_DIR']=str(C/'tmp/numba')
S=json.loads((Path(__file__).parent/'story.json').read_text());S['beats']=[{**s,'text':s['narration']} for s in S['scenes']];W,H,FPS,SR=1080,1920,24,44100
FONT=C/'fonts/Pretendard-SemiBold.otf'
if not FONT.exists():shutil.copy2(C.parent/'20261005-jewel-webtoon/fonts/Pretendard-SemiBold.otf',FONT)
FINAL=Path('/Users/admin/Downloads/vedio/veluwemeer-webtoon-short.mp4')
def run(args,log=None):
 r=subprocess.run([str(x) for x in args],capture_output=True)
 if log:(C/'logs'/log).write_bytes(r.stderr)
 if r.returncode:raise RuntimeError(r.stderr.decode(errors='replace')[-1600:])
 return r.stdout

def probe(f):return json.loads(run(['ffprobe','-v','error','-show_streams','-show_format','-of','json',f]))
def voice(b):return C/'voice'/(b['id']+'.mp3')
def align():
 import whisper,torch
 from whisper.timing import find_alignment
 from whisper.tokenizer import get_tokenizer
 torch.set_num_threads(4)
 model=whisper.load_model('base',device='cpu',download_root=str(C.parent/'20261001-glass-substrate/models'))
 tok=get_tokenizer(model.is_multilingual,language='ko',task='transcribe')
 for b in S['beats']:
  dest=C/'alignment'/(b['id']+'.json')
  if dest.exists():continue
  a=whisper.load_audio(str(voice(b)));mel=whisper.log_mel_spectrogram(whisper.pad_or_trim(a),n_mels=model.dims.n_mels)
  words=find_alignment(model,tok,tok.encode(b['text']),mel,len(a)//160)
  dest.write_text(json.dumps({'text':b['text'],'duration':len(a)/16000,'words':[{'text':w.word,'start':float(w.start),'end':float(w.end)} for w in words]},ensure_ascii=False,indent=2));print('ALIGNED',b['id'],round(len(a)/16000,2),flush=True)

def plan():
 t=0;beats=[];captions=[];audio=[]
 for b in S['beats']:
  al=json.loads((C/'alignment'/(b['id']+'.json')).read_text());assert al['text']==b['text']
  a=np.frombuffer(run(['ffmpeg','-v','error','-i',voice(b),'-af',f'atempo={S["speed"]}','-ar',SR,'-ac','1','-f','f32le','-']),dtype='<f4').copy()
  frames=math.ceil((len(a)/SR+.10+(0.30 if b['id']=='payoff' else 0))*FPS)
  dur=frames/FPS;beats.append({**b,'start':t,'duration':dur,'speechDuration':len(a)/SR})
  audio.append(np.pad(a,(0,round(dur*SR)-len(a))))
  groups=[];g=[]
  for w in al['words']:
   if g and len(''.join(x['text'] for x in g)+w['text'])>30:groups.append(g);g=[]
   g.append(w)
   if re.search(r'[.!?,]$',w['text'].strip()) and len(''.join(x['text']for x in g))>=10:groups.append(g);g=[]
  if g:groups.append(g)
  if len(groups)>1 and len(''.join(w['text'] for w in groups[-1]).strip())<8:
   groups[-2].extend(groups.pop())
  for i,g in enumerate(groups):
   start=g[0]['start']/S['speed'];end=min(len(a)/SR,g[-1]['end']/S['speed']+.07)
   if i+1<len(groups):end=min(end,groups[i+1][0]['start']/S['speed'])
   captions.append({'start':t+start,'end':t+max(start+.1,end),'text':''.join(x['text']for x in g).strip()})
  t+=dur
 if not 30<=t<=60:raise RuntimeError(f'Actual duration {t:.2f}s outside short guard. Revise content, do not pad.')
 y=np.concatenate(audio);ts=np.arange(len(y))/SR
 # Original restrained two-note pluck bed, with narration strongly foregrounded.
 bed=np.zeros_like(y)
 for start in np.arange(0,t,1.75):
  idx=int(start*SR);n=min(int(1.4*SR),len(y)-idx);u=np.arange(n)/SR;freq=[220,329.63,293.66,246.94][int(start/1.75)%4]
  bed[idx:idx+n]+=(.006*np.sin(2*np.pi*freq*u)+.003*np.sin(4*np.pi*freq*u))*np.exp(-u*5)
 y=y*.9+bed;y*=min(1,.92/max(abs(y)));fade=np.minimum(1,np.minimum(ts/.1,(t-ts)/.22));y*=fade
 with wave.open(str(C/'audio.wav'),'wb') as f:f.setnchannels(1);f.setsampwidth(2);f.setframerate(SR);f.writeframes((np.clip(y,-1,1)*32767).astype('<i2').tobytes())
 run(['ffmpeg','-y','-v','error','-i',C/'audio.wav','-af','loudnorm=I=-16:TP=-1.5:LRA=9','-ar',SR,C/'audio-normalized.wav'],'audio-normalize.log')
 (C/'audio-normalized.wav').replace(C/'audio.wav')
 result={'duration':t,'frames':round(t*FPS),'speed':S['speed'],'voiceId':S['voiceId'],'beats':beats,'captions':captions}
 (C/'timeline.json').write_text(json.dumps(result,ensure_ascii=False,indent=2));print(json.dumps({'duration':t,'captions':len(captions),'beats':[(b['id'],round(b['start'],2),round(b['duration'],2))for b in beats]}))


FONTS={n:ImageFont.truetype(str(FONT),n) for n in [24,28,30,34,40,46,50,58,64,70,78]}
BG=None;TL=None;SHADE=None
def setup():
 global BG,TL,SHADE
 BG=Image.open(C/'art/hero.png').convert('RGB').resize((W,H),Image.Resampling.LANCZOS)
 if A.mode=='draft-preview':
  start=0;beats=[]
  for b in S['beats']:
   beats.append({**b,'start':start});start+=b['duration']
  TL={'duration':start,'beats':beats,'captions':[]}
 else:TL=json.loads((C/'timeline.json').read_text())
 SHADE=Image.new('RGBA',(W,H));d=ImageDraw.Draw(SHADE)
 for y in range(H):d.line((0,y,W,y),fill=(11,23,29,int(145*max(0,1-y/640)+215*max(0,(y-1450)/470))))
def clamp(x):return max(0,min(1,x))
def ease(x):x=clamp(x);return x*x*(3-2*x)
def txt(d,s,xy,size=46,fill='#fff6e8',anchor='mm',stroke=0):d.text(xy,s,font=FONTS[size],fill=fill,anchor=anchor,stroke_width=stroke,stroke_fill='#17252a')
def poly(d,pts,fill,outline='#263e47',width=3):
 d.polygon(pts,fill=fill);d.line(pts+[pts[0]],fill=outline,width=width,joint='curve')
def arrow(d,a,b,fill='#f5ba60',width=7):
 d.line((a,b),fill=fill,width=width);ang=math.atan2(b[1]-a[1],b[0]-a[0]);L=19
 d.polygon([b,(b[0]-L*math.cos(ang-.55),b[1]-L*math.sin(ang-.55)),(b[0]-L*math.cos(ang+.55),b[1]-L*math.sin(ang+.55))],fill=fill)
def iso(x,y,z=0):return (540+(x-y)*.60,1090+(x+y)*.33-z)
def face(d,points,fill,outline='#263e47',width=3):poly(d,[iso(*p)for p in points],fill,outline,width)
def box(d,x0,y0,x1,y1,z0,z1,top='#e1cda9',front='#a88f70',side='#c8b58e'):
 face(d,[(x0,y1,z0),(x1,y1,z0),(x1,y1,z1),(x0,y1,z1)],front)
 face(d,[(x1,y0,z0),(x1,y1,z0),(x1,y1,z1),(x1,y0,z1)],side)
 face(d,[(x0,y0,z1),(x1,y0,z1),(x1,y1,z1),(x0,y1,z1)],top)
def boat(d,y,t=0):
 # Small recreational craft following the waterway Y axis.
 z=303+math.sin(t*2)*2
 face(d,[(-36,y-72,z),(36,y-72,z),(42,y+35,z),(0,y+85,z),(-42,y+35,z)],'#f4e8cf','#354c58',4)
 box(d,-22,y-38,22,y+16,z,z+26,'#ffdfa2','#ab9b83','#bccaca')
 face(d,[(-22,y-15,z+27),(22,y-15,z+27),(22,y+12,z+27),(-22,y+12,z+27)],'#326477')
 for off in [-60,-45]:d.line([iso(-47,y+off,z-1),iso(-65,y+off-25,z-1)],fill='#b5e7e5',width=3)
def car(d,x,y=-70):
 box(d,x-48,y-23,x+48,y+23,7,29,'#e5a757','#85562f','#b87137')
 box(d,x-21,y-20,x+22,y+20,29,51,'#ffe1a5','#46727b','#547c88')
 for a in [-29,31]:
  for b in [-25,25]:
   cx,cy=iso(x+a,y+b,10);d.ellipse((cx-10,cy-12,cx+10,cy+12),fill='#23333b',outline='#acb3a5',width=2)
def overview(d,t,cut=False,force=False):
 # Orthogonal paths: the road follows X; the water trough follows Y.
 face(d,[(-620,-175,-35),(620,-175,-35),(620,175,-35),(-620,175,-35)],'#858d83','#d6d5b9',3)
 face(d,[(-620,-120,0),(620,-120,0),(620,120,0),(-620,120,0)],'#3a4b53','#e9ca89',4)
 for x in range(-600,600,80):d.line([iso(x,0,1),iso(x+40,0,1)],fill='#ecdab7',width=3)
 # Road divider/support walls at far edge, centre, near edge.
 box(d,-165,-156,165,-134,0,227,'#c4b999','#a49578','#dfca9f')
 x=-590+(t*.13%1)*1180
 car(d,x,-73)
 for yy in [-12,136]:box(d,-165,yy,165,yy+22,0,227,'#c4b999','#a49578','#dfca9f')
 if cut:
  # Removed near half of trough is a clearly labelled explanatory cutaway.
  end=-5
 else:end=450
 box(d,-180,-450,180,end,227,255,'#f0dcc1','#ac9474','#d2b58a')
 face(d,[(-150,-440,260),(150,-440,260),(150,end,260),(-150,end,260)],'#197b94','#83ccd2',2)
 face(d,[(-150,-440,294),(150,-440,294),(150,end,294),(-150,end,294)],'#62b7c3','#add8cf',2)
 for yy in range(-420,int(end),50):
  drift=(t*23)%36;d.line([iso(-115,yy+drift,296),iso(85,yy+drift,296)],fill='#b2e5df',width=2)
 box(d,-180,-450,-150,end,255,324,'#f7e0b4','#a0876c','#cbbb92')
 if not cut:box(d,150,-450,180,end,255,324,'#f7e0b4','#a0876c','#cbbb92')
 if cut:
  # Reveal contained water thickness at section edge and supporting concrete.
  face(d,[(-150,end,260),(150,end,260),(150,end,294),(-150,end,294)],'#3e9aac','#b8edeb',3)
  by=-330+(t*15%180);boat(d,by,t)
 else:boat(d,-380+(t*65%730),t)
 if force:
  for k,yy in enumerate([-120,-15]):
   arrow(d,iso(0,yy,405),iso(0,yy,330),width=7)
  for yy in [-145,-1,147]:
   arrow(d,iso(175,yy,220),iso(175,yy,40),width=6)
 # Draw near-road car only when it is outside the covered portion: physical occlusion.
 if x>200:car(d,x,-73)
def wrap(text,size=50,width=890):
 lines=['']
 for word in text.split():
  candidate=(lines[-1]+' '+word).strip()
  if FONTS[size].getlength(candidate)>width and lines[-1]:lines.append(word)
  else:lines[-1]=candidate
 if len(lines)>2:raise RuntimeError('Caption too long: '+text)
 return lines

def frame(t,opening=None):
 b=next((b for b in TL['beats']if b['start']<=t<b['start']+b['duration']),TL['beats'][-1]);kind=b['id'];p=clamp((t-b['start'])/b['duration'])
 im=(opening.copy() if opening is not None else BG.copy()).convert('RGBA');im=Image.alpha_composite(im,SHADE)
 if opening is None:
  layer=Image.new('RGBA',(W,H));d=ImageDraw.Draw(layer)
  d.rounded_rectangle((40,560,1040,1535),radius=36,fill=(18,37,45,238),outline=(228,204,159,200),width=2)
  if kind in ['hook','trough','separate','payoff']:
   overview(d,t,cut=kind in ['trough','separate'],force=kind=='separate')
   if kind in ['trough','separate']:
    txt(d,'물',(300,655),34,fill='#b6e6e8');txt(d,'차',(800,1350),34,fill='#f9c989')
    txt(d,'바닥 → 지지벽' if kind=='separate' else '단면으로 들여다본 구조',(540,1470),34,fill='#f4d3a1')
   else:
    txt(d,'물길',(305,645),34,fill='#b6e6e8');txt(d,'찻길',(805,1410),34,fill='#f9c989')
    txt(d,'서로 다른 높이로 교차',(540,1485),34,fill='#ecd5b5')
  im=Image.alpha_composite(im,layer)
 d=ImageDraw.Draw(im)
 titles={'hook':'도로 위로 배가?','where':'길을 끊지 않는 교차로','trough':'위에는 물 · 아래에는 차','separate':'물의 무게는 어디로?','rain':'그런데 비가 오면?','payoff':'배도, 차도 기다리지 않게'}
 txt(d,titles[kind],(540,355),58,stroke=2)
 txt(d,'VELUWEMEER · NETHERLANDS',(65,156),24,fill='#ead0a3',anchor='lm',stroke=1)
 txt(d,'웹툰 재현',(1015,156),24,fill='#e9e1d4',anchor='rm',stroke=1)
 if opening is None:txt(d,'구조·배수 개념도 · 실제 축척/관로 아님',(540,1565),24,fill='#cbd0c5',stroke=1)
 cap=next((c for c in TL['captions']if c['start']<=t<c['end']),None)
 if cap:
  for i,line in enumerate(wrap(cap['text'])):txt(d,line,(540,1640+i*67),50,stroke=3)
 d.line([(65,1790),(65+950*min(t/TL['duration'],1),1790)],fill='#dfbd84',width=4)
 return im.convert('RGB')
def preview():
 setup();tiles=[]
 for b in TL['beats']:
  im=frame(max(6.1,b['start']+b['duration']*.65));im.thumbnail((270,480));tiles.append(im)
 sheet=Image.new('RGB',(810,960),'#17252a')
 for i,im in enumerate(tiles):sheet.paste(im,((i%3)*270,(i//3)*480))
 sheet.save(C/'qa/body-preview.jpg',quality=90);print(C/'qa/body-preview.jpg')
def render():
 setup();opening=C/'opening.mp4'
 if not opening.exists():raise RuntimeError('Required Higgsfield opening unavailable')
 log=open(C/'logs/render.log','wb');part=C/'render.partial.mp4'
 enc=subprocess.Popen(['ffmpeg','-y','-v','error','-f','rawvideo','-pix_fmt','rgb24','-s',f'{W}x{H}','-r',str(FPS),'-i','-','-i',str(C/'audio.wav'),'-map','0:v','-map','1:a','-c:v','libx264','-preset','fast','-crf','20','-threads','4','-pix_fmt','yuv420p','-c:a','aac','-b:a','192k','-t',str(TL['duration']),'-movflags','+faststart',str(part)],stdin=subprocess.PIPE,stdout=subprocess.DEVNULL,stderr=log)
 dec=subprocess.Popen(['ffmpeg','-v','error','-i',str(opening),'-vf',f'scale={W}:{H}:force_original_aspect_ratio=increase,crop={W}:{H},fps={FPS}','-frames:v',str(6*FPS),'-f','rawvideo','-pix_fmt','rgb24','-'],stdout=subprocess.PIPE,stderr=subprocess.DEVNULL)
 try:
  for i in range(TL['frames']):
   opening_frame=None
   if i<6*FPS:
    data=dec.stdout.read(W*H*3)
    if len(data)!=W*H*3:raise RuntimeError('Opening decode truncated')
    opening_frame=Image.frombytes('RGB',(W,H),data)
   im=frame(i/FPS,opening_frame);enc.stdin.write(im.tobytes())
   if i%240==0:print('RENDERED',i,'/',TL['frames'],flush=True)
  enc.stdin.close();code=enc.wait();dc=dec.wait();log.close()
  if code or dc:raise RuntimeError('Encoder/decoder failed')
  FINAL.parent.mkdir(parents=True,exist_ok=True);shutil.copy2(part,FINAL);part.unlink();print('FINAL',FINAL,flush=True)
 except BaseException:
  enc.kill();dec.kill();enc.wait();dec.wait();raise

def verify():
 setup();p=probe(FINAL);v=next(x for x in p['streams']if x['codec_type']=='video');a=next(x for x in p['streams']if x['codec_type']=='audio')
 assert (v['width'],v['height'])==(W,H) and int(v['nb_frames'])==TL['frames']
 assert abs(float(a['duration'])-TL['duration'])<.1
 run(['ffmpeg','-v','error','-i',FINAL,'-f','null','-'],'decode.log')
 run(['ffmpeg','-hide_banner','-i',FINAL,'-af','volumedetect,silencedetect=noise=-45dB:d=1.5','-vf','blackdetect=d=.5:pix_th=.05','-f','null','-'],'av-analysis.log')
 expected=''.join(b['text']for b in TL['beats']);observed=''.join(c['text']for c in TL['captions']);assert re.sub(r'\s','',expected)==re.sub(r'\s','',observed)
 for c in TL['captions']:assert c['end']>c['start'];wrap(c['text'])
 # Planned comparison geometry: a fixed track, distinct off-axis oculus.
 assert len(TL['beats'])==4
 images=[]
 for i,t in enumerate([1,5]+[b['start']+b['duration']*.65 for b in TL['beats']]):
  f=C/'qa'/f'final-{i}.jpg';run(['ffmpeg','-y','-v','error','-ss',str(t),'-i',FINAL,'-frames:v','1','-vf','scale=270:480',f]);images.append(Image.open(f).copy())
 sheet=Image.new('RGB',(1080,960))
 for i,im in enumerate(images):sheet.paste(im,((i%4)*270,(i//4)*480))
 sheet.save(C/'qa/final-review.jpg',quality=91)
 result={'final':str(FINAL),'duration':TL['duration'],'resolution':[W,H],'fps':FPS,'frames':TL['frames'],'bytes':FINAL.stat().st_size,'sha256':hashlib.sha256(FINAL.read_bytes()).hexdigest(),'checks':{'fullDecode':True,'audioVideoDuration':True,'captionTextCoverage':True,'captionLayout':True,'fourScenesPresent':True},'captionCount':len(TL['captions']),'voiceId':S['voiceId'],'speed':S['speed'],'limitations':['Artistic reconstruction, not an as-built engineering simulation.','Forced alignment is not independent speech recognition.','No audience popularity experiment performed.']}
 (C/'verification.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n');print(json.dumps(result,ensure_ascii=False))

if A.mode=='align':align()
elif A.mode=='plan':plan()
elif A.mode in ['preview','draft-preview']:preview()
elif A.mode=='render':render()
elif A.mode=='verify':verify()
