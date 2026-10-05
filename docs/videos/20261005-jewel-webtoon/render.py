"""Original webtoon motion reconstruction. Streaming frames, no PNG frame cache.
The roof is a simplified placement diagram, not a surveyed engineering model.
"""
import argparse,json,math,os,subprocess,hashlib,shutil,wave,re
from pathlib import Path
import numpy as np
from PIL import Image,ImageDraw,ImageFont,ImageEnhance,ImageFilter
P=argparse.ArgumentParser();P.add_argument('mode',choices=['align','plan','preview','render','verify']);P.add_argument('--cache',type=Path,required=True);A=P.parse_args();C=A.cache
for d in ['tmp','logs','alignment','fonts','qa']: (C/d).mkdir(parents=True,exist_ok=True)
os.environ['TMPDIR']=str(C/'tmp');os.environ['NUMBA_CACHE_DIR']=str(C/'tmp/numba')
S=json.loads((Path(__file__).parent/'story.json').read_text());S['beats']=[{**s,'text':s['narration']} for s in S['scenes']];W,H,FPS,SR=1080,1920,24,44100
FONT=C/'fonts/Pretendard-SemiBold.otf'
if not FONT.exists():shutil.copy2(C.parent/'20261005-webtoon-lipsync-episode1/fonts/Pretendard-SemiBold.otf',FONT)
FINAL=Path('/Users/admin/Downloads/vedio/jewel-airport-webtoon-short.mp4')
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
 if not 30<=t<=50:raise RuntimeError(f'Actual duration {t:.2f}s outside short guard. Revise content, do not pad.')
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
 TL=json.loads((C/'timeline.json').read_text())
 SHADE=Image.new('RGBA',(W,H));sd=ImageDraw.Draw(SHADE)
 for y in range(H):
  a=int(155*max(0,1-y/660)+195*max(0,(y-1390)/530))
  sd.line((0,y,W,y),fill=(12,18,23,a))
def clamp(x):return max(0,min(1,x))
def ease(x):x=clamp(x);return x*x*(3-2*x)
def txt(d,text,xy,size=46,fill='#fff6e8',anchor='mm',stroke=0):d.text(xy,text,font=FONTS[size],fill=fill,anchor=anchor,stroke_width=stroke,stroke_fill='#182232')
def poly(d,p,fill,outline='#1d3039',width=3):d.polygon(p,fill=fill);d.line(p+[p[0]],fill=outline,width=width,joint='curve')
def dashed(d,a,b,fill='#e4be82',width=3):
 a=np.array(a);b=np.array(b);length=np.linalg.norm(b-a)
 for start in np.arange(0,length,22):
  p=a+(b-a)*start/length;q=a+(b-a)*min(start+11,length)/length
  d.line([tuple(p),tuple(q)],fill=fill,width=width)
def panel(d,title,sub=None):
 txt(d,title,(540,365),58,stroke=2)
 if sub:txt(d,sub,(540,443),30,fill='#e8d9bd',stroke=1)
def train(d,x,y,scale=1):
 s=scale;p=lambda a,b:(x+a*s,y+b*s)
 poly(d,[p(-125,-31),p(83,-31),p(124,-9),p(127,16),p(-125,16)],'#e8ded0',width=3)
 poly(d,[p(-125,16),p(127,16),p(119,29),p(-119,29)],'#5b777e',width=3)
 for a in [-100,-51,-2,47]:poly(d,[p(a,-22),p(a+34,-22),p(a+34,3),p(a,3)],'#385662',width=2)
 for a in [-83,80]:d.ellipse((x+(a-10)*s,y+22*s,x+(a+10)*s,y+39*s),fill='#263640',outline='#c9c3b4',width=2)
 d.line([p(-122,10),p(119,10)],fill='#e1ae69',width=4)
def rail(d,y=1030):
 for x in range(55,1020,32):d.line((x,y-16,x+8,y+18),fill='#a78f76',width=6)
 for v in [-13,13]:d.line((40,y+v,1040,y+v),fill='#f3cc92',width=6)
 txt(d,'먼저 있던 선로',(190,y-62),30,fill='#f3cc92')
