"""Assemble the full accepted-look Falkirk film, preserving all original speech."""
import argparse,hashlib,json,re,subprocess
from pathlib import Path
from PIL import Image,ImageDraw,ImageFont
p=argparse.ArgumentParser();p.add_argument('--cache',type=Path,required=True);p.add_argument('--source-cache',type=Path,required=True);p.add_argument('--entry-cache',type=Path,required=True);p.add_argument('--output',type=Path,required=True);p.add_argument('--report',type=Path,required=True);a=p.parse_args();C=a.cache;OLD=a.source_cache;E=a.entry_cache;HERE=Path(__file__).parent
C.mkdir(parents=True,exist_ok=True)
def run(cmd):
 r=subprocess.run(list(map(str,cmd)),capture_output=True)
 if r.returncode:raise RuntimeError(r.stderr.decode(errors='replace')[-8000:])
 return r.stdout
def probe(f):return json.loads(run(['ffprobe','-v','error','-show_streams','-of','json',f]))['streams']
def sha(f):return hashlib.sha256(f.read_bytes()).hexdigest()
def ts(t):
 n=round(t*100);return f'{n//360000}:{n//6000%60:02}:{n//100%60:02}.{n%100:02}'
tl=json.loads((OLD/'timeline.json').read_text());receipt=json.loads((OLD/'higgsfield-receipt.json').read_text());assert receipt['state']=='downloaded'
review=json.loads((OLD/'review.json').read_text());assert review['digest']==tl['reviewDigest']
m=json.loads((C/'full-manifest-all.json').read_text());assert not m['preview'] and m['size']==[1080,1920] and m['samples']==64
assert m['sourceHash']==sha(HERE/'immersive-scene.py') and m['motionHash']==sha(HERE/'immersive-full.py')
em=json.loads((E/'motion-manifest.json').read_text());assert not em['preview'] and em['size']==[1080,1920] and em['sourceHash']==m['sourceHash']
assert em['motionHash']==sha(HERE/'immersive-motion.py')
for s in m['shots']:
 assert sha(C/(s['shot']+'.mp4'))==s['sha256'];v=next(x for x in probe(C/(s['shot']+'.mp4'))if x['codec_type']=='video');assert int(v['nb_frames'])==s['frames']
run(['ffmpeg','-v','error','-y','-i',OLD/'opening.mp4','-vf','scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,setsar=1,fps=24','-frames:v','80','-an','-c:v','libx264','-crf','18','-pix_fmt','yuv420p',C/'hook.mp4'])
run(['ffmpeg','-v','error','-y','-i',E/'motion-raw.mp4','-frames:v','365','-an','-c:v','libx264','-crf','18','-pix_fmt','yuv420p',C/'displace.mp4'])
listing='';frames=0;inputs=[]
for b in tl['beats']:
 f=C/(b['id']+'.mp4');v=next(x for x in probe(f)if x['codec_type']=='video');n=int(v['nb_frames']);assert n==round(b['duration']*24);frames+=n;inputs.append(dict(shot=b['id'],file=str(f),sha256=sha(f),frames=n));listing+="file '"+str(f).replace("'","'\\''")+"'\n"
assert frames==tl['frames']==1127
(C/'concat.txt').write_text(listing)
font=ImageFont.truetype(str(OLD/'fonts/Pretendard-SemiBold.otf'),54)
def wrap(s):
 ws=s.replace(r'\N',' ').split();s=' '.join(ws)
 if font.getlength(s)<=920:return [s]
 opts=[(' '.join(ws[:i]),' '.join(ws[i:]))for i in range(1,len(ws))];opts=[q for q in opts if max(map(font.getlength,q))<=920];assert opts
 return list(min(opts,key=lambda q:abs(font.getlength(q[0])-font.getlength(q[1]))))
header='''[Script Info]
ScriptType: v4.00+
PlayResX: 1080
PlayResY: 1920
WrapStyle: 2
ScaledBorderAndShadow: yes
[V4+ Styles]
Format: Name,Fontname,Fontsize,PrimaryColour,SecondaryColour,OutlineColour,BackColour,Bold,Italic,Underline,StrikeOut,ScaleX,ScaleY,Spacing,Angle,BorderStyle,Outline,Shadow,Alignment,MarginL,MarginR,MarginV,Encoding
Style: Caption,Pretendard SemiBold,54,&H00F4F7FA,&H00FFFFFF,&H00241B10,&H99000000,0,0,0,0,100,100,0,0,1,2.4,1,5,70,70,0,1
[Events]
Format: Layer,Start,End,Style,Name,MarginL,MarginR,MarginV,Effect,Text
'''
for b in tl['beats']:
 caps=[x for x in tl['captions']if x['scene']==b['id']];assert re.sub(r'\s','',''.join(c['text'].replace(r'\N','')for c in caps))==re.sub(r'\s','',b['narration'])
