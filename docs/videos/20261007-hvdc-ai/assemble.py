"""Speech-led longform assembly. Exact-source forced alignment, complete sentences, no truncation."""
import argparse,json,math,os,subprocess,hashlib,shutil,wave,re,time
from pathlib import Path
import numpy as np
from PIL import Image,ImageFont,ImageDraw
P=argparse.ArgumentParser();P.add_argument('mode',choices=['align','plan','assemble','verify','contact']);P.add_argument('--cache',type=Path,required=True);P.add_argument('--wait-for-render',action='store_true');P.add_argument('--only',default='all');P.add_argument('--no-final',action='store_true');A=P.parse_args();C=A.cache;HERE=Path(__file__).parent
for d in ['tmp','logs','alignment','fonts','qa','edit']:(C/d).mkdir(exist_ok=True)
os.environ['TMPDIR']=str(C/'tmp');os.environ['NUMBA_CACHE_DIR']=str(C/'tmp/numba')
S=json.loads((HERE/'story.json').read_text());W,H,FPS,SR=1920,1080,24,44100;FINAL=Path('/Users/admin/Downloads/vedio/hvdc-ai-longform.mp4');FONT=C/'fonts/Pretendard-SemiBold.otf'
if not FONT.exists():shutil.copy2(C.parent/'20261005-jewel-webtoon/fonts/Pretendard-SemiBold.otf',FONT)
fnt=ImageFont.truetype(str(FONT),52)
def run(args,log=None):
 r=subprocess.run([str(x)for x in args],capture_output=True)
 if log:(C/'logs'/log).write_bytes(r.stderr)
 if r.returncode:raise RuntimeError(r.stderr.decode(errors='replace')[-2000:])
 return r.stdout
def probe(f):return json.loads(run(['ffprobe','-v','error','-show_streams','-show_format','-of','json',f]))
def voice(b):return C/'voice'/(b['id']+'.mp3')
def display_text(t):
 for a,b in [('에이아이','AI'),('에이치브이디씨','HVDC'),('지피유','GPU'),('이천이십오 년','2025년'),('이천이십사 년','2024년'),('이천삼십 년','2030년'),('이백 메가와트','200MW'),('제삼연계선','제3연계선')]:t=t.replace(a,b)
 return t
def wrap(t):
 t=t.strip()
 if fnt.getlength(t)<=1100:return t
 ws=t.split();opts=[(' '.join(ws[:j]),' '.join(ws[j:]))for j in range(1,len(ws))];opts=[q for q in opts if max(fnt.getlength(z)for z in q)<=1250]
 if not opts:raise RuntimeError('Caption too long')
 l,r=min(opts,key=lambda q:abs(fnt.getlength(q[0])-fnt.getlength(q[1])));return l+r'\N'+r
