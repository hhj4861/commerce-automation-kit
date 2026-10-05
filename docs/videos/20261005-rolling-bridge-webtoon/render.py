"""Original webtoon motion reconstruction. Streaming frames, no PNG frame cache.
The bridge is a simplified kinematic diagram, not an engineering simulation.
"""
import argparse,json,math,os,subprocess,hashlib,shutil,wave,re
from pathlib import Path
import numpy as np
from PIL import Image,ImageDraw,ImageFont,ImageEnhance,ImageFilter
P=argparse.ArgumentParser();P.add_argument('mode',choices=['align','plan','preview','render','verify']);P.add_argument('--cache',type=Path,required=True);A=P.parse_args();C=A.cache
for d in ['tmp','logs','alignment','fonts','qa']: (C/d).mkdir(parents=True,exist_ok=True)
os.environ['TMPDIR']=str(C/'tmp');os.environ['NUMBA_CACHE_DIR']=str(C/'tmp/numba')
S=json.loads((Path(__file__).parent/'story.json').read_text());W,H,FPS,SR=1080,1920,24,44100
FONT=C/'fonts/Pretendard-SemiBold.otf'
if not FONT.exists():shutil.copy2(C.parent/'20261005-webtoon-lipsync-episode1/fonts/Pretendard-SemiBold.otf',FONT)
FINAL=Path('/Users/admin/Downloads/vedio/rolling-bridge-webtoon-short.mp4')
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
 if not 35<=t<=58:raise RuntimeError(f'Actual duration {t:.2f}s outside short guard. Revise content, do not pad.')
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

FONTS={n:ImageFont.truetype(str(FONT),n) for n in [24,28,30,34,40,46,50,58,70,78]}
BG=None;TL=None
def setup():
 global BG,TL
 BG=Image.open(C/'art/background.png').convert('RGB').resize((W,H),Image.Resampling.LANCZOS)
 BG=ImageEnhance.Brightness(BG.filter(ImageFilter.GaussianBlur(2.5))).enhance(.67)
 TL=json.loads((C/'timeline.json').read_text())
def clamp(x):return max(0,min(1,x))
def ease(x):x=clamp(x);return x*x*(3-2*x)
def txt(d,text,xy,size=46,fill='#fff8ec',anchor='mm',stroke=0):d.text(xy,text,font=FONTS[size],fill=fill,anchor=anchor,stroke_width=stroke,stroke_fill='#182232')
def poly(d,p,fill,outline='#18212b',width=3):d.polygon(p,fill=fill);d.line(p+[p[0]],fill=outline,width=width,joint='curve')
def human(d,x,y,t,scale=1):
 s=scale;walk=math.sin(t*7)*9*s
 d.ellipse((x-8*s,y-58*s,x+8*s,y-42*s),fill='#e4c0a1',outline='#25272b',width=2)
 poly(d,[(x-9*s,y-40*s),(x+8*s,y-40*s),(x+12*s,y-13*s),(x-12*s,y-13*s)],'#b68963',width=2)
 d.line([(x-5*s,y-13*s),(x-8*s+walk,y)],fill='#233247',width=5);d.line([(x+5*s,y-13*s),(x+7*s-walk,y)],fill='#233247',width=5)
def boat(d,x,y,scale=1):
 s=scale;p=lambda X,Y:(x+X*s,y+Y*s)
 poly(d,[p(-150,0),p(150,0),p(124,40),p(-126,40)],'#183e55',width=4)
 poly(d,[p(-106,-44),p(100,-44),p(123,0),p(-116,0)],'#e2b277',width=4)
 poly(d,[p(-115,-51),p(95,-51),p(108,-43),p(-111,-43)],'#8f5043',width=3)
 for k in [-78,-22,34]:poly(d,[p(k,-35),p(k+37,-35),p(k+37,-8),p(k,-8)],'#366078',width=2)
 d.line([p(-140,14),p(133,14)],fill='#c8795e',width=4)
 human(d,x+95*s,y-1*s,0,.52*s)
 for j in range(3):d.arc((x-165*s-j*20,y+32*s+j*9,x+175*s+j*20,y+50*s+j*9),0,170,fill='#c3c8c4',width=2)
