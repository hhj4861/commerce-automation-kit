"""Measured speech -> scene durations -> central captions -> H.264/AAC output."""
import argparse,json,subprocess,math,hashlib
from pathlib import Path
P=Path(__file__).resolve().parent
ap=argparse.ArgumentParser();ap.add_argument('--cache',type=Path,required=True);ap.add_argument('--silent-preview',action='store_true');a=ap.parse_args();C=a.cache;B=json.loads((P/'brief.json').read_text())
def run(args,**kw):subprocess.run(args,check=True,**kw)
def probe(p):return json.loads(subprocess.check_output(['ffprobe','-v','error','-show_streams','-show_format','-of','json',str(p)]))
def duration(p):return float(probe(p)['format']['duration'])
def stamp(t):
 n=round(t*100);return f'{n//360000}:{n//6000%60:02}:{n//100%60:02}.{n%100:02}'
T=[];start=0
for i,s in enumerate(B['scenes']):
 if a.silent_preview:d=8
 else:
  src=C/'remote-narration'/f'beat-{i:02}.mp3';meta=json.loads(Path(str(src)+'.json').read_text())
  assert meta['text']==s['narration'] and meta['voiceId']==B['voice'],'TTS source mismatch'
  out=C/f'voice-{i}.wav';run(['ffmpeg','-y','-v','error','-i',str(src),'-af',f'atempo={B["speed"]},silenceremove=start_periods=1:start_duration=0.02:start_threshold=-48dB', '-ar','48000','-ac','1',str(out)])
  d=duration(out)
 seconds=math.ceil((d+(0 if a.silent_preview else .16))*30)/30
 T.append(dict(s,start=start,seconds=seconds,voiceDuration=d));start+=seconds
(C/'timeline.json').write_text(json.dumps(T,ensure_ascii=False,indent=2)+'\n')
header='''[Script Info]
ScriptType: v4.00+
PlayResX: 1080
PlayResY: 1920
WrapStyle: 2
ScaledBorderAndShadow: yes
[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Caption,Apple SD Gothic Neo,64,&H00FFFFFF,&H00FFFFFF,&H00181614,&H70000000,-1,0,0,0,100,100,0,0,1,3,1,5,85,85,0,1
Style: Note,Apple SD Gothic Neo,27,&H00FFFFFF,&H00FFFFFF,&H00101010,&H70000000,0,0,0,0,100,100,0,0,1,1.5,0,2,60,60,170,1
[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
'''
lines=[]
for i,s in enumerate(T):
 chunks=[];current=''
 for word in s['narration'].split():
  if len(current)+1+len(word)>28 and current:chunks.append(current);current=word
  else:current=(current+' '+word).strip()
  if current.endswith(('.', '?')):chunks.append(current);current=''
 if current:chunks.append(current)
 weights=[len(x.replace(' ',''))for x in chunks];total=sum(weights);used=0
 for text,w in zip(chunks,weights):
  st=s['start']+s['voiceDuration']*used/total;used+=w;end=s['start']+s['voiceDuration']*used/total
  words=text.split()
  if len(text)>17 and len(words)>1:
   k=min(range(1,len(words)),key=lambda k:abs(len(' '.join(words[:k]))-len(' '.join(words[k:]))));text=' '.join(words[:k])+'\\N'+' '.join(words[k:])
  assert max(map(len,text.split('\\N')))<=22,'Caption too wide'
  lines.append(f'Dialogue: 2,{stamp(st)},{stamp(end)},Caption,,0,0,0,,{{\\pos(540,970)\\fad(60,60)}}{text}')
 note='설계 원리 AI 재현 · 실제 외관과 차이 있음' if s['kind']=='video' else '작동을 단순화한 3D · 실제 상세·변형량과 다름'
 if a.silent_preview:note='화면 검토용 · 음성 선택 대기 · '+note
 lines.append(f'Dialogue: 1,{stamp(s["start"])},{stamp(s["start"]+s["seconds"])},Note,,0,0,0,,{note}')
(C/'captions.ass').write_text(header+'\n'.join(lines)+'\n')
for i,s in enumerate(T):
 src=C/(s['id']+'.mp4');d=duration(src);factor=s['seconds']/d
 vf=f'setpts={factor}*PTS,scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,setsar=1,fps=30,tpad=stop_mode=clone:stop_duration=0.1,trim=duration={s["seconds"]},format=yuv420p'
 run(['ffmpeg','-y','-v','error','-i',str(src),'-an','-vf',vf,'-c:v','libx264','-crf','19','-preset','fast',str(C/f'edit-{i}.mp4')])
(C/'concat.txt').write_text(''.join(f"file 'edit-{i}.mp4'\n"for i in range(len(T))))
run(['ffmpeg','-y','-v','error','-f','concat','-safe','0','-i','concat.txt','-c','copy','silent.mp4'],cwd=C)
if a.silent_preview:
 out=C/'yeosu-visual-preview.mp4';run(['ffmpeg','-y','-v','error','-i','silent.mp4','-vf','ass=captions.ass','-c:v','libx264','-crf','19','-preset','fast','-movflags','+faststart',str(out)],cwd=C)
else:
 args=['ffmpeg','-y','-v','error'];filters=[]
 for i,s in enumerate(T):args+=['-i',str(C/f'voice-{i}.wav')];filters.append(f'[{i}:a]apad,atrim=duration={s["seconds"]},asetpts=PTS-STARTPTS[a{i}]')
 filters.append(''.join(f'[a{i}]'for i in range(len(T)))+f'concat=n={len(T)}:v=0:a=1,loudnorm=I=-16:TP=-1.5:LRA=8[a]')
 run(args+['-filter_complex',';'.join(filters),'-map','[a]','-ar','48000',str(C/'narration.wav')])
 out=C/'yeosu-realistic.mp4';run(['ffmpeg','-y','-v','error','-i','silent.mp4','-i','narration.wav','-vf','ass=captions.ass','-map','0:v','-map','1:a','-c:v','libx264','-crf','18','-preset','fast','-c:a','aac','-ar','48000','-b:a','192k','-movflags','+faststart',str(out)],cwd=C)
run(['ffmpeg','-v','error','-xerror','-i',str(out),'-f','null','-'])
v=probe(out);video=next(s for s in v['streams'] if s['codec_type']=='video');assert video['width']==1080 and video['height']==1920
receipt={'file':str(out),'seconds':float(video['duration']),'resolution':[1080,1920],'fullDecode':'passed','sha256':hashlib.sha256(out.read_bytes()).hexdigest(),'voiceId':None if a.silent_preview else B['voice'],'speed':B['speed'],'status':'visual-preview-awaiting-voice' if a.silent_preview else 'complete','captions':'Sentence-weight timing, not forced alignment'}
(P/'verification.json').write_text(json.dumps(receipt,ensure_ascii=False,indent=2)+'\n');print(json.dumps(receipt,ensure_ascii=False))
