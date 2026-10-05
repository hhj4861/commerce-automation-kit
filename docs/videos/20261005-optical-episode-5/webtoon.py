"""Webtoon optical explainer. Original art + staged ink diagrams; streaming, no frame cache.
Reuse original verified audio and captions. Illustrative signal speeds/colors, not simulation.
"""
import argparse,json,math,subprocess,hashlib,re,os
from pathlib import Path
from PIL import Image,ImageDraw,ImageFont
P=argparse.ArgumentParser();P.add_argument('mode',choices=['preview','render','verify']);P.add_argument('--cache',type=Path,required=True);P.add_argument('--original',type=Path,required=True);P.add_argument('--variant',choices=['long','short'],default='long');A=P.parse_args();C=A.cache;O=A.original
S=json.loads((Path(__file__).parent/'story.json').read_text());plan=json.loads((O/(A.variant+'-plan.json')).read_text());caps=json.loads((O/(A.variant+'-captions.json')).read_text());short=A.variant=='short'
W,H=(720,1280)if short else(1280,720);OUTW,OUTH=plan['width'],plan['height'];FPS=24;DURATION=plan['duration'];FRAMES=round(DURATION*FPS)
FINAL=Path('/Users/admin/Downloads/vedio')/f'optical-episode-5-webtoon-{A.variant}.mp4';ORIGINAL=FINAL.with_name(f'optical-episode-5-{A.variant}.mp4')
for f in ['qa','logs','tmp']:(C/f).mkdir(exist_ok=True,parents=True)
os.environ['TMPDIR']=str(C/'tmp')
ART={k:Image.open(C/'art'/f'{k}.png').convert('RGB')for k in ['hero','racks','daily','lab','fiber','copper']}
fonts={};INK='#131e29';CREAM='#fff0d1';GOLD='#f3bd75';TEAL='#81d6d4';RED='#ec8b7c';VIOLET='#c1a4e1'
def ft(n):
 n=round(n)
 if n not in fonts:fonts[n]=ImageFont.truetype(str(O/'fonts/Pretendard-SemiBold.otf'),n)
 return fonts[n]
def text(d,s,xy,n=26,color=CREAM,anchor='mm',stroke=1):d.text(xy,s,font=ft(n),fill=color,anchor=anchor,stroke_width=stroke,stroke_fill=INK)
def ease(x):x=max(0,min(1,x));return x*x*(3-2*x)
def lerp(a,b,p):return(a[0]+(b[0]-a[0])*p,a[1]+(b[1]-a[1])*p)
def line(d,points,color=GOLD,width=6):
 d.line(points,fill=INK,width=width+4,joint='curve');d.line(points,fill=color,width=width,joint='curve')
def dot(d,x,y,r,color):d.ellipse((x-r,y-r,x+r,y+r),fill=color,outline=INK,width=2)
def pathpoint(points,u):
 lens=[math.dist(a,b)for a,b in zip(points,points[1:])];total=sum(lens);v=max(0,min(.99999,u))*total
 for i,l in enumerate(lens):
  if v<=l:return lerp(points[i],points[i+1],v/max(l,.001))
  v-=l
 return points[-1]
def flow(d,pts,t,color=TEAL,count=4,active=True,width=6):
 line(d,pts,color,width)
 if active:
  for k in range(count):
   x,y=pathpoint(pts,(t*.22+k/count)%1);dot(d,x,y,5,color)
   d.ellipse((x-2,y-2,x+2,y+2),fill='#fff9e6')
