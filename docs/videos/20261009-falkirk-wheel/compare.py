"""Assemble a controlled comparison: identical cached audio, timing and caption style.
No API calls. A sample only; never overwrites the completed full film.
"""
import argparse,json,subprocess,hashlib,re
from pathlib import Path
from PIL import ImageFont,Image,ImageDraw
p=argparse.ArgumentParser();p.add_argument('--cache',type=Path,required=True);p.add_argument('--source-cache',type=Path,required=True);p.add_argument('--output-dir',type=Path,required=True);a=p.parse_args();C=a.cache;OLD=a.source_cache;OUT=a.output_dir
ROOT=Path(__file__).resolve().parents[3];STYLE=json.loads((ROOT/'apps/shopshorts/renderers/architecture_style.json').read_text());P=STYLE['caption'];FONT=OLD/'fonts/Pretendard-SemiBold.otf';fnt=ImageFont.truetype(str(FONT),P['size'])
def run(cmd):return subprocess.run(list(map(str,cmd)),check=True,capture_output=True).stdout
def probe(f):return json.loads(run(['ffprobe','-v','error','-show_streams','-of','json',f]))['streams']
def sha(f):return hashlib.sha256(f.read_bytes()).hexdigest()
def stamp(t):
 x=round(t*100);return f'{x//360000}:{x//6000%60:02}:{x//100%60:02}.{x%100:02}'
def wrap(t):
 words=t.replace(r'\N',' ').split()
 text=' '.join(words)
 if fnt.getlength(text)<=P['width']:return text
 opts=[(' '.join(words[:i]),' '.join(words[i:])) for i in range(1,len(words))];opts=[q for q in opts if max(map(fnt.getlength,q))<=P['width']]
 if not opts:raise ValueError('Caption exceeds two lines: '+text)
 left,right=min(opts,key=lambda q:abs(fnt.getlength(q[0])-fnt.getlength(q[1])))
 # Explicit line positions preserve Elbphilharmonie first-line centre/spacing.
 return left+r'\N'+right
manifest=json.loads((C/'manifest.json').read_text());tl=json.loads((OLD/'timeline.json').read_text());beat=next(x for x in tl['beats']if x['id']=='displace');D=beat['duration'];assert round(D*24)==manifest['frames']==365
styleBytes=(ROOT/'apps/shopshorts/renderers/architecture_style.json').read_bytes();styleCode=(ROOT/'apps/shopshorts/renderers/architecture_style.py').read_bytes();assert hashlib.sha256(styleBytes+styleCode).hexdigest()==manifest['styleDigest'],'Style changed since render'
for shot in manifest['shots']:
 v=next(s for s in probe(C/'clips'/f"{shot['id']}.mp4")if s['codec_type']=='video');assert int(v['nb_frames'])==shot['frames']
listing=''.join("file '"+str(C/'clips'/f"{s['id']}.mp4").replace("'","'\\''")+"'\n"for s in manifest['shots']);(C/'clips/list.txt').write_text(listing)
run(['ffmpeg','-v','error','-y','-f','concat','-safe','0','-i',C/'clips/list.txt','-c','copy',C/'after-raw.mp4'])
run(['ffmpeg','-v','error','-y','-ss',beat['start'],'-i',OLD/'audio.wav','-t',D,'-c:a','aac','-b:a','192k',C/'shared-audio.m4a'])
header=f'''[Script Info]
ScriptType: v4.00+
PlayResX: 1080
PlayResY: 1920
WrapStyle: 2
ScaledBorderAndShadow: yes
[V4+ Styles]
Format: Name,Fontname,Fontsize,PrimaryColour,SecondaryColour,OutlineColour,BackColour,Bold,Italic,Underline,StrikeOut,ScaleX,ScaleY,Spacing,Angle,BorderStyle,Outline,Shadow,Alignment,MarginL,MarginR,MarginV,Encoding
Style: Caption,{P['font']},{P['size']},&H00E5F5FF,&H00FFFFFF,&H00241B10,&H99000000,0,0,0,0,100,100,0,0,1,2,1,5,70,70,0,1
[Events]
Format: Layer,Start,End,Style,Name,MarginL,MarginR,MarginV,Effect,Text
'''
caps=[dict(start=max(0,c['start']-beat['start']),end=min(D,c['end']-beat['start']),text=wrap(c['text']))for c in tl['captions']if c['scene']=='displace']
assert re.sub(r'\s','',''.join(c['text'].replace(r'\N','')for c in caps))==re.sub(r'\s','',beat['narration'])
events=''
for c in caps:
 for i,line in enumerate(c['text'].split(r'\N')):events+=f"Dialogue: 0,{stamp(c['start'])},{stamp(c['end'])},Caption,,0,0,0,,{{\\pos(540,{P['firstLineY']+i*P['lineSpacing']})}}{line}\n"