def plan_roof(d,ox,oy,alpha=1):
 # A stylized plan diagram, no claim of surveyed axes or exact panel dimensions.
 rings=[]
 for r in [0,.23,.47,.72,1]:
  points=[]
  for j in range(40):
   a=j*math.tau/40
   x=(ox+70*math.cos(a))*(1-r)+(540+410*math.cos(a))*r
   y=(oy+48*math.sin(a))*(1-r)+(1030+350*math.sin(a))*r
   points.append((x,y))
  rings.append(points)
 for k in range(3,-1,-1):
  for j in range(40):
   j2=(j+1)%40;a=rings[k][j];b=rings[k][j2];c=rings[k+1][j];e=rings[k+1][j2]
   fill=(57+10*k,91+9*k,99+8*k,255)
   poly(d,[a,c,e],fill,outline=(201,213,198,245),width=2)
   poly(d,[a,e,b],(81,119,126,255),outline=(223,210,174,245),width=2)
 d.ellipse((ox-72,oy-50,ox+72,oy+50),fill='#367f97',outline='#e9e7cd',width=5)
 d.ellipse((ox-43,oy-30,ox+43,oy+30),fill='#b0e1e7',outline='#528daa',width=3)
def roof_section(d,p):
 shift=165*ease(p/.65);cx=540+shift
 # Two separate rising-and-falling shoulders join the displaced inward funnel.
 def curve(center,ghost=False):
  color='#8b9b98' if ghost else '#f6d194';width=3 if ghost else 8
  for side in [-1,1]:
   outer=145 if side<0 else 935;inner=center+side*54
   points=[]
   for k in range(101):
    u=k/100;x=outer+(inner-outer)*u;y=1190-325*math.sin(math.pi*u*.94)-55*u
    points.append((x,y))
   if not ghost:
    poly(d,points+[(inner,1220),(outer,1240)],(66,108,116,255),outline='#a8c2c1',width=2)
    for k in range(12,95,14):d.line([points[k],(points[k][0],points[k][1]+32)],fill='#b2d0cf',width=3)
   d.line(points,fill=color,width=width)
 curve(540,True);curve(cx)
 dashed(d,(540,665),(540,1340),fill='#aaa89d')
 for j in range(15):
  x=cx-40+j*5.5;y=1120+((p*410+j*21)%240)
  d.line((x,y,x,y+32),fill='#b6e9ea',width=3)
 d.line((440,1335,635,1335),fill='#dfbc83',width=7)
 train(d,540,1300,.48)
 txt(d,'구멍 위치가 바뀌면',(540,550),40)
 txt(d,'양쪽 곡면도 달라진다',(540,1420),40,fill='#f6d194')
 txt(d,'설계안 비교 · 단면 개념도',(540,670),28,fill='#c8c7ba')
def distances(d,p):
 plan_roof(d,600,1210)
 rail(d);train(d,180+600*ease(p),1015,.55)
 dashed(d,(600,1160),(600,700),fill='#9ee3df',width=5)
 dashed(d,(600,1260),(600,1370),fill='#ffd39a',width=5)
 txt(d,'먼 쪽',(730,820),40,fill='#bdece6',stroke=3)
 txt(d,'가까운 쪽',(795,1300),40,fill='#ffdaa7',stroke=3)
 txt(d,'구멍 ↔ 가장자리의 거리',(540,1430),34)
def wrap(text,size=50,width=890):
 words=text.split();lines=['']
 for word in words:
  candidate=(lines[-1]+' '+word).strip()
  if FONTS[size].getlength(candidate)>width and lines[-1]:lines.append(word)
  else:lines[-1]=candidate
 if len(lines)>2:raise RuntimeError('Caption too long: '+text)
 return lines