def chip(d,x,y,w=120,h=82,label='GPU',lit=False):
 # Inked metallic package with pins, perspective lip and crosshatching.
 for k in range(1,9):
  yy=y-h/2+k*h/9;d.line((x-w/2-13,yy,x+w/2+13,yy),fill=GOLD,width=3)
  xx=x-w/2+k*w/9;d.line((xx,y-h/2-11,xx,y+h/2+11),fill=GOLD,width=3)
 d.polygon([(x-w/2,y+h/2),(x+w/2,y+h/2),(x+w/2+10,y+h/2-9),(x+w/2+10,y-h/2-9),(x-w/2+10,y-h/2-9),(x-w/2,y-h/2)],fill='#4a6670',outline=INK,width=3)
 d.rectangle((x-w/2,y-h/2,x+w/2,y+h/2),fill='#d0b48b'if lit else'#78949c',outline=INK,width=3)
 d.rectangle((x-w/2+7,y-h/2+7,x+w/2-7,y+h/2-7),fill='#e9cf9f'if lit else'#aeb9af',outline='#455a60',width=2)
 for k in range(5):d.line((x-w/2+11+k*6,y+h/2-12,x-w/2+20+k*6,y+h/2-21),fill='#8c8f83',width=1)
 if label:text(d,label,(x,y),min(24,w*.20),INK,stroke=0)
def wave(d,x1,x2,y,t,amp=23,color=GOLD,weak=False):
 pts=[]
 for i in range(100):
  p=i/99;x=x1+(x2-x1)*p;aa=amp*(1-.72*p)if weak else amp
  yy=y+math.sin(p*math.pi*12-t*5)*aa;pts.append((x,yy))
 line(d,pts,color,3)
def bulb(d,x,y,p,color=GOLD):
 r=15+3*math.sin(p*7);dot(d,x,y,r,color)
 for j in range(8):
  a=j*math.pi/4;d.line((x+math.cos(a)*(r+8),y+math.sin(a)*(r+8),x+math.cos(a)*(r+16),y+math.sin(a)*(r+16)),fill=color,width=2)
def cover(im,w,h,p=0,focus=.5):
 # Video camera crop/zoom, not alteration of the underlying generated artwork.
 z=1.02+.045*p;scale=max(w/im.width,h/im.height)*z;cw=w/scale;ch=h/scale;cx=im.width*focus;cy=im.height*.52
 x=max(0,min(im.width-cw,cx-cw/2));y=max(0,min(im.height-ch,cy-ch/2))
 return im.resize((w,h),Image.Resampling.BILINEAR,box=(x,y,x+cw,y+ch))
# Precompute fixed vignette; retain painted scene, avoid palette changes.
shade=Image.new('RGBA',(W,H));sd=ImageDraw.Draw(shade)
for yy in range(H):
 a=round(130*max(0,1-yy/(H*.3))+195*max(0,(yy-H*.70)/(H*.30)))
 sd.line((0,yy,W,yy),fill=(13,23,31,min(230,a)))