for c in tl['captions']:
 for i,line in enumerate(wrap(c['text'])):header+=f"Dialogue: 0,{ts(c['start'])},{ts(c['end'])},Caption,,0,0,0,,{{\\pos(540,{1330+i*70})}}{line}\n"
header+='Dialogue: 1,0:00:00.00,0:00:03.33,Caption,,0,0,0,,{\\pos(540,230)\\fs66}배가 들어와도\\N무게는 그대로?\n'
# Keep the quantitative example explicitly hypothetical, without a permanent diagram title.
st=next(b['start']for b in tl['beats']if b['id']=='displace')+7
header+=f'Dialogue: 1,{ts(st)},{ts(st+3)},Caption,,0,0,0,,{{\\pos(540,380)\\fs30}}10톤은 원리 설명을 위한 예시\n'
ass=C/'captions.ass';ass.write_text(header);a.output.parent.mkdir(parents=True,exist_ok=True)
run(['ffmpeg','-v','error','-y','-f','concat','-safe','0','-i',C/'concat.txt','-i',OLD/'audio.wav','-map','0:v:0','-map','1:a:0','-vf',f"ass='{ass}':fontsdir='{OLD}/fonts',fade=t=out:st={tl['duration']-.5}:d=0.5",'-c:v','libx264','-crf','18','-preset','medium','-pix_fmt','yuv420p','-c:a','aac','-b:a','192k','-movflags','+faststart',a.output])
ss=probe(a.output);v=next(x for x in ss if x['codec_type']=='video');au=next(x for x in ss if x['codec_type']=='audio');assert (v['width'],v['height'],int(v['nb_frames']))==(1080,1920,1127);assert v['r_frame_rate']=='24/1';delta=abs(float(v['duration'])-float(au['duration']));assert delta<.1
run(['ffmpeg','-v','error','-i',a.output,'-f','null','-'])
log=subprocess.run(['ffmpeg','-hide_banner','-i',str(a.output),'-af','volumedetect','-vn','-f','null','-'],check=True,capture_output=True,text=True).stderr
mean=float(re.search(r'mean_volume: ([\d.-]+) dB',log)[1]);peak=float(re.search(r'max_volume: ([\d.-]+) dB',log)[1]);assert -40<mean<-5 and peak<=0
qa=C/'qa';qa.mkdir(exist_ok=True);times=[1,3.4,8,12.8,13.1,19.9,27.9,28.3,31.5,35.8,36.6,39.2,42,45.8];board=Image.new('RGB',(1080,510*4),'#122029');draw=ImageDraw.Draw(board)
for i,t in enumerate(times):
 f=qa/f'{i:02}.jpg';run(['ffmpeg','-v','error','-y','-ss',t,'-i',a.output,'-frames:v','1','-vf','scale=270:480',f]);board.paste(Image.open(f),(i%4*270,i//4*510));draw.text((i%4*270+8,i//4*510+484),f'{t}s',fill='white')
board.save(qa/'full-contact.jpg',quality=92)
report=dict(status='technical pass; visual review pending',file=str(a.output),sha256=sha(a.output),bytes=a.output.stat().st_size,duration=float(v['duration']),frames=1127,size=[1080,1920],fps=24,avDelta=delta,decode=True,captionsComplete=True,voiceId=tl['voiceId'],speed=tl['speed'],audioSourceHash=sha(OLD/'audio.wav'),meanDb=mean,peakDb=peak,endingHold=tl['beats'][-1]['duration']-tl['beats'][-1]['speechDuration'],paidCalls=0,inputs=inputs,openingSourceHash=sha(OLD/'opening.mp4'),entrySourceHash=sha(E/'motion-raw.mp4'),renderer=m,assemblerHash=sha(Path(__file__)),contact=str(qa/'full-contact.jpg'),limitations=m['limitations'])
a.report.write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n');print(json.dumps({k:report[k]for k in ['status','file','duration','frames','avDelta','meanDb','peakDb','endingHold']},ensure_ascii=False))
