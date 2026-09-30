"""Prepare measured narration, captions, and assemble the original 3D short."""
import argparse,json,subprocess,math,re,hashlib,shutil
from pathlib import Path
P=Path(__file__).resolve().parent
A=argparse.ArgumentParser();A.add_argument('mode',choices=['prepare','assemble']);A.add_argument('--cache',type=Path,required=True);a=A.parse_args();C=a.cache
B=json.loads((P/'brief.json').read_text());FPS=B['fps']
def run(args):subprocess.run(args,check=True)
def duration(p):return float(subprocess.check_output(['ffprobe','-v','error','-show_entries','format=duration','-of','default=nw=1:nk=1',str(p)]))
def stamp(t):
 cs=round(t*100);return f'{cs//360000}:{cs//6000%60:02}:{cs//100%60:02}.{cs%100:02}'
labels=['건물 바로 아래,\\N지하철은 어떻게 뚫을까?','빈틈을 방치하면?','토압식 쉴드 굴착기','흙으로 흙을 받친다','파낸 만큼, 조절해서','터널 벽은 바로 뒤에서','남은 틈까지 채운다','지상에서도 계속 확인','파면서, 동시에 지탱한다']
if a.mode=='prepare':
 C.mkdir(parents=True,exist_ok=True); timeline=[];frame=1
 for i,s in enumerate(B['scenes']):
  inp=C/'remote-narration'/f'beat-{i:02}.mp3';meta=json.loads(Path(str(inp)+'.json').read_text())
  assert meta['text']==s['narration'] and meta['voiceId']==B['voice'],meta
  out=C/f'voice-{i:02}.wav'
  run(['ffmpeg','-v','error','-y','-i',str(inp),'-af',f'atempo={B["speed"]}', '-ar','48000','-ac','1',str(out)])
  d=duration(out);frames=math.ceil((d+.13)*FPS)
  timeline.append(dict(s,index=i,start=frame,frames=frames,seconds=frames/FPS,voiceDuration=d,label=labels[i]));frame+=frames
 (C/'timeline.json').write_text(json.dumps(timeline,ensure_ascii=False,indent=2))
 header='''[Script Info]
ScriptType: v4.00+
PlayResX: 1080
PlayResY: 1920
WrapStyle: 2
ScaledBorderAndShadow: yes
[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Caption,Apple SD Gothic Neo,72,&H00FFFFFF,&H00FFFFFF,&H00202018,&H60000000,-1,0,0,0,100,100,0,0,1,3.3,1,5,70,70,0,1
Style: Title,Apple SD Gothic Neo,68,&H003C3823,&H003C3823,&H00FFFFFF,&H00000000,-1,0,0,0,100,100,0,0,1,0,0,8,70,70,370,1
Style: Note,Apple SD Gothic Neo,27,&H006A645B,&H006A645B,&H00FFFFFF,&H00000000,0,0,0,0,100,100,0,0,1,0,0,2,60,60,200,1
[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
'''
 lines=[]
 for s in timeline:
  start=(s['start']-1)/FPS;end=start+s['seconds']
  lines.append(f'Dialogue: 1,{stamp(start)},{stamp(end)},Title,,0,0,0,,{s["label"]}')
  words=s['narration'].split();chunks=[];current=''
  for w in words:
   if len(current)+len(w)+1>27 and current:chunks.append(current);current=w
   else:current=(current+' '+w).strip()
   if current.endswith(('.', '?')) and len(current)>12:chunks.append(current);current=''
  if current:chunks.append(current)
  weights=[len(x.replace(' ','')) for x in chunks];total=sum(weights);t=start
  for j,ch in enumerate(chunks):
   stop=start+s['voiceDuration']*sum(weights[:j+1])/total
   ww=ch.split();split=min(range(1,len(ww)),key=lambda k:abs(len(' '.join(ww[:k]))-len(' '.join(ww[k:])))) if len(ch)>16 and len(ww)>1 else len(ww)
   cap=' '.join(ww[:split])+('\\N'+' '.join(ww[split:]) if split<len(ww) else '')
   lines.append(f'Dialogue: 2,{stamp(t)},{stamp(stop)},Caption,,0,0,0,,{{\\pos(540,950)\\fad(70,70)}}{cap}');t=stop
  note='원리 설명용 3D 모형 · 실제 비례·공정 속도와 다릅니다'
  if s['id']=='risk':note='빈틈이 생겼을 때의 원리 비교 · 변형은 과장한 모형입니다'
  lines.append(f'Dialogue: 1,{stamp(start)},{stamp(end)},Note,,0,0,0,,{note}')
 (P/'captions.ass').write_text(header+'\n'.join(lines)+'\n')
 print(json.dumps({'seconds':(frame-1)/FPS,'frames':frame-1,'scenes':len(timeline)}))
else:
 timeline=json.loads((C/'timeline.json').read_text());filters=[];args=['ffmpeg','-v','error','-y']
 for i,s in enumerate(timeline):
  args+=['-i',str(C/f'voice-{i:02}.wav')];filters.append(f'[{i}:a]apad,atrim=duration={s["seconds"]},asetpts=PTS-STARTPTS[a{i}]')
 filters.append(''.join(f'[a{i}]' for i in range(len(timeline)))+f'concat=n={len(timeline)}:v=0:a=1,loudnorm=I=-16:TP=-1.5:LRA=8[out]')
 args+=['-filter_complex',';'.join(filters),'-map','[out]','-ar','48000',str(C/'narration.wav')];run(args)
 out=P/'subway-under-buildings.mp4'
 # Use cwd for libass path escaping, keeping Unicode/cloud paths out of filter syntax.
 shutil.copy2(P/'captions.ass',C/'captions.ass')
 subprocess.run(['ffmpeg','-v','error','-y','-i',str(C/'silent.mp4'),'-i',str(C/'narration.wav'),'-vf','ass=captions.ass','-map','0:v','-map','1:a','-c:v','libx264','-crf','18','-preset','medium','-pix_fmt','yuv420p','-c:a','aac','-ar','48000','-b:a','192k','-movflags','+faststart',str(out)],cwd=C,check=True)
 run(['ffmpeg','-v','error','-xerror','-i',str(out),'-f','null','-'])
 probe=json.loads(subprocess.check_output(['ffprobe','-v','error','-show_streams','-show_format','-of','json',str(out)]))
 v=next(x for x in probe['streams'] if x['codec_type']=='video');aud=next(x for x in probe['streams'] if x['codec_type']=='audio')
 assert v['width']==1080 and v['height']==1920 and int(v['nb_frames'])==sum(s['frames'] for s in timeline)
 assert aud['sample_rate']=='48000' and aud['channels']==1
 assert abs(float(v['duration'])-float(aud['duration']))<.15
 evidence={'file':out.name,'sha256':hashlib.sha256(out.read_bytes()).hexdigest(),'duration':float(v['duration']),'frames':int(v['nb_frames']),'resolution':[1080,1920],'fps':30,'audio':'AAC 48kHz mono','voiceId':B['voice'],'speed':B['speed'],'ttsRun':'36706679980','decoder':'ffmpeg full decode with -xerror passed','renderer':'Blender 4.5.10 Eevee','sources':'sources.md','captions':'Sentence-weight timing; not forced word alignment'}
 (P/'verification.json').write_text(json.dumps(evidence,ensure_ascii=False,indent=2)+'\n');print(json.dumps(evidence))
