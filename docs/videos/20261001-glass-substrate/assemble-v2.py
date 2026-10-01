"""Assemble source 3D, reused Higgsfield opening and insert, exact-script aligned captions and Kyle VO."""
import argparse,json,subprocess,re,math,hashlib,time
from pathlib import Path
p=argparse.ArgumentParser();p.add_argument('--cache',type=Path,required=True);p.add_argument('--source-cache',type=Path,required=True);p.add_argument('--output',type=Path,required=True);p.add_argument('--font-dir',type=Path,required=True);p.add_argument('--only',type=int);p.add_argument('--force',action='store_true');a=p.parse_args();c=a.cache;here=Path(__file__).parent;b=json.loads((here/'brief.json').read_text());align=json.loads((a.source_cache/'alignment.json').read_text());assert len(align)==len(b['scenes'])
(c/'edit').mkdir(parents=True,exist_ok=True);a.output.parent.mkdir(parents=True,exist_ok=True)
def run(args):subprocess.run(args,check=True)
def probe(f):return float(subprocess.check_output(['ffprobe','-v','error','-show_entries','format=duration','-of','csv=p=0',str(f)]))
def stamp(t):
 cs=round(t*100);return f'{cs//360000}:{cs//6000%60:02}:{cs//100%60:02}.{cs%100:02}'
def esc(t):return t.replace('\\','').replace('{','').replace('}','')
def wrap(t):
 if len(t)<=42:return t
 words=t.split();cuts=[(' '.join(words[:i]),' '.join(words[i:]))for i in range(1,len(words))]
 left,right=min(cuts,key=lambda x:abs(len(x[0])-len(x[1])))
 return left+r'\N'+right
