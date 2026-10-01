"""Re-edit approved longform assets into a portrait short. No generation/network calls."""
import argparse, hashlib, json, math, re, subprocess
from pathlib import Path
from PIL import ImageFont

p=argparse.ArgumentParser()
for name in ('source-cache','long-cache','cache','font-dir','output'):p.add_argument('--'+name,type=Path,required=True)
p.add_argument('--force',action='store_true');p.add_argument('--intro',type=Path,required=True);a=p.parse_args();a.cache.mkdir(parents=True,exist_ok=True)
here=Path(__file__).parent;brief=json.loads((here/'brief.json').read_text());align=json.loads((a.source_cache/'alignment.json').read_text())
# Scene index, inclusive sentence range, editorial heading. All spoken words are existing VO.
selections=[(0,0,0,'전기가 막히는 것 아닐까?'),(0,1,1,'칩 아래로 내려가는 길'),(1,4,4,'막는 재료 + 잇는 재료'),(2,3,4,'층 사이를 잇는 TGV'),(5,1,2,'레이저 변성 → 선택적 제거'),(6,3,3,'금속이 붙을 바탕부터'),(7,0,3,'구리를 붓는 게 아니다'),(8,1,2,'겉은 멀쩡해도 속은?'),(9,2,3,'뜨거워져도 연결 유지'),(11,1,1,'가공과 도금, 다른 전문 기술'),(12,2,3,'내가 쓰는 AI와의 관계'),(14,1,1,'필요한 자리만 연결한다'),(15,0,0,'길이 좋아져도 기다린다면?'),(15,2,2,'3탄: HBM') ]
font=ImageFont.truetype(str(a.font_dir/'Pretendard-SemiBold.otf'),60)
def run(cmd):return subprocess.run(cmd,check=True,capture_output=True,text=True)
def probe(path):return json.loads(run(['ffprobe','-v','error','-show_streams','-show_format','-of','json',str(path)]).stdout)
def stamp(t):
 n=round(t*100);return f'{n//360000}:{n//6000%60:02}:{n//100%60:02}.{n%100:02}'
def event(st,en,style,txt):return f'Dialogue: 0,{stamp(st)},{stamp(en)},{style},,0,0,0,,{txt}\n'
def wrap(s):
 if font.getlength(s)<=850:return s
 words=s.split();options=[(' '.join(words[:i]),' '.join(words[i:]))for i in range(1,len(words))]
 ok=[x for x in options if max(font.getlength(t)for t in x)<=850]
 assert ok,s
 return r'\N'.join(min(ok,key=lambda z:abs(font.getlength(z[0])-font.getlength(z[1]))))