def frame(t,opening=None):
 b=next((b for b in TL['beats']if b['start']<=t<b['start']+b['duration']),TL['beats'][-1]);p=clamp((t-b['start'])/b['duration']);kind=b['id']
 im=opening.copy() if opening is not None else BG.copy()
 im=Image.alpha_composite(im.convert('RGBA'),SHADE)
 if opening is None:
  layer=Image.new('RGBA',(W,H));d=ImageDraw.Draw(layer)
  # Retain the original illustrated atrium behind every explanatory scene.
  d.rounded_rectangle((40,560,1040,1480),radius=48,fill=(24,34,38,220),outline=(223,192,145,145),width=2)
  if kind in ['hook','existing','conflict','offset']:
   shift=0 if kind in ['hook','existing','conflict']else ease(p/.65)
   ox,oy=540+60*shift,1030+180*shift
   if kind!='existing' or p>.32:plan_roof(d,ox,oy)
   else:d.ellipse((130,680,950,1380),outline='#bba784',width=3)
   rail(d);train(d,100+880*((t*.1)%1),1015,.64)
   dashed(d,(540,662),(540,1390),fill='#dfd1b9');txt(d,'건물 중심',(540,632),28,fill='#e7dfcf')
   if kind=='conflict':
    rr=86+10*math.sin(t*7);d.ellipse((540-rr,1030-rr*.7,540+rr,1030+rr*.7),outline='#f6917c',width=6)
    txt(d,'가정: 정중앙에 놓으면',(540,1430),34,fill='#f5ac99')
   elif kind=='offset':
    if p<.7:dashed(d,(540,1090),(ox,oy+48),fill='#95e0e1',width=5)
    txt(d,'선로는 그대로 · 폭포 위치 변경',(540,1430),34,fill='#bce7e5')
   else:txt(d,'기존 선로 위에 들어선 새 건물',(540,1430),34,fill='#dfc69e')
  elif kind=='roof':distances(d,p)
  elif kind=='shape':roof_section(d,p)
  else:
   # Return to the opening image with a compact moving plan as causal recap.
   plan_roof(d,600,1210);rail(d);train(d,90+880*ease(p),1015,.64)
   txt(d,'먼저 있던 길을 품은 설계',(540,1430),40,fill='#f7d9a2')
  im=Image.alpha_composite(im,layer)
 d=ImageDraw.Draw(im)
 titles={'existing':('폭포보다 먼저 있던 것','싱가포르 · 주얼 창이공항'),'conflict':('정중앙이면, 길이 겹친다',None),'offset':('선로를 피해 설계한 폭포',None),'roof':('양쪽 거리가 달라진다',None),'shape':('그래서 비대칭 지붕',None),'payoff':('길이 먼저, 건물은 나중',None),'hook':('폭포가 왜 가운데가 아닐까?',None)}
 title,sub=titles.get(kind,titles['hook'])
 if opening is not None: title,sub='폭포가 왜 가운데가 아닐까?','기찻길에 숨은 설계의 이유'
 panel(d,title,sub)
 txt(d,'JEWEL · SINGAPORE',(65,156),24,fill='#f1d4a3',anchor='lm',stroke=1)
 txt(d,'웹툰 재현',(1015,156),24,fill='#e9e1d4',anchor='rm',stroke=1)
 if opening is None:txt(d,'배치·형태 개념도 · 실제 축척 아님',(65,1510),24,fill='#d7cbb9',anchor='lm',stroke=1)
 cap=next((c for c in TL['captions']if c['start']<=t<c['end']),None)
 if cap:
  for i,line in enumerate(wrap(cap['text'])):txt(d,line,(540,1600+i*70),50,stroke=3)
 d.line([(65,1780),(65+950*min(t/TL['duration'],1),1780)],fill='#dfbd84',width=4)
 return im.convert('RGB')
def preview():
 setup();times=[max(6.1,b['start']+b['duration']*.65) for b in TL['beats']];tiles=[]
 for t in times:
  im=frame(min(t,TL['duration']-.2));im.thumbnail((270,480));tiles.append(im)
 sheet=Image.new('RGB',(1080,960),'#17252a')
 for i,im in enumerate(tiles):sheet.paste(im,((i%4)*270,(i//4)*480))
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
 assert abs(1210-1030)>72+20
 images=[]
 for i,t in enumerate([1,5,11,14,20,26,29,TL['duration']-.8]):
  f=C/'qa'/f'final-{i}.jpg';run(['ffmpeg','-y','-v','error','-ss',str(t),'-i',FINAL,'-frames:v','1','-vf','scale=270:480',f]);images.append(Image.open(f).copy())
 sheet=Image.new('RGB',(1080,960))
 for i,im in enumerate(images):sheet.paste(im,((i%4)*270,(i//4)*480))
 sheet.save(C/'qa/final-review.jpg',quality=91)
 result={'final':str(FINAL),'duration':TL['duration'],'resolution':[W,H],'fps':FPS,'frames':TL['frames'],'bytes':FINAL.stat().st_size,'sha256':hashlib.sha256(FINAL.read_bytes()).hexdigest(),'checks':{'fullDecode':True,'audioVideoDuration':True,'captionTextCoverage':True,'captionLayout':True,'distinctTrackAndOculus':True},'captionCount':len(TL['captions']),'voiceId':S['voiceId'],'speed':S['speed'],'limitations':['Artistic reconstruction, not an as-built engineering simulation.','Forced alignment is not independent speech recognition.','No audience popularity experiment performed.']}
 (C/'verification.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n');print(json.dumps(result,ensure_ascii=False))

if A.mode=='align':align()
elif A.mode=='plan':plan()
elif A.mode=='preview':preview()
elif A.mode=='render':render()
elif A.mode=='verify':verify()
