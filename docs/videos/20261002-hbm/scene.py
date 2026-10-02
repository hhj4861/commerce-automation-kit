"""Original HBM industrial visual essay. Native 24fps, contextual sets, motivated macro cameras."""
import bpy, math, json, argparse, sys, random
from pathlib import Path
from mathutils import Vector
p=argparse.ArgumentParser();p.add_argument('--cache',type=Path,required=True);p.add_argument('--shot',default='all');p.add_argument('--preview',action='store_true');p.add_argument('--test',action='store_true');p.add_argument('--force',action='store_true');a=p.parse_args(sys.argv[sys.argv.index('--')+1:]);a.cache.mkdir(parents=True,exist_ok=True)
b=json.loads((Path(__file__).parent/'brief.json').read_text());ap=a.cache.parent/'alignment.json';al=json.loads(ap.read_text()) if ap.exists() else None
FPS=24

def smooth(t):t=max(0,min(1,t));return t*t*(3-2*t)
def make(i):
 random.seed(43);bpy.app.handlers.frame_change_pre.clear();bpy.ops.wm.read_factory_settings(use_empty=True)
 sc=b['scenes'][i];kind=sc['kind'];duration=math.ceil(((al[i]['duration'] if al else 23)+.12)*FPS)/FPS
 s=bpy.context.scene;s.render.engine='BLENDER_EEVEE_NEXT';s.eevee.taa_render_samples=24;s.render.resolution_x=1920;s.render.resolution_y=1080;s.render.resolution_percentage=100;s.render.fps=FPS;s.view_settings.view_transform='AgX';s.view_settings.look='AgX - Medium High Contrast'
 s.world=bpy.data.worlds.new('Studio ambient');s.world.use_nodes=True;s.world.node_tree.nodes['Background'].inputs[0].default_value=(.15,.18,.23,1);s.world.node_tree.nodes['Background'].inputs[1].default_value=.22
 mats={};actions=[];cache={}
 def mat(name,col,metal=0,rough=.3,emit=0,noise=0):
  m=bpy.data.materials.new(name);m.use_nodes=True;ns=m.node_tree.nodes;lk=m.node_tree.links;n=ns.get('Principled BSDF');n.inputs['Base Color'].default_value=(*col,1);n.inputs['Metallic'].default_value=metal;n.inputs['Roughness'].default_value=rough
  if emit:n.inputs['Emission Color'].default_value=(*col,1);n.inputs['Emission Strength'].default_value=emit
  if noise:
   tx=ns.new('ShaderNodeTexNoise');tx.inputs['Scale'].default_value=85;tx.inputs['Detail'].default_value=2;bp=ns.new('ShaderNodeBump');bp.inputs['Strength'].default_value=noise;bp.inputs['Distance'].default_value=.015;lk.new(tx.outputs['Fac'],bp.inputs['Height']);lk.new(bp.outputs['Normal'],n.inputs['Normal'])
  mats[name]=m;return m
 mat('steel',(.24,.29,.34),.85,.27,noise=.18);mat('black',(.014,.02,.026),.6,.25,noise=.12);mat('pcb',(.018,.083,.058),.35,.35,noise=.16);mat('gold',(.70,.37,.085),.85,.20);mat('copper',(.65,.21,.07),.85,.24);mat('silicon',(.045,.07,.095),.8,.13);mat('ceramic',(.26,.29,.27),.1,.45);mat('white',(.70,.75,.78),.3,.28);mat('signal',(.04,.68,1),.4,.2,3);mat('amber',(1,.30,.025),.3,.23,2);mat('red',(.8,.018,.01),.3,.24,2);mat('floor',(.045,.055,.07),.4,.5,noise=.12)
 def box(name,loc,size,m,bev=.035):
  key=(tuple(size),m,bev)
  if key in cache:
   o=cache[key].copy();o.data=cache[key].data;s.collection.objects.link(o);o.location=loc;o.name=name;return o
  bpy.ops.mesh.primitive_cube_add(size=1,location=loc);o=bpy.context.object;o.name=name;o.dimensions=size;bpy.ops.object.transform_apply(location=False,rotation=False,scale=True);o.data.materials.append(mats[m])
  if bev:mod=o.modifiers.new('Edge finish','BEVEL');mod.width=bev;mod.segments=2;o.modifiers.new('Weighted normals','WEIGHTED_NORMAL')
  cache[key]=o;return o
 def rod(name,start,end,r=.035,m='gold'):
  x,y=Vector(start),Vector(end);bpy.ops.mesh.primitive_cylinder_add(vertices=32,radius=r,depth=(y-x).length,location=(x+y)/2);o=bpy.context.object;o.name=name;o.rotation_euler=(y-x).to_track_quat('Z','Y').to_euler();o.data.materials.append(mats[m]);return o
 def move(o,st,en,dest):
  v=o.location.copy();d=Vector(dest);actions.append(lambda t,o=o,v=v,d=d,st=st,en=en:setattr(o,'location',v.lerp(d,smooth((t-st)/max(.01,en-st)))))
 def pulsepath(points,st=0,period=3,count=3,color='signal',radius=.04,stop=1e6):
  vs=[Vector(x)for x in points]
  for k in range(count):
   o=box('Data pulse',vs[0],(radius*2,radius*2,radius*2),color,radius*.3)
   def fn(t,o=o,k=k):
    o.hide_render=t<st or t>stop;f=((t-st)/period+k/count)%1*(len(vs)-1);j=min(int(f),len(vs)-2);o.location=vs[j].lerp(vs[j+1],f-j)
   actions.append(fn)
 def package(explode=False,lanes=18):
  box('Accelerator PCB',(0,0,0),(12,9,.22),'pcb')
  for x in(-5.7,5.7):
   for y in(-4.2,4.2):rod('Mounting screw',(x,y,.11),(x,y,.25),.15,'steel')
  for x in(-4.6,4.6):
   for j in range(12):
    y=-3.7+j*.66;box('Power stage',(x,y,.28),(.58,.38,.26),'black',.02);box('Power metal top',(x,y,.415),(.48,.30,.015),'steel',.006)
   for j in range(25):
    y=-4+j*.32;box('Decoupling capacitor',(x-.65,y,.18),(.20,.12,.13),'ceramic',.008)
  for j in range(34):
   y=-4.1+j*.25
   for x in(-1,1):box('PCB signal trace',(x*3.9,y,.118),(1.7,.016,.008),'gold',0)
  box('Package substrate',(0,0,.22),(7.15,6.2,.20),'black');box('Interposer',(0,0,.345),(6.85,5.85,.05),'silicon',.02)
  compute=box('Compute die',(0,0,.56),(2.55,3.45,.37),'silicon')
  rim=box('Compute rim',(0,0,.755),(2.62,3.52,.035),'steel',.015);rim.parent=compute;rim.matrix_parent_inverse=compute.matrix_world.inverted()
  for x in range(7):
   for y in range(9):
    tile=box('Compute tile',((x-3)*.31,(y-4)*.32,.782),(.25,.25,.012),'black',.004);tile.parent=compute;tile.matrix_parent_inverse=compute.matrix_world.inverted()
  stacks=[]
  for x in(-2.35,2.35):
   for y in(-1.8,0,1.8):
    box('HBM base die',(x,y,.49),(1.30,1.3,.17),'black')
    layers=[]
    for z in range(8):
     zz=.64+z*.082;o=box('DRAM silicon die',(x,y,zz),(1.18,1.20,.065),'silicon',.009);layers.append(o)
     # Copper exposed edge contacts are illustrative enlarged detail.
     for k in range(7):
      edge=box('Edge connection',(x-.48+k*.16,y-.605,zz),(.045,.022,.018),'gold',.003);edge.parent=o;edge.matrix_parent_inverse=o.matrix_world.inverted()
    stacks.append(layers)
    for j in range(lanes):
     yy=y-.54+j*(1.08/max(1,lanes-1));xx=x*.64;box('Interposer parallel wire',(xx,yy,.382),(.95,.018,.014),'copper',.002)
     if j%3==0:pulsepath([(x,yy,.405),(math.copysign(1.32,x),yy,.405)],period=2.5,count=2,radius=.024)
  if explode:
   target=stacks[1]
   for k,o in enumerate(target):move(o,3,10,(-2.35,0,.70+k*.34))
  # surrounding chassis and fins anchor macro shots in an industrial environment
  for y in(-5.2,5.2):box('Chassis rail',(0,y,.35),(17,.32,.9),'steel')
  for x in(-7.3,7.3):
   box('Adjacent heatsink',(x,0,.45),(2.3,7,.40),'black')
   for j in range(18):box('Cooling fin',(x-1+j*.115,0,1.0),(.045,6.8,1.1),'steel',.008)
  for x in(-4,4):
   for y in(-3.4,3.4):box('Status LED',(x,y,.27),(.12,.12,.08),'signal',.01)
  return compute,stacks
 def room():
  box('Datacenter floor',(0,0,-.35),(35,50,.3),'floor')
  for side in(-1,1):
   for j in range(6):
    x=side*5.8;y=-5+j*4.2;box('Server rack',(x,y,3.6),(2.8,3.5,7.5),'black')
    for z in range(12):
     zz=.35+z*.57;box('Rack tray',(x,y-1.80,zz),(2.48,.14,.40),'steel',.012)
     for k in range(8):box('Vent',(x-.95+k*.27,y-1.882,zz),(.075,.025,.24),'black',.008)
     box('Rack status',(x+1.06,y-1.90,zz),(.06,.025,.10),'signal',.004)
  for y in range(6):box('Ceiling luminaire',(0,-5+y*4.3,8),(3,.35,.06),'white')
 def warehouse(kitchen=False):
  box('Interior floor',(0,0,-.3),(30,30,.3),'floor')
  for x in(-7,7):box('Wall',(x,3,3),(.25,20,7),'steel')
  for x in(-4,0,4):
   for y in(1.8,5.3):
    box('Work bench',(x,y,1.45),(3.5,2,.18),'steel')
    for dx in(-1.4,1.4):box('Bench leg',(x+dx,y,.6),(.12,1.8,1.3),'steel')
    for k in range(3):
     if kitchen:
      rod('Cook pot',(x-.9+k*.85,y,1.57),(x-.9+k*.85,y,2.0),.31,'steel')
      rod('Lid',(x-.9+k*.85,y,2.01),(x-.9+k*.85,y,2.07),.34,'steel')
     else:
      for z in range(3):box('Stored crate',(x-.95+k*.95,y,1.75+z*.62),(.8,1.3,.53),'ceramic',.04)
  box('Serving counter',(0,-2,1.3),(11,1.25,.15),'steel')
  for k in range(10):
   o=box('Delivery tray',(-5+k*.53,-2,1.55),(.42,.8,.18),'gold');move(o,k*.65,k*.65+5,(4.8,-2,1.55))
  # partition makes a narrow service opening visibly constrain the path
  for x in(-3.6,3.6):box('Partition',(x,-.4,1.05),(6.1,.16,2.1),'steel')
  box('Pass header',(0,-.4,3.4),(1.1,.16,.12),'steel')
  for x in(-4,0,4):rod('Light hanger',(x,3,4.4),(x,3,6),.03,'steel');box('Kitchen light',(x,3,4.3),(2.5,.7,.1),'white')
 # cameras list: (position, focus target, lens). Discrete cuts with small physical motion per shot.
 if kind=='server':
  room();cams=[((0,-12,3.6),(0,5,3.5),28),((1,-9,2.2),(5.8,-5,2.3),45),((2,-10,2.0),(5.8,-6.8,2.3),45)]
 elif kind in('daily','limits'):
  room()
  if kind=='daily':
   box('Tablet chassis',(0,-7,1.7),(1.9,.16,2.8),'steel')
   box('Tablet display',(0,-7.10,1.7),(1.68,.04,2.5),'black')
   for k in range(7):
    o=box('Answer text metaphor',(-.15,-7.14,2.5-k*.24),(1.14,.015,.07),'signal',.008)
    actions.append(lambda t,o=o,k=k:setattr(o,'hide_render',t<2+k*.65))
   cams=[((0,-12,3),(0,-7,1.7),42),((1.4,-10,2.4),(0,-7,1.8),45),((0,-13,5),(0,0,3),30)]
  else:
   for y in(-3,1,5):
    rod('Network cable',(-4.5,y,5.4),(4.5,y,5.4),.075,'copper')
    pulsepath([(-4.4,y,5.5),(0,y,5.5),(4.4,y,5.5)],period=5,count=2,color='amber',radius=.075)
   cams=[((0,-12,4.6),(0,2,4.5),32),((0,-6,6),(0,1,5.4),35),((0,-12,3),(0,4,4),30)]
 elif kind in('queue','warehouse'):
  warehouse(kind=='queue');cams=[((9,-12,6),(0,1,1.5),38),((1,-7,4.5),(0,1.2,1.7),38),((-6,-7,3.5),(0,-2,1.5),48)]
 else:
  compute,stacks=package(explode=kind in('stack','tsv','heat','makers'))
  cams=[((8,-10,8),(0,0,.5),42),((3,-5,3),(0,0,.6),48),((-4.8,-4,2.7),(-2.35,0,1),50)]
  if kind in('package','decode','numbers','daily','context','limits','ending'):
   cams=[((7,-9,6),(0,0,.5),42),((1.1,-3.7,2.6),(0,-.3,.7),50),((-3.4,-3.4,2.3),(-1.8,0,.7),48)]
  if kind=='wide':
   cams=[((-.3,-5,3),(-1.8,0,.5),48),((-.5,-1.9,2.6),(-1.7,0,.42),50),((0,-6,6),(0,0,.5),45)]
  if kind=='numbers':cams=[((0,-.1,12),(0,0,.5),38),((5,-3,3),(2.35,0,.8),43),((0,-6,7),(0,0,.6),42)]
  if kind=='context':cams=[((-5.4,3.8,4.2),(-2.35,0,.9),46),((4,3.5,3.6),(2.35,0,1),43),((0,-.1,10),(0,0,.6),38)]
  if kind=='ending':cams=[((-4,-3,2.8),(-2.35,0,1),43),((4,-6,4),(0,0,.6),40),((9,-12,10),(0,0,.5),36)]
  if kind=='stack':cams=[((-5.2,-5,3),(-2.35,0,1),50),((-4,-3,3.3),(-2.35,0,1.8),55),((-5,-5,5),(-1,0,1.0),44)]
  if kind=='tsv':
   # Separate illustrative cutaway with silicon slabs and vertical copper TSVs.
   for o in stacks[1]:
    o.hide_render=True
    for child in o.children:child.hide_render=True
   for k in range(8):
    z=.68+k*.28;box('Section DRAM',(-2.35,.26,z),(1.18,.64,.065),'silicon',.009)
   for x in(-2.75,-2.35,-1.95):rod('Through silicon connection',(x,.05,.60),(x,.05,2.74),.035,'copper');pulsepath([(x,.02,2.8),(x,.02,.58)],count=2,period=3,radius=.025)
   cams=[((-4.2,-3.2,2.5),(-2.35,.05,1.7),60),((-3.1,-1.8,2.0),(-2.35,.08,1.6),55),((-4.5,-4.0,3.9),(-2.35,0,1.5),55)]
  if kind=='interposer':
   move(compute,1,6,(0,0,2.8));cams=[((4,-6,4.7),(0,0,1.0),43),((.8,-3,1.2),(-1.5,0,.42),46),((5,-6,5),(0,0,1.3),45)]
  if kind in('decode','context','daily','limits'):
   for j in range(5):pulsepath([(-2.35,-.4+j*.2,1.4),(-1.3,-.4+j*.2,.82),(0,-.4+j*.2,.83)],st=2+j*.4,period=3.5,count=2,color='amber',radius=.06)
  if kind=='inspection':
   box('Inspection arch',(0,2,4.3),(8,.7,.5),'steel')
   for x in(-3.8,3.8):box('Inspection post',(x,2,2),(.5,.7,4.4),'steel')
   head=box('Optical inspector',(-2.5,0,3.3),(.8,.8,.85),'black');move(head,0,duration,(2.5,0,3.3))
   rod('Lens',(-2.5,0,2.7),(-2.5,0,2.94),.22,'steel');cams=[((7,-9,5),(0,0,1),40),((-5,-3,2.3),(-2.35,0,1),55),((3,-4,4),(0,0,.5),48)]
  if kind=='heat':
   for x in(-2.8,-2.35,-1.9):pulsepath([(x,0,1.1),(x,.2,2.7),(x+.4,.5,3.7)],st=8,period=3.2,count=3,color='amber',radius=.035)
   cams=[((-4.5,-4,3.4),(-2.35,0,1.7),48),((3,-6,4.0),(0,0,1),42),((1,-5,3),(0,0,.7),48)]
 # Additional aisle light makes rack detail readable on phone screens.
 if kind in ('server','daily','limits'):
  bpy.ops.object.light_add(type='AREA',location=(0,-10,5));o=bpy.context.object;o.data.energy=5500;o.data.size=7;o.rotation_euler=(Vector((0,2,3))-o.location).to_track_quat('-Z','Y').to_euler()
 # Context lighting: a warm key, neutral fill and restrained cool rim.
 for loc,power,size,col in[((-3,-6,10),2100,7,(1,.83,.66)),((6,1,8),2500,5,(.77,.88,1)),((-5,6,5),1800,4,(1,.62,.28))]:
  bpy.ops.object.light_add(type='AREA',location=loc);o=bpy.context.object;o.data.energy=power;o.data.size=size;o.data.color=col;o.rotation_euler=(Vector((0,0,.6))-o.location).to_track_quat('-Z','Y').to_euler()
 bpy.ops.object.camera_add();cam=bpy.context.object;s.camera=cam;cam.data.type='PERSP';cam.data.clip_start=.03;cam.data.clip_end=180;cam.data.dof.use_dof=True;cam.data.dof.aperture_fstop=7.1
 def animate(scene):
  t=(scene.frame_current-1)/FPS
  for fn in actions:fn(t)
  q=min(len(cams)-1,int(t/duration*len(cams)));u=(t/duration*len(cams))%1;pos,target,lens=cams[q];v=Vector(pos);tar=Vector(target);v=tar+(v-tar)*(1.35 if kind not in ('server','queue','warehouse','daily','limits') else 1);v=v.lerp(tar,.08*smooth(u));v.x+=.16*math.sin(u*math.pi);cam.location=v;cam.rotation_euler=(tar-v).to_track_quat('-Z','Y').to_euler();cam.data.lens=lens*.88;cam.data.dof.focus_distance=(tar-v).length
 bpy.app.handlers.frame_change_pre.append(animate);s.frame_start=1;s.frame_end=math.ceil(duration*FPS)
 return s
for i,sc in enumerate(b['scenes']):
 if a.shot!='all'and sc['id']not in a.shot.split(','):continue
 out=a.cache/(sc['id']+'.mp4')
 if out.exists()and not(a.preview or a.test or a.force):print('SKIP',sc['id'],flush=True);continue
 s=make(i)
 if a.preview:
  for frac in(.15,.50,.85):
   s.frame_set(max(1,round(s.frame_end*frac)));s.render.image_settings.file_format='PNG';s.render.filepath=str(a.cache/(sc['id']+f'-{frac:.2f}.png'));bpy.ops.render.render(write_still=True)
 else:
  if a.test:s.frame_end=48;out=a.cache/(sc['id']+'-test.mp4')
  s.render.image_settings.file_format='FFMPEG';s.render.ffmpeg.format='MPEG4';s.render.ffmpeg.codec='H264';s.render.ffmpeg.constant_rate_factor='HIGH';s.render.ffmpeg.ffmpeg_preset='GOOD';s.render.filepath=str(out);bpy.ops.render.render(animation=True)
 print('COMPLETE',sc['id'],flush=True)