header='''[Script Info]
ScriptType: v4.00+
PlayResX: 1080
PlayResY: 1920
WrapStyle: 2
ScaledBorderAndShadow: yes
[V4+ Styles]
Format: Name,Fontname,Fontsize,PrimaryColour,SecondaryColour,OutlineColour,BackColour,Bold,Italic,Underline,StrikeOut,ScaleX,ScaleY,Spacing,Angle,BorderStyle,Outline,Shadow,Alignment,MarginL,MarginR,MarginV,Encoding
Style: Caption,Pretendard SemiBold,60,&H00FFFFFF,&H00FFFFFF,&H002B302B,&H002B302B,0,0,0,0,100,100,0,0,3,15,0,5,105,105,0,1
Style: Eyebrow,Pretendard SemiBold,28,&H007B7265,&H007B7265,&H00000000,&H00000000,0,0,0,0,100,100,2,0,1,0,0,5,70,120,0,1
Style: Title,Pretendard SemiBold,69,&H002B302B,&H002B302B,&H00000000,&H00000000,0,0,0,0,100,100,0,0,1,0,0,5,75,125,0,1
Style: Chapter,Pretendard SemiBold,39,&H006B7455,&H006B7455,&H00000000,&H00000000,0,0,0,0,100,100,0,0,1,0,0,5,65,125,0,1
Style: Note,Pretendard SemiBold,27,&H006B645C,&H006B645C,&H00000000,&H00000000,0,0,0,0,100,100,0,0,1,0,0,5,70,125,0,1
[Events]
Format: Layer,Start,End,Style,Name,MarginL,MarginR,MarginV,Effect,Text
'''
plan={'title':brief['title'],'voiceId':brief['voice'],'speed':1.0,'resolution':[1080,1920],'fps':24,'newHiggsfieldRequests':0,'newTtsRequests':0,'new3dRenders':0,'source':'existing TGV longform clean visual masters + original Kyle narration','segments':[]};cursor=0;outputs=[];allcues=[]
for j,(idx,first,last,label)in enumerate(selections):
 sc=brief['scenes'][idx];words=align[idx]['words'];assert ''.join(w['text']for w in words).strip()==sc['narration'].strip()
 sentences=[];group=[]
 for w in words:
  group.append(w)
  if re.search(r'[.!?。]$',w['text'].strip()):sentences.append(group);group=[]
 chosen=[w for sent in sentences[first:last+1]for w in sent];st=chosen[0]['start'];end=chosen[-1]['end'];duration=math.ceil((end-st+.08)*24)/24
 audio=a.source_cache/'remote-narration'/f'beat-{idx:02}.mp3';meta=json.loads(Path(str(audio)+'.json').read_text());assert meta['voiceId']==brief['voice'] and meta['text']==sc['narration']
 visual=a.long_cache/'edit'/f'{idx:02}-visual.mp4';vstart=st
 if j==0:visual=a.intro;vstart=0
 assert float(probe(visual)['format']['duration'])>=vstart+end-st-.05
 note='개념 모형 · 구조 단순화'
 if idx in (4,8,9):note='개념 모형 · 변형 확대 / 수치 비교 아님'
 if j==0:note='AI 재현 · 가상의 시설'
 if idx==11:note='LPKF · MKS Atotech · SCHOTT | 기술 제공 사례'
 if idx==8:note='왼쪽 충진 · 오른쪽 내부 빈틈 | 결함 확대'
 if idx==5:note='LIDE 공정 예 · 모든 TGV의 유일한 방식 아님'
 ass=header+event(0,duration,'Eyebrow',r'{\pos(515,205)}AI의 숨은 기반   02')+event(0,duration,'Title',r'{\pos(515,345)}전기가 안 통하는 유리,\N칩은 어떻게 연결할까?')+event(0,duration,'Chapter',r'{\pos(515,530)}'+label)+event(0,duration,'Note',r'{\pos(515,1545)}'+note)
 cues=[];g=[]
 def flush():
  if not g:return
  txt=''.join(x['text']for x in g).strip();cues.append([max(0,g[0]['start']-st),min(duration,g[-1]['end']-st+.04),wrap(txt)])
 for w in chosen:
  if g and w['text'].strip() not in '.!?。,，' and (len(''.join(x['text']for x in g))+len(w['text'])>25 or w['end']-g[0]['start']>2.8):flush();g=[]
  g.append(w)
  if re.search(r'[.!?。]$',w['text'].strip()):flush();g=[]
 flush()
 for n,cue in enumerate(cues):
  if n+1<len(cues):cue[1]=min(cue[1],cues[n+1][0])
  assert cue[1]>cue[0]
  ass+=event(cue[0],cue[1],'Caption',r'{\pos(515,1390)}'+cue[2]);allcues.append({'start':cursor+cue[0],'end':cursor+cue[1],'text':cue[2]})
 sub=a.cache/f'{j:02}.ass';sub.write_text(ass);out=a.cache/f'{j:02}.mp4';outputs.append(out)
 plan['segments'].append({'scene':sc['id'],'sourceSentenceIndices':[first,last],'start':cursor,'duration':duration,'audioStart':st,'audioEnd':end,'visualStart':vstart,'visual':str(visual),'audio':str(audio),'heading':label,'narration':''.join(w['text']for w in chosen).strip()});cursor+=duration
 if not out.exists()or a.force:
  # Wide two-object comparisons keep their full width. Other scenes use a mild central crop.
  crop='crop=1920:1080:0:0' if idx in (1,8,11,12,13)else 'crop=1680:1080:120:0'
  vf=f"fps=24,{crop},scale=1080:-2,pad=1080:1920:0:650:color=0xEAE9E1,setsar=1,tpad=stop_mode=clone:stop_duration=0.2,subtitles=filename='{sub}':fontsdir='{a.font_dir}'"
  # Trim audio at approved sentence boundaries; preserve normal playback speed.
  af=f'atrim=duration={end-st},asetpts=PTS-STARTPTS,afade=t=in:d=0.004,afade=t=out:st={max(0,end-st-.005)}:d=0.005,apad,atrim=duration={duration},loudnorm=I=-16:TP=-1.5:LRA=7'
  run(['ffmpeg','-v','error','-y','-ss',str(vstart),'-i',str(visual),'-ss',str(st),'-i',str(audio),'-t',str(duration),'-vf',vf,'-af',af,'-map','0:v:0','-map','1:a:0','-c:v','h264_videotoolbox','-b:v','8M','-pix_fmt','yuv420p','-c:a','aac','-b:a','192k','-ar','48000','-movflags','+faststart',str(out)])
 print('EDITED',j,sc['id'],round(duration,2),flush=True)