def diagram(kind,t,p):
 dw,dh=(620,730)if short else(1080,390);im=Image.new('RGBA',(dw,dh));d=ImageDraw.Draw(im)
 # Adaptive composition: vertical routes in short, horizontal routes in long.
 if kind in ['hook','promise','divide','sync','takeaway','ending']:
  pts=[(dw*.22,dh*.23),(dw*.78,dh*.23),(dw*.22,dh*.76),(dw*.78,dh*.76)];center=(dw*.50,dh*.50)
  wait=kind in ['hook','divide','sync']and p<.48
  for i,pt in enumerate(pts):
   flow(d,[pt,center],t-i*.5,RED if wait and i==3 else TEAL,3,not(wait and i==3))
  chip(d,*center,125,80,'교환',True)
  for i,pt in enumerate(pts):chip(d,*pt,115,78,'GPU',not(wait and i<3))
  if wait:
   x,y=pts[0];d.arc((x-26,y+65,x+26,y+117),int(t*70)%360,int(t*70)%360+260,fill=GOLD,width=5)
   text(d,'결과 대기',(x,y+135),22)
  elif kind=='ending':text(d,'함께 일하게 만드는 연결',(dw/2,dh*.97),28)
 elif kind in ['daily','impact']:
  # Three connected narrative objects, no manufactured performance metric.
  x1,x2=dw*.22,dw*.77;y=dh*.52
  d.rounded_rectangle((x1-62,y-45,x1+62,y+37),radius=7,fill='#bcc3b7',outline=INK,width=4)
  d.rectangle((x1-53,y-35,x1+53,y+27),fill='#263c4c')
  for j in range(3):d.line((x1-39,y-19+j*15,x1-15+ease(p)*54,y-19+j*15),fill=CREAM,width=4)
  d.polygon([(x1-62,y+38),(x1+62,y+38),(x1+77,y+52),(x1-77,y+52)],fill='#959e98',outline=INK)
  flow(d,[(x1+80,y),(x2-90,y)],t,TEAL,4)
  for j in range(3):
   yy=y-65+j*45;d.rounded_rectangle((x2-70,yy,x2+70,yy+35),radius=3,fill='#4e636b',outline=INK,width=3)
   for k in range(6):dot(d,x2-48+k*17,yy+16,3,GOLD if math.sin(t*3+k)>0 else'#7c857d')
  text(d,'내 요청',(x1,y+105),25);text(d,'여러 칩의 협업',(x2,y+105),25)
 elif kind=='memory':
  y=dh*.26;chip(d,dw*.28,y,145,90,'GPU',True);chip(d,dw*.69,y,95,72,'HBM')
  flow(d,[(dw*.38,y),(dw*.61,y)],t,GOLD,3);text(d,'가까운 메모리',(dw*.5,y+83),25)
  yy=dh*.77;chip(d,dw*.15,yy,92,70,'서버');chip(d,dw*.85,yy,92,70,'서버')
  flow(d,[(dw*.24,yy),(dw*.75,yy)],t,TEAL,5);text(d,'서버·랙 사이의 통신',(dw*.5,yy+75),25)
 elif kind in ['electrical','signal','lanes','speed']:
  xx1,xx2=dw*.12,dw*.88;yy=dh*.42
  count=6 if kind=='lanes'else 1
  for j in range(count):
   y=yy+(j-(count-1)/2)*20;flow(d,[(xx1+50,y),(xx2-50,y)],t+j*.2,GOLD,4,width=5)
  chip(d,xx1,yy,80,100,'송신');chip(d,xx2,yy,80,100,'수신')
  if kind in ['electrical','signal']:
   wave(d,xx1+45,xx2-45,dh*.70,t,24,GOLD,True)
   if p>.38:
    chip(d,dw*.66,yy,80,68,'보정',True)
    for j in range(3):wave(d,dw*.64+j*15,dw*.64+j*15+10,yy-65-j*13,t,8,RED)
   text(d,'거리·용량 ↑ → 손실·보정 부담',(dw/2,dh*.94),25)
  elif kind=='lanes':
   for j in range(3):d.arc((dw*.43+j*25,dh*.67,dw*.48+j*25,dh*.84),0,290,fill=RED,width=3)
   text(d,'배선 공간 · 전력 · 발열',(dw/2,dh*.94),25)
  else:
   wave(d,xx1+20,xx2-20,dh*.72,t,20,TEAL)
   text(d,'속도 하나가 아닌, 거리·용량·전력',(dw/2,dh*.96),24)
 elif kind in ['conversion','modulator','receiver']:
  if short:pts=[(dw*.50,dh*.10),(dw*.50,dh*.38),(dw*.50,dh*.66),(dw*.50,dh*.93)]
  else:pts=[(dw*.10,dh*.52),(dw*.36,dh*.52),(dw*.65,dh*.52),(dw*.90,dh*.52)]
  for j in range(3):flow(d,[pts[j],pts[j+1]],t,GOLD if j!=1 else TEAL,4,active=p>(j*.12))
  for j,(pt,label) in enumerate(zip(pts,['칩','전기 → 빛','빛 → 전기','칩'])):chip(d,*pt,142 if j in[1,2]else 85,70,label, j==min(3,int(p*4)))
  if kind=='modulator':
   lx,ly=(dw*.18,dh*.37)if short else(dw*.35,dh*.18);bulb(d,lx,ly,t,TEAL)
   line(d,[(lx,ly),pts[1]],TEAL,4);text(d,'광원',(lx,ly-36),23)
   text(d,'빛의 변화를 정보로',(dw*.5,dh*.99 if short else dh*.88),25)
  if kind=='receiver':
   q=pts[2];r=65+20*((t*.5)%1);d.arc((q[0]-r,q[1]-r,q[0]+r,q[1]+r),200,350,fill=TEAL,width=3)
 elif kind in ['wdm','wavelength']:
  cols=[GOLD,TEAL,VIOLET]
  if short:
   for j,col in enumerate(cols):
    x=dw*(.18+j*.32);flow(d,[(x,80),(x,180),(dw*.5+(j-1)*8,270),(dw*.5+(j-1)*8,510),(x,620)],t,col,7,width=4)
    bulb(d,x,65,t+j,col);dot(d,x,635,15,col)
   d.rounded_rectangle((dw*.5-33,265,dw*.5+33,520),radius=20,outline='#f6e7c9',width=3)
   text(d,'한 광섬유',(dw*.74,390),25);text(d,'여러 파장 → 분리',(dw*.5,710),28)
  else:
   for j,col in enumerate(cols):
    y=dh*(.23+j*.27);pts=[(80,y),(250,y),(400,dh*.5+(j-1)*9),(700,dh*.5+(j-1)*9),(850,y),(1000,y)]
    flow(d,pts,t,col,9,width=4);bulb(d,60,y,t+j,col);dot(d,1020,y,16,col)
   d.rounded_rectangle((385,dh*.5-32,715,dh*.5+32),radius=25,outline=CREAM,width=3)
   text(d,'한 광섬유 · 여러 파장',(550,dh*.85),28)
 elif kind in ['existing','cpo','cpo_detail']:
  # Two rows compare the electric reach; same board scale in both rows.
  yy=[dh*.25,dh*.74];x1=dw*.13;front=dw*.84
  for row,y in enumerate(yy):
   if kind=='existing':optic=front
   else:optic=front if row==0 else front-(front-dw*.36)*ease(p/.7)
   d.rounded_rectangle((dw*.04,y-61,dw*.97,y+67),radius=8,fill='#344f58',outline='#b5b4a0',width=2)
   flow(d,[(x1+45,y),(optic-33,y)],t,GOLD,3)
   if optic<front-10:flow(d,[(optic+33,y),(dw*.95,y)],t,TEAL,4)
   chip(d,x1,y,75,80,'칩',True);chip(d,optic,y,75,65,'광변환')
   for k in range(10):d.line((dw*.08+k*(dw*.08),y+48,dw*.08+k*(dw*.08),y+60),fill='#899584',width=2)
   text(d,'앞쪽 광모듈'if row==0 else'칩 가까이 옮기면',(dw*.50,y+100),24)
 elif kind=='industry':
  y=dh*.45
  for x,label in [(dw*.25,'NVIDIA'),(dw*.75,'Intel')]:
   chip(d,x,y,145,105,label,True);flow(d,[(x,y+70),(x,y+125)],t,TEAL,3)
  text(d,'광 네트워킹 제품 발표',(dw*.25,y+165),21);text(d,'2024 광 I/O 시연',(dw*.75,y+165),21)
  text(d,'발표·시연 ≠ 모든 칩에 보편화',(dw*.5,dh*.95),24)
 elif kind in ['limits','thermal']:
  x,y=dw*.5,dh*.55;chip(d,x,y,180,110,'광변환',True)
  for j in range(6):
   xx=x-85+j*32;pts=[]
   for k in range(25):
    yy=y-65-k*4;pts.append((xx+math.sin(k*.25-t*2)*9,yy))
   line(d,pts,RED,3)
  flow(d,[(dw*.10,y),(x-110,y)],t,GOLD,3);flow(d,[(x+110,y),(dw*.9,y)],t,TEAL,3)
  if kind=='limits':
   d.line((x+92,y+104,x+155,y+166),fill=CREAM,width=12);d.arc((x+72,y+81,x+119,y+124),0,285,fill=CREAM,width=10)
   text(d,'비용 · 정렬 · 교체',(dw*.5,dh*.96),27)
  else:
   bulb(d,dw*.14,dh*.22,t,TEAL);text(d,'외부 광원',(dw*.15,dh*.1),23);line(d,[(dw*.14,dh*.25),(dw*.14,y-12),(x-110,y-12)],TEAL,4)
   text(d,'빛을 써도 열은 남는다',(dw*.5,dh*.96),27)
 return im