def boat_forward(d,x,y,scale=1):
 # Boat travels across the former deck line, from foreground into the inlet.
 s=scale;p=lambda X,Y:(x+X*s,y+Y*s)
 poly(d,[p(0,-155),p(58,-110),p(62,103),p(38,123),p(-38,123),p(-62,103),p(-58,-110)],'#244e61',width=4)
 poly(d,[p(-48,-90),p(48,-90),p(48,95),p(-48,95)],'#c7a27a',width=3)
 poly(d,[p(-34,-65),p(34,-65),p(34,72),p(-34,72)],'#894e40',width=3)
 poly(d,[p(-31,-77),p(31,-77),p(31,-54),p(-31,-54)],'#70a0b0',width=2)
 for xx in [-45,38]:
  for yy in [-25,25,70]:poly(d,[p(xx,yy),p(xx+7,yy),p(xx+7,yy+22),p(xx,yy+22)],'#bed0c8',width=1)
 for k in range(3):
  d.line([p(-65-k*13,100),p(-94-k*19,155+k*14)],fill='#c7d0cb',width=2)
  d.line([p(65+k*13,100),p(94+k*19,155+k*14)],fill='#c7d0cb',width=2)

def deck(d,fold=0,highlight=-1,explode=0,offset=(0,0),scale=1):
 # Eight equal rigid segments, seven internal hinges; 45 degrees each closes an octagon.
 L=94.;angle=fold*math.pi/4;x,y=880.,1090.;verts=[(x,y)]
 for i in range(8):x-=L*math.cos(i*angle);y-=L*math.sin(i*angle);verts.append((x,y))
 def tr(p):return (offset[0]+p[0]*scale,offset[1]+p[1]*scale)
 for i in range(7,-1,-1):
  a=np.array(verts[i]);b=np.array(verts[i+1]);v=b-a;n=np.array([v[1],-v[0]])/L # inward/upward in screen coordinates
  n=-n if n[1]>0 and fold==0 else n
  # For left-directed edge inward normal is screen-up: (dy,-dx) points down, invert.
  n=np.array([-(b-a)[1],(b-a)[0]])/L
  a+=np.array([-explode*i,0]);b+=np.array([-explode*i,0]);dep=np.array([35.,-25.]);h=95-48*fold
  color='#f1bc73' if i==highlight else ('#bc9169' if i%2==0 else '#a67958')
  poly(d,[tr(tuple(a)),tr(tuple(b)),tr(tuple(b+dep)),tr(tuple(a+dep))],color,width=max(2,round(3*scale)))
  for k in range(1,7):
   m=a+(b-a)*(k/7);d.line([tr(tuple(m)),tr(tuple(m+dep))],fill='#5b4a41',width=max(1,round(scale)))
  poly(d,[tr(tuple(a)),tr(tuple(b)),tr(tuple(b-n*12)),tr(tuple(a-n*12))],'#493c35',width=max(1,round(2*scale)))
  # Triangular rail frames, simplified non-construction diagram.
  aa=a+n*h;bb=b+n*h
  for delta in [dep,np.array([0.,0.])]:
   for p,q in [(a+delta,aa+delta),(b+delta,bb+delta),(aa+delta,bb+delta),(a+delta,bb+delta)]:
    d.line([tr(tuple(p)),tr(tuple(q))],fill='#1b2936',width=max(2,round(7*scale)))
    d.line([tr(tuple(p)),tr(tuple(q))],fill='#91a5ac' if i!=highlight else '#ffd591',width=max(1,round(3*scale)))
  for p in [a,b]:
   cx,cy=tr(tuple(p));r=5*scale;d.ellipse((cx-r,cy-r,cx+r,cy+r),fill='#f1cf92',outline='#263848',width=max(1,round(scale)))
 if highlight>=0:
  p=(np.array(verts[highlight])+np.array(verts[highlight+1]))/2;cx,cy=tr(tuple(p+np.array([-explode*highlight,-145])));txt(d,str(highlight+1),(cx,cy),30,fill='#ffe0a4')
 return verts

