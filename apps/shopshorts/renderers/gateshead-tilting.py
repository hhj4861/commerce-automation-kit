"""Original illustrative Gateshead tilting assembly; not surveyed engineering geometry."""
import argparse,json,math,sys,subprocess,time,hashlib,random
from pathlib import Path
import bpy
from mathutils import Vector
P=argparse.ArgumentParser();P.add_argument('--out',type=Path,required=True);P.add_argument('--timeline',type=Path);P.add_argument('--preview',action='store_true');P.add_argument('--shot',default='all');P.add_argument('--percent',type=int,default=100)
a=P.parse_args(sys.argv[sys.argv.index('--')+1:]);a.out.mkdir(parents=True,exist_ok=True)
bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False);S=bpy.context.scene
S.render.engine='CYCLES';S.cycles.samples=48;S.cycles.use_denoising=True;S.cycles.max_bounces=4;S.render.use_persistent_data=True
pref=bpy.context.preferences.addons['cycles'].preferences
try:pref.compute_device_type='METAL';pref.get_devices()
except TypeError:pref.get_devices()
for dev in pref.devices:dev.use=dev.type=='METAL'
S.cycles.device='GPU' if any(d.use and d.type!='CPU' for d in pref.devices) else 'CPU'
S.render.resolution_x=1080;S.render.resolution_y=1920;S.render.resolution_percentage=a.percent;S.render.fps=24
S.view_settings.view_transform='AgX';S.view_settings.look='AgX - Medium High Contrast';S.view_settings.exposure=-.15
S.world.use_nodes=True;S.world.node_tree.nodes['Background'].inputs[0].default_value=(.43,.58,.73,1);S.world.node_tree.nodes['Background'].inputs[1].default_value=.45
M={};random.seed(41)
def mat(n,c,rough=.4,metal=0,noise=0):
 m=bpy.data.materials.new(n);m.use_nodes=True;q=m.node_tree.nodes['Principled BSDF'];q.inputs['Base Color'].default_value=(*c,1);q.inputs['Roughness'].default_value=rough;q.inputs['Metallic'].default_value=metal
 if noise:
  t=m.node_tree.nodes.new('ShaderNodeTexNoise');t.inputs['Scale'].default_value=noise;b=m.node_tree.nodes.new('ShaderNodeBump');b.inputs['Strength'].default_value=.2;b.inputs['Distance'].default_value=.035;m.node_tree.links.new(t.outputs['Fac'],b.inputs['Height']);m.node_tree.links.new(b.outputs[0],q.inputs['Normal'])
 M[n]=m;return m
for v in [('arch',(.73,.81,.8),.25,.55,0),('deck',(.65,.32,.075),.35,.35,15),('steel',(.17,.21,.23),.3,.7,0),('concrete',(.47,.42,.32),.8,0,6),('paving',(.31,.33,.3),.8,0,10),('brick',(.27,.13,.07),.75,0,20),('glass',(.08,.2,.23),.16,.6,0),('tree',(.07,.16,.09),.85,0,0),('trunk',(.16,.09,.035),.9,0,0),('boat',(.86,.33,.07),.25,.3,0),('white',(.85,.88,.78),.4,.1,0),('dark',(.025,.04,.045),.6,0,0),('mint',(.04,.85,.62),.25,.2,0),('skin',(.65,.4,.25),.6,0,0)]:mat(*v)
water=mat('water',(.025,.16,.19),.2,.45,0);q=water.node_tree.nodes['Principled BSDF'];q.inputs['Transmission Weight'].default_value=.15
noise=water.node_tree.nodes.new('ShaderNodeTexNoise');noise.inputs['Scale'].default_value=2.2;noise.inputs['Detail'].default_value=3;mapping=water.node_tree.nodes.new('ShaderNodeVectorMath');mapping.operation='MULTIPLY';mapping.inputs[1].default_value=(1,4,1);tex=water.node_tree.nodes.new('ShaderNodeTexCoord');water.node_tree.links.new(tex.outputs['Generated'],mapping.inputs[0]);water.node_tree.links.new(mapping.outputs[0],noise.inputs[0]);b=water.node_tree.nodes.new('ShaderNodeBump');b.inputs['Strength'].default_value=.25;b.inputs['Distance'].default_value=.045;water.node_tree.links.new(noise.outputs['Fac'],b.inputs['Height']);water.node_tree.links.new(b.outputs[0],q.inputs['Normal'])
def finish(o,n,m,parent=None):
 o.name=n;o.data.materials.append(M[m]);o.parent=parent;return o
