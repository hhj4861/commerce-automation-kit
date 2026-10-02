"""Voice-timed longform and full-frame vertical short from original HBM assets."""
import argparse,json,subprocess,math,re,hashlib
from pathlib import Path
p=argparse.ArgumentParser();p.add_argument('--cache',type=Path,required=True);p.add_argument('--output',type=Path,required=True);p.add_argument('--font-dir',type=Path,required=True);p.add_argument('--short',action='store_true');p.add_argument('--only',type=int);p.add_argument('--force',action='store_true');a=p.parse_args();c=a.cache;here=Path(__file__).parent;b=json.loads((here/'brief.json').read_text());al=json.loads((c/'alignment.json').read_text());folder=c/('short-edit'if a.short else'edit');folder.mkdir(exist_ok=True);a.output.parent.mkdir(exist_ok=True,parents=True)
FPS=24;W,H=(1080,1920)if a.short else(1920,1080)
def run(cmd):subprocess.run(cmd,check=True)
def probe(f):return json.loads(subprocess.check_output(['ffprobe','-v','error','-show_format','-show_streams','-of','json',str(f)]))
def stamp(t):
 n=round(t*100);return f'{n//360000}:{n//6000%60:02}:{n//100%60:02}.{n%100:02}'
def line(st,en,style,t):return f'Dialogue: 0,{stamp(st)},{stamp(en)},{style},,0,0,0,,{t}\n'
def clean(t):return t.replace('{','').replace('}','').replace('\\','')
def wrap(t):
 lim=17 if a.short else 34
 if len(t)<=lim:return t
 ws=t.split();opts=[(' '.join(ws[:j]),' '.join(ws[j:]))for j in range(1,len(ws))]
 if not opts:return t
 l,r=min(opts,key=lambda x:abs(len(x[0])-len(x[1])));return l+r'\N'+r
header=f'''[Script Info]
ScriptType: v4.00+
PlayResX: {W}
PlayResY: {H}
WrapStyle: 2
ScaledBorderAndShadow: yes
[V4+ Styles]
Format: Name,Fontname,Fontsize,PrimaryColour,SecondaryColour,OutlineColour,BackColour,Bold,Italic,Underline,StrikeOut,ScaleX,ScaleY,Spacing,Angle,BorderStyle,Outline,Shadow,Alignment,MarginL,MarginR,MarginV,Encoding
Style: Caption,Pretendard SemiBold,{62 if a.short else 54},&H00FFFFFF,&H00FFFFFF,&H00201B17,&H80000000,0,0,0,0,100,100,0,0,1,3,1,2,{65 if a.short else 130},{65 if a.short else 130},{340 if a.short else 90},1
Style: Note,Pretendard SemiBold,{24 if a.short else 23},&H00DDDDDD,&H00FFFFFF,&H00201B17,&H80000000,0,0,0,0,100,100,0,0,1,1.5,0,9,45,45,48,1
Style: Label,Pretendard SemiBold,{65 if a.short else 58},&H00FFFFFF,&H00FFFFFF,&H00201B17,&H80000000,0,0,0,0,100,100,0,0,1,2,1,8,80,80,{220 if a.short else 70},1
[Events]
Format: Layer,Start,End,Style,Name,MarginL,MarginR,MarginV,Effect,Text
'''
# Sentence selections reuse source narration and the same visual timeline; no new generation.
selections=[('hook',0,3),('capacity',0,3),('stack',0,3),('tsv',0,2),('interposer',0,2),('daily',0,2),('ending',0,2)]
parts=[]
for i,sc in enumerate(b['scenes']):
 d=math.ceil((al[i]['duration']+.12)*FPS)/FPS
 if not a.short:parts.append((i,0,d));continue
 sel=next((x for x in selections if x[0]==sc['id']),None)
 if not sel:continue
 sentences=list(re.finditer(r'[^.!?]+[.!?]?',sc['narration']));startchar=sentences[sel[1]].start();endchar=sentences[min(sel[2],len(sentences))-1].end();offset=0;chosen=[]
 for w in al[i]['words']:
  lo,hi=offset,offset+len(w['text']);offset=hi
  if hi>startchar and lo<endchar:chosen.append(w)
 start=max(0,chosen[0]['start']-.05);end=min(d,chosen[-1]['end']+.12)
 if i==0:start=0
 parts.append((i,start,math.ceil((end-start)*FPS)/FPS))
