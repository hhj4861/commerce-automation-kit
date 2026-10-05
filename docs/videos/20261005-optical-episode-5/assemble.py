"""Voice-first assembly with exact-source captions; fail on missing paid opening."""
import argparse,json,math,subprocess,re,hashlib,time
from pathlib import Path
p=argparse.ArgumentParser();p.add_argument('mode',choices=['align','plan','assemble','verify']);p.add_argument('--cache',type=Path,required=True);p.add_argument('--variant',choices=['long','short'],default='long');p.add_argument('--out',type=Path);p.add_argument('--font-dir',type=Path);p.add_argument('--preview-plan',action='store_true');p.add_argument('--wait-for-render',action='store_true');a=p.parse_args();c=a.cache;here=Path(__file__).parent;b=json.loads((here/'story.json').read_text());FPS=24
names={'long':'optical-episode-5-long.mp4','short':'optical-episode-5-short.mp4'}
def run(x):subprocess.run(x,check=True)
def probe(x):return json.loads(subprocess.check_output(['ffprobe','-v','error','-show_format','-show_streams','-of','json',str(x)]))
def dur(x):return float(probe(x)['format']['duration'])
def ts(t):
 n=round(t*100);return f'{n//360000}:{n//6000%60:02}:{n//100%60:02}.{n%100:02}'