def mesh(n,vs,fs,m,parent=None):
 d=bpy.data.meshes.new(n);d.from_pydata(vs,[],fs);d.update();o=bpy.data.objects.new(n,d);S.collection.objects.link(o);return finish(o,n,m,parent)
def box(n,loc,size,m,parent=None,bevel=.03):
 x,y,z=[v/2 for v in size];o=mesh(n,[(-x,-y,-z),(x,-y,-z),(x,y,-z),(-x,y,-z),(-x,-y,z),(x,-y,z),(x,y,z),(-x,y,z)],[(0,3,2,1),(4,5,6,7),(0,1,5,4),(1,2,6,5),(2,3,7,6),(3,0,4,7)],m,parent);o.location=loc
 if bevel:mod=o.modifiers.new('soft machined edges','BEVEL');mod.width=bevel;mod.segments=2;o.modifiers.new('normals','WEIGHTED_NORMAL')
 return o
def tube(n,pts,r,m,parent=None):
 d=bpy.data.curves.new(n,'CURVE');d.dimensions='3D';d.bevel_depth=r;d.bevel_resolution=3;sp=d.splines.new('POLY');sp.points.add(len(pts)-1)
 for p,v in zip(sp.points,pts):p.co=(*v,1)
 o=bpy.data.objects.new(n,d);S.collection.objects.link(o);return finish(o,n,m,parent)
def empty(n,loc=(0,0,0)):
 o=bpy.data.objects.new(n,None);S.collection.objects.link(o);o.location=loc;return o
def sphere(n,loc,r,m,parent=None):
 bpy.ops.mesh.primitive_uv_sphere_add(segments=16,ring_count=8,radius=r,location=(0,0,0));o=finish(bpy.context.object,n,m,parent);o.location=loc
 for p in o.data.polygons:p.use_smooth=True
 return o
# The bridge spans X, river traffic travels Y. All moving bridge parts share this rigid root.
bridge=empty('COMMON ROTATION AXIS',(0,0,1.2));boat=empty('one vessel');people=[]
curve=lambda x:max(0,1-(x/10)**2)
def deckpoint(x):return (x,-4*curve(x),0)
def archpoint(x):return (x,1.4*curve(x),7*curve(x))
xs=[-10+i/5 for i in range(101)]
tube('support arch',[archpoint(x) for x in xs],.17,'arch',bridge)
# Ribbon deck follows its own horizontal arc; it is never a stretching bar.
vs=[]
for x in xs:
 y=deckpoint(x)[1];vs.extend([(x,y-.45,-.13),(x,y+.45,-.13),(x,y-.45,0),(x,y+.45,0)])
fs=[]
for j in range(len(xs)-1):
 k=j*4;fs.extend([(k+2,k+6,k+7,k+3),(k,k+4,k+6,k+2),(k+1,k+3,k+7,k+5),(k,k+1,k+5,k+4)])
mesh('continuous walking deck',vs,fs,'deck',bridge)
for side in [-1,1]:
 tube('handrail',[(x,deckpoint(x)[1]+side*.4,.38) for x in xs],.023,'arch',bridge)
 for x in range(-9,10):tube('rail post',[(x,deckpoint(x)[1]+side*.4,0),(x,deckpoint(x)[1]+side*.4,.38)],.014,'steel',bridge)
for x in range(-9,10):tube('hanger cable',[deckpoint(x),archpoint(x)],.018,'steel',bridge)
# Massive end bearings are fixed in the river banks, never move with the bridge.
for side in [-1,1]:
 box('riverbank',(side*18,0,.1),(16,65,1.2),'concrete')
 box('quayside',(side*18,0,.75),(16,65,.12),'paving')
 box('bridge bearing',(side*10.1,0,.95),(.55,1,.45),'steel')
 for y in range(-30,31,3):tube('quayside joint',[(side*10,y,.819),(side*24,y,.819)],.008,'dark')
 for y in range(-27,28,5):
  x=side*12.2;tube('quay rail',[(x,y,.8),(x,y,1.4)],.025,'steel');box('light lantern',(x,y,1.5),(.13,.13,.22),'white')
 for j in range(11):
  y=-26+j*5+random.uniform(-.5,.5);x=side*random.uniform(17,21);h=random.uniform(2,5)
  w=random.uniform(2,4);box('context building',(x,y,.8+h/2),(w,3.4,h),'brick');box('roof cornice',(x,y,.8+h),(w+.18,3.58,.16),'concrete');box('roof detail',(x+.3,y+.5,.95+h),(.7,.8,.2),'steel')
  for z in [1.4+i*.7 for i in range(int(h/.7))]:
   for dy in [-1,0,1]:box('window',(x-side*(w/2+.025),y+dy,z),(.025,.45,.4),'glass',bevel=0)
 for j in range(14):
  x=side*random.uniform(13.3,15.4);y=random.uniform(-29,29);tube('tree trunk',[(x,y,.8),(x,y,1.8)],.06,'trunk');o=sphere('tree foliage',(x,y,2.1),.65,'tree');o.scale=(1,.85,1.3)