manifest={'title':b['title'],'voiceId':b['voice'],'speed':1.0,'resolution':[W,H],'fps':FPS,'native3dFps':FPS,'layout':'full-frame 9:16'if a.short else'cinematic 16:9','ttsWorkflowRun':36972343577,'higgsfieldGenerationId':'01603a68-fd02-451f-b492-ab9fc22e2cf9','additionalPaidGenerationForShort':False,'segments':[]};total=0
for n,(i,offset,d)in enumerate(parts):
 sc=b['scenes'][i];voice=c/'remote-narration'/f'beat-{i:02}.mp3';meta=json.loads(Path(str(voice)+'.json').read_text());assert meta['text']==sc['narration'] and meta['voiceId']==b['voice'];assert ''.join(w['text']for w in al[i]['words']).strip()==sc['narration'].strip()
 ass=header;note='3D 개념 재현 · 구조 단순화'
 if sc['kind']in('queue','warehouse'):note='이해를 돕는 비유'
 if i==0:ass+=line(0,min(6,d),'Note','AI 재현 · 가상의 서버')+line(6,d,'Note',note)
 else:ass+=line(0,d,'Note',note)
 cues=[];group=[]
 def flush():
  if not group:return
  st=max(0,group[0]['start']-offset-.03);en=min(d,max(group[-1]['end']-offset+.09,st+.35));t=''.join(w['text']for w in group).strip()
  if t and en>st:cues.append([st,en,wrap(clean(t))])
 for w in al[i]['words']:
  if w['end']<=offset or w['start']>=offset+d:continue
  if group and w['text'].strip() not in '.!?' and(len(''.join(x['text']for x in group))+len(w['text'])>(29 if a.short else 44)or w['end']-group[0]['start']>4.2):flush();group=[]
  group.append(w)
  if re.search(r'[.!?]$',w['text'].strip()):flush();group=[]
 flush()
 for k,q in enumerate(cues):
  if k+1<len(cues):q[1]=min(q[1],cues[k+1][0])
  if q[1]>q[0]:ass+=line(q[0],q[1],'Caption',q[2])
 if sc['id']=='numbers':ass+=line(4,d-1,'Label','H200   141 GB  /  4.8 TB/s')
 if sc['id']=='tsv':ass+=line(2,6,'Label','TSV · 실리콘 관통 연결')
 af=folder/f'{n:02}.ass';af.write_text(ass);out=folder/f'{n:02}.mp4';manifest['segments'].append({'id':sc['id'],'sourceIndex':i,'sourceStart':offset,'start':total,'duration':d,'caption':str(af),'captions':len(cues)});total+=d
 if a.only is not None and n!=a.only:continue
 if out.exists()and not a.force and abs(float(probe(out)['format']['duration'])-d)<.08:continue
 source=c/'3d'/(sc['id']+'.mp4');m=probe(source);v=next(x for x in m['streams']if x['codec_type']=='video');assert(v['width'],v['height'],v['avg_frame_rate'])==(1920,1080,'24/1')
 # Replace only opening six seconds, preserving the full scene timing afterwards.
 if i==0:
  visual=folder/'opening-joined.mp4';
  run(['ffmpeg','-v','error','-y','-i',str(c/'opening.mp4'),'-i',str(source),'-filter_complex','[0:v]scale=1920:1080,fps=24,trim=duration=6,setpts=PTS-STARTPTS,setsar=1[a];[1:v]trim=start=6,setpts=PTS-STARTPTS,setsar=1[b];[a][b]concat=n=2:v=1:a=0[v]','-map','[v]','-an','-c:v','h264_videotoolbox','-b:v','12M',str(visual)]);source=visual
 vf='crop=608:1080:(iw-608)/2:0,scale=1080:1920:flags=lanczos,setsar=1,'if a.short else'setsar=1,'
 vf+=f"subtitles=filename='{af}':fontsdir='{a.font_dir}'"
 run(['ffmpeg','-v','error','-y','-ss',str(offset),'-i',str(source),'-ss',str(offset),'-i',str(voice),'-t',str(d),'-vf',vf,'-af',f'apad,atrim=duration={d},loudnorm=I=-16:TP=-1.5:LRA=7','-c:v','h264_videotoolbox','-b:v','12M','-pix_fmt','yuv420p','-r','24','-c:a','aac','-b:a','192k','-ar','48000','-movflags','+faststart',str(out)]);print('EDITED',n,sc['id'],round(d,2),flush=True)
manifest['duration']=total;(c/('short-project.json'if a.short else'project.json')).write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n')
if a.only is None:
 inputs=[];f=[]
 for n,seg in enumerate(manifest['segments']):
  inputs+=['-i',str(folder/f'{n:02}.mp4')];d=seg['duration'];f+=[f'[{n}:v]setpts=PTS-STARTPTS,fps=24,tpad=stop_mode=clone:stop_duration=0.2,trim=duration={d},setpts=PTS-STARTPTS[v{n}]',f'[{n}:a]apad,atrim=duration={d},asetpts=PTS-STARTPTS[a{n}]']
 f.append(''.join(f'[v{n}][a{n}]'for n in range(len(parts)))+f'concat=n={len(parts)}:v=1:a=1[v][a]')
 run(['ffmpeg','-v','error','-y',*inputs,'-filter_complex',';'.join(f),'-map','[v]','-map','[a]','-r','24','-c:v','libx264','-preset','veryfast','-crf','19','-pix_fmt','yuv420p','-video_track_timescale','24000','-c:a','aac','-b:a','192k','-movflags','+faststart',str(a.output)])
 m=probe(a.output);v=next(x for x in m['streams']if x['codec_type']=='video');au=next(x for x in m['streams']if x['codec_type']=='audio');assert abs(float(v['duration'])-total)<.1;assert abs(float(v['duration'])-float(au['duration']))<.1
 run(['ffmpeg','-v','error','-i',str(a.output),'-f','null','-'])
 snd=subprocess.run(['ffmpeg','-hide_banner','-i',str(a.output),'-vn','-af','silencedetect=noise=-40dB:d=1.3,volumedetect','-f','null','-'],capture_output=True,text=True,check=True).stderr;(folder/'audio-check.log').write_text(snd);silences=re.findall(r'silence_duration: ([\d.]+)',snd)
 report={'path':str(a.output),'duration':float(v['duration']),'audioDuration':float(au['duration']),'resolution':[v['width'],v['height']],'fps':v['avg_frame_rate'],'voiceId':b['voice'],'speed':1.0,'fullDecode':'passed','silencesOver1_3s':silences,'captionCount':sum(s['captions']for s in manifest['segments']),'sha256':hashlib.file_digest(a.output.open('rb'),'sha256').hexdigest(),'visualReview':'pending'};(c/('short-verification.json'if a.short else'verification.json')).write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n');print('VERIFIED',json.dumps(report,ensure_ascii=False),flush=True)
