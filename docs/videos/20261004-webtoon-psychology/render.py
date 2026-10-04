"""Reproducible original motion-webtoon assembly; all intermediates use --cache.
No voice stretching or repeated narration. Speech-aligned captions, independent voice tracks.
"""
import argparse,json,math,os,re,subprocess,wave,hashlib
from pathlib import Path
import numpy as np
from PIL import ImageFont
P=argparse.ArgumentParser();P.add_argument('mode',choices=['align','plan','render','verify']);P.add_argument('--cache',type=Path,required=True);P.add_argument('--episode',type=int);P.add_argument('--output',type=Path,default=Path('/Users/admin/Downloads/vedio'));A=P.parse_args();C=A.cache
for d in ['tmp','logs','render','alignment','fonts']: (C/d).mkdir(parents=True,exist_ok=True)
os.environ['TMPDIR']=str(C/'tmp');os.environ['NUMBA_CACHE_DIR']=str(C/'tmp'/'numba')
STORY=json.loads((Path(__file__).parent/'story.json').read_text());FPS=24;SR=44100
EPISODES=[e for e in STORY['episodes'] if not A.episode or e['number']==A.episode]
MODEL='/Users/admin/Library/Mobile Documents/com~apple~CloudDocs/gpt 작업/commerce-automation-kit/20261001-glass-substrate/models'
FONT=C/'fonts'/'Pretendard-SemiBold.otf'

def run(args,log=None):
 p=subprocess.run([str(x)for x in args],stdout=subprocess.PIPE,stderr=subprocess.PIPE)
 if log:(C/'logs'/log).write_bytes(p.stderr)
 if p.returncode:raise RuntimeError(f'{args[0]} failed: {p.stderr.decode(errors="replace")[-1800:]}')
 return p.stdout

