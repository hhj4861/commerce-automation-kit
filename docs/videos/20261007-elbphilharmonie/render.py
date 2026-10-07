"""Original room-in-room webtoon motion explanation. Frames stream directly to encoder.
Schematic vibration amplitudes are illustrative, not measured building displacement.
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
FINAL=Path('/Users/admin/Downloads/vedio/elbphilharmonie-webtoon-short.mp4')
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
  frames=math.ceil((len(a)/SR+(2.7 if b['id']=='payoff' else .28))*FPS)
  dur=frames/FPS;beats.append({**b,'start':t,'duration':dur,'speechDuration':len(a)/SR})
  audio.append(np.pad(a,(0,round(dur*SR)-len(a))))
  groups=[];g=[]
  for w in al['words']:
   candidate=''.join(x['text']for x in g)+w['text']
   try:wrap(candidate)
   except RuntimeError:
    if g:groups.append(g);g=[]
   g.append(w)
   # Never run the next sentence into the end of the preceding sentence.
   if re.search(r'[.!?]$',w['text'].strip()):groups.append(g);g=[]
  if g:groups.append(g)
  for i,g in enumerate(groups):
   start=g[0]['start']/S['speed'];end=min(len(a)/SR,g[-1]['end']/S['speed']+.07)
   if i+1<len(groups):end=min(end,groups[i+1][0]['start']/S['speed'])
   captions.append({'start':t+start,'end':t+max(start+.1,end),'text':''.join(x['text']for x in g).strip()})
  t+=dur
 if not 40<=t<=180:raise RuntimeError(f'Unexpected speech-led duration {t:.2f}s; inspect input. Never truncate narration.')
 # Keep the complete final subtitle through the intentional visual hold.
 captions[-1]['end']=t-.6
 y=np.concatenate(audio);ts=np.arange(len(y))/SR
 # Original restrained two-note pluck bed, with narration strongly foregrounded.
 bed=np.zeros_like(y)
 for start in np.arange(0,t,1.75):
  idx=int(start*SR);n=min(int(1.4*SR),len(y)-idx);u=np.arange(n)/SR;freq=[220,329.63,293.66,246.94][int(start/1.75)%4]
  bed[idx:idx+n]+=(.006*np.sin(2*np.pi*freq*u)+.003*np.sin(4*np.pi*freq*u))*np.exp(-u*5)
 y=y*.9+bed;y*=min(1,.92/max(abs(y)));fade=np.minimum(1,np.minimum(ts/.1,(t-ts)/.7));y*=fade
 with wave.open(str(C/'audio.wav'),'wb') as f:f.setnchannels(1);f.setsampwidth(2);f.setframerate(SR);f.writeframes((np.clip(y,-1,1)*32767).astype('<i2').tobytes())
 run(['ffmpeg','-y','-v','error','-i',C/'audio.wav','-af','loudnorm=I=-16:TP=-1.5:LRA=9','-ar',SR,C/'audio-normalized.wav'],'audio-normalize.log')
 (C/'audio-normalized.wav').replace(C/'audio.wav')
 result={'duration':t,'frames':round(t*FPS),'speed':S['speed'],'voiceId':S['voiceId'],'beats':beats,'captions':captions}
 (C/'timeline.json').write_text(json.dumps(result,ensure_ascii=False,indent=2));print(json.dumps({'duration':t,'captions':len(captions),'beats':[(b['id'],round(b['start'],2),round(b['duration'],2))for b in beats]}))


FONTS={n:ImageFont.truetype(str(FONT),n) for n in [24,28,30,34,40,46,50,58,64,70,78]}
BG=None;TL=None;SHADE=None;INTERIOR=None
def setup():
 global BG,TL,SHADE,INTERIOR
 BG=Image.open(C/'art/hero.png').convert('RGB').resize((W,H),Image.Resampling.LANCZOS)
 INTERIOR=Image.open(C/'art/interior.png').convert('RGB').resize((W,H),Image.Resampling.LANCZOS) if (C/'art/interior.png').exists() else BG
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
def wave_line(d,x0,y,x1,t,amp=18,color='#edb75c',width=5):
 pts=[(x,y+amp*math.sin((x-x0)/27-t*7)) for x in range(int(x0),int(x1)+1,4)]
 d.line(pts,fill=color,width=width,joint='curve')
def spring(d,x,y0,y1,width=25):
 # Coil deformation is vertical, matching the displacement used by the room.
 pts=[(x,y0),(x,y0+6)]
 for j in range(19):pts.append((x+width*math.sin(j*math.pi/2),(y0+8)+(y1-y0-16)*j/18))
 pts.extend([(x,y1-6),(x,y1)])
 d.line(pts,fill='#182d36',width=11,joint='curve');d.line(pts,fill='#eed6ac',width=6,joint='curve')
 d.line([(x-width-9,y0),(x+width+9,y0)],fill='#ffe0a1',width=8)
 d.line([(x-width-9,y1),(x+width+9,y1)],fill='#ddc49e',width=8)
def concert_room(d,cx,top,w,h,dy=0,small=False):
 x0=cx-w/2;x1=cx+w/2;y0=top+dy;y1=y0+h
 d.rounded_rectangle((x0+9,y0+13,x1+9,y1+13),radius=32,fill='#31434a')
 d.rounded_rectangle((x0,y0,x1,y1),radius=32,fill='#d9be96',outline='#ffe1a3',width=5)
 d.rounded_rectangle((x0+15,y0+15,x1-15,y1-19),radius=24,fill='#655950',outline='#9c8770',width=2)
 # Textured curved interior wall, terraced audience seating.
 for xx in range(int(x0+27),int(x1-22),13):
  d.line((xx,y0+24,xx,y0+h*.52),fill='#b69a7c',width=2)
 for row in range(4):
  yy=y0+h*.44+row*h*.102
  d.arc((x0+24+row*9,yy-30,x1-24-row*9,yy+60),0,180,fill='#d9ba87',width=4)
  n=10 if small else 17
  for j in range(n):
   xx=x0+36+(w-72)*j/(n-1);seatY=yy+abs(j-(n-1)/2)*1.5
   d.rounded_rectangle((xx-6,seatY-1,xx+6,seatY+12),radius=3,fill='#b98857')
   d.ellipse((xx-3,seatY-9,xx+3,seatY-3),fill='#e1c6a4')
 d.ellipse((cx-w*.17,y1-h*.23,cx+w*.17,y1-h*.075),fill='#d6b486',outline='#fce3af',width=2)
 d.line((cx,y1-h*.10,cx,y1-h*.24),fill='#283c46',width=7)
 d.ellipse((cx-7,y1-h*.27,cx+7,y1-h*.27+14),fill='#f1ceb1')
 # Inner heavy shell closes all around the hall, not just a floating stage.
 d.line((x0+15,y1-7,x1-15,y1-7),fill='#ffe3ad',width=12)
def rig(d,cx,t,isolated=True,w=390,top=790,h=350,labels=True,amp=20):
 base=top+h+126;ext=amp*math.sin(t*7);inner=(amp*.12*math.sin(t*7-.7) if isolated else ext)
 # Outer reinforced concrete frame remains separated from inner hall.
 d.rounded_rectangle((cx-w/2-28,top-50+ext,cx+w/2+28,base+22+ext),radius=28,fill='#344c58',outline='#7898a4',width=5)
 d.rounded_rectangle((cx-w/2-11,top-29+ext,cx+w/2+11,base-3+ext),radius=18,fill='#182d38')
 for x in [cx-w*.31,cx,cx+w*.31]:
  if isolated:spring(d,x,top+h+inner+12,base+ext-5,19 if w<500 else 29)
  else:d.rectangle((x-13,top+h+inner,x+13,base+ext),fill='#9db0ac',outline='#d1d9c7',width=3)
 concert_room(d,cx,top,w-48,h,inner,small=w<500)
 d.line((cx-w/2-35,base+24+ext,cx+w/2+35,base+24+ext),fill='#a9b9b4',width=18)
 if labels:
  txt(d,'스프링으로 분리' if isolated else '단단하게 연결',(cx,top-92),30,fill='#f1ce8b' if isolated else '#9bb1bd')
  txt(d,'같은 바닥의 진동',(cx,base+80),28,fill='#a4bbc3')
 wave_line(d,cx-w*.35,top+h*.35,cx+w*.35,t,amp=5 if isolated else 22,color='#ffcb76',width=4)
 # Identical external excitation in both sides: not measured magnitudes.
 wave_line(d,cx-w*.35,base+57,cx+w*.35,t,amp=15,color='#90bfd0',width=3)
def structure_panel(d,t,kind,p):
 if kind=='mechanism':
  rig(d,295,t,False,w=370);rig(d,785,t,True,w=370)
  txt(d,'같은 진동, 다른 전달',(540,635),46)
  txt(d,'움직임·파형은 설명을 위해 과장',(540,1500),24,fill='#a7bcc2')
 elif kind=='separate':
  rig(d,540,t,True,w=700,top=780,h=370,labels=False,amp=7)
  txt(d,'바깥 구조 안에 독립된 공연장',(540,640),40)
  txt(d,'스프링 묶음 362개',(540,1455),40,fill='#f6cc87')
  txt(d,'낱개 스프링 수가 아닙니다',(540,1510),24,fill='#b3c4c2')
 elif kind=='limit':
  rig(d,635,t,True,w=530,top=790,h=340,labels=False,amp=7)
  txt(d,'공기와 구조, 두 개의 길',(540,650),40)
  # Airborne wave confronts double wall, structural wave reaches spring support.
  for j in range(3):
   rr=30+((t*45+j*34)%115)
   d.arc((155-rr,990-rr,155+rr,990+rr),-58,58,fill='#87c2db',width=4)
  txt(d,'공기음',(210,820),30,fill='#a9dced')
  arrow(d,(175,875),(330,875),'#91c1d7',5)
  txt(d,'이중 벽',(430,727),30,fill='#b7d6df')
  txt(d,'구조 진동',(230,1420),30,fill='#ecc891')
  arrow(d,(290,1390),(490,1290),'#efc27c',5)
  txt(d,'무게·진동 특성에 맞춘 설계',(540,1520),30,fill='#f2d5a8')
 elif kind=='problem':
  # Follow one orange pulse from a noisy environment along the outer shell.
  rig(d,640,t,False,w=490,top=805,h=330,labels=False,amp=9)
  txt(d,'소음은 벽과 바닥도 타고 옵니다',(540,650),40)
  # Stylised harbour vessel and impact source, with no measured source attribution.
  poly(d,[(98,1180),(270,1180),(240,1220),(118,1220)],'#e9ceb0')
  d.rectangle((135,1135,220,1180),fill='#527887',outline='#dfd7bf',width=3)
  d.rectangle((180,1100,196,1135),fill='#deb67a')
  wave_line(d,95,1235,287,t,7,'#77b9c9',3)
  path=[(250,1220),(360,1280),(913,1280),(913,990),(870,990)]
  d.line(path,fill='#6e7067',width=5)
  lengths=[math.dist(a,b)for a,b in zip(path,path[1:])];total=sum(lengths)
  for j in range(7):
   pos=(t*175+j*total/7)%total
   for a,b,l in zip(path,path[1:],lengths):
    if pos<=l:
     q=pos/l;x=a[0]+(b[0]-a[0])*q;y=a[1]+(b[1]-a[1])*q;d.ellipse((x-7,y-7,x+7,y+7),fill='#ffc271');break
    pos-=l
  txt(d,'구조를 따라 전해지는 진동',(540,1450),34,fill='#f2ca8f')
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
 # Human payoff precedes return to the exact opening subject.
 background=INTERIOR if kind=='payoff' and p<.40 else BG
 im=(opening.copy() if opening is not None else background.copy()).convert('RGBA')
 if kind=='payoff' and .35<p<.47:
  im=Image.blend(INTERIOR.convert('RGBA'),BG.convert('RGBA'),ease((p-.35)/.12))
 im=Image.alpha_composite(im,SHADE)
 if kind in ['problem','separate','mechanism','limit']:
  layer=Image.new('RGBA',(W,H));d=ImageDraw.Draw(layer)
  d.rounded_rectangle((38,560,1042,1555),radius=32,fill=(15,31,42,241),outline=(221,199,157,210),width=2)
  structure_panel(d,t,kind,p)
  # Soft reveal for diagram transitions while preserving the spoken sequence.
  fade=min(1,(t-b['start'])/.24)
  if fade<1:layer.putalpha(layer.getchannel('A').point(lambda a:int(a*fade)))
  im=Image.alpha_composite(im,layer)
 d=ImageDraw.Draw(im)
 titles={'hook':'공연장이 스프링 위에?','problem':'항구의 소음은 어디로 갈까?','separate':'건물 안에, 또 하나의 방','mechanism':'스프링은 무엇을 바꿀까?','limit':'스프링만으로 충분할까?','payoff':'작은 연주까지 들을 수 있게'}
 txt(d,titles[kind],(540,355),58,stroke=2)
 txt(d,'ELBPHILHARMONIE · HAMBURG',(65,156),24,fill='#ead0a3',anchor='lm',stroke=1)
 txt(d,'웹툰 재현',(1015,156),24,fill='#e9e1d4',anchor='rm',stroke=1)
 txt(d,'설명용 단면 · 실제 배치/축척/진동 크기 아님',(540,1575),24,fill='#cbd0c5',stroke=1)
 cap=next((c for c in TL['captions']if c['start']<=t<c['end']),None)
 if cap:
  for i,line in enumerate(wrap(cap['text'])):txt(d,line,(540,1650+i*67),50,stroke=3)
 d.line([(65,1800),(65+950*min(t/TL['duration'],1),1800)],fill='#dfbd84',width=3)
 # Fade only AFTER the complete voice and two-second result hold.
 remaining=TL['duration']-t
 if remaining<.6:im=Image.blend(Image.new('RGBA',(W,H),'#101c25'),im,clamp(remaining/.6))
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
 # Narrative and final-voice hold invariants.
 assert len(TL['beats'])==6
 last=TL['beats'][-1];tail=TL['duration']-(last['start']+last['speechDuration'])
 assert tail>=2.7 and TL['captions'][-1]['end']>=TL['duration']-.61
 images=[]
 for i,t in enumerate([1,5]+[b['start']+b['duration']*.65 for b in TL['beats']]+[TL['duration']-2,TL['duration']-.7]):
  f=C/'qa'/f'final-{i}.jpg';run(['ffmpeg','-y','-v','error','-ss',str(t),'-i',FINAL,'-frames:v','1','-vf','scale=270:480',f]);images.append(Image.open(f).copy())
 sheet=Image.new('RGB',(1080,1440))
 for i,im in enumerate(images):sheet.paste(im,((i%4)*270,(i//4)*480))
 sheet.save(C/'qa/final-review.jpg',quality=91)
 result={'final':str(FINAL),'duration':TL['duration'],'resolution':[W,H],'fps':FPS,'frames':TL['frames'],'bytes':FINAL.stat().st_size,'sha256':hashlib.sha256(FINAL.read_bytes()).hexdigest(),'checks':{'fullDecode':True,'audioVideoDuration':True,'captionTextCoverage':True,'captionLayout':True,'sixScenesPresent':True,'completeFinalSpeech':True,'endingHoldSeconds':tail},'captionCount':len(TL['captions']),'voiceId':S['voiceId'],'speed':S['speed'],'limitations':['Artistic reconstruction, not an as-built engineering simulation.','Forced alignment is not independent speech recognition.','No audience popularity experiment performed.']}
 (C/'verification.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n');print(json.dumps(result,ensure_ascii=False))

if A.mode=='align':align()
elif A.mode=='plan':plan()
elif A.mode in ['preview','draft-preview']:preview()
elif A.mode=='render':render()
elif A.mode=='verify':verify()
