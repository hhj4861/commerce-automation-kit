"""Picture-led low-voltage board close-up with an animated explanatory power path."""
from pathlib import Path
import argparse,subprocess,math,json
from PIL import Image,ImageDraw,ImageFont,ImageFilter
p=argparse.ArgumentParser();p.add_argument('--cache',type=Path,required=True);a=p.parse_args();C=a.cache;W,H,FPS=1920,1080,24;D=10
im=Image.open(C/'art/board.png').convert('RGB').resize((W,H),Image.Resampling.LANCZOS);font=ImageFont.truetype(str(C/'fonts/Pretendard-SemiBold.otf'),34)
pts=[(.15,.28),(.23,.30),(.30,.44),(.48,.49),(.58,.54),(.66,.63),(.76,.66),(.82,.55),(.85,.44)];pts=[(x*W,y*H)for x,y in pts];lens=[math.dist(a,b)for a,b in zip(pts,pts[1:])];length=sum(lens)
cmd=['ffmpeg','-v','error','-y','-f','rawvideo','-pix_fmt','rgb24','-s',f'{W}x{H}','-r',str(FPS),'-i','-','-an','-c:v','libx264','-preset','fast','-crf','18','-threads','4','-pix_fmt','yuv420p','-movflags','+faststart',str(C/'board-motion.mp4')];enc=subprocess.Popen(cmd,stdin=subprocess.PIPE)
for i in range(round(D*FPS)):
 t=i/FPS;frame=im.copy().convert('RGBA');glow=Image.new('RGBA',(W,H));d=ImageDraw.Draw(glow)
 # Early connector -> regulator -> chip progression; restrained cycling afterward.
 for j in range(3):
  dist=((t/3-j*.13)%1)*length
  for aa,bb,ll in zip(pts,pts[1:],lens):
   if dist<ll:x=aa[0]+(bb[0]-aa[0])*dist/ll;y=aa[1]+(bb[1]-aa[1])*dist/ll;break
   dist-=ll
  d.ellipse((x-12,y-12,x+12,y+12),fill=(255,205,92,215))
 frame=Image.alpha_composite(frame,glow.filter(ImageFilter.GaussianBlur(9)));frame=Image.alpha_composite(frame,glow);d=ImageDraw.Draw(frame)
 labels=[('서버 전원 입력',(190,90),(310,270),0),('전압을 조절하는 전원부',(730,115),(845,330),.7),('AI칩 · 낮은 전압의 직류',(1480,120),(1615,420),2.1)]
 for text,xy,target,start in labels:
  if t<start:continue
  x,y=xy;ww=font.getlength(text)+32;d.rounded_rectangle((x-ww/2,y-28,x+ww/2,y+28),radius=12,fill=(13,27,40,225),outline=(214,172,101,220),width=2);d.text((x,y),text,font=font,fill='#fff6e8',anchor='mm');d.line((x,y+29,target[0],target[1]),fill=(223,185,112,190),width=2)
 if i==72:frame.convert('RGB').save(C/'qa/board-motion.png')
 enc.stdin.write(frame.convert('RGB').tobytes())
enc.stdin.close();assert enc.wait()==0;print('BOARD_MOTION_COMPLETE',D)
