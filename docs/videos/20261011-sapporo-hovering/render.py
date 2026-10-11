"""Speech-led longform assembly. Exact-source forced alignment, complete sentences, no truncation."""
import argparse,json,math,os,subprocess,hashlib,shutil,wave,re,time
from pathlib import Path
import numpy as np
from PIL import Image,ImageFont,ImageDraw
P=argparse.ArgumentParser();P.add_argument('mode',choices=['align','plan']);P.add_argument('--cache',type=Path,required=True);P.add_argument('--wait-for-render',action='store_true');P.add_argument('--only',default='all');P.add_argument('--no-final',action='store_true');A=P.parse_args();C=A.cache;HERE=Path(__file__).parent
for d in ['tmp','logs','alignment','fonts','qa','edit']:(C/d).mkdir(exist_ok=True)
os.environ['TMPDIR']=str(C/'tmp');os.environ['NUMBA_CACHE_DIR']=str(C/'tmp/numba')
S=json.loads((HERE/'story.json').read_text());W,H,FPS,SR=1080,1920,24,44100;FINAL=Path('/Users/admin/Downloads/vedio/sapporo-hovering-architecture-short.mp4');FONT=C/'fonts/Pretendard-SemiBold.otf'
if not FONT.exists():shutil.copy2(C.parent/'20261005-jewel-webtoon/fonts/Pretendard-SemiBold.otf',FONT)
fnt=ImageFont.truetype(str(FONT),62)
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
 ws=t.split();opts=[(' '.join(ws[:j]),' '.join(ws[j:]))for j in range(1,len(ws))];opts=[q for q in opts if max(fnt.getlength(z)for z in q)<=880]
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
  al=json.loads((C/'alignment'/(b['id']+'.json')).read_text());assert al['text']==b['narration'];v=np.frombuffer(run(['ffmpeg','-v','error','-i',voice(b),'-af',f"atempo={S['speed']}",'-ar',SR,'-ac','1','-f','f32le','-']),dtype='<f4').copy();D=max(0,math.ceil((len(v)/SR+(1.5 if b['id']=='ending'else .18))*FPS)/FPS);beats.append({**b,'start':t,'duration':D,'speechDuration':len(v)/SR});audio.append(np.pad(v,(0,round(D*SR)-len(v))));groups=[];g=[]
  al['words']=[{**w,'start':w['start']/S['speed'],'end':w['end']/S['speed']}for w in al['words']]
  # Prefer complete sentences; a character cap must not strand short predicates.
  sentences=[];g=[]
  for w in al['words']:
   g.append(w)
   if re.search(r'[.!?]$',w['text'].strip()):sentences.append(g);g=[]
  if g:sentences.append(g)
  def fit(words):
   text=''.join(w['text']for w in words).strip()
   try:wrap(display_text(text));return [words]
   except RuntimeError:
    candidates=[j for j in range(1,len(words))if words[j-1]['text'].strip().endswith(',')]or list(range(1,len(words)))
    assert candidates,'Single word too wide'
    at=min(candidates,key=lambda j:abs(sum(len(w['text'])for w in words[:j])-sum(len(w['text'])for w in words[j:])))
    return fit(words[:at])+fit(words[at:])
  groups=[g for sentence in sentences for g in fit(sentence)]
  assert ''.join(w['text']for g in groups for w in g)==''.join(w['text']for w in al['words'])
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
