"""Assemble a silent 10s quality test, compare with original, verify both."""
from pathlib import Path
import subprocess,json,hashlib,numpy as np
from PIL import Image,ImageDraw,ImageFont
C=Path('/Users/admin/Library/Mobile Documents/com~apple~CloudDocs/gpt 작업/commerce-automation-kit/20261008-al-bahr-quality')
OLD=C.parent/'20261008-al-bahr';OUT=Path('/Users/admin/Downloads/vedio');FONT=OLD/'fonts/Pretendard-SemiBold.otf'
def run(args):
 p=subprocess.run([str(x)for x in args],capture_output=True)
 if p.returncode:raise RuntimeError(p.stderr.decode(errors='replace')[-2000:])
 return p.stdout
raw=C/'improved-raw.mp4';assert raw.exists()
old=OLD/'clips/shade.mp4'
# Keep the original film intact; comparison deliberately isolates visual quality.
new=OUT/'al-bahr-quality-improved-10s.mp4';comparison=OUT/'al-bahr-quality-before-after-10s.mp4'
assert not new.exists()and not comparison.exists(),'Never overwrite delivered versions'
run(['ffmpeg','-v','error','-i',raw,'-an','-c:v','copy','-movflags','+faststart',new])
font=ImageFont.truetype(str(FONT),30);small=ImageFont.truetype(str(FONT),21)
label=Image.new('RGBA',(1080,1080),(0,0,0,0));d=ImageDraw.Draw(label)
d.rectangle((0,0,1080,71),fill=(18,28,34,255));d.rectangle((0,1032,1080,1080),fill=(18,28,34,255));d.line((539,72,539,1032),fill=(255,255,255,130),width=2)
for text,x in [('기존 · 단면 장면',270),('개선 · 외벽 근접 장면',810)]:d.text((x,22),text,font=font,anchor='mt',fill='white')
d.text((540,1044),'10초 무음 품질 비교 · 구조와 동작은 설명용 재구성',font=small,anchor='mt',fill=(194,211,218))
label.save(C/'qa/comparison-label.png')
run(['ffmpeg','-v','error','-i',old,'-i',new,'-i',C/'qa/comparison-label.png','-filter_complex','[0:v]trim=duration=10,setpts=PTS-STARTPTS,scale=540:960,setsar=1[a];[1:v]scale=540:960,setsar=1[b];[a][b]hstack=inputs=2,pad=1080:1080:0:72:color=0x121c22[base];[base][2:v]overlay=0:0[out]','-map','[out]','-an','-t','10','-r','24','-c:v','libx264','-crf','18','-pix_fmt','yuv420p','-movflags','+faststart',comparison])
results=[]
for f in [new,comparison]:
 q=json.loads(run(['ffprobe','-v','error','-show_streams','-show_format','-of','json',f]));v=next(x for x in q['streams']if x['codec_type']=='video');assert abs(float(v['duration'])-10)<.05 and int(v['nb_frames'])==240
 assert not any(x['codec_type']=='audio'for x in q['streams'])
 run(['ffmpeg','-v','error','-i',f,'-f','null','-'])
 results.append({'file':str(f),'duration':float(v['duration']),'frames':int(v['nb_frames']),'width':v['width'],'height':v['height'],'bytes':f.stat().st_size,'sha256':hashlib.sha256(f.read_bytes()).hexdigest(),'decode':'pass','audio':'intentionally silent visual comparison'})
# Detect unintended still output with actual sampled frames, not just metadata.
changes=[];frames=[]
for t in [.1,2,4,6,9.5]:
 arr=np.frombuffer(run(['ffmpeg','-v','error','-ss',t,'-i',new,'-frames:v','1','-vf','scale=108:192','-f','rawvideo','-pix_fmt','rgb24','-']),dtype=np.uint8).reshape(192,108,3)
 if frames:changes.append(float(np.abs(arr.astype(float)-frames[-1].astype(float)).mean()))
 frames.append(arr)
assert all(x>1 for x in changes),changes
qa={'outputs':results,'motionSampleMeanAbsoluteDifferences':changes,'geometry':json.loads((C/'geometry-check.json').read_text()),'visualReview':'pending','extraHiggsfieldCredits':0,'extraTTSRequests':0,'originalPreserved':hashlib.sha256(Path('/Users/admin/Downloads/vedio/al-bahr-webtoon-short.mp4').read_bytes()).hexdigest()=='8c2e4c1f383856719e696d07c27057fe44364db54df2bc013221f51a5a4d6455'}
assert qa['originalPreserved'];(C/'quality-sample-qa.json').write_text(json.dumps(qa,ensure_ascii=False,indent=2)+'\n')
for t in [1,4,8]:run(['ffmpeg','-v','error','-ss',t,'-i',comparison,'-frames:v','1',C/'qa'/f'comparison-{t}.jpg'])
print(json.dumps(qa,ensure_ascii=False))
