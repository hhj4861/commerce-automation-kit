"""A complete miniature HBM story, reusing licensed/generated picture and Kyle speech.
Cut on measured sentence pauses; never extend a source trim into the next sentence.
"""
import sys
sys.dont_write_bytecode=True
import argparse,json,subprocess,re,math,hashlib
from pathlib import Path
from explain import annotations
p=argparse.ArgumentParser();p.add_argument('--cache',type=Path,required=True);p.add_argument('--output',type=Path,required=True);p.add_argument('--font-dir',type=Path,required=True);a=p.parse_args()
c=a.cache;out=c/'short-v3';out.mkdir(parents=True,exist_ok=True);here=Path(__file__).parent
brief=json.loads((here/'brief.json').read_text());alignment=json.loads((c/'alignment.json').read_text())
# Explicit editorial order: question, bottleneck, structure, mechanism, benefit, answer.
plan=[('hook',0,3,'왜 비싼 AI칩이 기다릴까?'),('capacity',1,3,'저장 공간과 운반 통로는 다르다'),('stack',0,2,'HBM: 칩을 쌓고 GPU 가까이에'),('wide',3,4,'여러 통로로 동시에 공급한다'),('daily',0,2,'그래서 내 AI 답변은?'),('ending',2,3,'HBM의 핵심은 GPU의 기다림 줄이기')]
FPS=24
font=a.font_dir/'Pretendard-SemiBold.otf'
def run(cmd):return subprocess.run(cmd,check=True)
def probe(f):return json.loads(subprocess.check_output(['ffprobe','-v','error','-show_streams','-show_format','-of','json',str(f)]))
def stamp(t):
 n=round(t*100);return f'{n//360000}:{n//6000%60:02}:{n//100%60:02}.{n%100:02}'
def line(st,en,style,t):return f'Dialogue: 0,{stamp(st)},{stamp(en)},{style},,0,0,0,,{t}\n'
def display(t):
 for x,y in [('에이치비엠','HBM')]:t=t.replace(x,y)
 return t.strip()
def wrap(t):
 if len(t)<=17:return t
 ws=t.split();opts=[(' '.join(ws[:j]),' '.join(ws[j:]))for j in range(1,len(ws))]
 if not opts:return t
 l,r=min(opts,key=lambda x:abs(len(x[0])-len(x[1])));return l+r'\N'+r
