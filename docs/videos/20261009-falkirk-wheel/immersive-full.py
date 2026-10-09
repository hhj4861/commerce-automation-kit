"""Complete the accepted Falkirk look: approach, level gondola rotation, upper exit.
Authored illustrative model; mechanically constrained motion, no paid calls.
"""
import argparse,hashlib,json,math,random,runpy,sys,time
from pathlib import Path
import bpy
from mathutils import Vector,Matrix
from bpy_extras.object_utils import world_to_camera_view
p=argparse.ArgumentParser();p.add_argument('--out',type=Path,required=True);p.add_argument('--percent',type=int,default=100);p.add_argument('--samples',type=int,default=64);p.add_argument('--preview',action='store_true');p.add_argument('--only',choices=['all','problem','balance','ending'],default='all');a=p.parse_args(sys.argv[sys.argv.index('--')+1:])
source=Path(__file__).with_name('immersive-scene.py');sys.argv=['blender','--','--out',str(a.out/'scene'),'--percent',str(a.percent),'--samples',str(a.samples),'--build-only'];g=runpy.run_path(str(source));S=g['S'];B=g['B'];cam=g['cam'];water=g['water'];box=g['box'];root=g['root'];CENTER=15.5;R=13.5
# Extend only the unseen outer landscape; the accepted foreground is unchanged.
# A new side view must not reveal the finite edge of the original lookdev terrain.
xs=list(range(-765,-165,15))+list(range(-165,166,3))+list(range(180,766,15))
ys=list(range(-710,-110,15))+list(range(-110,221,3))+list(range(235,1211,15))
vs=[(x,y,g['height'](x,y))for y in ys for x in xs];faces=[];nx=len(xs)
for j in range(len(ys)-1):
 for i in range(nx-1):
  x=(xs[i]+xs[i+1])/2;y=(ys[j]+ys[j+1])/2
  if -165<x<165 and -110<y<220:continue
  faces.append((j*nx+i,j*nx+i+1,(j+1)*nx+i+1,(j+1)*nx+i))
outer=g['mesh']('continuous outer landscape',vs,faces,'grass')
for f in outer.data.polygons:f.use_smooth=True
rng=random.Random(4110)
for j in range(60):
 x=rng.uniform(-300,-105);y=rng.uniform(25,300);z=g['height'](x,y);h=rng.uniform(5,9)
 g['rod']('distant woodland trunk',(x,y,z),(x,y,z+h*.75),.13,'trunk',verts=8)
 for k in range(3):
  o=bpy.data.objects.new('distant leaf canopy',g['protos'][(j+k)%5]);S.collection.objects.link(o);o.location=(x+rng.uniform(-1,1),y+rng.uniform(-1,1),z+h*.7+rng.uniform(-.5,1));o.scale=(h*.32,h*.29,h*.34)
S.render.use_persistent_data=True;bpy.context.view_layer.update()
rotor=root('animated rotor pivot');rotor.location=(0,0,CENTER)
for o in list(S.objects):
 if o.name.startswith('wheel arm '):o.parent=rotor;o.matrix_parent_inverse=Matrix.Translation((0,0,-CENTER))
low=root('level lower-origin gondola');high=root('level upper-origin gondola')
# The scene's gondola meshes/curves use world-space coordinates. Identity roots
# preserve those coordinates; independent translations keep decks horizontal.
for o in list(S.objects):
 if o.name.startswith(('gondola bottom','gondola side','gondola railing','gondola rail','gondola rotating bearing','upper trough water','closed far gate')):
  z=sum((o.matrix_world@Vector(v)).z for v in o.bound_box)/8;o.parent=low if z<15.5 else high
B.parent=low
lowwater=box('contained lower gondola water',(0,6.5,2.012),(6.5,20.6,.03),'water',low,b=0)
lf=box('lower gondola entrance gate',(0,-3.8,1.65),(6.5,.15,1.25),'steel edge',low)
lb=box('lower gondola exit gate',(0,16.9,1.65),(6.5,.15,1.25),'steel edge',low)
hb=box('upper-origin gondola rear gate',(0,16.9,28.65),(6.5,.15,1.25),'steel edge',high)
fixed=box('aqueduct isolation gate',(0,17.25,28.65),(6.4,.15,1.25),'steel edge')
wakes=[o for o in S.objects if o.name.startswith('bow disturbance crest')]
xy=[(v.co.x,v.co.y)for v in water.data.vertices]
D={'problem':231,'balance':199,'ending':252};ACTIVE='problem'
def smooth(u):u=max(0,min(1,u));return u*u*(3-2*u)
def state(shot,t):
 if shot=='problem':return dict(angle=0,boatY=-17+3*smooth(t/(D[shot]/24)),close=0,exitOpen=0)
 if shot=='balance':return dict(angle=math.pi*smooth((t-.9)/6.7),boatY=2+.3*smooth(t/.35),close=smooth((t-.35)/.4),exitOpen=0)
 return dict(angle=math.pi,boatY=2.3+24*smooth((t-2.4)/6.2),close=1,exitOpen=smooth((t-.7)/1.0))