box('river',(0,0,-.12),(20,1000,.2),'water',bevel=0)
# Vessel points toward +Y. The roof must clear the raised deck, including bow and stern.
mesh('vessel hull',[(-.48,-1.4,.02),(.48,-1.4,.02),(.48,.75,.02),(0,1.45,.02),(-.48,.75,.02),(-.58,-1.4,.4),(.58,-1.4,.4),(.58,.75,.4),(0,1.5,.4),(-.58,.75,.4)],[(0,4,3,2,1),(5,6,7,8,9),(0,1,6,5),(1,2,7,6),(2,3,8,7),(3,4,9,8),(4,0,5,9)],'boat',boat)
box('cabin',(0,-.3,.9),(.85,1.3,1),'white',boat)
box('front window',(0,.36,1.03),(.68,.03,.42),'glass',boat)
for side in [-1,1]:box('cabin side window',(side*.43,-.3,1.04),(.025,.9,.4),'glass',boat)
tube('short mast',[(0,-.75,1.4),(0,-.75,2.4)],.025,'steel',boat)
for i in range(3):
 for side in [-1,1]:tube('subtle wake',[(side*(.6+.8*t),-1.3-2.5*t,.012) for t in [j/20 for j in range(21)]],.008,'white',boat)
for side in [-1,1]:
 tube('boat guardrail',[(side*.48,-1.1,.65),(side*.48,.65,.65),(side*.12,1.25,.65)],.018,'steel',boat)
 for yy in [-1,.5]:tube('boat rail support',[(side*.48,yy,.4),(side*.48,yy,.65)],.012,'steel',boat)
box('cabin roof',(0,-.3,1.43),(1.03,1.47,.09),'dark',boat)
# Small walking figures provide scale. Hidden during any bridge movement.
for i in range(8):
 p=empty('pedestrian '+str(i));p.parent=bridge;x=-7+i*1.8;p.location=Vector(deckpoint(x));people.append((p,x))
 sphere('head',(0,0,.55),.085,'skin',p);box('coat',(0,0,.34),(.16,.13,.3),'mint' if i%2 else 'dark',p,.025)
 for side in [-1,1]:tube('leg',[(side*.045,0,.22),(side*.055,0,.03)],.025,'dark',p)
axis=tube('rotation axis',[(-10.4,0,1.2),(10.4,0,1.2)],.025,'mint');pins=[sphere('fixed pivot',(x,0,1.2),.23,'mint') for x in [-10,10]]
offsetline=tube('deck offset from fixed axis',[(0,0,1.23),(0,-4,1.23)],.024,'mint')
clearance=tube('clearance marker',[(1.15,-3,0),(1.15,-3,3.5)],.024,'mint')
mastlevel=tube('same waterline mast height',[(.9,-3,2.4),(1.4,-3,2.4)],.025,'white')
bpy.ops.object.light_add(type='SUN',location=(-10,-15,24));sun=bpy.context.object;sun.data.energy=3;sun.data.angle=.12;sun.rotation_euler=(.5,-.4,-.6)
bpy.ops.object.light_add(type='AREA',location=(-5,-9,16));fill=bpy.context.object;fill.data.energy=1800;fill.data.shape='DISK';fill.data.size=12
bpy.ops.object.camera_add();cam=bpy.context.object;S.camera=cam;cam.data.lens=28;cam.data.clip_end=250
smooth=lambda u:u*u*(3-2*u)
def pose(shot,u):
 q=smooth(u);tilt=0;by=-8;show=False
 if shot=='hook':tilt=40*smooth(min(1,u*1.4));by=-7+2*u
 elif shot=='conflict':by=-7+1.4*u;show=True
 elif shot=='structure':show=True
 elif shot=='tilt':tilt=40*q;by=-6
 elif shot=='passage':tilt=40;by=-6+13*q
 elif shot=='limit':tilt=40;by=7+4*u
 elif shot=='return':tilt=40*(1-smooth(min(1,u/.6)));by=11+5*u;show=u>.65
 bridge.rotation_euler[0]=math.radians(-tilt);boat.location=(0,by,0)
 axis.hide_render=shot not in ['tilt','structure']
 for pin in pins:pin.hide_render=shot not in ['tilt','structure']
 clearance.hide_render=shot!='limit';offsetline.hide_render=shot!='structure';mastlevel.hide_render=shot!='limit'
 for p,x in people:
  for o in [p,*p.children]:o.hide_render=not show
  p.location=Vector(deckpoint(max(-9,min(9,x+u*1.4))))
 if shot=='structure':p=Vector((18-3*u,-28+4*u,17-2*u));target=Vector((0,-.6,2.7));cam.data.lens=28
 elif shot=='passage':p=Vector((16-2*u,-24+3*u,11+u));target=Vector((0,-.5,2));cam.data.lens=25
 elif shot=='limit':p=Vector((12,-22,9));target=Vector((0,-1.5,2));cam.data.lens=25
 else:p=Vector((19-2*u,-30+2*u,15+u));target=Vector((0,-.5,2.4));cam.data.lens=28
 cam.location=p;cam.rotation_euler=(target-p).to_track_quat('-Z','Y').to_euler();S.frame_set(round(u*240))
