"""Reuse approved pictures and speech; modern typography and explicit stereo AAC export."""
import argparse, hashlib, json, math, subprocess, re
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont
P=argparse.ArgumentParser();P.add_argument('mode',choices=['build','preview','assemble','verify']);P.add_argument('--cache',required=True,type=Path);A=P.parse_args()
C=A.cache;D=C/'edit-v2';D.mkdir(exist_ok=True);F=Path('/Users/admin/Downloads/vedio/bathroom-pipes-architecture-short-v2.mp4');TL=json.loads((C/'timeline.json').read_text());FPS=24;W,H=1080,1920
FONT=C/'fonts/Pretendard-SemiBold.otf';caption_font=ImageFont.truetype(str(FONT),62);title_font=ImageFont.truetype(str(FONT),88);label_font=ImageFont.truetype(str(FONT),38)
def run(args):
 p=subprocess.run([str(x) for x in args],capture_output=True)
 if p.returncode: raise RuntimeError(p.stderr.decode(errors='replace')[-4000:])
 return p.stdout
def probe(f):return json.loads(run(['ffprobe','-v','error','-show_streams','-show_format','-of','json',f]))
def lines(text):
 text=text.replace(r'\N',' ').strip()
 if caption_font.getlength(text)<=880:return [text]
 words=text.split();opts=[[' '.join(words[:i]),' '.join(words[i:])]for i in range(1,len(words))];opts=[q for q in opts if max(caption_font.getlength(z)for z in q)<=880]
 assert opts, text
 return min(opts,key=lambda q:abs(caption_font.getlength(q[0])-caption_font.getlength(q[1])))
def overlay(cap,label,hook):
 im=Image.new('RGBA',(W,H));d=ImageDraw.Draw(im)
 if hook:
  for y in range(620):d.line((0,y,W,y),fill=(12,22,27,int(170*max(0,1-y/620))))
  d.rounded_rectangle((76,198,84,395),radius=4,fill=(110,233,219,255))
  d.text((112,204),'윗집 배관이',font=title_font,fill=(255,255,255,255),anchor='lt')
  d.text((112,310),'왜 우리 집에?',font=title_font,fill=(146,244,228,255),anchor='lt')
 if cap is not None:
  ls=lines(TL['captions'][cap]['text']);width=max(caption_font.getlength(s)for s in ls);height=len(ls)*78+36;top=1420-height/2
  d.rounded_rectangle(((W-width)/2-30,top,(W+width)/2+30,top+height),radius=20,fill=(13,22,29,215))
  for j,s in enumerate(ls):d.text((W/2,top+18+j*78),s,font=caption_font,fill=(255,255,255,255),anchor='mt')
 if label:
  for text,y in [('윗집',420),('우리 집',1190)]:
   width=label_font.getlength(text);d.rounded_rectangle((110,y-31,110+width+36,y+31),radius=13,fill=(244,248,246,238));d.text((128,y),text,font=label_font,fill=(29,43,48,255),anchor='lm')
 return im
if A.mode=='build':
 # One packet per output frame prevents sparse PNG timestamps from drifting in multi-input overlay.
 states=[];assets={};entries=[]
 for f in range(TL['frames']):
  t=f/FPS;cap=next((i for i,c in enumerate(TL['captions'])if c['start']<=t<c['end']),None);label=any(b['id']in ['reveal','ending'] and max(6,b['start'])<=t<b['start']+b['duration']for b in TL['beats']);state=(cap,label,t<3.8)
  if state not in assets:
   name=f'overlay-{len(assets):03}.png';overlay(*state).save(D/name);assets[state]=name
  if states and states[-1][0]==state:states[-1][1]+=1
  else:states.append([state,1])
 # Encode a dense fixed-rate alpha track so every graphic frame is independently checkable.
 # Keep the multi-input graph stable across generated/Blender clip color-metadata changes.
 proc=subprocess.Popen(['ffmpeg','-v','error','-y','-f','rawvideo','-pixel_format','rgba','-video_size','1080x1920','-framerate','24','-i','pipe:0','-an','-c:v','qtrle',str(D/'graphics.mov')],stdin=subprocess.PIPE,stderr=subprocess.PIPE)
 try:
  for state,count in states:
   pixels=Image.open(D/assets[state]).convert('RGBA').tobytes()
   for _ in range(count):proc.stdin.write(pixels)
  proc.stdin.close();err=proc.stderr.read();assert proc.wait()==0,err.decode()
 finally:
  if proc.poll() is None:proc.kill();proc.wait()
 stream=next(s for s in probe(D/'graphics.mov')['streams']if s['codec_type']=='video');assert int(stream['nb_frames'])==TL['frames']
 (D/'design.json').write_text(json.dumps({'font':'Pretendard SemiBold','captionSize':62,'titleSize':88,'captionOutline':False,'captionPanel':'rounded charcoal','title':'left aligned white / mint','assets':len(assets),'frames':TL['frames']},indent=2))
 print('Built',len(assets),'typography states');raise SystemExit()
