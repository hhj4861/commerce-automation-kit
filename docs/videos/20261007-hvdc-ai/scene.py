"""HVDC film: original tangible 3D environments and causal motion, not engineering CAD."""
import bpy,math,json,sys,argparse,subprocess,time
from pathlib import Path
from mathutils import Vector
from bpy.app.handlers import persistent
p=argparse.ArgumentParser();p.add_argument('--cache',type=Path,required=True);p.add_argument('--preview',action='store_true');p.add_argument('--only',default='all');p.add_argument('--test-seconds',type=float,default=0);p.add_argument('--samples',type=int,default=24);a=p.parse_args(sys.argv[sys.argv.index('--')+1:]);C=a.cache
for f in ['clips','qa','logs']:(C/f).mkdir(exist_ok=True)
S=json.loads((Path(__file__).parent/'story.json').read_text());TL=json.loads((C/'timeline.json').read_text()) if(C/'timeline.json').exists()else {'beats':S['scenes']};FPS=24
bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
s=bpy.context.scene;s.render.engine='BLENDER_EEVEE_NEXT';s.render.resolution_x=1920;s.render.resolution_y=1080;s.render.resolution_percentage=100;s.render.fps=FPS;s.render.image_settings.color_mode='RGB';s.view_settings.view_transform='AgX';s.view_settings.look='AgX - Medium High Contrast';s.world.use_nodes=True;s.world.node_tree.nodes['Background'].inputs[0].default_value=(.045,.075,.12,1);s.world.node_tree.nodes['Background'].inputs[1].default_value=.5
if hasattr(s,'eevee'):s.eevee.taa_render_samples=a.samples
M={}
def mat(n,c,metal=0,rough=.5,emit=0,noise=False):
 m=bpy.data.materials.new(n);m.use_nodes=True;b=m.node_tree.nodes.get('Principled BSDF');b.inputs['Base Color'].default_value=(*c,1);b.inputs['Metallic'].default_value=metal;b.inputs['Roughness'].default_value=rough
 if emit:b.inputs['Emission Color'].default_value=(*c,1);b.inputs['Emission Strength'].default_value=emit
 if noise:
  nt=m.node_tree.nodes.new('ShaderNodeTexNoise');nt.inputs['Scale'].default_value=35;bu=m.node_tree.nodes.new('ShaderNodeBump');bu.inputs['Strength'].default_value=.15;bu.inputs['Distance'].default_value=.03;m.node_tree.links.new(nt.outputs['Fac'],bu.inputs['Height']);m.node_tree.links.new(bu.outputs['Normal'],b.inputs['Normal'])
 M[n]=m
for args in [('ink',(.018,.028,.044),.1,.6),('steel',(.25,.36,.44),.75,.27),('copper',(.73,.32,.105),.8,.25),('cream',(.77,.72,.57),.1,.55),('land',(.12,.21,.23),.0,.8),('sea',(.025,.12,.21),.35,.32),('concrete',(.26,.34,.40),.0,.75),('amber',(1,.46,.075),.3,.35,2),('cyan',(.05,.65,.85),.3,.35,1.6),('red',(.8,.08,.025),.1,.5,1.3)]:mat(*args)
roots={};dyn={}
def root(n):
 o=bpy.data.objects.new(n,None);s.collection.objects.link(o);roots[n]=o;return o
def finish(o,n,m,r):o.name=n;o.data.materials.append(M[m]);o.parent=r;return o
def box(n,loc,dim,m,r,b=.04):
 bpy.ops.mesh.primitive_cube_add(size=1,location=loc);o=bpy.context.object;o.dimensions=dim;bpy.ops.object.transform_apply(location=False,rotation=False,scale=True);finish(o,n,m,r)
 if b:q=o.modifiers.new('Edge highlight','BEVEL');q.width=b;q.segments=2;o.modifiers.new('Normals','WEIGHTED_NORMAL')
 return o
