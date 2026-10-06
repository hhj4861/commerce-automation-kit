"""Reuse an approved full film and its identical-narration motion replacement. No paid calls."""
import argparse, json, subprocess
from pathlib import Path
parser=argparse.ArgumentParser()
parser.add_argument('--source',type=Path,required=True)
parser.add_argument('--motion',type=Path,required=True)
parser.add_argument('--artifacts',type=Path,required=True)
parser.add_argument('--out',type=Path,required=True)
a=parser.parse_args();a.artifacts.mkdir(parents=True,exist_ok=True);a.out.parent.mkdir(parents=True,exist_ok=True)
def probe(p):
 return json.loads(subprocess.check_output(['ffprobe','-v','error','-show_entries','format=duration:stream=codec_name,width,height,r_frame_rate','-of','json',str(p)]))
start=92.1666666667;length=23.2083333333;end=start+length
for p in [a.source,a.motion]:
 assert p.is_file(),p
 assert p.resolve()!=a.out.resolve(),'Never overwrite a source'
assert abs(float(probe(a.motion)['format']['duration'])-length)<.1
f=f'[0:v]trim=end={start},setpts=PTS-STARTPTS[a];[1:v]setpts=PTS-STARTPTS,fps=24,setsar=1[b];[0:v]trim=start={end},setpts=PTS-STARTPTS[c];[a][b][c]concat=n=3:v=1:a=0[v]'
with (a.artifacts/'compose.log').open('w') as log:
 subprocess.run(['ffmpeg','-y','-v','warning','-i',str(a.source),'-i',str(a.motion),'-filter_complex',f,'-map','[v]','-map','0:a:0','-c:v','libx264','-preset','veryfast','-crf','18','-pix_fmt','yuv420p','-r','24','-c:a','copy','-movflags','+faststart',str(a.out)],stdout=log,stderr=log,check=True)
with (a.artifacts/'decode.log').open('w') as log:
 subprocess.run(['ffmpeg','-v','error','-i',str(a.out),'-f','null','-'],stdout=log,stderr=log,check=True)
def audiohash(p):return subprocess.check_output(['ffmpeg','-v','error','-i',str(p),'-map','0:a:0','-c','copy','-f','hash','-hash','sha256','-'],text=True).strip()
report={'source':str(a.source),'motion':str(a.motion),'output':str(a.out),'probe':probe(a.out),'replacedSeconds':[start,end],'newPaidRequests':0,'sourceAudio':audiohash(a.source),'outputAudio':audiohash(a.out)}
assert report['sourceAudio']==report['outputAudio']
assert abs(float(report['probe']['format']['duration'])-float(probe(a.source)['format']['duration']))<.1
(a.artifacts/'pilot-verification.json').write_text(json.dumps(report,ensure_ascii=False,indent=2))
print(json.dumps(report,ensure_ascii=False))
