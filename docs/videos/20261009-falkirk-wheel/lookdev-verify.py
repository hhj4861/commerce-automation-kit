"""Verify/repackage the three native Blender keyframes; does not grade beauty."""
import argparse, hashlib, json, shutil
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont, ImageStat
p=argparse.ArgumentParser();p.add_argument('--render-dir',type=Path,required=True);p.add_argument('--deliver-dir',type=Path,required=True);p.add_argument('--report',type=Path,required=True);a=p.parse_args()
m=json.loads((a.render_dir/'manifest.json').read_text());src=Path(__file__).with_name('immersive-scene.py')
assert m['sourceHash']==hashlib.sha256(src.read_bytes()).hexdigest(),'render/source mismatch'
assert {s['shot']for s in m['shots']}=={'site','entry','water'}
assert m['size']==[1080,1920] and m['engine']=='CYCLES'
a.deliver_dir.mkdir(parents=True,exist_ok=True)
font_path='/Users/admin/Library/Fonts/Pretendard-SemiBold.otf'
# The user's previously downloaded licensed font is optional for the board only.
choices=[Path(font_path),Path('/Users/admin/Library/Mobile Documents/com~apple~CloudDocs/gpt 작업/commerce-automation-kit/20261009-falkirk-wheel/fonts/Pretendard-SemiBold.otf')]
font=next((ImageFont.truetype(str(f),25)for f in choices if f.exists()),ImageFont.load_default(size=22))
small=next((ImageFont.truetype(str(f),17)for f in choices if f.exists()),ImageFont.load_default(size=16))
board=Image.new('RGB',(1668,1090),'#f0eee7');d=ImageDraw.Draw(board);d.text((24,17),'FALKIRK  /  SCENE LOOK DEVELOPMENT',font=font,fill='#172c34');d.text((24,53),'Blender keyframes · illustrative geometry · not a completed video',font=small,fill='#455861')
labels={'site':'01  시설과 운하 전경','entry':'02  수면 높이에서 배 진입','water':'03  선수와 물의 접촉'}
files=[]
for i,s in enumerate(m['shots']):
 f=a.render_dir/(s['shot']+'.png');assert hashlib.sha256(f.read_bytes()).hexdigest()==s['sha256']
 with Image.open(f)as im:
  assert im.size==(1080,1920);im.verify()
 im=Image.open(f).convert('RGB');assert max(ImageStat.Stat(im.resize((64,64))).stddev)>15,'blank render'
 target=a.deliver_dir/('falkirk-'+s['shot']+'-v3.png');shutil.copyfile(f,target)
 board.paste(im.resize((540,960),Image.Resampling.LANCZOS),(24+i*552,91));d.text((24+i*552,1059),labels[s['shot']],font=small,fill='#172c34');files.append({'shot':s['shot'],'file':str(target),'sha256':s['sha256'],'dimensions':[1080,1920]})
board_file=a.deliver_dir/'falkirk-lookdev-v3.jpg';board.save(board_file,quality=94)
report={'status':'technical checks passed; visual/user review separate','sourceHash':m['sourceHash'],'renderer':{'engine':m['engine'],'samples':m['samples']},'files':files,'board':str(board_file),'sceneContinuity':{'sameScene':True,'sameBoat':m['boatLocation'],'waterLevel':m['waterLevel']},'paidCalls':0,'limitations':m['limitations']}
a.report.write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n');print(json.dumps(report,ensure_ascii=False))