def bridge_scene(d,t,fold,highlight=-1,people=False,ship=False,explode=0,ship_progress=0):
 # Two foreground banks, visually distinguish empty boat route from deck.
 poly(d,[(0,1096),(137,1096),(161,1130),(0,1130)],'#c5bca7',width=3)
 poly(d,[(0,1130),(161,1130),(161,1285),(0,1330)],'#7d756a',width=3)
 poly(d,[(808,1096),(1080,1096),(1080,1130),(832,1130)],'#c5bca7',width=3)
 poly(d,[(832,1130),(1080,1130),(1080,1295),(832,1250)],'#7d756a',width=3)
 for yy in range(1160,1270,34):
  d.line([(835,yy),(1080,yy+20)],fill='#ae9e85',width=2)
  for xx in range(855+(yy%2)*20,1080,65):d.line([(xx,yy+4),(xx,yy+32)],fill='#494c48',width=2)
 if ship:boat_forward(d,450,1420-490*ease(ship_progress),.72-.22*ship_progress)
 deck(d,fold,highlight,explode)
 if people and fold<.02:
  human(d,180+(t*42)%480,1083,t,1.15);human(d,730-(t*35)%400,1083,t+1,1)

def panel(d,title,sub=None):
 txt(d,title,(W/2,388),58,stroke=2)
 if sub:txt(d,sub,(W/2,467),30,fill='#e5d2b4',stroke=1)

def draw_hinge(d,p):
 # Enlarged two rigid deck members: pivot stays fixed; no material stretching.
 cx,cy=530,1100;ang=ease((math.sin(p*math.pi*2-.8)+1)/2)*.9
 v=np.array([math.cos(ang),-math.sin(ang)]);pivot=np.array([cx,cy]);end=pivot+v*330;left=np.array([200.,1100.])
 for a,b in [(left,pivot),(pivot,end)]:
  n=np.array([-(b-a)[1],(b-a)[0]]);n=n/np.linalg.norm(n)*22
  poly(d,[tuple(a-n),tuple(b-n),tuple(b+n),tuple(a+n)],'#b88557',width=5)
  for k in range(1,9):
   pt=a+(b-a)*k/9;d.line([tuple(pt-n),tuple(pt+n)],fill='#66472f',width=2)
 d.ellipse((cx-31,cy-31,cx+31,cy+31),fill='#c1cbd0',outline='#1c2a35',width=5);d.ellipse((cx-9,cy-9,cx+9,cy+9),fill='#355368')
 d.arc((cx-106,cy-106,cx+106,cy+106),int(-ang*180/math.pi),0,fill='#ffd28b',width=8)
 d.line([(cx,cy-48),(cx,cy-240)],fill='#f4cf8d',width=3);txt(d,'관절',(cx,cy-282),46,fill='#ffe1af')
 txt(d,'각 조각의 길이는 그대로',(540,1350),40,fill='#f4e2c5',stroke=1)