def voice(b):return C/('voice-'+b['speaker'])/f"beat-{b['voiceIndex']:02d}.mp3"
def probe(f):return json.loads(run(['ffprobe','-v','error','-show_format','-show_streams','-of','json',f]))
def align():
 import torch,whisper
 from whisper.timing import find_alignment
 from whisper.tokenizer import get_tokenizer
 torch.set_num_threads(4);m=whisper.load_model('base',device='cpu',download_root=MODEL);tok=get_tokenizer(m.is_multilingual,language='ko',task='transcribe')
 for ep in EPISODES:
  for b in ep['beats']:
   dest=C/'alignment'/(b['id']+'.json')
   if dest.exists():continue
   f=voice(b);meta=json.loads(Path(str(f)+'.json').read_text())
   assert meta['text']==b['text'] and meta['voiceId']==STORY['voices'][b['speaker']]['id']
   audio=whisper.load_audio(str(f));duration=len(audio)/16000
   if duration>29:raise RuntimeError('Utterance exceeds alignment window')
   mel=whisper.log_mel_spectrogram(whisper.pad_or_trim(audio),n_mels=m.dims.n_mels)
   words=find_alignment(m,tok,tok.encode(b['text']),mel,len(audio)//160)
   out=dict(duration=duration,text=b['text'],voice=meta['voiceId'],words=[dict(text=w.word,start=float(w.start),end=float(w.end))for w in words])
   dest.write_text(json.dumps(out,ensure_ascii=False,indent=2));print('ALIGNED',b['id'],round(duration,2),flush=True)

def stamp(t):
 cs=round(t*100);return f'{cs//360000}:{cs//6000%60:02d}:{cs//100%60:02d}.{cs%100:02d}'
def wrapped(text,font,maxwidth=1530):
 words=text.split()
 if font.getlength(text)<=maxwidth and len(text)<=36:return text
 choices=[]
 for i in range(1,len(words)):
  left=' '.join(words[:i]);right=' '.join(words[i:]);wl=font.getlength(left);wr=font.getlength(right)
  if max(wl,wr)<=maxwidth:choices.append((abs(wl-wr),left,right))
 if not choices:
  if font.getlength(text)<=maxwidth:return text
  raise RuntimeError('Caption exceeds two readable lines: '+text)
 _,left,right=min(choices)
 return left+r'\N'+right

def plan(ep):
 n=ep['number'];font=ImageFont.truetype(str(FONT),48);t=0;beats=[];captions=[]
 for i,b in enumerate(ep['beats']):
  a=json.loads((C/'alignment'/(b['id']+'.json')).read_text());dur=a['duration'];pause=b['pause']+(1.8 if i==len(ep['beats'])-1 else 0)
  frames=math.ceil((dur+pause)*FPS);entry={**b,'start':t,'duration':frames/FPS,'speechDuration':dur,'frames':frames};beats.append(entry)
  words=a['words'];groups=[];g=[]
  for w in words:
   if g and len(''.join(x['text']for x in g))+len(w['text'])>48:groups.append(g);g=[]
   g.append(w)
   if re.search(r'[.!?。！？]$',w['text'].strip()) or (re.search(r'[,，]$',w['text'].strip()) and len(''.join(x['text']for x in g))>=15):groups.append(g);g=[]
  if g:groups.append(g)
  for j,g in enumerate(groups):
   text=''.join(w['text']for w in g).strip();start=max(0,g[0]['start']);end=min(dur,max(start+.4,g[-1]['end']+.08))
   if j+1<len(groups):end=min(end,groups[j+1][0]['start'])
   if end<=start:continue
   captions.append(dict(start=t+start,end=t+end,speaker=b['speaker'],text=text,wrapped=wrapped(text,font)))
  t+=frames/FPS
 if not 180<=t<=240:raise RuntimeError(f'Episode {n} runtime {t:.2f}s outside approved 180–240s; revise script rather than pad/stretch')
 out=dict(episode=n,title=ep['title'],duration=t,beats=beats,captions=captions)
 (C/f'timeline-{n}.json').write_text(json.dumps(out,ensure_ascii=False,indent=2))
 header='''[Script Info]
ScriptType: v4.00+
PlayResX: 1920
PlayResY: 1080
ScaledBorderAndShadow: yes
WrapStyle: 2
[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Default,Pretendard SemiBold,48,&H00FFFFFF,&H00FFFFFF,&H00241D18,&H70000000,0,0,0,0,100,100,0,0,1,2.5,1.2,2,160,160,80,1
Style: Title,Pretendard SemiBold,38,&H00E8E8F3,&H00FFFFFF,&H00241D18,&H70000000,0,0,0,0,100,100,0,0,1,2,1,7,74,74,55,1
[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
'''
 lines=[header,f'Dialogue: 0,0:00:00.00,0:00:05.50,Title,,0,0,0,,{n}화  ·  {ep["title"]}']
 names={'N':'','S':'서윤','M':'민지'};colors={'N':'&HFFFFFF&','S':'&HBBE4FF&','M':'&HE6CBFF&'}
 for c in captions:
  label=(r'{\fs30\c'+colors[c['speaker']]+r'}'+names[c['speaker']]+r'\N{\fs48\c&HFFFFFF&}') if c['speaker']!='N' else ''
  lines.append(f'Dialogue: 1,{stamp(c["start"])},{stamp(c["end"])},Default,,0,0,0,,'+r'{\fad(70,90)}'+label+c['wrapped'])
 ending='다음 이야기  ·  네가 괜찮다고 했잖아' if n==1 else '마지막 이야기  ·  오늘은 안 괜찮아' if n==2 else '괜찮다는 거짓말  ·  끝'
 lines.append(f'Dialogue: 0,{stamp(t-2)},{stamp(t)},Title,,0,0,0,,'+r'{\fad(250,0)}'+ending)
 (C/f'captions-{n}.ass').write_text('\n'.join(lines)+'\n')
 # Human-readable subtitle sidecar.
 srt=[]
 for i,c in enumerate(captions,1):
  def st(x):return '0'+stamp(x).replace('.',',')+'0'
  srt.append(f'{i}\n{st(c["start"])} --> {st(c["end"])}\n'+c['wrapped'].replace(r'\N','\n'))
 (C/f'captions-{n}.srt').write_text('\n\n'.join(srt)+'\n')
 print('PLANNED',n,round(t,2),len(captions),flush=True);return out

def wavwrite(path,data):
 with wave.open(str(path),'wb')as f:f.setnchannels(1);f.setsampwidth(2);f.setframerate(SR);f.writeframes((np.clip(data,-.98,.98)*32767).astype('<i2').tobytes())

def audio(timeline):
 n=timeline['episode'];total=round(timeline['duration']*SR);speech=np.zeros(total,dtype=np.float32)
 for b in timeline['beats']:
  data=np.frombuffer(run(['ffmpeg','-v','error','-i',voice(b),'-f','f32le','-ac','1','-ar',str(SR),'-']),dtype='<f4').copy()
  # Normalize each voice to consistent RMS with peak protection, no tempo/pitch edits.
  active=data[np.abs(data)>.015];rms=np.sqrt(np.mean(active**2))if len(active)else .1
  gain=min(.13/max(rms,.001),.76/max(np.max(np.abs(data)),.001));data*=gain
  start=round(b['start']*SR);length=min(len(data),total-start);speech[start:start+length]+=data[:length]
 # Quiet original procedural score: sparse felt-piano-like tones. No third-party music.
 music=np.zeros(total,dtype=np.float32);progression=([57,60,64],[53,57,60],[48,52,55],[55,59,62]) if n<3 else ([53,57,60],[48,52,55],[55,59,62],[48,52,55])
 for k,at in enumerate(np.arange(0,timeline['duration'],4.5)):
  chord=progression[(k//2)%4]
  for j,note in enumerate(chord):
   start=round((at+j*.22)*SR);length=min(round(5*SR),total-start)
   if length<=0:continue
   tt=np.arange(length)/SR;freq=440*2**((note-69)/12);env=(1-np.exp(-tt*20))*np.exp(-tt/1.45)
   tone=(np.sin(2*np.pi*freq*tt)+.24*np.sin(2*np.pi*freq*2*tt)+.08*np.sin(2*np.pi*freq*3*tt))*env*.008
   music[start:start+length]+=tone.astype(np.float32)
 # Fade only music, never narration.
 fade=round(2*SR);music[:fade]*=np.linspace(0,1,fade);music[-fade:]*=np.linspace(1,0,fade)
 wavwrite(C/'render'/f'audio-{n}.wav',speech+music)

def render(ep):
 timeline=plan(ep);n=ep['number'];outdir=C/'render'/f'e{n}';outdir.mkdir(exist_ok=True);audio(timeline)
 clips=[]
 # Keep the first 6 seconds as actual reference-conditioned Higgsfield video.
 opener=outdir/'opening.mp4'
 if not opener.exists():run(['ffmpeg','-y','-v','error','-i',C/f'opening-{n}.mp4','-t','6','-an','-vf','scale=1920:1080:force_original_aspect_ratio=increase,crop=1920:1080,setsar=1,fps=24','-c:v','libx264','-preset','fast','-crf','18','-pix_fmt','yuv420p',opener],f'opening-{n}.log')
 clips.append(opener)
 for i,b in enumerate(timeline['beats']):
  start=max(6,b['start']);end=b['start']+b['duration'];frames=round((end-start)*FPS)
  if frames<=0:continue
  dest=outdir/(b['id']+'.mp4');clips.append(dest)
  if dest.exists():continue
  # Alternate restrained push/pull and lateral reframing; no repeated footage padding.
  z=f'1.035+0.035*on/{max(frames-1,1)}' if i%2==0 else f'1.07-0.035*on/{max(frames-1,1)}'
  x='iw/2-iw/zoom/2' if i%3==0 else f'(iw-iw/zoom)*(0.35+0.25*on/{max(frames-1,1)})' if i%3==1 else f'(iw-iw/zoom)*(0.65-0.25*on/{max(frames-1,1)})'
  vf=f"crop=iw-8:ih-8:4:4,scale=2560:1440:flags=lanczos,zoompan=z='{z}':x='{x}':y='ih/2-ih/zoom/2':d={frames}:s=1920x1080:fps=24,setsar=1,format=yuv420p"
  run(['ffmpeg','-y','-v','error','-threads','2','-i',C/'art'/f"shot-{b['art']:02d}.png",'-vf',vf,'-frames:v',frames,'-an','-c:v','libx264','-preset','fast','-crf','18','-threads','2',dest],b['id']+'.log')
  print('RENDERED',b['id'],frames,flush=True)
 listing=outdir/'concat.txt';listing.write_text('\n'.join("file '"+str(f).replace("'","'\\''")+"'"for f in clips)+'\n')
 base=outdir/'base.mp4';run(['ffmpeg','-y','-v','error','-f','concat','-safe','0','-i',listing,'-c','copy',base],f'concat-{n}.log')
 A.output.mkdir(parents=True,exist_ok=True);final=A.output/f'im-fine-webtoon-episode-{n}.mp4'
 # FFmpeg filter syntax needs escaped drive-path punctuation, not shell escaping.
 esc=lambda p:str(p).replace('\\','\\\\').replace(':','\\:').replace("'","'\\''")
 vf=f"subtitles=filename='{esc(C/f'captions-{n}.ass')}':fontsdir='{esc(C/'fonts')}'"
 run(['ffmpeg','-y','-v','error','-i',base,'-i',C/'render'/f'audio-{n}.wav','-vf',vf,'-map','0:v','-map','1:a','-af','alimiter=limit=0.92:level=false','-c:v','libx264','-preset','fast','-crf','20','-threads','4','-c:a','aac','-b:a','192k','-ar',SR,'-t',f'{timeline["duration"]:.6f}','-movflags','+faststart',final],f'final-{n}.log')
 print('FINAL',str(final),timeline['duration'],flush=True)

def verify():
 results=[]
 for ep in EPISODES:
  n=ep['number'];f=A.output/f'im-fine-webtoon-episode-{n}.mp4';p=probe(f);t=json.loads((C/f'timeline-{n}.json').read_text());video=next(s for s in p['streams']if s['codec_type']=='video');au=next(s for s in p['streams']if s['codec_type']=='audio')
  assert (video['width'],video['height'])==(1920,1080)
  assert abs(float(p['format']['duration'])-t['duration'])<.08
  assert abs(float(video['duration'])-float(au['duration']))<.08
  assert t['captions'][-1]['end']<=t['duration']
  assert sum(b['frames']for b in t['beats'])==round(t['duration']*FPS)
  run(['ffmpeg','-v','error','-i',f,'-f','null','-'],f'decode-{n}.log')
  run(['ffmpeg','-hide_banner','-i',f,'-af','volumedetect,silencedetect=noise=-45dB:d=2','-vf','blackdetect=d=0.5:pix_th=0.05','-f','null','-'],f'av-analysis-{n}.log')
  results.append(dict(episode=n,file=str(f),duration=t['duration'],captions=len(t['captions']),sha256=hashlib.sha256(f.read_bytes()).hexdigest(),decode='pass',audioVideoSync='pass'))
  print('VERIFIED',n,flush=True)
 (C/'verification.json').write_text(json.dumps(results,ensure_ascii=False,indent=2)+'\n')
if A.mode=='align':align()
elif A.mode=='plan':
 for e in EPISODES:plan(e)
elif A.mode=='render':
 for e in EPISODES:render(e)
else:verify()