def event(start,end,style,text):return f'Dialogue: 0,{stamp(start)},{stamp(end)},{style},,0,0,0,,{text}\n'
HEADER='''[Script Info]
ScriptType: v4.00+
PlayResX: 1920
PlayResY: 1080
WrapStyle: 2
ScaledBorderAndShadow: yes
[V4+ Styles]
Format: Name,Fontname,Fontsize,PrimaryColour,SecondaryColour,OutlineColour,BackColour,Bold,Italic,Underline,StrikeOut,ScaleX,ScaleY,Spacing,Angle,BorderStyle,Outline,Shadow,Alignment,MarginL,MarginR,MarginV,Encoding
Style: Caption,Pretendard SemiBold,52,&H00FFFFFF,&H00FFFFFF,&H90302A24,&H90302A24,0,0,0,0,100,100,0,0,3,10,0,2,140,140,102,1
Style: Title,Pretendard SemiBold,48,&H002D2520,&H002D2520,&H00FFFFFF,&H00000000,0,0,0,0,100,100,0,0,1,0,0,7,90,90,110,1
Style: Series,Pretendard SemiBold,25,&H00493C31,&H00493C31,&H00FFFFFF,&H00000000,0,0,0,0,100,100,0,0,1,0,0,7,90,90,65,1
Style: Note,Pretendard SemiBold,25,&H00493C31,&H00493C31,&H00FFFFFF,&H00000000,0,0,0,0,100,100,0,0,1,0,0,9,80,90,65,1
[Events]
Format: Layer,Start,End,Style,Name,MarginL,MarginR,MarginV,Effect,Text
'''
manifest={'title':b['title'],'voice':b['voice'],'speed':1.0,'resolution':[1920,1080],'fps':24,'captionAlignment':'Reused approved-script Whisper alignment','renderSourceResolution':[1920,1080],'renderSourceFps':12,'deliveryInterpolation':'FFmpeg framerate blend to 24fps','loopedSceneVideo':False,'newPaidRequests':0,'higgsfieldReused':{'generationId':'8a63ba30-24d3-4a05-9e58-fbfa531d6b3d','placements':['hook 0-6s','manufacture 0-6s']},'scenes':[]};start=0
for i,sc in enumerate(b['scenes']):
 au=a.source_cache/'remote-narration'/f'beat-{i:02}.mp3';meta=json.loads(Path(str(au)+'.json').read_text());assert meta['voiceId']==b['voice'] and meta['text']==sc['narration'];d=math.ceil((probe(au)+.12)*24)/24
 words=align[i]['words'];assert align[i]['id']==sc['id'];assert ''.join(w['text'] for w in words).strip()==sc['narration'].strip()
 text=HEADER+event(0,d,'Series',f'AI의 숨은 기반  01   /   유리기판')+event(.12,4.6,'Title',esc(sc['title']))
 note='개념 모형 · 구조 단순화'
 if sc['visual'] in ['warp','compare','thermal']:note='개념 모형 · 변형 확대 (수치 비교 아님)'
 text+=event(0,d,'Note',note)
 legends={'inside':'짙은 부품: 칩·메모리   /   구리색: 연결 배선','glass':'왼쪽: 유기 코어   /   오른쪽: 유리 코어','thermal':'위: 유기 코어  /  가운데: 유리  /  아래: 실리콘 · 개념 비교','wiring':'유리 코어의 단면   /   금속 배선','industry':'Intel  ·  삼성전기  ·  SKC / Absolics','ending':'TGV  ·  유리 속을 관통하는 금속 연결','traffic':'왼쪽: 데이터 공급  /  오른쪽: 연산','crowded':'칩 아래 작은 점: 연결 접점','warpage':'붉은 표시: 접점 높이 차이','limits':'아래 왼쪽부터: 메모리 · 전력 · 냉각'}
 if sc['id'] in legends:text+=event(4.8,d,'Series',r'{\pos(90,130)\fs30}'+legends[sc['id']])
 cues=[];group=[]
 def flush():
  global text
  if not group:return
  st=max(0,group[0]['start']-.06);end=min(d,max(group[-1]['end']+.10,st+.5));caption=''.join(w['text'] for w in group).strip();cues.append([st,end,wrap(esc(caption))])
 for w in words:
  if group and w['text'].strip() not in '.!?。' and (len(''.join(x['text'] for x in group))+len(w['text'])>48 or w['end']-group[0]['start']>4.8):flush();group=[]
  group.append(w)
  if re.search(r'[.!?。]$',w['text'].strip()):flush();group=[]
 flush()
 for k,cue in enumerate(cues):
  if k+1<len(cues):cue[1]=min(cue[1],cues[k+1][0])
  if cue[1]>cue[0]:text+=event(cue[0],cue[1],'Caption',cue[2])
 if sc['id'] in ('hook','manufacture'):
  text=text.replace(event(0,d,'Note',note),event(0,6,'Note',r'{\c&HFFFFFF&\bord2\3c&H242424&}AI 재현 · 가상의 시설')+event(6,d,'Note',note));text=text.replace(event(0,d,'Series',f'AI의 숨은 기반  01   /   유리기판'),event(0,6,'Series',r'{\c&HFFFFFF&\bord2\3c&H242424&}AI의 숨은 기반  01   /   유리기판')+event(6,d,'Series','AI의 숨은 기반  01   /   유리기판'));text=text.replace(event(.12,4.6,'Title',esc(sc['title'])),event(.12,4.6,'Title',r'{\c&HFFFFFF&\bord2\3c&H242424&}'+esc(sc['title'])))
 ass=c/'edit'/f'{i:02}.ass';ass.write_text(text)
 video=c/'3d'/(sc['id']+'.mp4');visual=c/'edit'/f'{i:02}-visual.mp4';out=c/'edit'/f'{i:02}.mp4'
 manifest['scenes'].append({'id':sc['id'],'start':start,'duration':d,'narration':str(au),'visual':str(video),'caption':str(ass)});start+=d
 if a.only is not None and i!=a.only:continue
 if out.exists() and not a.force:
  check=subprocess.run(['ffprobe','-v','error','-show_entries','format=duration','-of','csv=p=0',str(out)],capture_output=True,text=True)
  if check.returncode==0 and abs(float(check.stdout)-d)<.15:continue
 ready=json.loads(subprocess.check_output(['ffprobe','-v','error','-show_streams','-show_format','-of','json',str(video)]));stream=next(x for x in ready['streams'] if x['codec_type']=='video')
 assert stream['width']==1920 and stream['height']==1080 and stream['avg_frame_rate']=='12/1'
 assert abs(float(ready['format']['duration'])-d)<.12
 # Unique full-duration choreography, no stream loop. Blend intermediate frames for 24fps delivery.
 vf="framerate=fps=24:interp_start=15:interp_end=240:scene=100,tpad=stop_mode=clone:stop_duration=0.15,setsar=1"
 run(['ffmpeg','-v','error','-y','-i',str(video),'-t',str(d),'-vf',vf,'-an','-c:v','h264_videotoolbox','-b:v','12M','-pix_fmt','yuv420p',str(visual)])
 if sc['id'] in ('hook','manufacture'):
  insert=c/'edit'/f'{i:02}-factory-insert.mp4';chain=c/'edit'/f'{i:02}-factory-concat.txt';cut=c/'edit'/f'{i:02}-factory-rest.mp4';merged=c/'edit'/f'{i:02}-factory-merged.mp4'
  run(['ffmpeg','-v','error','-y','-i',str(a.source_cache/'broll-factory.mp4'),'-t','6','-vf','scale=1920:1080,fps=24,setsar=1','-an','-c:v','h264_videotoolbox','-b:v','10M','-pix_fmt','yuv420p',str(insert)])
  run(['ffmpeg','-v','error','-y','-ss','6','-i',str(visual),'-an','-c:v','h264_videotoolbox','-b:v','10M',str(cut)])
  chain.write_text(''.join("file '"+str(x).replace("'","'\\''")+"'\n" for x in [insert,cut]));run(['ffmpeg','-v','error','-y','-f','concat','-safe','0','-i',str(chain),'-c','copy',str(merged)]);visual=merged
 # Audio has no speed filter; per-scene speech level normalized, total length follows VO.
 filt=f"subtitles=filename='{ass}':fontsdir='{a.font_dir}'"
 run(['ffmpeg','-v','error','-y','-i',str(visual),'-i',str(au),'-t',str(d),'-vf',filt,'-af',f'apad,atrim=duration={d},loudnorm=I=-16:TP=-1.5:LRA=7','-c:v','h264_videotoolbox','-b:v','10M','-pix_fmt','yuv420p','-c:a','aac','-b:a','192k','-ar','48000','-movflags','+faststart',str(out)])
 print('ASSEMBLED',sc['id'],round(d,2),flush=True)
manifest['duration']=start;(c/'project.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2))
if a.only is None:
 chain=c/'edit'/'concat.txt';chain.write_text(''.join("file '"+str(c/'edit'/f'{i:02}.mp4').replace("'","'\\''")+"'\n"for i in range(len(b['scenes']))));run(['ffmpeg','-v','error','-y','-f','concat','-safe','0','-i',str(chain),'-c','copy','-movflags','+faststart',str(a.output)]);print('FINAL',a.output,round(probe(a.output),2),flush=True)