def cyl(n,loc,rad,depth,m,r,axis='z',vertices=32):
 bpy.ops.mesh.primitive_cylinder_add(vertices=vertices,radius=rad,depth=depth,location=loc);o=finish(bpy.context.object,n,m,r)
 if axis=='x':o.rotation_euler.y=math.pi/2
 if axis=='y':o.rotation_euler.x=math.pi/2
 q=o.modifiers.new('Machined edge','BEVEL');q.width=.025;q.segments=2
 for f in o.data.polygons:f.use_smooth=True
 return o
def line(n,pts,rad,m,r):
 c=bpy.data.curves.new(n,'CURVE');c.dimensions='3D';c.bevel_depth=rad;c.bevel_resolution=2;sp=c.splines.new('POLY');sp.points.add(len(pts)-1)
 for pp,co in zip(sp.points,pts):pp.co=(*co,1)
 o=bpy.data.objects.new(n,c);s.collection.objects.link(o);return finish(o,n,m,r)
def sphere(n,loc,rad,m,r):
 bpy.ops.mesh.primitive_uv_sphere_add(segments=12,ring_count=6,radius=rad,location=loc);return finish(bpy.context.object,n,m,r)
def insulator(x,y,z,h,r):
 cyl('Porcelain support',(x,y,z+h/2),.10,h,'cream',r)
 for j in range(5):cyl('Insulator shed',(x,y,z+.1+j*h/5),.20,.07,'cream',r)
def substation(x,y,z,scale,r):
 q=root('station-'+str(x)+'-'+str(y));q.parent=r;q.location=(x,y,z);q.scale=(scale,)*3
 box('Foundation',(0,0,.08),(5,3.6,.16),'concrete',q)
 box('Valve hall back',(0,1.5,1.2),(4.6,.16,2.2),'steel',q)
 for xx in [-2.2,2.2]:box('Hall frame',(xx,0,1.2),(.14,3.1,2.3),'steel',q)
 for xx in [-1.4,0,1.4]:
  box('Valve rack',(xx,.5,1),(.7,.7,1.8),'ink',q)
  for zz in [.35,.7,1.05,1.4,1.75]:box('Semiconductor module',(xx,.1,zz),(.6,.12,.22),'copper',q)
 for xx in [-1.4,1.4]:
  box('Transformer tank',(xx,-1.2,.65),(.9,.7,1.05),'steel',q)
  for j in range(6):box('Cooling fins',(xx-.4+j*.16,-1.62,.65),(.035,.18,.86),'cream',q,.01)
  insulator(xx,-1.2,1.15,.65,q)
 return q
# Coast-to-data-center miniature environment; all land shapes original, not a real route.
r=root('route');box('Seafloor',(0,0,-.45),(28,19,.6),'concrete',r);box('Sea',(0,0,-.1),(28,18,.12),'sea',r)
for x,dim in [(-9,(9,13,.75)),(9,(10,14,.75))]:box('Coastal land',(x,.7,.10),dim,'land',r,.8)
rotors=[]
for x,y in [(-10,1),(-8,3),(-11,-2.8)]:
 cyl('Turbine tower',(x,y,1.55),.16,3,'cream',r);hub=root('rotor'+str(x));hub.parent=r;hub.location=(x,y-.15,3.05);rotors.append(hub);sphere('Turbine hub',(0,0,0),.22,'steel',hub)
 for k in range(3):
  z=k*math.tau/3;ob=box('Turbine blade',(math.sin(z)*.72,-.07,math.cos(z)*.72),(.17,.12,1.55),'cream',hub);ob.rotation_euler.y=z
substation(-6,0,.5,.62,r);substation(5.3,0,.5,.62,r)
path=[(-6,-1,.40),(-3,-1,-.0),(0,-1,-.0),(3,-1,-.0),(5.3,-1,.40),(8,-1,.6)];line('HVDC route',path,.13,'ink',r);line('Energy route',[(x,y,z+.11)for x,y,z in path],.035,'amber',r)
box('Data center',(9,-.2,1.22),(3.5,3,1.55),'steel',r)
for xx in [7.6,8.3,9,9.7,10.4]:
 box('Exterior vent',(xx,-1.72,1.25),(.43,.03,.7),'ink',r)
 for yy in [-.8,.1,.9]:cyl('Roof HVAC fan',(xx,yy,2.10),.23,.2,'ink',r)
