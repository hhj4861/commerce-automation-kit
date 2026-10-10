"""Apply the approved bathroom-v2 typography to two original, text-free edits."""
import argparse,hashlib,json,math,re,subprocess
from pathlib import Path
import numpy as np
from PIL import Image,ImageDraw,ImageFont
P=argparse.ArgumentParser();P.add_argument('film',choices=['moses','falkirk']);P.add_argument('mode',choices=['build','assemble','verify']);A=P.parse_args()
ROOT=Path('/Users/admin/Library/Mobile Documents/com~apple~CloudDocs/gpt 작업/commerce-automation-kit');HERE=Path(__file__).parent;FPS=24;W,H=1080,1920
if A.film=='moses':
 C=ROOT/'20261010-moses-bridge';B=C/'clips';OLD=Path('/Users/admin/Downloads/vedio/moses-bridge-immersive-short.mp4');OUT=OLD.with_name('moses-bridge-immersive-short-v2.mp4');TITLE=['물 아래 길인데','왜 안 잠길까?'];REPORT=HERE.parent/'20261010-moses-bridge/verification.json';HEAD_END=3.8
else:
 C=ROOT/'20261009-falkirk-wheel';B=ROOT/'20261010-falkirk-full/final';OLD=Path('/Users/admin/Downloads/vedio/falkirk-wheel-immersive-full-v3.mp4');OUT=OLD.with_name('falkirk-wheel-immersive-full-v4.mp4');TITLE=['배가 들어와도','무게는 그대로?'];REPORT=HERE.parent/'20261009-falkirk-wheel/full-verification.json';HEAD_END=3.3333333333
D=ROOT/'20261010-architecture-typography'/A.film;D.mkdir(parents=True,exist_ok=True);TL=json.loads((C/'timeline.json').read_text());E=json.loads(REPORT.read_text());FONT=C/'fonts/Pretendard-SemiBold.otf';CF=ImageFont.truetype(str(FONT),62);TF=ImageFont.truetype(str(FONT),88);NF=ImageFont.truetype(str(FONT),34)
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
def run(args):
 r=subprocess.run([str(x)for x in args],capture_output=True)
 if r.returncode:raise RuntimeError(r.stderr.decode(errors='replace')[-4000:])
 return r.stdout
def probe(p):return json.loads(run(['ffprobe','-v','error','-show_streams','-of','json',p]))['streams']
def cy(c):return 330 if A.film=='moses' and c['scene']in ['liner','anchor','drain']else 1420
def wrap(text):
 text=text.replace(r'\N',' ').strip()
 if CF.getlength(text)<=880:return [text]
 w=text.split();opts=[[' '.join(w[:i]),' '.join(w[i:])]for i in range(1,len(w))];opts=[x for x in opts if max(CF.getlength(z)for z in x)<=880];assert opts,text
 return min(opts,key=lambda x:abs(CF.getlength(x[0])-CF.getlength(x[1])))
def draw(cap,hook,note):
 im=Image.new('RGBA',(W,H));d=ImageDraw.Draw(im)
 if hook:
  for y in range(620):d.line((0,y,W,y),fill=(12,22,27,int(170*max(0,1-y/620))))
  d.rounded_rectangle((76,198,84,395),radius=4,fill=(110,233,219,255))
  for j,line in enumerate(TITLE):
   assert TF.getlength(line)<890
   d.text((112,204+j*106),line,font=TF,fill=(255,255,255,255)if j==0 else(146,244,228,255),anchor='lt')
 if cap is not None:
  c=TL['captions'][cap];ls=wrap(c['text']);width=max(CF.getlength(s)for s in ls);height=len(ls)*78+36;top=cy(c)-height/2
  d.rounded_rectangle(((W-width)/2-30,top,(W+width)/2+30,top+height),radius=20,fill=(13,22,29,215))
  for j,line in enumerate(ls):d.text((W/2,top+18+j*78),line,font=CF,fill=(255,255,255,255),anchor='mt')
 if note:
  text='10톤은 원리 설명을 위한 예시';width=NF.getlength(text);d.rounded_rectangle(((W-width)/2-22,365,(W+width)/2+22,425),radius=12,fill=(13,22,29,210));d.text((540,380),text,font=NF,fill=(255,255,255,255),anchor='mt')
 return im
