"""Animate the reviewed continuous Falkirk scene, with no paid or external inputs.
Boat entry is a stationary-wheel phase. Surface ripples are illustrative, not CFD.
"""
import argparse, hashlib, json, math, runpy, sys, time
from pathlib import Path
import bpy
from mathutils import Vector
p=argparse.ArgumentParser()
p.add_argument('--out',type=Path,required=True)
p.add_argument('--percent',type=int,default=100)
p.add_argument('--samples',type=int,default=64)
p.add_argument('--preview',action='store_true')
a=p.parse_args(sys.argv[sys.argv.index('--')+1:])
source=Path(__file__).with_name('immersive-scene.py')
sys.argv=['blender','--','--out',str(a.out/'scene'),'--percent',str(a.percent),'--samples',str(a.samples),'--build-only']
g=runpy.run_path(str(source));S=g['S'];B=g['B'];water=g['water'];cam=g['cam'];SHOTS=g['SHOTS']
S.render.use_persistent_data=True
S.frame_start=1;S.frame_end=408
water_xy=[(v.co.x,v.co.y)for v in water.data.vertices]
wakes=[o for o in S.objects if o.name.startswith('bow disturbance crest')]
# Subtle downstream surface features; keep the same mean water level and open gate.
# Do not rotate the wheel while the boat crosses the open entrance.
def smooth(u):
 u=max(0,min(1,u));return u*u*(3-2*u)
def update(scene, depsgraph=None):
 t=(scene.frame_current-1)/24
 B.location.y=-14+16*smooth(t/15.5)
 bow=B.location.y+6.65
 for v,(x,y) in zip(water.data.vertices,water_xy):
  r=math.hypot(x/1.3,y-bow)
  v.co.z=2+.012*math.sin(x*.72+y*.49+t*1.2)+.005*math.sin(y*1.05-x*.71+t*1.5)+.02*math.sin(r*2.2-t*2)*math.exp(-r*.35)*math.exp(-abs(x)*.07)
 water.data.update()
 for j,o in enumerate(wakes):
  o.location.y=B.location.y-g['BOAT_Y']
  o.location.z=.004*math.sin(t*3+j)
 if t<3.5:
  shot='site';c=SHOTS[shot];u=t/3.5
  pos=Vector((-24,-51,20))+Vector((1.2*u,1.5*u,-.3*u));target=Vector((0,2,15.3))
 elif t<10.5:
  shot='entry';c=SHOTS[shot];u=(t-3.5)/7
  pos=Vector(c['camera'])+Vector((-u,0,.2*u));target=Vector((0,B.location.y+2,3.4))
 else:
  shot='water';c=SHOTS[shot];u=(t-10.5)/6.5;dy=B.location.y-g['BOAT_Y']
  pos=Vector(c['camera'])+Vector((.25*u,dy,.05*u));target=Vector(c['target'])+Vector((0,dy,0))
 cam.location=pos;cam.rotation_euler=(target-pos).to_track_quat('-Z','Y').to_euler()
 cam.data.type='PERSP';cam.data.lens=32 if shot=='site' else c['lens'];cam.data.clip_end=1500
 cam.data.dof.use_dof=True;cam.data.dof.focus_distance=(target-pos).length;cam.data.dof.aperture_fstop=c['fstop']
 return {'frame':scene.frame_current,'time':t,'shot':shot,'boatY':round(B.location.y,5),'waterLevel':2,'camera':list(pos),'target':list(target),'gate':'open/lowered','wheelAngle':0}
checks=[]
for frame in [1,84,85,168,252,253,336,408]:
 S.frame_set(frame);checks.append(update(S))
assert all(b['boatY']>=a0['boatY'] for a0,b in zip(checks,checks[1:]))
assert checks[0]['boatY']+6.65 < -4.7 and checks[-1]['boatY']-6 > -4.7
assert all(c['waterLevel']==2 and c['wheelAngle']==0 for c in checks)
bpy.app.handlers.frame_change_pre.append(update)
started=time.time();a.out.mkdir(parents=True,exist_ok=True)
if a.preview:
 for frame in [1,168,336]:
  S.frame_set(frame);update(S);S.render.filepath=str(a.out/f'preview-{frame:04}.png');bpy.ops.render.render(write_still=True)
else:
 S.render.image_settings.file_format='FFMPEG';S.render.ffmpeg.format='MPEG4';S.render.ffmpeg.codec='H264'
 S.render.ffmpeg.constant_rate_factor='HIGH';S.render.ffmpeg.ffmpeg_preset='GOOD';S.render.ffmpeg.audio_codec='NONE'
 S.render.filepath=str(a.out/'motion-raw.mp4');S.frame_set(1);update(S)
 bpy.ops.render.render(animation=True)
manifest={'sourceHash':hashlib.sha256(source.read_bytes()).hexdigest(),'motionHash':hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),'frames':408,'fps':24,'duration':17,'size':[round(1080*a.percent/100),round(1920*a.percent/100)],'engine':S.render.engine,'samples':a.samples,'preview':a.preview,'checks':checks,'seconds':round(time.time()-started,2),'paidCalls':0,'limitations':['illustrative geometry, not a surveyed model','surface waves and bow wakes, not a fluid-volume simulation','body motion excerpt; no wheel rotation or Higgsfield introduction in this test']}
(a.out/'motion-manifest.json').write_text(json.dumps(manifest,indent=2)+'\n')
print('MOTION_RENDER_DONE',json.dumps(manifest),flush=True)