plan['duration']=cursor;plan['captions']=allcues;(a.cache/'plan.json').write_text(json.dumps(plan,ensure_ascii=False,indent=2)+'\n')
chain=a.cache/'concat.txt';chain.write_text(''.join("file '"+str(x).replace("'","'\\''")+"'\n"for x in outputs));a.output.parent.mkdir(parents=True,exist_ok=True)
inputs=[];filters=[]
for i,(f,segment)in enumerate(zip(outputs,plan['segments'])):
 inputs+=['-i',str(f)];d=segment['duration']
 filters.append(f'[{i}:v]setpts=PTS-STARTPTS,fps=24,tpad=stop_mode=clone:stop_duration=0.2,trim=duration={d},setpts=PTS-STARTPTS[v{i}]')
 filters.append(f'[{i}:a]apad,atrim=duration={d},asetpts=PTS-STARTPTS[a{i}]')
filters.append(''.join(f'[v{i}][a{i}]'for i in range(len(outputs)))+f'concat=n={len(outputs)}:v=1:a=1[v][a]')
run(['ffmpeg','-v','error','-y',*inputs,'-filter_complex',';'.join(filters),'-map','[v]','-map','[a]','-r','24','-fps_mode','cfr','-c:v','libx264','-preset','veryfast','-crf','19','-pix_fmt','yuv420p','-video_track_timescale','24000','-c:a','aac','-b:a','192k','-movflags','+faststart',str(a.output)])
m=probe(a.output);v=next(x for x in m['streams']if x['codec_type']=='video');aud=next(x for x in m['streams']if x['codec_type']=='audio');assert(v['width'],v['height'],v['avg_frame_rate'])==(1080,1920,'24/1');assert abs(float(m['format']['duration'])-cursor)<.15;assert abs(float(v['duration'])-cursor)<.09;assert abs(float(v['duration'])-float(aud['duration']))<.1
run(['ffmpeg','-v','error','-i',str(a.output),'-f','null','-'])
sound=run(['ffmpeg','-hide_banner','-i',str(a.output),'-vn','-af','silencedetect=noise=-40dB:d=1.0,volumedetect','-f','null','-']).stderr;(a.cache/'audio-check.log').write_text(sound)
report={'video':str(a.output),'durationSeconds':float(m['format']['duration']),'videoDurationSeconds':float(v['duration']),'audioDurationSeconds':float(aud['duration']),'resolution':[1080,1920],'fps':24,'audioCodec':aud['codec_name'],'voiceId':brief['voice'],'speed':1.0,'fullDecode':'passed','captions':len(allcues),'captionWidthMaxPixels':850,'captionSafeCenter':[515,1390],'silencesOver1Second':[float(x)for x in re.findall(r'silence_duration: ([\d.]+)',sound)],'newPaidRequests':0,'new3dRenders':0,'sha256':hashlib.file_digest(a.output.open('rb'),'sha256').hexdigest(),'sourceHashes':{str(f):hashlib.file_digest(f.open('rb'),'sha256').hexdigest()for f in sorted({Path(s[k])for s in plan['segments']for k in ('audio','visual')})},'visualReview':'pending'}
assert not report['silencesOver1Second'],report['silencesOver1Second']
(a.cache/'verification.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n');print('VERIFIED',a.output,report['durationSeconds'],flush=True)
