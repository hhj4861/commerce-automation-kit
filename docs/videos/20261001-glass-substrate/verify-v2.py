"""Verify the actual exported movie, aligned captions and provenance; keep media outside Git."""
import argparse,json,subprocess,re,hashlib
from pathlib import Path
p=argparse.ArgumentParser();p.add_argument('--cache',type=Path,required=True);p.add_argument('--source-cache',type=Path,required=True);p.add_argument('--video',type=Path,required=True);a=p.parse_args();c=a.cache;here=Path(__file__).parent
manifest=json.loads((c/'project.json').read_text());brief=json.loads((here/'brief.json').read_text());alignment=json.loads((a.source_cache/'alignment.json').read_text())
def cmd(args):return subprocess.run(args,check=True,capture_output=True,text=True)
meta=json.loads(cmd(['ffprobe','-v','error','-show_streams','-show_format','-of','json',str(a.video)]).stdout);vs=next(s for s in meta['streams']if s['codec_type']=='video');au=next(s for s in meta['streams']if s['codec_type']=='audio');duration=float(meta['format']['duration'])
assert (vs['width'],vs['height'])==(1920,1080);assert vs['avg_frame_rate']=='24/1';assert abs(duration-manifest['duration'])<.15;assert au['codec_name']=='aac'
assert manifest['loopedSceneVideo'] is False
for scene in manifest['scenes']:
 source=json.loads(cmd(['ffprobe','-v','error','-show_streams','-show_format','-of','json',scene['visual']]).stdout)
 v=next(x for x in source['streams'] if x['codec_type']=='video')
 assert (v['width'],v['height'],v['avg_frame_rate'])==(1920,1080,'12/1')
 assert abs(float(source['format']['duration'])-scene['duration'])<.12
# Actual complete decode, not existence-only validation.
cmd(['ffmpeg','-v','error','-i',str(a.video),'-f','null','-'])
def time(t):h,m,s=t.split(':');return int(h)*3600+int(m)*60+float(s)
caption_count=0
for i,sc in enumerate(brief['scenes']):
 assert alignment[i]['id']==sc['id'];assert ''.join(w['text']for w in alignment[i]['words']).strip()==sc['narration'].strip()
 prev=0
 for line in (c/'edit'/f'{i:02}.ass').read_text().splitlines():
  if not line.startswith('Dialogue:'):continue
  parts=line.split(',',9)
  if parts[3]!='Caption':continue
  start,end=time(parts[1]),time(parts[2]);assert start>=prev-.011 and end>start;assert end<=manifest['scenes'][i]['duration']+.011;prev=end
  assert all(len(x)<=42 for x in parts[9].split(r'\N'));assert len(parts[9].split(r'\N'))<=2;caption_count+=1
sound=cmd(['ffmpeg','-hide_banner','-i',str(a.video),'-vn','-af','silencedetect=noise=-40dB:d=1.3,volumedetect','-f','null','-']).stderr
(c/'audio-check.log').write_text(sound);silences=[float(x)for x in re.findall(r'silence_duration: ([\d.]+)',sound)]
report={'video':str(a.video),'bytes':a.video.stat().st_size,'sha256':hashlib.file_digest(a.video.open('rb'),'sha256').hexdigest(),'durationSeconds':duration,'resolution':[vs['width'],vs['height']],'renderSourceResolution':[1920,1080],'renderSourceFps':12,'deliveryInterpolation':'framerate blend to 24fps','loopedSceneVideo':False,'newPaidRequests':0,'fps':vs['avg_frame_rate'],'audioCodec':au['codec_name'],'voiceId':brief['voice'],'speed':brief['speed'],'sceneCount':len(brief['scenes']),'captionCount':caption_count,'fullDecode':'passed','captionTextAndTiming':'passed','silencesOver1_3Seconds':silences,'meanVolumeDb':re.findall(r'mean_volume: ([^\n]+)',sound),'maxVolumeDb':re.findall(r'max_volume: ([^\n]+)',sound),'higgsfield':{'factoryGenerationId':'8a63ba30-24d3-4a05-9e58-fbfa531d6b3d','previousGenerationCreditsQuoted':54,'newGenerationRequests':0,'newCreditsSpent':0,'reusedAt':[{'start':0,'end':6},{'start':manifest['scenes'][9]['start'],'end':manifest['scenes'][9]['start']+6}]},'notChecked':'No claim of engineering-scale simulation or actual factory footage.'}
# Compare the actual opening picture to the reused Higgsfield source, excluding text overlays.
reuse=cmd(['ffmpeg','-hide_banner','-i',str(a.video),'-i',str(a.source_cache/'broll-factory.mp4'),'-filter_complex','[0:v]trim=duration=6,setpts=PTS-STARTPTS,crop=1000:450:460:280[a];[1:v]trim=duration=6,setpts=PTS-STARTPTS,fps=24,crop=1000:450:460:280[b];[a][b]ssim=shortest=1','-an','-f','null','-']).stderr
score=float(re.findall(r'All:([0-9.]+)',reuse)[-1]);assert score>.95,score
report['higgsfield']['openingPictureSSIM']=score
report['sourceReuse']={'higgsfieldSha256':hashlib.file_digest((a.source_cache/'broll-factory.mp4').open('rb'),'sha256').hexdigest(),'narrationSha256':{f.name:hashlib.file_digest(f.open('rb'),'sha256').hexdigest() for f in sorted((a.source_cache/'remote-narration').glob('beat-*.mp3'))}}
assert len(report['sourceReuse']['narrationSha256'])==15
(c/'verification.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n');print(json.dumps(report,ensure_ascii=False,indent=2))