if A.mode in ['assemble','preview']:
 for b in TL['beats']:
  q=next(z for z in probe(C/'clips'/(b['id']+'.mp4'))['streams']if z['codec_type']=='video');assert(q['width'],q['height'],q['pix_fmt'])==(W,H,'yuv420p')
 n=TL['frames'] if A.mode=='assemble' else 240;out=F if A.mode=='assemble' else D/'preview-v2.mp4'
 # Explicitly select original narration, never the silent generated opening.
 filters=f"[2:v]scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,setsar=1,fps=24,setpts=PTS-STARTPTS[intro];[0:v][intro]overlay=enable='lt(t,6)':eof_action=pass[base];[3:v]fps=24,setpts=PTS-STARTPTS[graphics];[base][graphics]overlay=eof_action=pass,fade=t=out:st={TL['duration']-.5}:d=0.5[v];[1:a]aresample=48000,pan=stereo|c0=c0|c1=c0[a]"
 args=['ffmpeg','-v','error','-y','-reinit_filter','0','-f','concat','-safe','0','-i',C/'edit/list.txt','-i',C/'audio.wav','-i',C/'opening.mp4','-i',D/'graphics.mov','-filter_complex',filters,'-map','[v]','-map','[a]','-r','24','-fps_mode','cfr','-frames:v',n,'-t',n/FPS,'-c:v','libx264','-crf','18','-preset','medium','-pix_fmt','yuv420p','-c:a','aac','-profile:a','aac_low','-b:a','192k','-ar','48000','-ac','2','-disposition:a:0','default','-metadata:s:a:0','language=kor','-metadata:s:a:0','handler_name=Korean narration','-movflags','+faststart',out]
 run(args);print(out);raise SystemExit()
q=probe(F);v=next(s for s in q['streams']if s['codec_type']=='video');a=next(s for s in q['streams']if s['codec_type']=='audio')
assert int(v['nb_frames'])==TL['frames'];assert (v['width'],v['height'])==(W,H)
assert a['codec_name']=='aac' and a['profile']=='LC' and a['channels']==2 and a['sample_rate']=='48000' and a['disposition']['default']==1
assert abs(float(v['duration'])-float(a['duration']))<.1
run(['ffmpeg','-v','error','-i',F,'-f','null','-'])
import numpy as np
pcm=np.frombuffer(run(['ffmpeg','-v','error','-i',F,'-map','0:a:0','-ar','48000','-ac','2','-f','f32le','-']),dtype='<f4').reshape(-1,2)
assert np.max(np.abs(pcm))<1 and np.sqrt(np.mean(pcm**2))>.03
rms=[]
for b in TL['beats']:
 segment=pcm[round(b['start']*48000):round((b['start']+b['speechDuration'])*48000)]
 val=float(np.sqrt(np.mean(segment**2)));assert val>.025,(b['id'],val);rms.append({'scene':b['id'],'rms':val})
original=np.frombuffer(run(['ffmpeg','-v','error','-i',C/'audio.wav','-ar','48000','-ac','1','-f','f32le','-']),dtype='<f4');n=min(len(original),len(pcm));corr=float(np.corrcoef(original[:n],pcm[:n,0])[0,1]);assert corr>.98
result={'file':str(F),'sha256':hashlib.sha256(F.read_bytes()).hexdigest(),'duration':float(v['duration']),'frames':int(v['nb_frames']),'bytes':F.stat().st_size,'audio':{'codec':'AAC-LC','sampleRate':48000,'channels':2,'language':'kor','default':True,'sourceCorrelation':corr,'perSceneRms':rms,'peakDb':float(20*np.log10(np.max(abs(pcm))))},'decode':'pass','visualReview':'pending','note':'Original MP4 already contained non-silent AAC mono. Stereo is a compatibility export, not a confirmed root-cause fix for the user playback environment.'}
# Check every actual caption's midpoint pixels, catching overlay timing drift at clip boundaries.
caption_frames=[round((c['start']+c['end'])/2*FPS)for c in TL['captions']]
expr='+'.join('eq(n\\,'+str(f)+')'for f in caption_frames)
raw=run(['ffmpeg','-v','error','-i',F,'-vf',f'select={expr},crop=1080:250:0:1290','-fps_mode','passthrough','-pix_fmt','rgb24','-f','rawvideo','-'])
imgs=np.frombuffer(raw,dtype=np.uint8).reshape(len(caption_frames),250,1080,3);checks=[]
for i,(frame,img)in enumerate(zip(caption_frames,imgs)):
 expected=np.asarray(overlay(i,False,False))[1290:1540,:,:];mask=(expected[:,:,:3].min(axis=2)>245)&(expected[:,:,3]==255)
 ratio=float((img[mask].min(axis=1)>185).mean());assert ratio>.90,(i,frame,ratio)
 checks.append({'caption':i,'frame':frame,'whiteGlyphMatch':ratio})
result['captionTiming']=checks
result['sourceNarrationCoverage']='unchanged complete reviewed timeline'
(D/'verification-v2.json').write_text(json.dumps(result,ensure_ascii=False,indent=2));print(json.dumps(result,ensure_ascii=False))
for name,t in [('title',1),('caption',15),('alternative',38),('ending',54)]:run(['ffmpeg','-v','error','-y','-ss',t,'-i',F,'-frames:v','1',D/(name+'.jpg')])
