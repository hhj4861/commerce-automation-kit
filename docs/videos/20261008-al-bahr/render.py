"""Speech-led longform assembly. Exact-source forced alignment, complete sentences, no truncation."""
import argparse,json,math,os,subprocess,hashlib,shutil,wave,re,time
from pathlib import Path
import numpy as np
from PIL import Image,ImageFont,ImageDraw
P=argparse.ArgumentParser();P.add_argument('mode',choices=['align','plan','assemble','verify','contact']);P.add_argument('--cache',type=Path,required=True);P.add_argument('--wait-for-render',action='store_true');P.add_argument('--only',default='all');P.add_argument('--no-final',action='store_true');A=P.parse_args();C=A.cache;HERE=Path(__file__).parent
for d in ['tmp','logs','alignment','fonts','qa','edit']:(C/d).mkdir(exist_ok=True)
os.environ['TMPDIR']=str(C/'tmp');os.environ['NUMBA_CACHE_DIR']=str(C/'tmp/numba')
S=json.loads((HERE/'story.json').read_text());W,H,FPS,SR=1080,1920,24,44100;FINAL=Path('/Users/admin/Downloads/vedio/al-bahr-webtoon-short.mp4');FONT=C/'fonts/Pretendard-SemiBold.otf'
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
 if fnt.getlength(t)<=870:return t
 ws=t.split();opts=[(' '.join(ws[:j]),' '.join(ws[j:]))for j in range(1,len(ws))];opts=[q for q in opts if max(fnt.getlength(z)for z in q)<=900]
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
  al=json.loads((C/'alignment'/(b['id']+'.json')).read_text());assert al['text']==b['narration'];v=np.frombuffer(run(['ffmpeg','-v','error','-i',voice(b),'-af',f"atempo={S['speed']}",'-ar',SR,'-ac','1','-f','f32le','-']),dtype='<f4').copy();D=max(6 if b['id']=='hook'else 0,math.ceil((len(v)/SR+(2.7 if b['id']=='ending'else .22))*FPS)/FPS);beats.append({**b,'start':t,'duration':D,'speechDuration':len(v)/SR});audio.append(np.pad(v,(0,round(D*SR)-len(v))));groups=[];g=[]
  al['words']=[{**w,'start':w['start']/S['speed'],'end':w['end']/S['speed']}for w in al['words']]
  for w in al['words']:
   text=''.join(x['text']for x in g)+w['text']
   if g and(len(text)>28 or w['end']-g[0]['start']>4):groups.append(g);g=[]
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
 assert 35<t<150,f'Unexpected {t}s; inspect before rendering';captions[-1]['end']=t-.35;arr=np.concatenate(audio);arr*=min(1,.9/max(abs(arr)))
 with wave.open(str(C/'audio-raw.wav'),'wb')as f:f.setnchannels(1);f.setsampwidth(2);f.setframerate(SR);f.writeframes((np.clip(arr,-1,1)*32767).astype('<i2').tobytes())
 run(['ffmpeg','-v','error','-y','-i',C/'audio-raw.wav','-af','loudnorm=I=-16:TP=-1.5:LRA=9','-ar',SR,C/'audio.wav'])
 tl=dict(duration=t,frames=round(t*FPS),width=W,height=H,fps=FPS,voiceId=S['voiceId'],speed=S['speed'],beats=beats,captions=captions,reviewDigest=json.loads((C/'review.json').read_text())['digest']);(C/'timeline.json').write_text(json.dumps(tl,ensure_ascii=False,indent=2));print(json.dumps(dict(duration=t,beats=len(beats),captions=len(captions),lastHold=beats[-1]['duration']-beats[-1]['speechDuration'])));raise SystemExit()
TL=json.loads((C/'timeline.json').read_text())
def ts(t):
 n=round(t*100);return f'{n//360000}:{n//6000%60:02}:{n//100%60:02}.{n%100:02}'
