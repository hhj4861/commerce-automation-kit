"""Prepare the approved two-person sample; assemble only real audio-driven lip-sync clips."""
import argparse,json,subprocess,os,math
from pathlib import Path
p=argparse.ArgumentParser();p.add_argument('mode',choices=['prepare','render','verify']);p.add_argument('--cache',type=Path,required=True);a=p.parse_args();c=a.cache
s=json.loads((Path(__file__).parent/'lipsync-sample.json').read_text());fps=25
for d in ['tmp','logs']: (c/d).mkdir(parents=True,exist_ok=True)
os.environ['TMPDIR']=str(c/'tmp')
def run(args):
 r=subprocess.run([str(x)for x in args],capture_output=True)
 if r.returncode:raise RuntimeError(r.stderr.decode(errors='replace')[-2000:])
 return r.stdout
def probe(f):return json.loads(run(['ffprobe','-v','error','-show_format','-show_streams','-of','json',f]))
def stamp(t):
 n=round(t*100);return f'{n//360000}:{n//6000%60:02d}:{n//100%60:02d}.{n%100:02d}'
if a.mode=='prepare':
 total=0;times=[]
 for b in s['beats']:
  role=b['id'];src=c/(role+'.mp3');meta=json.loads((c/(role+'.mp3.json')).read_text())
  assert meta['voiceId']==b['voiceId'] and meta['text']==b['ttsText']
  dur=math.ceil((float(probe(src)['format']['duration'])+.4)*fps)/fps
  run(['ffmpeg','-hide_banner','-loglevel','error','-y','-i',src,'-af','apad=pad_dur=0.4','-t',dur,'-ar','44100','-ac','1',c/(role+'-input.wav')])
  times.append(dict(role=role,start=total,duration=dur,text=b['text'],name=b['name']));total+=dur
 assert 15<=total<=20,total
 (c/'timing.json').write_text(json.dumps(dict(duration=total,shots=times),ensure_ascii=False,indent=2))
 print('Prepared',total)
elif a.mode=='render':
 timeline=json.loads((c/'timing.json').read_text());files=[]
 fontdir=Path('/Users/admin/Library/Mobile Documents/com~apple~CloudDocs/gpt 작업/commerce-automation-kit/20261005-webtoon-acting/fonts')
 for b in timeline['shots']:
  role=b['role'];src=c/(role+'-lipsync.mp4');info=probe(src)
  if not any(x['codec_type']=='video'for x in info['streams']):raise RuntimeError('Missing real lip-sync video')
  dur=b['duration'];actual=float(info['format']['duration'])
  if actual<dur-.2:raise RuntimeError('Provider clip shorter than input audio')
  ass=c/(role+'.ass')
  lines=['[Script Info]','ScriptType: v4.00+','PlayResX: 1920','PlayResY: 1080','[V4+ Styles]','Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding','Style: Caption,Pretendard SemiBold,48,&H00FFFFFF,&H00FFFFFF,&H00221C19,&H80000000,0,0,0,0,100,100,0,0,1,2.5,1,2,180,180,78,1','Style: Name,Pretendard SemiBold,40,&H00FFFFFF,&H00FFFFFF,&H00221C19,&H80000000,0,0,0,0,100,100,0,0,1,2,1,7,80,80,64,1','[Events]','Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text',f"Dialogue: 1,0:00:00.00,{stamp(dur)},Name,,0,0,0,,{b['name']}"]
  alignment=json.loads((c/(role+'-alignment.json')).read_text());groups=alignment['groups']
  for g in groups:lines.append(f"Dialogue: 1,{stamp(g['start'])},{stamp(g['end'])},Caption,,0,0,0,,{g['text']}")
  ass.write_text('\n'.join(lines)+'\n')
  dest=c/(role+'-final.mp4')
  vf=f"scale=1920:1080:force_original_aspect_ratio=increase,crop=1920:1080,setsar=1,fps={fps},ass='{ass}':fontsdir='{fontdir}'"
  # Use exactly the submitted speech track with unchanged speed and start time.
  run(['ffmpeg','-hide_banner','-loglevel','error','-y','-i',src,'-i',c/(role+'-input.wav'),'-map','0:v:0','-map','1:a:0','-vf',vf,'-af','alimiter=limit=0.89:level=disabled','-c:v','libx264','-preset','fast','-crf','18','-c:a','aac','-b:a','192k','-t',dur,'-pix_fmt','yuv420p',dest]);files.append(dest)
 (c/'concat.txt').write_text(''.join("file '"+str(f).replace("'","'\\''")+"'\n"for f in files))
 out=Path('/Users/admin/Downloads/vedio/im-fine-seoyun-minji-lipsync-sample.mp4')
 run(['ffmpeg','-hide_banner','-loglevel','error','-y','-f','concat','-safe','0','-i',c/'concat.txt','-c','copy','-movflags','+faststart',out]);print(out)
else:
 f=Path('/Users/admin/Downloads/vedio/im-fine-seoyun-minji-lipsync-sample.mp4');info=probe(f);dur=float(info['format']['duration']);assert 15<=dur<=20
 run(['ffmpeg','-v','error','-i',f,'-f','null','-'])
 print(json.dumps(dict(duration=dur,streams=[{k:x.get(k)for k in ['codec_type','codec_name','width','height','duration']}for x in info['streams']]),indent=2))
