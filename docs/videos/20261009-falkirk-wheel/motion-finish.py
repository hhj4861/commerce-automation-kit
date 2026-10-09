"""Caption, reuse the original speech, and verify the actual animated MP4."""
import argparse,hashlib,json,re,subprocess
from pathlib import Path
from PIL import Image,ImageDraw,ImageFont
p=argparse.ArgumentParser();p.add_argument('--cache',type=Path,required=True);p.add_argument('--source-cache',type=Path,required=True);p.add_argument('--output',type=Path,required=True);p.add_argument('--report',type=Path,required=True);a=p.parse_args()
C=a.cache;OLD=a.source_cache;HERE=Path(__file__).parent
m=json.loads((C/'motion-manifest.json').read_text());assert not m['preview'] and m['size']==[1080,1920] and m['frames']==408
for k,f in [('sourceHash','immersive-scene.py'),('motionHash','immersive-motion.py')]:assert m[k]==hashlib.sha256((HERE/f).read_bytes()).hexdigest()
def run(cmd):return subprocess.run(list(map(str,cmd)),check=True,capture_output=True).stdout
def probe(f):return json.loads(run(['ffprobe','-v','error','-show_streams','-of','json',f]))['streams']
def sha(f):return hashlib.sha256(f.read_bytes()).hexdigest()
def stamp(t):
 x=round(t*100);return f'{x//360000}:{x//6000%60:02}:{x//100%60:02}.{x%100:02}'
raw=C/'motion-raw.mp4';v=next(s for s in probe(raw)if s['codec_type']=='video');assert int(v['nb_frames'])==408
font=ImageFont.truetype(str(OLD/'fonts/Pretendard-SemiBold.otf'),54)
def wrap(s):
 words=s.replace(r'\N',' ').split();s=' '.join(words)
 if font.getlength(s)<=920:return [s]
 opts=[(' '.join(words[:i]),' '.join(words[i:]))for i in range(1,len(words))];opts=[q for q in opts if max(map(font.getlength,q))<=920]
 assert opts,'Caption too wide'
 return list(min(opts,key=lambda q:abs(font.getlength(q[0])-font.getlength(q[1]))))
tl=json.loads((OLD/'timeline.json').read_text());b=next(x for x in tl['beats']if x['id']=='displace');D=17
caps=[dict(start=c['start']-b['start'],end=c['end']-b['start'],lines=wrap(c['text']))for c in tl['captions']if c['scene']=='displace']
assert re.sub(r'\s','',''.join(''.join(c['lines'])for c in caps))==re.sub(r'\s','',b['narration'])
assert caps[-1]['end']<=b['duration']<D and D-b['speechDuration']>1.5
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
for c in caps:
 for i,line in enumerate(c['lines']):header+=f"Dialogue: 0,{stamp(c['start'])},{stamp(c['end'])},Caption,,0,0,0,,{{\\pos(540,{1330+i*70})}}{line}\n"
ass=C/'captions.ass';ass.write_text(header)
# Reuse exactly the selected source speech at its existing speed. Add only silent tail.
run(['ffmpeg','-v','error','-y','-ss',b['start'],'-i',OLD/'audio.wav','-t',b['duration'],'-c:a','pcm_s16le',C/'speech.wav'])
a.output.parent.mkdir(parents=True,exist_ok=True)
run(['ffmpeg','-v','error','-y','-i',raw,'-i',C/'speech.wav','-map','0:v:0','-map','1:a:0','-vf',f"ass='{ass}':fontsdir='{OLD}/fonts'",'-af','apad','-t',D,'-c:v','libx264','-crf','18','-preset','medium','-pix_fmt','yuv420p','-c:a','aac','-b:a','192k','-movflags','+faststart',a.output])
ss=probe(a.output);v=next(x for x in ss if x['codec_type']=='video');au=next(x for x in ss if x['codec_type']=='audio')
assert (v['width'],v['height'],int(v['nb_frames']))==(1080,1920,408)
assert v['r_frame_rate']=='24/1' and abs(float(v['duration'])-float(au['duration']))<.1
run(['ffmpeg','-v','error','-i',a.output,'-f','null','-'])
vol=subprocess.run(['ffmpeg','-hide_banner','-i',str(a.output),'-af','volumedetect','-vn','-f','null','-'],check=True,capture_output=True,text=True).stderr
mean=float(re.search(r'mean_volume: ([\d.-]+) dB',vol)[1]);peak=float(re.search(r'max_volume: ([\d.-]+) dB',vol)[1]);assert -40<mean<-5 and peak<=0
qa=C/'qa';qa.mkdir(exist_ok=True);times=[.5,3.4,3.6,7,10.4,10.6,14,16.5];board=Image.new('RGB',(1080,1020),'#122029');draw=ImageDraw.Draw(board)
for i,t in enumerate(times):
 f=qa/f'{i:02}.jpg';run(['ffmpeg','-v','error','-y','-ss',t,'-i',a.output,'-frames:v','1','-vf','scale=270:480',f]);board.paste(Image.open(f),(i%4*270,i//4*510));draw.text((i%4*270+8,i//4*510+484),f'{t}s',fill='white')
board.save(qa/'motion-contact.jpg',quality=92)
report={'status':'technical pass; rendered-frame visual review pending','file':str(a.output),'sha256':sha(a.output),'duration':17,'frames':408,'size':[1080,1920],'fps':24,'decode':True,'avDelta':abs(float(v['duration'])-float(au['duration'])),'audio':{'source':str(OLD/'audio.wav'),'sourceHash':sha(OLD/'audio.wav'),'sourceStart':b['start'],'sourceDuration':b['duration'],'voiceId':tl['voiceId'],'speed':tl['speed'],'meanDb':mean,'peakDb':peak,'newTtsCalls':0,'endingPause':D-b['speechDuration']},'captions':{'complete':True,'lastEnd':caps[-1]['end'],'font':'Pretendard SemiBold','size':54,'lineY':[1330,1400]},'renderer':m,'assemblerHash':sha(Path(__file__)),'paidCalls':0,'scope':'17-second motion proof, not a full-film replacement or production deployment','contact':str(qa/'motion-contact.jpg')}
a.report.write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n');print(json.dumps(report,ensure_ascii=False))