if A.mode=='assemble':
 js="import{readFile}from'node:fs/promises';import{validateDepthReview}from'./apps/shopshorts/lib/explanation-depth.js';const s=JSON.parse(await readFile(process.argv[1]));const r=await validateDepthReview(JSON.parse(await readFile(process.argv[2])),s.brief,s);if(!r.passed)process.exit(1);"
 subprocess.run(['node','--input-type=module','-e',js,str(HERE/'story.json'),str(C/'review.json')],cwd=HERE.parents[2],check=True)
 assert json.loads((C/'higgsfield-receipt.json').read_text())['state']=='downloaded'
 hook=TL['beats'][0]['duration'];run(['ffmpeg','-v','error','-y','-i',C/'opening.mp4','-vf',f'scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,setsar=1,fps=24,tpad=stop_mode=clone:stop_duration={max(0,hook-6)}','-t',hook,'-an','-c:v','libx264','-crf','18','-pix_fmt','yuv420p',C/'clips/hook.mp4'])
 listing=''
 for b in TL['beats']:
  f=C/'clips'/(b['id']+'.mp4');q=next(z for z in probe(f)['streams']if z['codec_type']=='video');assert int(q['nb_frames'])==round(b['duration']*FPS),(b['id'],q.get('nb_frames'));listing+='file '+"'"+str(f).replace("'","'\\''")+"'\n"
 (C/'edit/list.txt').write_text(listing)
 header='''[Script Info]
ScriptType: v4.00+
PlayResX: 1080
PlayResY: 1920
WrapStyle: 2
ScaledBorderAndShadow: yes
[V4+ Styles]
Format: Name,Fontname,Fontsize,PrimaryColour,SecondaryColour,OutlineColour,BackColour,Bold,Italic,Underline,StrikeOut,ScaleX,ScaleY,Spacing,Angle,BorderStyle,Outline,Shadow,Alignment,MarginL,MarginR,MarginV,Encoding
Style: Caption,Pretendard SemiBold,52,&H00FFFFFF,&H00FFFFFF,&H00221A12,&H99000000,0,0,0,0,100,100,0,0,1,2.4,1,5,70,70,0,1
Style: Hook,Pretendard SemiBold,62,&H00FFFFFF,&H00FFFFFF,&H00221A12,&H99000000,0,0,0,0,100,100,0,0,1,3,1,8,65,65,180,1
[Events]
Format: Layer,Start,End,Style,Name,MarginL,MarginR,MarginV,Effect,Text
'''
 events=f'Dialogue: 1,0:00:00.00,0:00:03.80,Hook,,0,0,0,,빌딩이 우산을\\N펼친다고?\n'
 for cap in TL['captions']:events+=f"Dialogue: 0,{ts(cap['start'])},{ts(cap['end'])},Caption,,0,0,0,,{{\\pos(540,1525)}}{cap['text']}\n"
 (C/'edit/captions.ass').write_text(header+events)
 run(['ffmpeg','-v','error','-y','-f','concat','-safe','0','-i',C/'edit/list.txt','-i',C/'audio.wav','-map','0:v:0','-map','1:a:0','-vf',f"ass='{C}/edit/captions.ass':fontsdir='{C}/fonts',fade=t=out:st={TL['duration']-.5}:d=0.5",'-c:v','libx264','-crf','18','-preset','medium','-pix_fmt','yuv420p','-c:a','aac','-b:a','192k','-movflags','+faststart',FINAL], 'assemble.log');print('FINAL',FINAL)
elif A.mode=='verify':
 q=probe(FINAL);v=next(x for x in q['streams']if x['codec_type']=='video');au=next(x for x in q['streams']if x['codec_type']=='audio');assert int(v['nb_frames'])==TL['frames'];assert(v['width'],v['height'])==(1080,1920);assert abs(float(v['duration'])-float(au['duration']))<.1
 run(['ffmpeg','-v','error','-i',FINAL,'-f','null','-'],'decode.log')
 for b in TL['beats']:
  cap=''.join(z['text'].replace(r'\N','')for z in TL['captions']if z['scene']==b['id']);assert re.sub(r'\s','',cap)==re.sub(r'\s','',b['narration']),(b['id'],cap)
 hold=TL['beats'][-1]['duration']-TL['beats'][-1]['speechDuration'];assert hold>=2.7
 r=dict(file=str(FINAL),duration=float(v['duration']),width=v['width'],height=v['height'],frames=v['nb_frames'],bytes=FINAL.stat().st_size,sha256=hashlib.sha256(FINAL.read_bytes()).hexdigest(),speed=S['speed'],voiceId=S['voiceId'],finalHold=hold,decode='pass',captionCoverage='all narration',visualReview='pending',reviewDigest=TL['reviewDigest']);(C/'verification.json').write_text(json.dumps(r,ensure_ascii=False,indent=2));print(json.dumps(r,ensure_ascii=False))
elif A.mode=='contact':
 times=[1,4]+[b['start']+b['duration']*.55 for b in TL['beats'][1:]]+[TL['duration']-1.2];imgs=[]
 for i,t in enumerate(times):
  f=C/'qa'/f'final-{i}.jpg';run(['ffmpeg','-v','error','-y','-ss',t,'-i',FINAL,'-frames:v','1','-vf','scale=270:480',f]);imgs.append(Image.open(f).convert('RGB'))
 grid=Image.new('RGB',(270*4,510*math.ceil(len(imgs)/4)),(20,25,30));d=ImageDraw.Draw(grid)
 for i,(im,t)in enumerate(zip(imgs,times)):x=i%4*270;y=i//4*510;grid.paste(im,(x,y));d.text((x+8,y+483),f'{t:.1f}s',fill='white')
 grid.save(C/'qa/contact.jpg')