def draw_hydraulic(d,p):
 # Schematic actuator grows; endpoint-driven linkage visibly follows it.
 progress=ease((math.sin(p*math.pi*2-1.4)+1)/2);a=np.array([210.,1100.]);joint=np.array([520.,1100.]);theta=progress*.8;b=joint+np.array([310*math.cos(theta),-310*math.sin(theta)])
 for u,v in [(a,joint),(joint,b)]:
  d.line([tuple(u),tuple(v)],fill='#172431',width=43);d.line([tuple(u),tuple(v)],fill='#ae8057',width=29)
 top1=a+np.array([0,-200]);top2=b+np.array([0,-200]);mid=(top1+top2)/2
 for u,v in [(a,top1),(b,top2),(top1,joint),(joint,top2)]:d.line([tuple(u),tuple(v)],fill='#718d9c',width=10)
 # Telescoping rod detail (conceptual; not exact as-built actuator location).
 d.line([tuple(top1),tuple(top2)],fill='#dce5e7',width=18);d.line([tuple(top1),tuple(mid)],fill='#1e3447',width=45);d.line([tuple(top1),tuple(mid)],fill='#c49457',width=29)
 for k in range(4):
  r=(p*1.4+k*.22)%1;pt=top1+(mid-top1)*r;d.ellipse((pt[0]-4,pt[1]-4,pt[0]+4,pt[1]+4),fill='#ffe8a2')
 for pt in [a,joint,b,top1,top2]:d.ellipse((pt[0]-12,pt[1]-12,pt[0]+12,pt[1]+12),fill='#e5cca2',outline='#1e3140',width=4)
 txt(d,'유압 → 연결부 → 바닥',(540,1340),40,fill='#ffe1af',stroke=1)

def wrap(text,size=50,width=890):
 words=text.split();lines=['']
 for word in words:
  candidate=(lines[-1]+' '+word).strip()
  if FONTS[size].getlength(candidate)>width and lines[-1]:lines.append(word)
  else:lines[-1]=candidate
 if len(lines)>2:raise RuntimeError('Caption too long: '+text)
 return lines

def frame(t,opening=None):
 b=next((b for b in TL['beats'] if b['start']<=t<b['start']+b['duration']),TL['beats'][-1]);p=clamp((t-b['start'])/b['duration']);kind=b['id']
 im=opening.copy() if opening is not None else BG.copy()
 # Stable cinematic shading, no background palette swap.
 overlay=Image.new('RGBA',(W,H));od=ImageDraw.Draw(overlay)
 for yy in range(H):
  alpha=int(95*max(0,1-yy/700)+150*max(0,(yy-1360)/560))
  od.line((0,yy,W,yy),fill=(10,19,29,alpha))
 im=Image.alpha_composite(im.convert('RGBA'),overlay);d=ImageDraw.Draw(im)
 if opening is not None:panel(d,'이게… 다리라고?','런던 · 롤링 브리지')
 else:
  # Geometry lives in a separate drawing layer for independent camera framing.
  geom=Image.new('RGBA',(W,H));d=ImageDraw.Draw(geom)
  if kind in ['reveal','context']:
   panel(d,'길이 사라지는 순간','배가 지나갈 자리를 만드는 다리');bridge_scene(d,t,ease(p),ship=p>.8)
  elif kind=='segments':
   panel(d,'한 덩어리가 아니다','여덟 개의 단단한 조각');bridge_scene(d,t,0,highlight=min(7,int(p*8)),explode=3*math.sin(p*math.pi))
  elif kind=='hinges':panel(d,'휘는 게 아니라, 접힌다','바뀌는 것은 관절의 각도');draw_hinge(d,p)
  elif kind=='hydraulic':panel(d,'움직임의 시작은 유압','연결부를 움직여 바닥을 접는다');draw_hydraulic(d,p)
  elif kind=='fold':
   panel(d,'12m의 길 → 팔각형','끝과 끝이 만나면');bridge_scene(d,t,ease(p/.82));
  elif kind=='boat':
   panel(d,'이번에는 배의 차례','다리를 접은 자리로 통과');bridge_scene(d,t,1,ship=True,ship_progress=p)
   for k in range(3):
    y=1080+k*90;d.line([(625,y+45),(625,y)],fill='#efc381',width=4);d.line([(614,y+13),(625,y),(636,y+13)],fill='#efc381',width=4)
  elif kind=='payoff':panel(d,'펼치면 다시, 사람의 길','한 자리를 나눠 쓰는 설계');bridge_scene(d,t,1-ease(p/.6),people=True)
  # Zoom the folded mechanism into view without scaling typography.
  # Only pixels below the title region are transformed.
  if kind in ['fold','boat']:
   z=1.0+(.85*ease((p-.35)/.6) if kind=='fold' else .85)
   if kind=='boat':z=1.18
   layer=geom.crop((0,550,W,1450))
   cx,cy=(820,450) if kind=='fold' else (650,540)
   out=layer.transform(layer.size,Image.Transform.AFFINE,(1/z,0,cx-cx/z,0,1/z,cy-cy/z),Image.Resampling.BICUBIC)
   geom.paste(out,(0,550))
  im=Image.alpha_composite(im,geom);d=ImageDraw.Draw(im)
  txt(d,'구조 동작 단순화',(70,1440),24,fill='#c9c8c4',anchor='lm',stroke=1)
 txt(d,'WEBTOON ARCHITECTURE',(70,158),24,fill='#f0d6b0',anchor='lm',stroke=1)
 txt(d,'웹툰 재구성',(1010,158),24,fill='#e9e5dd',anchor='rm',stroke=1)
 cap=next((c for c in TL['captions'] if c['start']<=t<c['end']),None)
 if cap:
  lines=wrap(cap['text']);yy=1580
  for i,line in enumerate(lines):txt(d,line,(540,yy+i*70),50,stroke=3)
 # Small progress underline, not a boxed presentation layout.
 d.line([(70,1780),(70+940*min(t/TL['duration'],1),1780)],fill='#dcb580',width=4)
 return im.convert('RGB')