for j in range(5):box('City building',(6.8+j*.85,5,1.0+j%2*.35),(.55,.8,1.5+j%2*.7),'concrete',r)
routeDots=[sphere('Power trace',(0,0,0),.095,'amber',r)for i in range(14)]
# Rich server aisle, architecture, cabinets, copper busbars and physical server trays.
r=root('server');box('Server floor',(0,2,-.1),(18,21,.2),'concrete',r);box('Rear wall',(0,10,3),(18,.15,6),'steel',r)
fans=[];leds=[]
for side in [-1,1]:
 for j in range(5):
  x=side*3.2;y=j*2.2
  box('Rack cabinet',(x,y,2.05),(1.25,1.7,4.1),'ink',r)
  for k in range(8):
   zz=.34+k*.48;box('Server tray',(x,y-.88,zz),(1.1,.07,.36),'steel',r,.015);leds.append(box('Status LED',(x+.4,y-.925,zz),(.06,.012,.035),'amber',r,.0))
   for n in range(4):box('Vent slot',(x-.36+n*.15,y-.925,zz),(.055,.015,.21),'ink',r,.0)
  line('Copper power bus',[(x+.66,y-.5,.2),(x+.66,y-.5,4.65),(x+.66,9,4.65)],.075,'copper',r)
 for j in range(6):box('Aisle floor joint',(0,j*1.8-.5,.02),(5,.025,.02),'steel',r,.0)
for x in [-2,2]:line('Ceiling light',[(x,-3,5.6),(x,10,5.6)],.025,'amber',r)
# Converter hall, with tangible modular hardware.
r=root('converter');box('Station floor',(0,0,-.12),(21,17,.25),'concrete',r);box('Station rear wall',(0,5.7,3.2),(20,.2,6.4),'steel',r)
modules=[]
for xx in [-5,-2.6,0,2.6,5]:
 for yy in [0,3]:
  for j in range(6):
   z=.6+j*.65;box('Module body',(xx,yy,z),(1.6,1.3,.46),'ink',r);modules.append(box('Valve face',(xx,yy-.69,z),(1.45,.10,.32),'copper',r))
   for v in [-.58,.58]:box('Cooling pipe',(xx+v,yy-.8,z),(.06,.08,.42),'steel',r,.01)
  for v in [-.8,.8]:insulator(xx+v,yy,.05,.45,r);line('Support rail',[(xx+v,yy,.35),(xx+v,yy,4.2)],.035,'cream',r)
for x in [-7,7]:line('Overhead busbar',[(x,-4,.5),(x,-4,5),(x,4,5)],.10,'copper',r)
# Layered cable: stepped removal reveals conductor, insulation, metallic screen, armour.
r=root('cable');box('Seabed',(0,0,-1.72),(35,25,.4),'land',r)
cableparts=[]
for name,rad,dep,ma in [('Outer protection',1.45,7.2,'ink'),('Metallic screen',1.31,8.3,'steel'),('Insulation',1.19,9.8,'cream'),('Copper conductor',.46,12.8,'copper')]:cableparts.append(cyl(name,(0,0,0),rad,dep,ma,r,'x',64))
for j in range(19):
 th=j*math.tau/19;line('Copper strands',[(-6.4,.51*math.cos(th),.51*math.sin(th)),(6.4,.51*math.cos(th),.51*math.sin(th))],.066,'copper',r)
shieldrings=[]
for x in [-3,-1.5,0,1.5,3]:shieldrings.append(line('Exposed metallic screen section',[(x,1.28*math.cos(k*math.pi/32),1.28*math.sin(k*math.pi/32))for k in range(33)],.055,'steel',r))
fields=[]
for x in [-2.3,0,2.3]:
 for j in range(8):
  th=j*math.tau/8;fields.append(line('Radial electric field',[(x,.66*math.cos(th),.66*math.sin(th)),(x,1.22*math.cos(th),1.22*math.sin(th))],.022,'cyan',r))