if A.mode=='align':
 import whisper,torch
 from whisper.timing import find_alignment
 from whisper.tokenizer import get_tokenizer
 torch.set_num_threads(4);m=whisper.load_model('base',device='cpu',download_root=str(C.parent/'20261001-glass-substrate/models'));tok=get_tokenizer(m.is_multilingual,language='ko',task='transcribe')
 for b in S['scenes']:
  target=C/'alignment'/(b['id']+'.json');meta=json.loads(Path(str(voice(b))+'.json').read_text());assert meta['text']==b['narration'] and meta['voiceId']==S['voiceId']
  if target.exists():
   assert json.loads(target.read_text())['text']==b['narration'];continue
  au=whisper.load_audio(str(voice(b)));assert len(au)/16000<30,'Long speech needs separate alignment chunks, never cut it';mel=whisper.log_mel_spectrogram(whisper.pad_or_trim(au),n_mels=m.dims.n_mels);words=find_alignment(m,tok,tok.encode(b['narration']),mel,len(au)//160);target.write_text(json.dumps(dict(text=b['narration'],duration=len(au)/16000,words=[dict(text=w.word,start=float(w.start),end=float(w.end))for w in words]),ensure_ascii=False,indent=2));print('ALIGNED',b['id'],round(len(au)/16000,2),flush=True)
 raise SystemExit()
if A.mode=='plan':
 t=0;beats=[];captions=[];audio=[]
 for b in S['scenes']:
  al=json.loads((C/'alignment'/(b['id']+'.json')).read_text());assert al['text']==b['narration'];v=np.frombuffer(run(['ffmpeg','-v','error','-i',voice(b),'-ar',SR,'-ac','1','-f','f32le','-']),dtype='<f4').copy();D=math.ceil((len(v)/SR+(2.7 if b['id']=='ending'else .22))*FPS)/FPS;beats.append({**b,'start':t,'duration':D,'speechDuration':len(v)/SR});audio.append(np.pad(v,(0,round(D*SR)-len(v))));groups=[];g=[]
  for w in al['words']:
   text=''.join(x['text']for x in g)+w['text']
   if g and(len(text)>38 or w['end']-g[0]['start']>4):groups.append(g);g=[]
   g.append(w)
   if re.search(r'[.!?]$',w['text'].strip()):groups.append(g);g=[]
  if g:groups.append(g)
  merged=[]
  for group in groups:
   text=''.join(w['text']for w in group).strip()
   if not re.search('[가-힣A-Za-z0-9]',text) and merged:merged[-1].extend(group)
   else:merged.append(group)
  groups=merged
  for j,g in enumerate(groups):
   st=g[0]['start'];en=min(len(v)/SR,g[-1]['end']+.10)
   if j+1<len(groups):en=min(en,groups[j+1][0]['start'])
   text=''.join(w['text']for w in g).strip();assert re.search('[가-힣A-Za-z0-9]',text)
   captions.append(dict(scene=b['id'],start=t+st,end=t+max(st+.10,en),text=wrap(display_text(text))))
  t+=D
 assert 240<t<900,f'Unexpected {t}s; inspect before rendering';captions[-1]['end']=t-.35;arr=np.concatenate(audio);arr*=min(1,.9/max(abs(arr)))
 with wave.open(str(C/'audio-raw.wav'),'wb')as f:f.setnchannels(1);f.setsampwidth(2);f.setframerate(SR);f.writeframes((np.clip(arr,-1,1)*32767).astype('<i2').tobytes())
 run(['ffmpeg','-v','error','-y','-i',C/'audio-raw.wav','-af','loudnorm=I=-16:TP=-1.5:LRA=9','-ar',SR,C/'audio.wav'])
 tl=dict(duration=t,frames=round(t*FPS),width=W,height=H,fps=FPS,voiceId=S['voiceId'],speed=1,beats=beats,captions=captions,reviewDigest=json.loads((C/'review.json').read_text())['digest']);(C/'timeline.json').write_text(json.dumps(tl,ensure_ascii=False,indent=2));print(json.dumps(dict(duration=t,beats=len(beats),captions=len(captions),lastHold=beats[-1]['duration']-beats[-1]['speechDuration'])));raise SystemExit()
TL=json.loads((C/'timeline.json').read_text())
def ts(t):
 n=round(t*100);return f'{n//360000}:{n//6000%60:02}:{n//100%60:02}.{n%100:02}'
HEADER='''[Script Info]
ScriptType: v4.00+
PlayResX: 1920
PlayResY: 1080
WrapStyle: 2
ScaledBorderAndShadow: yes
[V4+ Styles]
Format: Name,Fontname,Fontsize,PrimaryColour,SecondaryColour,OutlineColour,BackColour,Bold,Italic,Underline,StrikeOut,ScaleX,ScaleY,Spacing,Angle,BorderStyle,Outline,Shadow,Alignment,MarginL,MarginR,MarginV,Encoding
Style: Caption,Pretendard SemiBold,52,&H00FFFFFF,&H00FFFFFF,&H00221A12,&H99000000,0,0,0,0,100,100,0,0,1,2.2,0.8,2,150,150,205,1
Style: Chapter,Pretendard SemiBold,42,&H00D3EFFF,&H00FFFFFF,&H00221A12,&H99000000,0,0,0,0,100,100,0,0,1,2,1,7,80,80,65,1
Style: Small,Pretendard SemiBold,30,&H00EEEEEE,&H00FFFFFF,&H00221A12,&H99000000,0,0,0,0,100,100,0,0,1,2,1,7,80,80,130,1
Style: Hook,Pretendard SemiBold,68,&H00FFFFFF,&H00FFFFFF,&H00221A12,&H99000000,0,0,0,0,100,100,0,0,1,3,1,8,80,80,95,1
[Events]
Format: Layer,Start,End,Style,Name,MarginL,MarginR,MarginV,Effect,Text
'''
def event(st,en,style,text):return f'Dialogue: 0,{ts(st)},{ts(en)},{style},,0,0,0,,{text}\n'
def annotations(b):
 id=b['id'];D=b['duration'];lines=[]
 if id=='voltage':lines=[(1,D*.38,'같은 전달 전력 · 같은 전선 저항'),(D*.38,D,'전류 ½ → 저항 열손실 ¼')]
 elif id in ['ac-also','acdc']:lines=[(1,D,'고전압의 이점은 교류에도 적용됩니다'if id=='ac-also'else'청록: 교류 전압    금색: 직류 전압 · 둘 다 전력을 전달합니다')]
 elif id=='cable':lines=[(1,D*.52,'도체 → 절연층 → 금속 차폐층'),(D*.52,D,'두 금속층 사이에 에너지를 저장하는 성질')]
 elif id=='charging':lines=[(1,D,'교류 · 충전과 방전 반복 → 전류 여유 사용')]
 elif id=='dc-cable':lines=[(1,D*.65,'직류 · 초기 충전 뒤 전기장 유지'),(D*.65,D,'도체·변환소의 손실은 남습니다')]
 elif id=='not-waste':lines=[(1,D,'저장했다 반환하는 에너지 ≠ 전부 열손실')]
 elif id=='valves':lines=[(1,13.2,'고정된 전원 · 왼쪽 출력 + / 오른쪽 출력 −'),(13.2,14.25,'첫 스위치 쌍을 끕니다'),(14.25,D,'반대 쌍을 켜면 · 왼쪽 출력 − / 오른쪽 출력 +')]
 elif id=='control':lines=[(1,D*.40,'4개 스위치: 극성 전환을 보여주는 기초 예'),(D*.43,D,'실제 설비: 다수 모듈·제어·필터')]
 elif id=='chip':lines=[(1,min(10,D),'지역 전력망 → 변압기·전원 장치 → 낮은 전압의 직류')]
 elif id=='demand':lines=[(1,D*.35,'데이터센터 전체 · IEA 2025 기본 시나리오'),(D*.35,D,'2024년 추정 415 TWh → 2030년 전망 약 945 TWh')]
 elif id=='jeju':lines=[(1,D,'완도–동제주 제3연계선 · 2024 준공 · 200 MW')]
 elif id=='jeju-context':lines=[(1,D,'국내 전력망 연결 사례 · AI 전용 사업이 아님')]
 elif id=='cost':lines=[(1,D,'변환소 비용 + 변환 손실 + 노선 조건')]
 elif id=='not-magic':lines=[(1,D,'발전량 부족은 송전선만으로 해결되지 않습니다')]
 return lines
def zero_reference(b):
 if b['id'] not in ['ac-also','acdc']:return ''
 D=b['duration'];events=''
 def project(pos,eye,target):
  eye=np.array(eye,dtype=float);forward=np.array(target)-eye;forward/=np.linalg.norm(forward);right=np.cross(forward,[0,0,1]);right/=np.linalg.norm(right);up=np.cross(right,forward);v=np.array(pos)-eye;z=np.dot(v,forward);f=W*46/36;return np.array([W/2+f*np.dot(v,right)/z,H/2-f*np.dot(v,up)/z])
 for frame in range(0,round(D*FPS),2):
  st=frame/FPS;en=min(D,(frame+2)/FPS);u=st/D;phase=min(2,int(u*3));v=u*3%1;eye=(5,-14,8)if phase==1 else(9-v,-15,13)
  for yy in [-2.5,2.5]:
   aa=project((-5.8,yy,1.2),eye,(0,0,.5));bb=project((5.8,yy,1.2),eye,(0,0,.5));d=bb-aa;norm=np.array([-d[1],d[0]])/np.linalg.norm(d)*1.4;pts=[aa+norm,bb+norm,bb-norm,aa-norm];shape='m '+' l '.join(f'{x:.1f} {y:.1f}'for x,y in pts)
   events+=event(st,en,'Small',r'{\an7\pos(0,0)\p1\c&HBBBBBB&\alpha&H45&}'+shape)
   if 40<aa[0]<W-40 and 200<aa[1]<H-230:events+=event(st,en,'Small',r'{\an5\pos('+f'{aa[0]-18:.1f},{aa[1]:.1f}'+r')\fs30\c&HFFFFFF&}0')
 return events
if A.mode=='assemble':
 assert(C/'opening.mp4').exists(),'Higgsfield opening required';assert json.loads((C/'review.json').read_text())['passed'];clips=[]
 code="import{readFile}from'node:fs/promises';import{validateDepthReview}from'./apps/shopshorts/lib/explanation-depth.js';const s=JSON.parse(await readFile(process.argv[1]));s.beats=s.scenes.map(x=>({...x,text:x.narration}));const r=await validateDepthReview(JSON.parse(await readFile(process.argv[2])),s.brief,s);if(!r.passed)process.exit(1);"
 subprocess.run(['node','--input-type=module','-e',code,str(HERE/'story.json'),str(C/'review.json')],cwd=HERE.parents[2],check=True)
 for i,b in enumerate(TL['beats']):
  if A.only!='all' and b['id']not in A.only.split(','):continue
  id=b['id'];D=b['duration'];source=C/'clips'/(id+'.mp4')
  if A.wait_for_render:
   deadline=time.monotonic()+14400;announced=False
   while True:
    try:
     q=next(x for x in probe(source)['streams']if x['codec_type']=='video')
     if int(q.get('nb_frames',0))==round(D*FPS):break
    except (RuntimeError,StopIteration,ValueError):pass
    if time.monotonic()>deadline:raise TimeoutError('Render incomplete '+id)
    if not announced:print('WAIT_RENDER',id,flush=True);announced=True
    time.sleep(3)
  v=next(x for x in probe(source)['streams']if x['codec_type']=='video');assert int(v['nb_frames'])==round(D*FPS),(id,v['nb_frames'],D)
  if id in ['chip','ending']:
   board=C/'board-motion.mp4';assert board.exists();joined=C/'edit'/(id+'-picture-source.mp4');cut=10 if id=='chip'else D-6
   if not joined.exists()or joined.stat().st_mtime<max(source.stat().st_mtime,board.stat().st_mtime):
    run(['ffmpeg','-v','error','-y','-i',source,'-i',board,'-filter_complex',f'[0:v]trim=duration={cut},setpts=PTS-STARTPTS,setsar=1[a];[1:v]trim=duration={D-cut},setpts=PTS-STARTPTS,setsar=1[b];[a][b]concat=n=2:v=1:a=0[v]','-map','[v]','-an','-c:v','libx264','-preset','fast','-crf','18','-threads','4',joined])
   source=joined
  ass=HEADER+zero_reference(b)
  if i==0:ass+=event(0,3.7,'Hook','AI칩은 준비됐는데, 전기가 없다면?')
  else:ass+=event(.25,min(6,D),'Chapter',b['label'])
  for j,(st,en,text)in enumerate(annotations(b)):ass+=event(st,en,'Small',r'{\pos(80,'+str(135)+')}' +text)
  for cue in TL['captions']:
   if cue['scene']==id:ass+=event(cue['start']-b['start'],cue['end']-b['start'],'Caption',cue['text'])
  af=C/'edit'/(id+'.ass');old=af.read_text()if af.exists()else None;out=C/'edit'/(id+'.mp4');clips.append(out)
  if old==ass and out.exists()and out.stat().st_mtime>=source.stat().st_mtime:
   try:
    q=next(x for x in probe(out)['streams']if x['codec_type']=='video')
    if int(q.get('nb_frames',0))==round(D*FPS):print('EDIT_CACHED',id,flush=True);continue
   except (RuntimeError,StopIteration,ValueError):pass
  af.write_text(ass)
  if i==0:
   joined=C/'edit/opening-joined.mp4';run(['ffmpeg','-v','error','-y','-i',C/'opening.mp4','-i',source,'-filter_complex',f'[0:v]scale=1920:1080:force_original_aspect_ratio=increase,crop=1920:1080,fps=24,trim=duration=6,setpts=PTS-STARTPTS,setsar=1[a];[1:v]trim=start=6,setpts=PTS-STARTPTS,setsar=1[b];[a][b]concat=n=2:v=1:a=0[v]','-map','[v]','-an','-c:v','libx264','-preset','fast','-crf','18','-threads','4',joined]);source=joined
  vf=f"setsar=1,subtitles=filename='{af}':fontsdir='{C/'fonts'}'"
  run(['ffmpeg','-v','error','-y','-i',source,'-t',D,'-vf',vf,'-an','-c:v','libx264','-preset','fast','-crf','18','-threads','4','-pix_fmt','yuv420p','-r',FPS,out]);print('EDITED',id,flush=True)
 if A.no_final:raise SystemExit()
 concat=C/'edit/concat.txt';concat.write_text(''.join("file '"+str(x).replace("'","'\\''")+"'\n"for x in clips));FINAL.parent.mkdir(parents=True,exist_ok=True);run(['ffmpeg','-v','error','-y','-f','concat','-safe','0','-i',concat,'-i',C/'audio.wav','-map','0:v','-map','1:a','-c:v','copy','-c:a','aac','-b:a','192k','-t',TL['duration'],'-movflags','+faststart',FINAL]);print('FINAL',FINAL);raise SystemExit()
if A.mode=='verify':
 m=probe(FINAL);v=next(x for x in m['streams']if x['codec_type']=='video');au=next(x for x in m['streams']if x['codec_type']=='audio');assert(v['width'],v['height'])==(W,H);assert int(v['nb_frames'])==TL['frames'];assert abs(float(v['duration'])-float(au['duration']))<.08;run(['ffmpeg','-v','error','-i',FINAL,'-f','null','-'],'decode.log');r=subprocess.run(['ffmpeg','-hide_banner','-i',str(FINAL),'-af','silencedetect=noise=-40dB:d=1.5,volumedetect','-vf','blackdetect=d=0.3:pix_th=.05','-f','null','-'],capture_output=True,text=True,check=True);(C/'logs/av-check.log').write_text(r.stderr);report=dict(file=str(FINAL),duration=float(v['duration']),size=FINAL.stat().st_size,resolution=[W,H],fps=v['avg_frame_rate'],voice=S['voiceId'],speed=1,fullDecode=True,blackSegments=re.findall(r'black_start:[^\n]+',r.stderr),silences=re.findall(r'silence_duration: [^\n]+',r.stderr),maxVolume=re.findall(r'max_volume: [^\n]+',r.stderr),finalHold=TL['beats'][-1]['duration']-TL['beats'][-1]['speechDuration'],sha256=hashlib.file_digest(FINAL.open('rb'),'sha256').hexdigest(),visualReview='pending');(C/'verification.json').write_text(json.dumps(report,ensure_ascii=False,indent=2));print(json.dumps(report,ensure_ascii=False));raise SystemExit()
if A.mode=='contact':
 shots=[]
 for i,b in enumerate(TL['beats']):
  dest=C/'qa'/('final-'+b['id']+'.jpg');run(['ffmpeg','-v','error','-y','-ss',b['start']+min(7,b['duration']/2),'-i',FINAL,'-frames:v','1','-vf','scale=640:360',dest]);im=Image.open(dest).convert('RGB');d=ImageDraw.Draw(im);d.rectangle((0,0,640,32),fill='#142432');d.text((10,4),str(i+1)+' '+b['id'],font=ImageFont.truetype(str(FONT),19),fill='white');shots.append(im)
 sheet=Image.new('RGB',(1920,360*math.ceil(len(shots)/3)),(17,27,36))
 for i,im in enumerate(shots):sheet.paste(im,((i%3)*640,(i//3)*360))
 sheet.save(C/'qa/contact.jpg');print(C/'qa/contact.jpg')
