"""Narration-timed, non-looping 3D choreography. Conceptual, not engineering simulation."""
import bpy, math, sys, argparse, json
from pathlib import Path
from mathutils import Vector
p=argparse.ArgumentParser();p.add_argument('--cache',type=Path,required=True);p.add_argument('--source-cache',type=Path,required=True);p.add_argument('--shot',default='all');p.add_argument('--preview',action='store_true');p.add_argument('--force',action='store_true');p.add_argument('--width',type=int,default=1920);p.add_argument('--fps',type=int,default=12)
a=p.parse_args(sys.argv[sys.argv.index('--')+1:]);a.cache.mkdir(parents=True,exist_ok=True)
brief=json.loads((Path(__file__).parent/'brief.json').read_text());alignment=json.loads((a.source_cache/'alignment.json').read_text());old=json.loads((a.source_cache/'project.json').read_text())
def ease(x):x=max(0,min(1,x));return x*x*(3-2*x)
def ramp(t,lo,hi):return ease((t-lo)/max(.1,hi-lo))
def make(index):
 sc=brief['scenes'][index];duration=old['scenes'][index]['duration'];words=alignment[index]['words'];shot=sc['id']
 def cue(phrase):
  text='';spans=[]
  for w in words:spans.append((len(text),w['start']));text+=w['text']
  loc=text.find(phrase)
  if loc<0:raise ValueError(f'Missing cue {shot}: {phrase}')
  return next((tm for pos,tm in reversed(spans) if pos<=loc),0)
 bpy.app.handlers.frame_change_pre.clear();bpy.ops.wm.read_factory_settings(use_empty=True)
 s=bpy.context.scene;s.render.engine='BLENDER_EEVEE_NEXT';s.render.resolution_x=a.width;s.render.resolution_y=round(a.width*9/16);s.render.resolution_percentage=100;s.render.fps=a.fps
 s.view_settings.view_transform='AgX';s.view_settings.look='AgX - Medium High Contrast';s.render.image_settings.color_mode='RGB'
 if hasattr(s,'eevee'):s.eevee.taa_render_samples=16
 s.world=bpy.data.worlds.new('Warm continuous studio');s.world.use_nodes=True;s.world.node_tree.nodes['Background'].inputs[0].default_value=(.67,.65,.60,1);s.world.node_tree.nodes['Background'].inputs[1].default_value=.32
 mats={};actions=[]
 def material(name,color,metal=0,rough=.3,emission=0):
  m=bpy.data.materials.new(name);m.use_nodes=True;q=m.node_tree.nodes['Principled BSDF'];q.inputs['Base Color'].default_value=(*color,1);q.inputs['Metallic'].default_value=metal;q.inputs['Roughness'].default_value=rough
  if emission:q.inputs['Emission Color'].default_value=(*color,1);q.inputs['Emission Strength'].default_value=emission
  mats[name]=m;return m
 material('floor',(.68,.65,.59),rough=.85);material('silicon',(.018,.027,.036),.72,.23);material('copper',(.80,.30,.085),.83,.24);material('glass',(.16,.47,.38),.12,.15);material('organic',(.09,.135,.085),.1,.5);material('light',(.65,.68,.65),.65,.27);material('red',(.9,.035,.015),.25,.3,1);material('signal',(1,.46,.025),.35,.22,2);material('cool',(.05,.45,.32),.25,.3,1)
 q=mats['glass'].node_tree.nodes['Principled BSDF'];q.inputs['Transmission Weight'].default_value=.72;q.inputs['IOR'].default_value=1.48
 def box(name,loc,size,mat,bevel=.025):
  bpy.ops.mesh.primitive_cube_add(size=1,location=loc);o=bpy.context.object;o.name=name;o.dimensions=size;bpy.ops.object.transform_apply(location=False,rotation=False,scale=True);o.data.materials.append(mats[mat]);mod=o.modifiers.new('Precision edge','BEVEL');mod.width=bevel;mod.segments=3;o.modifiers.new('Surface normals','WEIGHTED_NORMAL');return o
 def rod(name,start,end,r=.024,mat='copper'):
  v,w=Vector(start),Vector(end);bpy.ops.mesh.primitive_cylinder_add(vertices=12,radius=r,depth=(w-v).length,location=(v+w)/2);o=bpy.context.object;o.name=name;o.rotation_euler=(w-v).to_track_quat('Z','Y').to_euler();o.data.materials.append(mats[mat]);return o
 def ball(loc,r=.05,mat='signal'):
  bpy.ops.mesh.primitive_uv_sphere_add(segments=12,ring_count=8,radius=r,location=loc);o=bpy.context.object;o.data.materials.append(mats[mat]);return o
 def appear(o,start,seconds=1):
  original=o.scale.copy();actions.append(lambda t,o=o,orig=original,st=start,d=seconds:setattr(o,'scale',orig*max(.001,ramp(t,st,st+d))))
 def lift(o,start,height,seconds=2):
  base=o.location.z;actions.append(lambda t,o=o,z=base,st=start,h=height,d=seconds:setattr(o.location,'z',z+h*ramp(t,st,st+d)))
 def move(o,start,endtime,target):
  base=o.location.copy();dest=Vector(target);actions.append(lambda t,o=o,b=base,d=dest,st=start,en=endtime:setattr(o,'location',b.lerp(d,ramp(t,st,en))))
 def signal(start,end,begin,period=3,phase=0,stop=None):
  o=ball(start);v,w=Vector(start),Vector(end)
  def update(t):
   active=t>=begin and (stop is None or t<stop);o.scale=(1,1,1) if active else (.001,)*3;o.location=v.lerp(w,((t-begin)/period+phase)%1)
  actions.append(update);return o
 def package(explode_at=None,close_at=None):
  core=box('Glass core',(0,0,.46),(3.2,2.35,.20),'glass',.045);die=box('Compute silicon',(0,0,.76),(1.18,1.2,.24),'silicon');parts=[die]
  # Fine surface geometry and contacts retain material detail in close views.
  for x in (-1.1,1.1):
   for y in (-.65,.65):
    for k in range(4):parts.append(box('Memory layer',(x,y,.64+k*.065),(.58,.62,.05),'silicon',.008))
  traces=[]
  for side in (-1,1):
   for j in range(7):
    y=(j-3)*.17;traces.append(rod('Copper redistribution',(side*.62,y,.585),(side*1.42,y,.585),.012))
  for i in range(8):
   for j in range(6):ball(((i-3.5)*.38,(j-2.5)*.36,.28),.052,'copper')
  if explode_at is not None:
   for k,o in enumerate(parts):
    base=o.location.z;height=1.35 if k==0 else .75+((k-1)%4)*.17
    def up(t,o=o,z=base,h=height):
     value=ramp(t,explode_at,explode_at+3)
     if close_at is not None:value*=1-ramp(t,close_at,close_at+3)
     o.location.z=z+h*value
    actions.append(up)
  return core,parts,traces
 def warp(cx,mat,amount,start):
  verts=[(cx+(i/24-.5)*2.6,(j/10-.5)*1.65,.64)for j in range(11)for i in range(25)];faces=[]
  for j in range(10):
   for i in range(24):k=j*25+i;faces.append((k,k+1,k+26,k+25))
  mesh=bpy.data.meshes.new('Flexible surface');mesh.from_pydata(verts,[],faces);mesh.update();o=bpy.data.objects.new('Exaggerated warpage',mesh);s.collection.objects.link(o);o.data.materials.append(mats[mat]);o.modifiers.new('Core depth','SOLIDIFY').thickness=.12
  def bend(t):
   for v in mesh.vertices:v.co.z=.64+amount*ramp(t,start,start+5)*((v.co.x-cx)/1.3)**2
   mesh.update()
  actions.append(bend)
  for i in range(9):
   x=cx+(i-4)*.27;rod('Fixed reference pin',(x,-.73,.22),(x,-.73,.59),.034)
   cap=ball((x,-.73,.59),.054,'copper');actions.append(lambda t,o=cap,x=x:setattr(o.location,'z',.59+amount*ramp(t,start,start+5)*((x-cx)/1.3)**2))
   if amount>.1 and abs(i-4)>2:
    bad=ball((x,-.78,.47),.066,'red');appear(bad,start+4)
  box('Rigid component',(cx,.18,1.05),(1.9,1.02,.19),'silicon')
  return o
 focus_z=.78;ortho=6.8;camera_height=5.5
 if shot in ('hook','inside','reveal'):
  st=6 if shot=='hook' else (1 if shot=='inside' else cue('더 많은'))
  core,parts,traces=package(st, duration-5 if shot=='reveal' else None);focus_z=1.08;ortho=7.1
  for side in (-1,1):
   for j in range(3):signal((side*1.36,(j-1)*.3,.60),(side*.61,(j-1)*.3,.60),st+4,2.5,j/3)
 elif shot=='traffic':
  for x in (-2,2):box('Memory and compute',(x,0,.5),(1.0,1.7,.56),'silicon')
  for j in range(7):
   y=(j-3)*.20;lane=rod('Data lane',(-1.45,y,.48),(1.45,y,.48),.024)
   begin=1 if j==3 else cue('가깝게')+.16*j;appear(lane,begin)
   for k in range(2):signal((-1.45,y,.52),(1.45,y,.52),begin,3,k/2)
  ortho=7.3
 elif shot=='crowded':
  core=box('Growing package',(0,0,.4),(3.1,2.3,.18),'glass');actions.append(lambda t:setattr(core,'scale',(1+.3*ramp(t,1,5),1+.3*ramp(t,1,5),1)))
  for i in range(3):
   for j in range(3):
    x,y=(i-1)*1.05,(j-1)*.83;o=box('Chiplet',(x,y,.68),(.78,.60,.21),'silicon');appear(o,1+(i*3+j)*.45)
    for k in range(4):
     pin=ball((x+(k-1.5)*.16,y-.27,.52),.036,'copper');appear(pin,cue('접점')+.08*k)
  gauge=box('Alignment ruler',(0,-1.35,.51),(3.8,.025,.025),'red');appear(gauge,cue('위치 오차'))
  ortho=7.1
 elif shot=='warpage':warp(0,'organic',.50,cue('휘어'));ortho=5.7;camera_height=3.0
 elif shot=='thermal':
  start=cue('크기가 변하고')
  for j,mat in enumerate(('silicon','glass','organic')):
   y=(j-1)*.7;o=box('Material expansion',(0,y,.52),(2.75,.40,.17),mat);rate=(.05,.09,.34)[j]
   def expand(t,o=o,r=rate):
    v=r*ramp(t,start,start+5);o.scale.x=1+v;o.location.x=2.75*v/2
   actions.append(expand);rod('Anchored left',(-1.40,y,.24),(-1.40,y,.82),.015,'light')
  heat=box('Temperature indicator',(-2.0,0,.38),(.16,2.3,.08),'red');appear(heat,start)
  ortho=6.2
 elif shot=='glass':
  warp(-1.6,'organic',.35,3);warp(1.6,'glass',.025,3);ortho=8.0;camera_height=4
 elif shot in ('wiring','ending'):
  core=box('Cutaway glass core',(0,.35,.62),(3.2,1.5,.50),'glass');chip=box('Top silicon',(0,.63,1.22),(1.22,.70,.22),'silicon');appear(chip,1)
  start=cue('구리색') if shot=='wiring' else cue('위와 아래')
  for i in range(9):
   x=(i-4)*.31;via=rod('Metal filled via',(x,-.40,.34),(x,-.40,.96),.044);trace=rod('Surface copper',(x,-.40,.96),(x,1.0,.96),.022);appear(via,start+i*.12);appear(trace,start+1+i*.12)
   signal((x,-.43,.35),(x,-.43,.99),start+2,2.4,i/9)
  ortho=6.4;camera_height=3.5
 elif shot in ('tradeoff','manufacture','industry'):
  ortho=7.9;focus_z=.95
  carrier=box('Protective carrier',(0,0,.23),(3.2,2.15,.24),'silicon');panel=box('Glass panel',(0,0,.41),(2.88,1.85,.085),'glass')
  for x in (-1.68,1.68):box('Gantry rail',(x,0,1.05),(.12,3.6,1.8),'light')
  beam=box('Moving gantry',(0,-1.0,2.0),(3.65,.17,.17),'light');head=box('Processing head',(0,-1.0,1.62),(.40,.34,.55),'silicon');lens=rod('Processing lens',(0,-1.0,1.36),(0,-1.0,1.23),.10)
  if shot=='tradeoff':
   lift(panel,cue('운반'),.6,3)
   for x in (-1.4,1.4):
    jaw=box('Carrier support',(x,0,1.03),(.16,1.5,.26),'light');appear(jaw,cue('손상을'))
   for k in range(3):
    defect=rod('Illustrated microcrack',(.65+k*.12,-.75,1.06),(.80+k*.1,-.55,1.06),.017,'red');appear(defect,cue('균열'))
  elif shot=='manufacture':
   for o in (beam,head,lens):move(o,1,8,(o.location.x,1.0,o.location.z))
   for i in range(7):
    x=(i-3)*.32;v=rod('Filled via',(x,-.6,.36),(x,-.6,.64),.035);appear(v,cue('금속')+i*.10)
   die=box('Mounted chip',(0,0,.82),(1.15,1.0,.2),'silicon');appear(die,cue('칩을'))
  else:
   for o in (beam,head,lens):move(o,1,duration-4,(o.location.x,1.05,o.location.z))
   scan=box('Moving inspection strip',(0,-.85,.48),(2.75,.025,.015),'cool');move(scan,1,duration-4,(0,.9,.48))
   for j in range(3):
    sample=box('Validation sample',((j-1)*.80,0,.56),(.65,.65,.10),'glass');appear(sample,2+j*3)
 elif shot=='daily':
  ortho=7.9;focus_z=1.05;camera_height=5.3
  phone=box('User device',(-2.5,-.4,.70),(.85,.15,1.5),'silicon');box('Device screen',(-2.5,-.49,.72),(.72,.018,1.26),'glass')
  for i in range(3):
   x=.1+i*.93;box('AI server rack',(x,.25,1.3),(.75,.76,2.5),'silicon')
   for j in range(8):
    z=.25+j*.26;box('Server tray',(x,-.17,z),(.63,.06,.17),'light',.01);led=ball((x-.22,-.22,z),.025,'signal');appear(led,2+i*1.4+j*.1)
  for j in range(3):signal((-2,-.50,.6),(.1+j*.93,-.50,.6),cue('함께'),3,j/3)
 elif shot=='limits':
  core,parts,traces=package();ortho=8.0
  for j,mat in enumerate(('silicon','copper','cool')):
   x=(j-1)*1.35;o=box('Memory power cooling',(x,-2,.4),(.74,.6,.60),mat);appear(o,1+j*3);path=rod('Required system supply',(x,-1.7,.35),(x,-1.15,.35),.035,mat);appear(path,2+j*3);signal((x,-1.7,.39),(x,-1.15,.39),cue('메모리')+j,2,j/3)
 else:raise ValueError(shot)
 box('Warm continuous background',(0,0,-.18),(200,200,.18),'floor',.01)
 for loc,power,size,color in [((-3,-4,7),1450,5,(1,.9,.77)),((4,2,5),1800,4,(.84,1,.98)),((0,4,3),900,3,(1,.85,.65))]:
  bpy.ops.object.light_add(type='AREA',location=loc);o=bpy.context.object;o.data.energy=power;o.data.shape='DISK';o.data.size=size;o.data.color=color;o.rotation_euler=(Vector((0,0,.6))-o.location).to_track_quat('-Z','Y').to_euler()
 bpy.ops.object.camera_add();cam=bpy.context.object;s.camera=cam;cam.data.type='ORTHO';cam.data.ortho_scale=ortho
 def animate(scene):
  t=(scene.frame_current-1)/a.fps
  for fn in actions:fn(t)
  progress=t/duration;angle=-math.pi/2+.18+.30*ramp(progress,0,1)
  cam.location=(8*math.cos(angle),8*math.sin(angle),camera_height-.35*ramp(progress,.3,.8));cam.data.ortho_scale=ortho*(1-.06*ramp(progress,.2,.8));cam.rotation_euler=(Vector((0,0,focus_z))-cam.location).to_track_quat('-Z','Y').to_euler()
 bpy.app.handlers.frame_change_pre.append(animate);s.frame_start=1;s.frame_end=math.ceil(duration*a.fps);return s
for i,sc in enumerate(brief['scenes']):
 if a.shot!='all' and sc['id'] not in a.shot.split(','):continue
 out=a.cache/(sc['id']+'.mp4')
 if out.exists() and not a.preview and not a.force:print('SKIP',sc['id'],flush=True);continue
 s=make(i)
 if a.preview:
  for fraction in (.18,.62,.9):
   s.frame_set(max(1,int(s.frame_end*fraction)));s.render.image_settings.file_format='PNG';s.render.filepath=str(a.cache/(sc['id']+f'-{fraction:.2f}.png'));bpy.ops.render.render(write_still=True)
 else:
  s.render.image_settings.file_format='FFMPEG';s.render.ffmpeg.format='MPEG4';s.render.ffmpeg.codec='H264';s.render.ffmpeg.constant_rate_factor='HIGH';s.render.ffmpeg.ffmpeg_preset='GOOD';s.render.filepath=str(out);bpy.ops.render.render(animation=True)
 print('COMPLETE',sc['id'],flush=True)