cabledots=[sphere('Energy delivered',(0,0,0),.09,'amber',r)for _ in range(12)]
# Compare identical wires and heat. Both use high voltage where applicable.
r=root('loss');box('Laboratory',(0,0,-1.8),(25,20,.5),'concrete',r)
lossDots=[];heat=[]
for yy in [-2,2]:
 cyl('Equal copper conductor',(0,yy,0),.25,11,'copper',r,'x',48)
 for xx in [-5.7,5.7]:cyl('Terminal',(xx,yy,0),.50,.6,'steel',r,'x');insulator(xx,yy,-1.6,1.2,r)
 for j in range(10):lossDots.append((sphere('Current marker',(0,yy,-.45),.08,'amber',r),yy,j))
 for j in range(6):heat.append((sphere('Resistive heat',(j*1.5-4,yy,.6),.13,'red',r),yy,j))
# AC/DC voltage waveforms embedded above two physical conductors, not an empty slide.
r=root('wave');box('Wave lab',(0,0,-1.9),(25,18,.5),'concrete',r);wavecurves=[]
for yy in [-2.5,2.5]:
 cyl('Transmission conductor',(0,yy,0),.19,12,'copper',r,'x')
 wavecurves.append(line('Voltage curve',[(x/10-6,yy,1.1)for x in range(121)],.04,'cyan'if yy>0 else'amber',r))
waveDots=[(sphere('AC DC current',(0,yy,.0),.12,'cyan'if yy>0 else'amber',r),yy,j)for yy in[-2.5,2.5]for j in range(10)]
# Four-switch polarity example, extruded wiring and real switching levers.
r=root('valves');box('Circuit plinth',(0,0,-.3),(13,9,.6),'concrete',r)
line('Fixed positive rail',[(-5,3,.3),(5,3,.3)],.095,'amber',r);line('Fixed negative rail',[(-5,-3,.3),(5,-3,.3)],.095,'cyan',r)
switches=[]
for xx in [-3,3]:

 for ya,yb in [(3,2.05),(1.15,-1.15),(-2.05,-3)]:line('Conductor between switches',[(xx,ya,.3),(xx,yb,.3)],.07,'copper',r)
 for yy in[-1.6,1.6]:
  box('Switch base',(xx,yy,.32),(.8,1.05,.25),'ink',r);o=box('Switch lever',(xx,yy,.58),(.13,.85,.14),'copper',r);switches.append((o,xx,yy))
for xx in [-3,3]:
 for yy in [-1.6,1.6]:
  for dy in [-.425,.425]:line('Switch contact',[(xx,yy+dy,.3),(xx,yy+dy,.58)],.065,'steel',r)
line('Output path',[(-3,0,.3),(-1,0,.3)],.09,'copper',r);line('Output path',[(1,0,.3),(3,0,.3)],.09,'copper',r);box('Load',(0,0,.5),(1.9,.8,.65),'steel',r)
terminals=[sphere('Output polarity',(xx,0,.45),.25,'amber',r)for xx in[-2,2]]
# Geographic connection drawn at approximate real relative locations; no invented coast outline.
r=root('jeju');box('Korea Strait',(0,0,-.3),(22,16,.5),'sea',r)
box('Mainland fragment',(-2.8,5,.1),(14,6,.65),'land',r,1.4)
ob=cyl('Jeju island',(2.3,-2.7,.1),1,.6,'land',r,vertices=64);ob.scale=(4,1.75,1)
substation(-1,3,.55,.45,r);substation(4,-2.4,.55,.45,r);jejupts=[(-1,2.5,.6),(0,.2,.2),(2,-1.1,.2),(4,-2.4,.6)];line('Wando Dongjeju schematic connection',jejupts,.055,'amber',r)
for key in ['route','server','converter','cable','loss','wave','valves','jeju']:
 if key not in roots:raise RuntimeError(key)
for loc,col,power,size in [((-8,-8,15),(1,.66,.32),2800,10),((9,-2,12),(.28,.56,1),2300,8),((0,9,12),(1,.45,.17),3000,9)]:
 bpy.ops.object.light_add(type='AREA',location=loc);o=bpy.context.object;o.data.energy=power;o.data.color=col;o.data.shape='DISK';o.data.size=size;o.rotation_euler=(Vector((0,0,1))-o.location).to_track_quat('-Z','Y').to_euler()