def state(t):
 c=next((i for i,c in enumerate(TL['captions'])if c['start']<=t<c['end']),None);note=False
 if A.film=='falkirk':
  st=next(b['start']for b in TL['beats']if b['id']=='displace')+7;note=st<=t<st+3
 return c,t<HEAD_END,note
assert sha(OLD)==E['sha256'],'Original final file differs from reviewed source'
if A.mode=='build':
 clips=[]
 expected={x['shot']:x['sha256']for x in (E['render']['shots']if A.film=='moses'else E['inputs'])}
 for b in TL['beats']:
  f=B/(b['id']+'.mp4');v=next(z for z in probe(f)if z['codec_type']=='video');assert(v['width'],v['height'],v['pix_fmt'])==(W,H,'yuv420p');assert int(v['nb_frames'])==round(b['duration']*FPS)
  if b['id']in expected:assert sha(f)==expected[b['id']],b['id']
  clips.append({'id':b['id'],'file':str(f),'sha256':sha(f),'frames':int(v['nb_frames'])})
 (D/'clips.json').write_text(json.dumps(clips,indent=2));(D/'list.txt').write_text(''.join("file '"+x['file'].replace("'","'\\''")+"'\n"for x in clips))
 for b in TL['beats']:
  joined=''.join(c['text'].replace(r'\N','')for c in TL['captions']if c['scene']==b['id']);assert re.sub(r'\s','',joined)==re.sub(r'\s','',b['narration'])
 if A.film=='moses':
  # Retain only actual projected-anchor vector events, never the old text styles.
  old=(C/'edit/captions.ass').read_text();header=old[:old.index('Dialogue:')];events=[line for line in old.splitlines()if line.startswith('Dialogue: 3,')];assert events and all('\\p1' in x for x in events);(D/'anchors.ass').write_text(header+'\n'.join(events)+'\n')
 assets={};states=[]
 for f in range(TL['frames']):
  s=state(f/FPS)
  if s not in assets:
   file=D/f'overlay-{len(assets):03}.png';draw(*s).save(file);assets[s]=file
  if states and states[-1][0]==s:states[-1][1]+=1
  else:states.append([s,1])
 proc=subprocess.Popen(['ffmpeg','-v','error','-y','-f','rawvideo','-pixel_format','rgba','-video_size','1080x1920','-framerate','24','-i','pipe:0','-an','-c:v','qtrle',str(D/'graphics.mov')],stdin=subprocess.PIPE,stderr=subprocess.PIPE)
 try:
  for s,n in states:
   pixels=Image.open(assets[s]).convert('RGBA').tobytes()
   for _ in range(n):proc.stdin.write(pixels)
  proc.stdin.close();err=proc.stderr.read();assert proc.wait()==0,err.decode()
 finally:
  if proc.poll()is None:proc.kill();proc.wait()
 assert int(probe(D/'graphics.mov')[0]['nb_frames'])==TL['frames'];print(A.film,'graphics ready',flush=True);raise SystemExit()
if A.mode=='assemble':
 for x in json.loads((D/'clips.json').read_text()):assert sha(Path(x['file']))==x['sha256']
 base=f"[0:v]ass='{D}/anchors.ass':fontsdir='{C}/fonts'[base];"if A.film=='moses'else '[0:v]null[base];'
 filters=base+f"[2:v]setpts=PTS-STARTPTS[g];[base][g]overlay=eof_action=pass,fade=t=out:st={TL['duration']-.5}:d=0.5[v]"
 # Same-sized sources have differing color metadata. Keep graph state across that boundary.
 run(['ffmpeg','-v','error','-y','-reinit_filter','0','-f','concat','-safe','0','-i',D/'list.txt','-i',OLD,'-i',D/'graphics.mov','-filter_complex',filters,'-map','[v]','-map','1:a:0','-r','24','-fps_mode','cfr','-frames:v',TL['frames'],'-t',TL['duration'],'-c:v','libx264','-crf','18','-preset','medium','-pix_fmt','yuv420p','-c:a','copy','-movflags','+faststart',OUT]);print('Created',OUT,flush=True);raise SystemExit()