def update(scene,depsgraph=None):
 t=(scene.frame_current-1)/24;q=state(ACTIVE,t);theta=q['angle'];x=-R*math.sin(theta);z=CENTER-R*math.cos(theta)
 rotor.rotation_euler.y=theta;low.location=(x,0,z-2);high.location=(-x,0,CENTER+R*math.cos(theta)-29)
 low.rotation_euler=(0,0,0);high.rotation_euler=(0,0,0);B.location=(0,q['boatY'],2.05);B.rotation_euler=(0,0,0)
 lowwater.hide_render=ACTIVE=='problem';lf.location.z=1.65-1.5*(1-q['close']);lb.location.z=1.65-1.5*(1-q['close']+q['exitOpen']);fixed.location.z=28.65-1.5*q['exitOpen']
 for o in wakes:o.hide_render=True
 for v,(wx,wy)in zip(water.data.vertices,xy):v.co.z=2+.012*math.sin(wx*.72+wy*.49+t*1.2)+.005*math.sin(wy*1.05-wx*.71+t*1.5)
 water.data.update()
 if ACTIVE=='problem':
  u=t/(D[ACTIVE]/24);pos=Vector((-28+4*u,-58+7*u,25-5*u));target=Vector((0,2,15.3));lens=32
 elif ACTIVE=='balance':
  u=t/(D[ACTIVE]/24);pos=Vector((-33+5*u,-58+2*u,22+2*u));target=Vector((0,4,16));lens=29.5
 else:
  by=q['boatY'];pos=Vector((28,by-10,41));target=Vector((0,by+.3,29.3));lens=30
 cam.location=pos;cam.rotation_euler=(target-pos).to_track_quat('-Z','Y').to_euler();cam.data.lens=lens;cam.data.clip_end=1500;cam.data.dof.use_dof=True;cam.data.dof.focus_distance=(target-pos).length;cam.data.dof.aperture_fstop=11
 return dict(shot=ACTIVE,frame=scene.frame_current,time=t,**q,lowCenter=[x,6.5,z],highCenter=[-x,6.5,2*CENTER-z],boatWorld=[x,q['boatY'],z+.05],camera=list(pos),decksHorizontal=True)
# Evaluate every output frame, including gate transitions, before rendering.
checks=[]
for ACTIVE,n in D.items():
 for frame in range(1,n+1):
  t=(frame-1)/24;q=state(ACTIVE,t)
  assert 0<=q['angle']<=math.pi and 0<=q['close']<=1 and 0<=q['exitOpen']<=1
  if 0<q['angle']<math.pi:assert q['close']==1 and q['exitOpen']==0 and -3.8<q['boatY']-6 and q['boatY']+6.65<16.9
  if q['boatY']>2.3 and ACTIVE=='ending':assert q['angle']==math.pi and q['exitOpen']==1
 for frame in [1,n//2,n]:
  S.frame_set(frame);q=update(S);bpy.context.view_layer.update();q['actualBoatWorld']=list(B.matrix_world.translation);q['actualBoatUp']=list(B.matrix_world.to_3x3()@Vector((0,0,1)))
  assert (Vector(q['actualBoatWorld'])-Vector(q['boatWorld'])).length<1e-4
  assert (Vector(q['actualBoatUp'])-Vector((0,0,1))).length<1e-5
  assert abs(math.hypot(q['lowCenter'][0],q['lowCenter'][2]-CENTER)-R)<1e-6
  if ACTIVE=='ending':
   projected=[world_to_camera_view(S,cam,o.matrix_world@Vector(v))for o in B.children if o.type in ['MESH','CURVE'] for v in o.bound_box]
   bounds=[min(v.x for v in projected),max(v.x for v in projected),min(v.y for v in projected),max(v.y for v in projected)]
   assert bounds[0]>.025 and bounds[1]<.975 and bounds[2]>.025 and bounds[3]<.975,('boat outside frame',bounds)
   q['boatScreenBounds']=bounds
  checks.append(q)
bpy.app.handlers.frame_change_pre.append(update);a.out.mkdir(parents=True,exist_ok=True);started=time.time();outputs=[]
for ACTIVE,n in D.items():
 if a.only not in ['all',ACTIVE]:continue
 S.frame_start=1;S.frame_end=n;clip_started=time.time();print('FULL_SHOT_START',ACTIVE,n,flush=True)
 if a.preview:
  for frame in [1,n//2,n]:
   S.frame_set(frame);update(S);S.render.image_settings.file_format='PNG';S.render.filepath=str(a.out/f'{ACTIVE}-{frame:04}.png');bpy.ops.render.render(write_still=True)
 else:
  S.render.image_settings.file_format='FFMPEG';S.render.ffmpeg.format='MPEG4';S.render.ffmpeg.codec='H264';S.render.ffmpeg.constant_rate_factor='HIGH';S.render.ffmpeg.ffmpeg_preset='GOOD';S.render.ffmpeg.audio_codec='NONE';S.render.filepath=str(a.out/f'{ACTIVE}.mp4');S.frame_set(1);update(S);bpy.ops.render.render(animation=True)
  outputs.append(dict(shot=ACTIVE,frames=n,seconds=round(time.time()-clip_started,2),file=str(a.out/f'{ACTIVE}.mp4'),sha256=hashlib.sha256((a.out/f'{ACTIVE}.mp4').read_bytes()).hexdigest()))
manifest=dict(sourceHash=hashlib.sha256(source.read_bytes()).hexdigest(),motionHash=hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),preview=a.preview,engine=S.render.engine,samples=a.samples,size=[round(1080*a.percent/100),round(1920*a.percent/100)],fps=24,shots=outputs,checks=checks,seconds=round(time.time()-started,2),paidCalls=0,limitations=['Illustrative proportions and compressed operation timing, not an engineering simulation','Waves are procedural, not CFD'])
(a.out/f'full-manifest-{a.only}.json').write_text(json.dumps(manifest,indent=2)+'\n');print('FULL_RENDER_DONE',json.dumps(manifest),flush=True)