if a.mode=='align':
 import os
 os.environ['NUMBA_CACHE_DIR']=str(c/'numba-cache')
 import torch,whisper
 from whisper.timing import find_alignment
 from whisper.tokenizer import get_tokenizer
 torch.set_num_threads(4)
 modeldir=c.parent/'20261001-glass-substrate/models'
 m=whisper.load_model('base',device='cpu',download_root=str(modeldir));tok=get_tokenizer(m.is_multilingual,language='ko',task='transcribe')
 result=[]
 for beat in b['beats']:
  mp=c/'voice'/(beat['id']+'.mp3');meta=json.loads(Path(str(mp)+'.json').read_text());assert meta['text']==beat['text'] and meta['voiceId']==b['voiceId']
  audio=whisper.load_audio(str(mp));duration=len(audio)/16000
  assert duration<=30,'Split voice on a pause before alignment'
  mel=whisper.log_mel_spectrogram(whisper.pad_or_trim(audio),n_mels=m.dims.n_mels)
  words=find_alignment(m,tok,tok.encode(beat['text']),mel,len(audio)//160)
  result.append({'id':beat['id'],'duration':duration,'words':[{'text':w.word,'start':float(w.start),'end':float(w.end),'probability':float(w.probability)}for w in words]})
  (c/'alignment.json').write_text(json.dumps(result,ensure_ascii=False,indent=2));print('ALIGNED',beat['id'],round(duration,2),flush=True)
 raise SystemExit()
if a.mode=='plan':
 for variant in names:
  ids=([s['id'] for s in b['beats']] if variant=='long' else b['shortIds']);speed=1 if variant=='long'else 1.1;segments=[];total=0
  for sid in ids:
   i=next(i for i,s in enumerate(b['beats'])if s['id']==sid);sc=b['beats'][i];mp=c/'voice'/f'{sid}.mp3'
   if a.preview_plan:d=18
   else:
    meta=json.loads(Path(str(mp)+'.json').read_text());assert meta['voiceId']==b['voiceId']and meta['text']==sc['text'];d=dur(mp)
   d=math.ceil((d/speed+(.9 if sid==ids[-1]else .12))*FPS)/FPS
   segments.append({'id':sid,'index':i,'duration':d,'start':total,'speed':speed});total+=d
  plan={'variant':variant,'speed':speed,'voice':b['voiceId'],'width':1920 if variant=='long'else 1080,'height':1080 if variant=='long'else 1920,'fps':FPS,'duration':total,'segments':segments,'previewOnly':a.preview_plan}
  (c/(variant+'-plan.json')).write_text(json.dumps(plan,ensure_ascii=False,indent=2));print('PLAN',variant,round(total,3),flush=True)
 raise SystemExit()
plan=json.loads((c/(a.variant+'-plan.json')).read_text());assert not plan['previewOnly'];W,H=plan['width'],plan['height'];portrait=a.variant!='long';out=a.out or Path('/Users/admin/Downloads/vedio')/names[a.variant];folder=c/('edit-'+a.variant);folder.mkdir(parents=True,exist_ok=True)
if a.mode=='verify':
 meta=probe(out);v=next(x for x in meta['streams']if x['codec_type']=='video');au=next(x for x in meta['streams']if x['codec_type']=='audio');assert(v['width'],v['height'])==(W,H);assert abs(float(v['duration'])-plan['duration'])<.12;assert abs(float(v['duration'])-float(au['duration']))<.12
 run(['ffmpeg','-v','error','-i',str(out),'-f','null','-'])
 log=subprocess.run(['ffmpeg','-hide_banner','-i',str(out),'-af','silencedetect=noise=-40dB:d=1.3,volumedetect','-vf','blackdetect=d=0.3:pix_th=.05','-f','null','-'],capture_output=True,text=True,check=True).stderr;(folder/'verify.log').write_text(log)
 report={'file':str(out),'resolution':[W,H],'duration':float(v['duration']),'audioDuration':float(au['duration']),'fps':v['avg_frame_rate'],'voice':b['voiceId'],'speed':plan['speed'],'fullDecode':True,'silencesOver1_3sec':re.findall(r'silence_duration: ([\d.]+)',log),'blackSegments':re.findall(r'black_start:[^\n]+',log),'maxVolume':re.findall(r'max_volume: ([^\n]+)',log),'sha256':hashlib.file_digest(out.open('rb'),'sha256').hexdigest(),'visualReview':'pending'};(c/(a.variant+'-verification.json')).write_text(json.dumps(report,ensure_ascii=False,indent=2));print(json.dumps(report,ensure_ascii=False));raise SystemExit()
assert a.font_dir and a.font_dir.exists();al=json.loads((c/'alignment.json').read_text());clips=[]
header=f'''[Script Info]
ScriptType: v4.00+
PlayResX: {W}
PlayResY: {H}
WrapStyle: 2
ScaledBorderAndShadow: yes
[V4+ Styles]
Format: Name,Fontname,Fontsize,PrimaryColour,SecondaryColour,OutlineColour,BackColour,Bold,Italic,Underline,StrikeOut,ScaleX,ScaleY,Spacing,Angle,BorderStyle,Outline,Shadow,Alignment,MarginL,MarginR,MarginV,Encoding
Style: Caption,Pretendard SemiBold,{62 if portrait else 52},&H00FFFFFF,&H00FFFFFF,&H00211913,&H90000000,0,0,0,0,100,100,0,0,1,3,1,2,72,72,{350 if portrait else 95},1
Style: Hook,Pretendard SemiBold,{78 if portrait else 68},&H00FFFFFF,&H00FFFFFF,&H00211913,&H90000000,0,0,0,0,100,100,0,0,1,3,1,8,65,65,{170 if portrait else 90},1
Style: Note,Pretendard SemiBold,{23 if portrait else 22},&H00DDDDDD,&H00FFFFFF,&H00302216,&H80000000,0,0,0,0,100,100,0,0,1,1,0,9,45,45,45,1
Style: Label,Pretendard SemiBold,{44 if portrait else 36},&H0099F0E4,&H00FFFFFF,&H00302216,&H80000000,0,0,0,0,100,100,0,0,1,2,1,8,60,60,{190 if portrait else 70},1
[Events]
Format: Layer,Start,End,Style,Name,MarginL,MarginR,MarginV,Effect,Text
'''
labels_unused={'distance':'계산 사이에도 데이터가 이동합니다','stack':'연결 거리 ↓','contacts':'접점의 정렬','hybrid':'금속 + 절연층 접합','heat':'신호의 길과 열의 길','amd':'2세대 3D V-Cache · 개념도','yield':'접합 전후 검사','winter':'겨울에 모은 얼음','insulation':'반지하 + 덮개','drain':'녹은 물의 배출','vent':'천장의 환기구','ending':'가까운 연결 + 열이 빠질 길','iceending':'겨울의 차가움을 보관하는 건물'}
labels={x['id']:x['label'] for x in b['beats']}
def event(st,en,style,t):return f'Dialogue: 0,{ts(st)},{ts(en)},{style},,0,0,0,,{t}\n'
def wrap(t):
 lim=17 if portrait else 32
 if len(t)<=lim:return t
 words=t.split();opts=[(' '.join(words[:j]),' '.join(words[j:]))for j in range(1,len(words))]
 if not opts:return t
 l,r=min(opts,key=lambda x:abs(len(x[0])-len(x[1])));return l+r'\N'+r
allcues=[]
for n,seg in enumerate(plan['segments']):
 sid=seg['id'];i=seg['index'];D=seg['duration'];speed=seg['speed'];source=c/('3d-'+a.variant)/(sid+'.mp4');voice=c/'voice'/f'{sid}.mp3'
 if a.wait_for_render:
  deadline=time.monotonic()+5400;announced=False
  while True:
   try:
    if source.exists() and dur(source)+.05>=D:break
   except subprocess.CalledProcessError:pass
   if time.monotonic()>deadline:raise TimeoutError('Renderer did not finish '+sid)
   if not announced:print('WAIT RENDER',sid,flush=True);announced=True
   time.sleep(3)
 assert source.exists(),str(source);assert dur(source)+.05>=D
 ass=header+event(0,D,'Note','3D 개념도 · 색과 흐름은 설명용')
 if n==0:ass=header+event(0,6,'Note','AI 재현 · 실제 촬영 아님')+event(6,D,'Note','구조를 단순화한 3D 재현')
 if n==0:ass+=event(0,min(D,3.4),'Hook','AI칩끼리 왜'+r'\N'+'빛으로 대화할까?' if portrait else 'AI칩끼리 왜 빛으로 대화할까?')
 elif sid in labels:ass+=event(.4,min(D,4.8,D-5 if sid=='ending' else D),'Label',wrap(labels[sid]))
 if sid in ('conversion','modulator','receiver'):ass+=event(4,min(D,8),'Label',wrap('금색: 전기 신호   청록: 광 연결'))
 if sid in ('wdm','wavelength'):ass+=event(4,min(D,9),'Label',wrap('파장 구분을 위한 색 · 실제는 주로 적외선'))
 words=al[i]['words'];assert al[i]['id']==sid;assert ''.join(w['text']for w in words).strip()==b['beats'][i]['text'].strip();group=[];cues=[]
 def flush():
  if not group:return
  st=max(0,group[0]['start']/speed-.025);en=min(D,max(st+.4,group[-1]['end']/speed+.07));text=''.join(w['text']for w in group).strip();text=text.replace('티에스엠씨','TSMC').replace('에이엠디','AMD').replace('소아이씨','SoIC').replace('포베로스 다이렉트','Foveros Direct').replace('쓰리디 브이 캐시','3D V-Cache').replace('지피유','GPU').replace('에이치비엠','HBM').replace('씨피오','CPO').replace('씨피유','CPU');cues.append([st,en,wrap(text)])
 for w in words:
  if group and w['text'].strip() not in '.!?,;:' and(len(''.join(x['text']for x in group))+len(w['text'])>(28 if portrait else 48)or w['end']-group[0]['start']>4):flush();group=[]
  group.append(w)
  if re.search('[.!?]$',w['text'].strip()):flush();group=[]
 flush()
 merged=[]
 for cue in cues:
  if re.fullmatch(r'[\s.!?,;:]+',cue[2]):
   if merged:merged[-1][1]=max(merged[-1][1],cue[1]);merged[-1][2]+=cue[2].strip()
  else:merged.append(cue)
 cues=merged
 assert cues and all(re.search(r'[가-힣A-Za-z0-9]',q[2])for q in cues),'Empty or punctuation-only caption'
 for j,q in enumerate(cues):
  if j+1<len(cues):q[1]=min(q[1],cues[j+1][0])
  if n==len(plan['segments'])-1 and j==len(cues)-1:q[1]=D
  if q[1]>q[0]:ass+=event(*q[:2],'Caption',q[2]);allcues.append({'scene':sid,'start':seg['start']+q[0],'end':seg['start']+q[1],'text':q[2]})
 af=folder/f'{n:02}.ass';af.write_text(ass);clip=folder/f'{n:02}.mp4';clips.append(clip)
 if clip.exists()and abs(dur(clip)-D)<.05:print('EDIT EXISTS',sid,flush=True);continue
 vf=f"setsar=1,subtitles=filename='{af}':fontsdir='{a.font_dir}'"
 if sid=='ending' and a.variant in('long','short'):
  motion=c/f'summary-{a.variant}.mp4';assert motion.exists(),'Required HyperFrames summary missing'
  joined=folder/'summary-joined.mp4';cut=D-5
  run(['ffmpeg','-v','error','-y','-i',str(source),'-i',str(motion),'-filter_complex',f'[0:v]fps=24,trim=duration={cut},setpts=PTS-STARTPTS,setsar=1[a];[1:v]fps=24,tpad=stop_mode=clone:stop_duration=1,trim=duration=5,setpts=PTS-STARTPTS,setsar=1[b];[a][b]concat=n=2:v=1:a=0[v]','-map','[v]','-an','-c:v','libx264','-preset','veryfast','-crf','22',str(joined)]);source=joined
 if n==0:
  opening=c/'opening.mp4';assert opening.exists(),'Required Higgsfield opening missing';joined=folder/'opening-joined.mp4'
  crop='scale=1920:1080'if a.variant=='long'else'scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920'
  run(['ffmpeg','-v','error','-y','-i',str(opening),'-i',str(source),'-filter_complex',f'[0:v]{crop},fps=24,trim=duration=6,setpts=PTS-STARTPTS,setsar=1[a];[1:v]trim=start=6,setpts=PTS-STARTPTS,setsar=1[b];[a][b]concat=n=2:v=1:a=0[v]','-map','[v]','-an','-c:v','libx264','-preset','veryfast','-crf','22',str(joined)]);source=joined
 run(['ffmpeg','-v','error','-y','-i',str(source),'-i',str(voice),'-t',str(D),'-vf',vf,'-af',f'atempo={speed},apad,atrim=duration={D},loudnorm=I=-16:TP=-1.5:LRA=7','-c:v','libx264','-preset','veryfast','-crf','22','-pix_fmt','yuv420p','-r','24','-c:a','aac','-b:a','192k','-ar','48000','-movflags','+faststart',str(clip)]);print('EDITED',sid,flush=True)
(c/(a.variant+'-captions.json')).write_text(json.dumps(allcues,ensure_ascii=False,indent=2))
# Re-encode concatenation once to normalize AAC boundaries; no next-sentence fragments.
inputs=[];filters=[]
for n,seg in enumerate(plan['segments']):
 inputs+=['-i',str(clips[n])];D=seg['duration'];filters += [f'[{n}:v]fps=24,tpad=stop_mode=clone:stop_duration=0.1,trim=duration={D},setpts=PTS-STARTPTS[v{n}]',f'[{n}:a]apad,atrim=duration={D},asetpts=PTS-STARTPTS[a{n}]']
filters.append(''.join(f'[v{n}][a{n}]'for n in range(len(clips)))+f'concat=n={len(clips)}:v=1:a=1[v][a]');out.parent.mkdir(exist_ok=True,parents=True)
run(['ffmpeg','-v','error','-y',*inputs,'-filter_complex',';'.join(filters),'-map','[v]','-map','[a]','-r','24','-c:v','libx264','-preset','veryfast','-crf','21','-pix_fmt','yuv420p','-video_track_timescale','24000','-c:a','aac','-b:a','192k','-movflags','+faststart',str(out)]);print('FINAL',out,flush=True)