def preview():
 setup();times=[7,9.5,14,19,26,28,32,TL['duration']-.7];tiles=[]
 for t in times:
  t=min(t,TL['duration']-.2);im=frame(t);im.thumbnail((270,480));tiles.append(im)
 sheet=Image.new('RGB',(1080,960))
 for i,im in enumerate(tiles):sheet.paste(im,((i%4)*270,(i//4)*480))
 sheet.save(C/'qa/body-preview.jpg',quality=90);print(C/'qa/body-preview.jpg')

def render():
 setup();opening=C/'opening.mp4'
 if not opening.exists():raise RuntimeError('Required Higgsfield opening unavailable')
 log=open(C/'logs/render.log','wb');part=FINAL.with_suffix('.partial.mp4')
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
  part.replace(FINAL);print('FINAL',FINAL,flush=True)
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
 # Mathematically check rigid segment lengths and full octagon closure.
 verts=[np.array([0.,0.])]
 for i in range(8):verts.append(verts[-1]+94*np.array([math.cos(i*math.pi/4),math.sin(i*math.pi/4)]))
 assert np.linalg.norm(verts[-1])<1e-6
 for a,b in zip(verts,verts[1:]):assert abs(np.linalg.norm(b-a)-94)<1e-6
 images=[]
 for i,t in enumerate([1,5,11,14,20,26,29,TL['duration']-.8]):
  f=C/'qa'/f'final-{i}.jpg';run(['ffmpeg','-y','-v','error','-ss',str(t),'-i',FINAL,'-frames:v','1','-vf','scale=270:480',f]);images.append(Image.open(f).copy())
 sheet=Image.new('RGB',(1080,960))
 for i,im in enumerate(images):sheet.paste(im,((i%4)*270,(i//4)*480))
 sheet.save(C/'qa/final-review.jpg',quality=91)
 result={'final':str(FINAL),'duration':TL['duration'],'resolution':[W,H],'fps':FPS,'frames':TL['frames'],'bytes':FINAL.stat().st_size,'sha256':hashlib.sha256(FINAL.read_bytes()).hexdigest(),'checks':{'fullDecode':True,'audioVideoDuration':True,'captionTextCoverage':True,'captionLayout':True,'rigidSegmentLengths':True,'octagonClosure':True},'captionCount':len(TL['captions']),'voiceId':S['voiceId'],'speed':S['speed'],'limitations':['Artistic reconstruction, not an as-built engineering simulation.','Forced alignment is not independent speech recognition.','No audience popularity experiment performed.']}
 (C/'verification.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n');print(json.dumps(result,ensure_ascii=False))

if A.mode=='align':align()
elif A.mode=='plan':plan()
elif A.mode=='preview':preview()
elif A.mode=='render':render()
elif A.mode=='verify':verify()