header='''[Script Info]
ScriptType: v4.00+
PlayResX: 1080
PlayResY: 1920
WrapStyle: 2
ScaledBorderAndShadow: yes
[V4+ Styles]
Format: Name,Fontname,Fontsize,PrimaryColour,SecondaryColour,OutlineColour,BackColour,Bold,Italic,Underline,StrikeOut,ScaleX,ScaleY,Spacing,Angle,BorderStyle,Outline,Shadow,Alignment,MarginL,MarginR,MarginV,Encoding
Style: Caption,Pretendard SemiBold,62,&H00FFFFFF,&H00FFFFFF,&H00201B17,&H80000000,0,0,0,0,100,100,0,0,1,3,1,2,65,65,340,1
Style: Note,Pretendard SemiBold,24,&H00DDDDDD,&H00FFFFFF,&H00201B17,&H80000000,0,0,0,0,100,100,0,0,1,1.5,0,9,45,45,48,1
[Events]
Format: Layer,Start,End,Style,Name,MarginL,MarginR,MarginV,Effect,Text
'''
manifest={'revision':3,'voiceId':brief['voice'],'speed':1.0,'newPaidGenerations':0,'segments':[]};total=0
for n,(name,first,last,headline)in enumerate(plan):
 i=next(i for i,s in enumerate(brief['scenes'])if s['id']==name);sc=brief['scenes'][i];al=alignment[i];voice=c/'remote-narration'/f'beat-{i:02}.mp3';meta=json.loads(Path(str(voice)+'.json').read_text());assert meta['voiceId']==brief['voice']and meta['text']==sc['narration']
 sentences=list(re.finditer(r'[^.!?]+[.!?]',sc['narration']));lo,hi=sentences[first].start(),sentences[last-1].end();pos=0;words=[]
 for w in al['words']:
  end=pos+len(w['text'])
  if end>lo and pos<hi:words.append(w)
  pos=end
 transcript=sc['narration'][lo:hi].strip();assert ''.join(w['text']for w in words).strip()==transcript
 log=subprocess.run(['ffmpeg','-hide_banner','-i',str(voice),'-af','silencedetect=noise=-34dB:d=0.08','-f','null','-'],capture_output=True,text=True,check=True).stderr
 pauses=list(zip(map(float,re.findall(r'silence_start: ([\d.]+)',log)),map(float,re.findall(r'silence_end: ([\d.]+)',log))))
 def boundary(t):
  x=min(pauses,key=lambda x:abs(sum(x)/2-t));mid=sum(x)/2
  assert abs(mid-t)<.5,(name,t,x)
  return mid,x
 start,startpause=(0,None)if first==0 else boundary(words[0]['start'])
 end,endpause=(al['duration'],None)if last==len(sentences)else boundary(words[-1]['end'])
 speech=end-start;tail=1.0 if name=='ending'else .08;duration=math.ceil((speech+tail)*FPS)/FPS
 # The ending uses an existing 8.5s native portrait shot with the final summary sentence.
 visualstart=0 if name=='ending'else start;source=c/'v2/3d-short'/f'{name}.mp4'
 if name=='hook':source=c/'v2/short-edit/opening-joined.mp4'
 vd=float(next(x for x in probe(source)['streams']if x['codec_type']=='video')['duration']);assert vd>=visualstart+speech-.05
 ass=header+line(0,duration,'Note','AI 재현 · 가상의 서버'if name=='hook'else'3D 개념 재현 · 구조 단순화')
 # Keep physical role labels and synchronized mechanism guides, remove repeated questions.
 guide=annotations(name,visualstart,duration,True,c)
 guide='\n'.join(x for x in guide.splitlines()if r'\pos(540,280)'not in x)+'\n'
 ass+=guide
 top=6 if name=='hook'else 0
 ass+=line(top,duration,'Caption',r'{\an5\pos(540,280)\fs46\fad(100,100)}'+wrap(headline))
 cues=[];group=[]
 def flush():
  if not group:return
  st=max(0,group[0]['start']-start-.03);en=min(duration,max(group[-1]['end']-start+.09,st+.35));text=wrap(display(''.join(w['text']for w in group)))
  if text and en>st:cues.append([st,en,text])
 for w in words:
  if group and w['text'].strip()not in'.!?'and(len(''.join(x['text']for x in group))+len(w['text'])>29 or w['end']-group[0]['start']>4.2):flush();group=[]
  group.append(w)
  if re.search(r'[.!?]$',w['text'].strip()):flush();group=[]
 flush()
 for k,q in enumerate(cues):
  if k+1<len(cues):q[1]=min(q[1],cues[k+1][0])
  elif name=='ending':q[1]=duration
  ass+=line(q[0],q[1],'Caption',q[2])
 af=out/f'{n:02}.ass';af.write_text(ass);target=out/f'{n:02}.mp4'
 vf=f"trim=start={visualstart},setpts=PTS-STARTPTS,tpad=stop_mode=clone:stop_duration=1.2,trim=duration={duration},subtitles=filename='{af}':fontsdir='{a.font_dir}'"
 # Trim BEFORE padding: .12s appended to source duration in v2 could leak the next word.
 audio=f'atrim=start={start}:end={end},asetpts=PTS-STARTPTS,afade=t=in:d=0.006,afade=t=out:st={max(0,speech-.006)}:d=0.006,apad,atrim=duration={duration},loudnorm=I=-16:TP=-1.5:LRA=7'
 run(['ffmpeg','-v','error','-y','-i',str(source),'-i',str(voice),'-vf',vf,'-af',audio,'-map','0:v:0','-map','1:a:0','-t',str(duration),'-c:v','h264_videotoolbox','-b:v','12M','-pix_fmt','yuv420p','-r','24','-c:a','aac','-b:a','192k','-ar','48000','-movflags','+faststart',str(target)])
 manifest['segments'].append({'id':name,'sourceIndex':i,'sentenceRange':[first,last],'sourceStart':start,'sourceEnd':end,'startPause':startpause,'endPause':endpause,'start':total,'duration':duration,'tail':duration-speech,'narration':transcript,'caption':str(af),'captions':len(cues),'video':str(target),'visualSourceStart':visualstart});total+=duration;print('EDITED',name,duration,flush=True)
inputs=[];filters=[]
for n,s in enumerate(manifest['segments']):
 inputs+=['-i',s['video']];d=s['duration'];filters +=[f'[{n}:v]trim=duration={d},setpts=PTS-STARTPTS[v{n}]',f'[{n}:a]apad,atrim=duration={d},asetpts=PTS-STARTPTS[a{n}]']
filters+=[''.join(f'[v{n}][a{n}]'for n in range(len(plan)))+f'concat=n={len(plan)}:v=1:a=1[v][a]']
run(['ffmpeg','-v','error','-y',*inputs,'-filter_complex',';'.join(filters),'-map','[v]','-map','[a]','-c:v','libx264','-preset','veryfast','-crf','19','-r','24','-pix_fmt','yuv420p','-c:a','aac','-b:a','192k','-movflags','+faststart',str(a.output)])
manifest.update(duration=total,path=str(a.output),sha256=hashlib.file_digest(a.output.open('rb'),'sha256').hexdigest());(out/'project.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n');print('COMPLETE',total,flush=True)