bpy.ops.object.camera_add();cam=bpy.context.object;s.camera=cam;cam.data.lens=46;cam.data.clip_end=300
s.use_nodes=True
nt=s.node_tree;nt.nodes.clear();rl=nt.nodes.new('CompositorNodeRLayers');edge=nt.nodes.new('CompositorNodeFilter');edge.filter_type='SOBEL';nt.links.new(rl.outputs['Image'],edge.inputs['Image']);inv=nt.nodes.new('CompositorNodeInvert');bw=nt.nodes.new('CompositorNodeRGBToBW');nt.links.new(edge.outputs['Image'],bw.inputs[0]);nt.links.new(bw.outputs[0],inv.inputs['Color']);mix=nt.nodes.new('CompositorNodeMixRGB');mix.blend_type='MULTIPLY';mix.inputs[0].default_value=.14;nt.links.new(rl.outputs['Image'],mix.inputs[1]);nt.links.new(inv.outputs['Color'],mix.inputs[2]);out=nt.nodes.new('CompositorNodeComposite');nt.links.new(mix.outputs[0],out.inputs[0])
GROUPS=['route','server','converter','cable','loss','wave','valves','jeju']
def children(o):
 yield o
 for ch in o.children:yield from children(ch)
VISIBLE_GROUP=None
def show(group):
 global VISIBLE_GROUP
 if VISIBLE_GROUP==group:return
 VISIBLE_GROUP=group
 for k in GROUPS:
  for o in children(roots[k]):o.hide_render=k!=group

def camera(loc,at,lens=46):cam.location=loc;cam.rotation_euler=(Vector(at)-cam.location).to_track_quat('-Z','Y').to_euler();cam.data.lens=lens
B=None;D=0
@persistent
def animate(scene):
 if not B:return
 t=(scene.frame_current-1)/FPS;u=t/max(.1,D);sid=B['id'];family=B['visual'];family='cable' if family=='charging'else family
 if sid=='control' and u>.42:family='converter'
 if sid=='ending'and u>.55:family='server'
 show(family)
 # Cuts have new informational scales and targets, rather than a perpetual spin.
 phase=min(2,int(u*3));v=(u*3)%1
 if family=='route':
  if phase==0:camera((22-v*2,-26,21),(0,0,1),45)
  elif phase==1:camera((-13+v,-12,8),(-7,0,1.5),48)
  else:camera((15-v*2,-13,8),(6,0,1.2),49)
  for j,hub in enumerate(rotors):hub.rotation_euler.y=t*(.28 if sid=='not-magic' and u>.25 else 1.3)+j
  for j,o in enumerate(routeDots):
   q=((t*.15+j/14)%1);idx=min(4,int(q*5));f=q*5-idx;o.location=Vector(path[idx]).lerp(Vector(path[idx+1]),f)+Vector((0,0,.20));o.hide_render=(sid=='not-magic'and u>.25 and j%3!=0)
 elif family=='server':
  if phase==0:camera((0,-6+v*1.6,2.4),(0,7,2.1),28)
  elif phase==1:camera((.0+v*.2,-4.4,2.8),(2.6,.6,2.1),34)
  else:camera((0,-2+v,4.0),(0,5,2),30)
  for j,o in enumerate(leds):o.data.materials[0]=M['amber'if (int(t*2)+j)%7 else'cyan']
 elif family=='converter':
  if phase==0:camera((12-v,-15,10),(0,1,2),43)
  elif phase==1:camera((3.8-v*.3,-6,4.0),(0,0,2),52)
  else:camera((-8+v,-8,5),(-2,0,2),49)
  for j,o in enumerate(modules):o.data.materials[0]=M['amber'if (int(t*3)+j)%6<2 else'copper']
 elif family=='cable':
  if phase==0:camera((13-v,-13,8),(0,0,0),48)
  elif phase==1:camera((10-v,-7,4),(3.2,0,0),57)
  else:camera((8,-10+v,4),(1,0,0),49)
  reveal=sid in ['charging','dc-cable','not-waste']
  for i,o in enumerate(cableparts[:3]):o.hide_render=reveal
  fieldamp=(abs(math.sin(t*2)) if sid!='dc-cable'else min(1,t/2))
  for o in shieldrings:o.hide_render=not reveal
  for o in fields:o.hide_render=not reveal;o.scale=(1,fieldamp,fieldamp);o.data.materials[0]=M['cyan'if sid=='dc-cable' or math.sin(t*2)>0 else 'amber']
  for j,o in enumerate(cabledots):o.location=(-6+(t*1.4+j)%12,-.76,.06);o.hide_render=not reveal
 elif family=='loss':
  camera((10-v,-16,12)if phase!=1 else(7,-9,5),(0,0,0),46)
  for o,yy,j in lossDots:o.location.x=-5+(t*1.6+j)%10;o.hide_render=yy>0 and j%2==0
  for o,yy,j in heat:o.scale=(1 if yy<0 else .25,)*3;o.location.z=.5+.18*math.sin(t*2+j)
 elif family=='wave':
  camera((9-v,-15,13)if phase!=1 else(5,-14,8),(0,0,.5),46)
  for j,o in enumerate(wavecurves):
   for k,pp in enumerate(o.data.splines[0].points):pp.co=(k/10-6,(-2.5 if j==0 else 2.5),1.2+(.7 if j==0 else math.sin(k/15-t*2)*.7),1)
  for o,yy,j in waveDots:o.location.x=-5+(j+(t if yy<0 else math.sin(t*2)*.3))%10
 elif family=='valves':
  camera((7-v,-10,12)if phase!=1 else(4,-8,10),(0,0,.1),46)
  polarity=1 if t<14.25 else -1
  if sid=='control':polarity=1 if math.sin(t*1.2)>0 else-1
  for o,x,y in switches:
   on=((x*y<0)if polarity>0 else(x*y>0)) and not(sid=='valves' and 13.2<t<14.25); o.rotation_euler.z=0 if on else .65;o.data.materials[0]=M['amber'if on else'copper']
  for j,o in enumerate(terminals):o.data.materials[0]=M['amber'if (j==0)==(polarity>0)else'cyan']
 elif family=='jeju':camera((10-v*2,-14,20)if phase!=1 else(8,-10,12),(0,1,0),45)