# Verify evaluated transforms of the actual rigid assembly before spending on frames.
fixed=[Vector((-10,0,1.2)),Vector((10,0,1.2))]
for deg in [0,10,20,30,40]:
 bridge.rotation_euler[0]=math.radians(-deg);bpy.context.view_layer.update()
 for local,expected in zip([Vector(deckpoint(-10)),Vector(deckpoint(10))],fixed):
  assert (bridge.matrix_world @ local-expected).length<1e-7,'moving pivot'
 assert all(o.parent==bridge for o in S.objects if o.name.startswith(('hanger cable','support arch','continuous walking deck'))),'detached structure'
 if deg==40:
  for x in [-.6,0,.6]:
   local=Vector(deckpoint(x));local.z=-.13
   assert (bridge.matrix_world @ local).z>2.4+.6,'vessel mast clearance'
bridge.rotation_euler[0]=0;bpy.context.view_layer.update()
manifest={'sourceHash':hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),'engine':'CYCLES','samples':48,'device':S.cycles.device,'percent':a.percent,'rigidAssembly':True,'fixedEndpoints':True,'illustrativeGeometry':True,'shots':[]}
shots=['hook','conflict','structure','tilt','passage','limit','return']
if a.preview:
 for sh in shots if a.shot=='all' else [a.shot]:
  pose(sh,.5);S.render.image_settings.file_format='PNG';S.render.filepath=str(a.out/(sh+'.png'));bpy.ops.render.render(write_still=True)
 (a.out/'preview-manifest.json').write_text(json.dumps(manifest,indent=2));raise SystemExit()
tl=json.loads(a.timeline.read_text());mp=a.out/'render-manifest.json'
if mp.exists():
 old=json.loads(mp.read_text())
 if all(old.get(k)==manifest[k] for k in ['sourceHash','percent','samples']):manifest=old
started=time.time()
for beat in tl['beats']:
 sh=beat['id']
 if a.shot!='all' and a.shot!=sh:continue
 n=round(beat['duration']*24);out=a.out/(sh+'.mp4')
 if any(v['id']==sh and v['frames']==n for v in manifest['shots']) and out.exists():continue
 temp=a.out/(sh+'-current.png');S.render.image_settings.file_format='PNG';S.render.filepath=str(temp)
 with (a.out/(sh+'-encode.log')).open('wb') as log:
  proc=subprocess.Popen(['ffmpeg','-v','error','-y','-f','image2pipe','-framerate','24','-vcodec','png','-i','pipe:0','-an','-c:v','libx264','-crf','17','-preset','fast','-pix_fmt','yuv420p','-movflags','+faststart',str(out)],stdin=subprocess.PIPE,stderr=log)
  try:
   for f in range(n):
    pose(sh,f/max(1,n-1));bpy.ops.render.render(write_still=True);proc.stdin.write(temp.read_bytes())
    if f%24==0:print('PROGRESS',sh,f,n,round(time.time()-started,1),flush=True)
   proc.stdin.close();assert proc.wait()==0
  finally:
   if proc.poll() is None:proc.kill();proc.wait()
 temp.unlink();manifest['shots']=[v for v in manifest['shots'] if v['id']!=sh]+[{'id':sh,'frames':n,'sha256':hashlib.sha256(out.read_bytes()).hexdigest()}];mp.write_text(json.dumps(manifest,indent=2));print('SHOT_COMPLETE',sh,flush=True)
print('RENDER_COMPLETE',round(time.time()-started,1),flush=True)