# Both versions get identical explanatory overlays, so comparison isolates visual treatment.
for start,end,title in [(0,175/24,'물의 힘이 배의 무게를 받칩니다'),(175/24,285/24,'배가 들어오면, 물은 빠져나갑니다'),(285/24,D,'수위는 같고, 물은 운하로')]:events+=f'Dialogue: 1,{stamp(start)},{stamp(end)},Caption,,0,0,0,,{{\\pos(540,250)\\fs43}}{title}\n'
events+='Dialogue: 1,0:00:07.00,0:00:10.00,Caption,,0,0,0,,{\\pos(540,390)\\fs30}10톤은 원리 설명을 위한 예시\n'
files={}
for name,raw,label in [('before',OLD/'clips/displace.mp4','기존 · 동일 대사'),('after',C/'after-raw.mp4','개선 · 동일 대사')]:
 ass=C/f'{name}.ass';ass.write_text(header+events+f'Dialogue: 2,0:00:00.00,{stamp(D)},Caption,,0,0,0,,{{\\pos(540,125)\\fs28}}{label}\n')
 target=OUT/'falkirk-quality-sample-v2.mp4'if name=='after'else C/'before-captioned.mp4'
 run(['ffmpeg','-v','error','-y','-i',raw,'-i',C/'shared-audio.m4a','-map','0:v:0','-map','1:a:0','-vf',f"ass='{ass}':fontsdir='{OLD}/fonts'",'-c:v','libx264','-crf','18','-preset','medium','-pix_fmt','yuv420p','-c:a','copy','-movflags','+faststart',target]);files[name]=target
comparison=OUT/'falkirk-quality-comparison-v2.mp4'
run(['ffmpeg','-v','error','-y','-i',files['before'],'-i',files['after'],'-filter_complex','[0:v][1:v]hstack=inputs=2[v]','-map','[v]','-map','1:a:0','-c:v','libx264','-crf','18','-c:a','copy','-movflags','+faststart',comparison]);files['comparison']=comparison
results={}
for name,f in files.items():
 streams=probe(f);v=next(s for s in streams if s['codec_type']=='video');audio=next(s for s in streams if s['codec_type']=='audio');assert int(v['nb_frames'])==365;assert abs(float(v['duration'])-float(audio['duration']))<.1
 run(['ffmpeg','-v','error','-i',f,'-f','null','-']);pcm=run(['ffmpeg','-v','error','-i',f,'-map','0:a:0','-f','s16le','-']);results[name]=dict(file=str(f),sha256=sha(f),frames=365,duration=float(v['duration']),audioPCMHash=hashlib.sha256(pcm).hexdigest(),decode=True)
assert len({r['audioPCMHash']for r in results.values()})==1
contact=Image.new('RGB',(1080,1020),(16,24,29));draw=ImageDraw.Draw(contact)
for i,t in enumerate([2,8.5,13]):
 for row,name in enumerate(['before','after']):
  f=C/'qa'/f'{name}-{i}.jpg';run(['ffmpeg','-v','error','-y','-ss',t,'-i',files[name],'-frames:v','1','-vf','scale=270:480',f]);contact.paste(Image.open(f),(i*360,row*510));draw.text((i*360+8,row*510+485),f'{name} {t}s',fill='white')
contact.save(C/'qa/comparison-contact.jpg')
report=dict(status='technical checks passed; visual review pending',style=manifest['styleId'],styleDigest=manifest['styleDigest'],files=results,narration=beat['narration'],captionsComplete=True,voiceSpeed=tl['speed'],paidCalls=0,scope='15-second excerpt, not full-film replacement')
(C/'verification.json').write_text(json.dumps(report,ensure_ascii=False,indent=2));print(json.dumps(report,ensure_ascii=False))