bpy.app.handlers.frame_change_pre.clear();bpy.app.handlers.frame_change_pre.append(animate)
for beat in TL['beats']:
 if a.only!='all'and beat['id']not in a.only.split(','):continue
 B=beat;D=beat['duration'];N=round(D*FPS)
 if a.test_seconds:N=min(N,round(a.test_seconds*FPS));D=N/FPS
 s.frame_start=1;s.frame_end=N
 if a.preview:
  s.render.resolution_percentage=65;s.render.image_settings.file_format='PNG';s.frame_set(max(1,N//2));s.render.filepath=str(C/'qa'/(B['id']+'.png'));bpy.ops.render.render(write_still=True)
 else:
  s.render.resolution_percentage=100;s.render.image_settings.file_format='FFMPEG';s.render.ffmpeg.format='MPEG4';s.render.ffmpeg.codec='H264';s.render.ffmpeg.constant_rate_factor='HIGH';s.render.ffmpeg.ffmpeg_preset='GOOD';s.render.filepath=str(C/'clips'/(B['id']+('-test'if a.test_seconds else'')+'.mp4'))
  f=Path(s.render.filepath)
  if f.exists():
   q=subprocess.run(['ffprobe','-v','error','-show_entries','stream=nb_frames,width,height','-of','json',str(f)],capture_output=True,text=True)
   if q.returncode==0 and any(int(v.get('nb_frames',0))==N and v.get('width')==1920 and v.get('height')==1080 for v in json.loads(q.stdout)['streams']):print('CACHED',B['id'],flush=True);continue
   f.rename(f.with_suffix('.incomplete-'+str(int(time.time()))+'.mp4'))
  bpy.ops.render.render(animation=True)
 print('SCENE_COMPLETE',B['id'],N,flush=True)
print('RENDER_COMPLETE',flush=True)
