"""Render the reviewed Claude composition; reuse existing narration without a paid call."""
import argparse, hashlib, json, os, shutil, subprocess
from pathlib import Path

parser=argparse.ArgumentParser()
parser.add_argument('--artifacts',type=Path,required=True)
parser.add_argument('--production',type=Path,default=Path('/Users/admin/workSpace/shopshorts-production'))
parser.add_argument('--source',type=Path,required=True)
parser.add_argument('--deliver',type=Path,default=Path('/Users/admin/Downloads/vedio/claude-motion-test'))
args=parser.parse_args()
root=args.artifacts.resolve(); project=root/'render'; project.mkdir(parents=True,exist_ok=True)
assets=project/'assets';assets.mkdir(exist_ok=True)
(root/'previews').mkdir(exist_ok=True)
shutil.copy2(Path(__file__).with_name('composition.html'),project/'index.html')
shutil.copy2(args.production/'node_modules/gsap/dist/gsap.min.js',assets/'gsap.min.js')
font=args.production/'apps/shopshorts/public/NanumGothic-Regular.ttf'
shutil.copy2(font,assets/'font.ttf')
(root/'tmp').mkdir(exist_ok=True)
# Short IPC pathname; actual temporary files remain on the requested iCloud volume.
alias=Path('/private/tmp/cak-mg-1006')
if alias.is_symlink():
 if alias.resolve()!=(root/'tmp').resolve():raise SystemExit('Temporary alias owned by another task')
elif alias.exists():raise SystemExit('Temporary alias already exists')
else:alias.symlink_to(root/'tmp',target_is_directory=True)
env={**os.environ,'TMPDIR':str(alias),'TMP':str(alias),'TEMP':str(alias),'HYPERFRAMES_NO_TELEMETRY':'1','HYPERFRAMES_SKIP_SKILLS':'1','HYPERFRAMES_EXTRACT_CACHE_DIR':str(root/'frame-cache')}
node='/Users/admin/.nvm/versions/node/v22.23.3/bin/node'
cli=args.production/'node_modules/hyperframes/bin/hyperframes.mjs'
def run(cmd,log=None):
 print('RUN',Path(str(cmd[0])).name,flush=True)
 if log:
  with (root/log).open('w') as f:subprocess.run([str(x) for x in cmd],env=env,stdout=f,stderr=subprocess.STDOUT,check=True)
 else:subprocess.run([str(x) for x in cmd],env=env,check=True)
raw=root/'motion-raw.mp4'
run([node,cli,'render',project,'-o',raw,'--fps','24','--workers','2','--strict','--quiet'],'hyperframes.log')
args.deliver.mkdir(parents=True,exist_ok=True)
a=args.deliver/'A-original.mp4';b=args.deliver/'B-claude-motion.mp4';ab=args.deliver/'AB-comparison.mp4'
shutil.copy2(args.source,a)
run(['ffmpeg','-y','-v','error','-i',raw,'-i',args.source,'-map','0:v:0','-map','1:a:0','-c:v','copy','-c:a','copy','-t','23.208333','-movflags','+faststart',b],'mux.log')
# No audio doubling: the single original narration accompanies both panels.
filter_graph="[0:v]scale=960:540,pad=960:620:0:80:color=0x182c3c,drawtext=fontfile='"+str(font)+"':text='A  기존 영상':fontsize=32:fontcolor=white:x=40:y=24[a];[1:v]scale=960:540,pad=960:620:0:80:color=0x182c3c,drawtext=fontfile='"+str(font)+"':text='B  Claude + 맞춤 모션':fontsize=32:fontcolor=white:x=40:y=24[b];[a][b]hstack=inputs=2[v]"
run(['ffmpeg','-y','-v','error','-i',a,'-i',b,'-filter_complex',filter_graph,'-map','[v]','-map','0:a:0','-c:v','libx264','-crf','18','-preset','fast','-pix_fmt','yuv420p','-c:a','copy','-t','23.208333','-movflags','+faststart',ab],'comparison.log')
report={}
for label,p in [('A',a),('B',b),('AB',ab)]:
 info=json.loads(subprocess.check_output(['ffprobe','-v','error','-show_entries','format=duration:stream=codec_name,width,height,r_frame_rate','-of','json',str(p)]))
 run(['ffmpeg','-v','error','-i',p,'-f','null','-'],f'decode-{label}.log')
 report[label]={'path':str(p),'probe':info,'sha256':hashlib.sha256(p.read_bytes()).hexdigest()}
 hashes=[]
 for kind in ['audio']:
  h=subprocess.check_output(['ffmpeg','-v','error','-i',str(p),'-map','0:a:0','-c','copy','-f','hash','-hash','sha256','-'],text=True).strip()
  report[label]['audioPacketHash']=h
assert len({v['audioPacketHash'] for v in report.values()})==1,'Narration differs'
(root/'verification.json').write_text(json.dumps(report,ensure_ascii=False,indent=2))
run(['ffmpeg','-y','-v','error','-i',b,'-vf','fps=1/4,scale=640:360,tile=3x2','-frames:v','1',root/'previews/contactsheet.jpg'],'contactsheet.log')
print(json.dumps(report,ensure_ascii=False,indent=2),flush=True)
if alias.is_symlink() and alias.resolve()==(root/'tmp').resolve():alias.unlink()