ARTMAP={k:'racks'for k in ['hook','promise','divide','sync','memory','takeaway','ending']}
ARTMAP.update({k:'lab'for k in ['electrical','signal','lanes','speed','conversion','modulator','receiver','wdm','wavelength','existing','cpo','cpo_detail','industry','limits','thermal']});ARTMAP.update(daily='daily',impact='daily')
ARTMAP.update({k:'fiber'for k in ['wdm','wavelength','speed']});ARTMAP.update({k:'copper'for k in ['electrical','signal','lanes']});ARTMAP.update({k:'hero'for k in ['conversion','modulator','receiver','existing','cpo','cpo_detail']})
def getseg(t):return next((s for s in plan['segments']if s['start']<=t<s['start']+s['duration']),plan['segments'][-1])
def wrap(s,maxwidth,n):
 words=s.replace('\\N',' ').split();lines=['']
 for w in words:
  nxt=(lines[-1]+' '+w).strip()
  if ft(n).getlength(nxt)>maxwidth and lines[-1]:lines.append(w)
  else:lines[-1]=nxt
 return lines

def frame(t,opening=None):
 seg=getseg(t);kind=seg['id'];local=t-seg['start'];p=local/seg['duration'];art=ARTMAP[kind]
 # Establish place on beat change, then unfold explanatory drawing over it.
 im=opening.copy() if opening else cover(ART[art],W,H,p,focus=.34 if art=='daily'and short else .5)
 im=Image.alpha_composite(im.convert('RGBA'),shade)
 if opening is None:
  alpha=ease((local-.25)/.7)
  if kind in ['daily','impact']:alpha*=.87
  tint=Image.new('RGBA',(W,H),(13,24,32,round(125*alpha)));im=Image.alpha_composite(im,tint)
  layer=diagram(kind,local,p);pos=((W-layer.width)//2,round(H*.235)if short else 160)
  if alpha<1:layer.putalpha(layer.getchannel('A').point(lambda x:round(x*alpha)))
  im.alpha_composite(layer,pos)
 d=ImageDraw.Draw(im)
 text(d,'AI의 숨은 기반 ⑤',(W*.045,H*.045),18 if short else 16,anchor='lm',stroke=1)
 text(d,'웹툰 개념 재구성',(W*.955,H*.045),15 if short else 14,anchor='rm')
 if t<3.4:
  title=['AI칩끼리 왜','빛으로 대화할까?']if short else['AI칩끼리 왜 빛으로 대화할까?']
  for j,x in enumerate(title):text(d,x,(W/2,H*.13+j*54),45 if short else 43,stroke=2)
 elif opening is None:
  title=S['beats'][seg['index']]['label'];lines=wrap(title,W*.86,30 if short else 33)
  for j,x in enumerate(lines):text(d,x,(W/2,H*.135+j*39),30 if short else 33,stroke=2)
 if kind in ['wdm','wavelength']:
  text(d,'색은 파장 구분용 · 실제는 주로 적외선',(W/2,H*.81 if short else H*.83),17 if short else 18,stroke=1)
 if kind in ['conversion','modulator','receiver']:
  text(d,'금색: 전기   청록: 광 연결',(W/2,H*.81 if short else H*.83),20,stroke=1)
 cap=next((q for q in caps if q['start']<=t<q['end']),None)
 if cap:
  n=39 if short else 34;lines=wrap(cap['text'],W*.86,n);assert len(lines)<=2,(cap,lines)
  yy=H*.875 if short else H*.885
  for j,x in enumerate(lines):text(d,x,(W/2,yy+j*(n+9)),n,stroke=3)
 d.line((W*.045,H*(.96 if short else .985),W*(.045+.91*t/DURATION),H*(.96 if short else .985)),fill=GOLD,width=2)
 return im.convert('RGB')

def run(cmd,log=None):
 r=subprocess.run([str(x)for x in cmd],capture_output=True)
 if log:(C/'logs'/log).write_bytes(r.stderr)
 if r.returncode:raise RuntimeError(r.stderr.decode(errors='replace')[-1800:])
 return r.stdout

def preview():
 ids=['hook','daily','sync','electrical','conversion','wdm','cpo','limits','ending']if not short else['hook','electrical','conversion','wdm','ending']
 tiles=[]
 for sid in ids:
  s=next(s for s in plan['segments']if s['id']==sid);t=s['start']+s['duration']*.60
  img=frame(t);img.save(C/'qa'/f'preview-{A.variant}-{sid}.jpg',quality=92);img.thumbnail((360,360 if short else 203));tiles.append(img)
 sheet=Image.new('RGB',(360*3,(360 if short else 203)*math.ceil(len(tiles)/3)),INK)
 for i,img in enumerate(tiles):sheet.paste(img,((i%3)*360,(i//3)*(360 if short else 203)))
 dest=C/'qa'/f'preview-{A.variant}.jpg';sheet.save(dest,quality=93);print(dest)

def render():
 assert(C/'opening.mp4').exists(),'Higgsfield opening required'
 assert ORIGINAL.exists(),'Original verified audio source required'
 hashes=json.loads((Path(__file__).parent/'verification.json').read_text())
 # Exact input hash is also recorded in output QA; keep pre-existing files immutable.
 oldhash=hashlib.file_digest(ORIGINAL.open('rb'),'sha256').hexdigest()
 part=FINAL.with_suffix('.partial.mp4');log=(C/'logs'/f'render-{A.variant}.log').open('wb')
 enc=subprocess.Popen(['ffmpeg','-v','error','-y','-f','rawvideo','-pix_fmt','rgb24','-s',f'{W}x{H}','-r',str(FPS),'-i','-','-i',str(ORIGINAL),'-map','0:v','-map','1:a:0','-vf',f'scale={OUTW}:{OUTH}:flags=lanczos','-c:v','libx264','-preset','fast','-crf','21','-threads','4','-pix_fmt','yuv420p','-c:a','copy','-t',str(DURATION),'-movflags','+faststart',str(part)],stdin=subprocess.PIPE,stderr=log)
 dec=subprocess.Popen(['ffmpeg','-v','error','-i',str(C/'opening.mp4'),'-vf',f'scale={W}:{H}:force_original_aspect_ratio=increase,crop={W}:{H},fps={FPS}','-frames:v','144','-f','rawvideo','-pix_fmt','rgb24','-'],stdout=subprocess.PIPE,stderr=subprocess.DEVNULL)
 try:
  for i in range(FRAMES):
   op=None
   if i<144:
    raw=dec.stdout.read(W*H*3);assert len(raw)==W*H*3;op=Image.frombytes('RGB',(W,H),raw)
   enc.stdin.write(frame(i/FPS,op).tobytes())
   if i%480==0:print('RENDER',A.variant,i,'/',FRAMES,flush=True)
  enc.stdin.close();rc=enc.wait();rd=dec.wait();log.close();assert rc==0 and rd==0
  part.replace(FINAL);assert hashlib.file_digest(ORIGINAL.open('rb'),'sha256').hexdigest()==oldhash
  print('FINAL',FINAL,flush=True)
 except BaseException:
  enc.kill();dec.kill();enc.wait();dec.wait();raise

def verify():
 meta=json.loads(run(['ffprobe','-v','error','-show_format','-show_streams','-of','json',FINAL]));v=next(x for x in meta['streams']if x['codec_type']=='video');a=next(x for x in meta['streams']if x['codec_type']=='audio')
 assert(v['width'],v['height'])==(OUTW,OUTH);assert int(v['nb_frames'])==FRAMES;assert abs(float(a['duration'])-DURATION)<.12
 run(['ffmpeg','-v','error','-i',FINAL,'-f','null','-'],f'decode-{A.variant}.log')
 run(['ffmpeg','-hide_banner','-i',FINAL,'-af','silencedetect=noise=-40dB:d=1.3,volumedetect','-vf','blackdetect=d=.3:pix_th=.05','-f','null','-'],f'analysis-{A.variant}.log')
 log=(C/'logs'/f'analysis-{A.variant}.log').read_text();sil=re.findall(r'silence_duration: ([\d.]+)',log);black=re.findall(r'black_start:[^\n]+',log);assert not sil and not black
 # Packet/audio payload equivalence: no second TTS or retiming of existing audio.
 ah=[]
 for f in[ORIGINAL,FINAL]:ah.append(run(['ffmpeg','-v','error','-i',f,'-map','0:a:0','-c','copy','-f','hash','-hash','sha256','-']).decode().strip())
 assert ah[0]==ah[1],ah
 for q in caps:assert q['end']>q['start']and len(wrap(q['text'],W*.86,39 if short else 34))<=2
 tiles=[]
 selected=plan['segments'] if not short else plan['segments']
 for i,s in enumerate(selected):
  t=s['start']+(min(2,s['duration']*.3)if i==0 else s['duration']*.6);f=C/'qa'/f'final-{A.variant}-{s["id"]}.jpg'
  run(['ffmpeg','-v','error','-y','-ss',str(t),'-i',FINAL,'-frames:v','1','-vf','scale=240:-1',f]);tiles.append(Image.open(f).copy())
 th=tiles[0].height;sheet=Image.new('RGB',(240*4,th*math.ceil(len(tiles)/4)),INK)
 for i,img in enumerate(tiles):sheet.paste(img,((i%4)*240,(i//4)*th))
 sheet.save(C/'qa'/f'final-{A.variant}-sheet.jpg',quality=92)
 report={'file':str(FINAL),'duration':float(v['duration']),'frames':FRAMES,'resolution':[OUTW,OUTH],'artStyle':'webtoon','audioReusedExactly':True,'audioPacketHash':ah[0],'voice':S['voiceId'],'speed':plan['speed'],'captionCount':len(caps),'captionLayout':True,'fullDecode':True,'silencesOver1_3sec':sil,'blackSegments':black,'maxVolume':re.findall(r'max_volume: ([^\n]+)',log),'sha256':hashlib.file_digest(FINAL.open('rb'),'sha256').hexdigest(),'originalSha256':hashlib.file_digest(ORIGINAL.open('rb'),'sha256').hexdigest(),'visualReview':'pending','limitations':['Illustrated conceptual structure, not an as-built product schematic.','Photon and signal colors/speeds are explanatory; actual optical signals mainly infrared.']}
 (C/f'{A.variant}-verification.json').write_text(json.dumps(report,ensure_ascii=False,indent=2));print(json.dumps(report,ensure_ascii=False))
if A.mode=='preview':preview()
elif A.mode=='render':render()
else:verify()