s=probe(OUT);v=next(x for x in s if x['codec_type']=='video');au=next(x for x in s if x['codec_type']=='audio');assert int(v['nb_frames'])==TL['frames'];assert(v['width'],v['height'])==(W,H);assert abs(float(v['duration'])-float(au['duration']))<.1
run(['ffmpeg','-v','error','-i',OUT,'-f','null','-'])
def audiohash(p):return hashlib.sha256(run(['ffmpeg','-v','error','-i',p,'-map','0:a:0','-c:a','copy','-f','adts','-'])).hexdigest()
assert audiohash(OUT)==audiohash(OLD),'Audio packets changed'
pcm=np.frombuffer(run(['ffmpeg','-v','error','-i',OUT,'-map','0:a:0','-ac','1','-ar','16000','-f','f32le','-']),dtype='<f4');levels=[]
for b in TL['beats']:
 a=pcm[round(b['start']*16000):round((b['start']+b['speechDuration'])*16000)];rms=float(np.sqrt(np.mean(a*a)));assert rms>.025;levels.append({'scene':b['id'],'rms':rms})
checks=[]
for i,c in enumerate(TL['captions']):
 frame=round((c['start']+c['end'])/2*FPS);y=((cy(c)-125)//2)*2
 raw=run(['ffmpeg','-v','error','-i',OUT,'-vf',f'select=eq(n\\,{frame}),crop=1080:250:0:{y}','-frames:v','1','-pix_fmt','rgb24','-f','rawvideo','-']);img=np.frombuffer(raw,dtype=np.uint8).reshape(250,W,3);ex=np.asarray(draw(i,False,False))[y:y+250];mask=(ex[:,:,:3].min(axis=2)>245)&(ex[:,:,3]==255);ratio=float((img[mask].min(axis=1)>185).mean());assert ratio>.9,(i,ratio);checks.append({'caption':i,'frame':frame,'glyphMatch':ratio})
times=[1]+[b['start']+b['duration']*.55 for b in TL['beats'][1:]]+[TL['duration']-1];board=Image.new('RGB',(1080,510*math.ceil(len(times)/4)),(20,25,30));d=ImageDraw.Draw(board)
for i,t in enumerate(times):
 file=D/f'qa-{i}.jpg';run(['ffmpeg','-v','error','-y','-ss',t,'-i',OUT,'-frames:v','1','-vf','scale=270:480',file]);board.paste(Image.open(file),(i%4*270,i//4*510));d.text((i%4*270+8,i//4*510+483),f'{t:.1f}s',fill='white')
board.save(D/'contact.jpg')
r={'file':str(OUT),'sha256':sha(OUT),'sourceFinal':str(OLD),'sourceFinalHash':sha(OLD),'frames':int(v['nb_frames']),'duration':float(v['duration']),'decode':'pass','audioPackets':'identical to user-specified original','audioHash':audiohash(OUT),'audioLevels':levels,'captionTiming':checks,'endingHold':TL['beats'][-1]['duration']-TL['beats'][-1]['speechDuration'],'paidCalls':0,'bodyRerender':False,'visualReview':'pending','preservedAnnotations':'projected anchors'if A.film=='moses'else'10-ton hypothetical example','sourceHash':sha(Path(__file__))};(D/'verification.json').write_text(json.dumps(r,ensure_ascii=False,indent=2));print(json.dumps({'film':A.film,'file':str(OUT),'duration':r['duration'],'checks':'pass'},ensure_ascii=False),flush=True)
