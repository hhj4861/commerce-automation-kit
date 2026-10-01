"""Original TGV cutaways and process choreography; enlarged conceptual geometry."""
import bpy,math,json,argparse,sys
from pathlib import Path
from mathutils import Vector
p=argparse.ArgumentParser();p.add_argument('--cache',type=Path,required=True);p.add_argument('--shot',default='all');p.add_argument('--preview',action='store_true');p.add_argument('--force',action='store_true');p.add_argument('--fps',type=int,default=12);a=p.parse_args(sys.argv[sys.argv.index('--')+1:]);a.cache.mkdir(parents=True,exist_ok=True)
b=json.loads((Path(__file__).parent/'brief.json').read_text());al=json.loads((a.cache.parent/'alignment.json').read_text())
def smooth(x):x=max(0,min(1,x));return x*x*(3-2*x)
def ramp(t,lo,hi):return smooth((t-lo)/max(.1,hi-lo))
def make(i):
 shot=b['scenes'][i]['id'];duration=math.ceil((al[i]['duration']+.12)*24)/24;bpy.app.handlers.frame_change_pre.clear();bpy.ops.wm.read_factory_settings(use_empty=True)
 s=bpy.context.scene;s.render.engine='BLENDER_EEVEE_NEXT';s.render.resolution_x=1920;s.render.resolution_y=1080;s.render.resolution_percentage=100;s.render.fps=a.fps;s.eevee.taa_render_samples=12;s.view_settings.view_transform='AgX';s.view_settings.look='AgX - Medium High Contrast'
 s.world=bpy.data.worlds.new('Warm studio');s.world.use_nodes=True;s.world.node_tree.nodes['Background'].inputs[0].default_value=(.65,.63,.57,1);s.world.node_tree.nodes['Background'].inputs[1].default_value=.4
 mats={};actions=[];ortho=7;focus=.9;camheight=4.6
 def mat(name,col,metal=0,rough=.3,emit=0):
  m=bpy.data.materials.new(name);m.use_nodes=True;n=m.node_tree.nodes['Principled BSDF'];n.inputs['Base Color'].default_value=(*col,1);n.inputs['Metallic'].default_value=metal;n.inputs['Roughness'].default_value=rough
  if emit:n.inputs['Emission Color'].default_value=(*col,1);n.inputs['Emission Strength'].default_value=emit
  mats[name]=m
 mat('floor',(.69,.665,.60),rough=.9);mat('glass',(.17,.49,.39),.15,.18);mat('copper',(.83,.32,.075),.82,.22);mat('silicon',(.016,.025,.035),.65,.2);mat('silver',(.58,.63,.62),.78,.25);mat('red',(.85,.035,.017),.25,.3,1);mat('signal',(1,.49,.02),.35,.2,2);mat('violet',(.48,.16,.43),.25,.3);mat('good',(.025,.45,.22),.25,.25,1)
 def box(name,loc,size,m,bev=.025):
  bpy.ops.mesh.primitive_cube_add(size=1,location=loc);o=bpy.context.object;o.name=name;o.dimensions=size;bpy.ops.object.transform_apply(location=False,rotation=False,scale=True);o.data.materials.append(mats[m])
  if bev:mod=o.modifiers.new('Machined edge','BEVEL');mod.width=bev;mod.segments=2;o.modifiers.new('Normals','WEIGHTED_NORMAL')
  return o
 def rod(name,start,end,r=.045,m='copper'):
  x,y=Vector(start),Vector(end);bpy.ops.mesh.primitive_cylinder_add(vertices=20,radius=r,depth=(y-x).length,location=(x+y)/2);o=bpy.context.object;o.name=name;o.rotation_euler=(y-x).to_track_quat('Z','Y').to_euler();o.data.materials.append(mats[m]);return o
 def ball(loc,r=.06,m='signal'):
  bpy.ops.mesh.primitive_uv_sphere_add(segments=12,ring_count=8,radius=r,location=loc);o=bpy.context.object;o.data.materials.append(mats[m]);return o
 def appear(o,st,en):
  orig=o.scale.copy();actions.append(lambda t,o=o,orig=orig,st=st,en=en:setattr(o,'scale',orig*max(.001,ramp(t,st,en))))
 def move(o,st,en,dest):
  orig=o.location.copy();v=Vector(dest);actions.append(lambda t,o=o,orig=orig,v=v,st=st,en=en:setattr(o,'location',orig.lerp(v,ramp(t,st,en))))
 def hide(o,st,en):
  orig=o.scale.copy();actions.append(lambda t,o=o,orig=orig,st=st,en=en:setattr(o,'scale',orig*max(.001,1-ramp(t,st,en))))
 def cue(text,fallback=.3):
  joined='';spans=[]
  for w in al[i]['words']:spans.append((len(joined),w['start']));joined+=w['text']
  pos=joined.find(text)
  return next((tm for ix,tm in reversed(spans) if ix<=pos),duration*fallback) if pos>=0 else duration*fallback
 def stream(points,st=0,period=4,count=3,m='signal'):
  vs=[Vector(x)for x in points]
  for k in range(count):
   o=ball(vs[0],.055,m)
   def fn(t,o=o,k=k):
    o.scale=(1,)*3 if t>=st else(.001,)*3;f=((t-st)/period+k/count)%1*(len(vs)-1);idx=min(int(f),len(vs)-2);o.location=vs[idx].lerp(vs[idx+1],f-idx)
   actions.append(fn)
 def tube(x,z,h,rin,rout,m,st=0,en=0):
  # Open front half exposes the wall and the inside of the through-hole.
  verts=[];faces=[];n=32
  for zz in(0,h):
   for r in(rin,rout):
    verts += [(r*math.cos(math.pi*k/n),r*math.sin(math.pi*k/n),zz)for k in range(n+1)]
  size=n+1
  for k in range(n):
   faces += [(k,k+1,2*size+k+1,2*size+k),(size+k,3*size+k,3*size+k+1,size+k+1),(k,size+k,size+k+1,k+1),(2*size+k,2*size+k+1,3*size+k+1,3*size+k)]
  faces +=[(0,2*size,3*size,size),(n,size+n,3*size+n,2*size+n)]
  mesh=bpy.data.meshes.new('TGV half section');mesh.from_pydata(verts,[],faces);mesh.update();o=bpy.data.objects.new('Metallized wall',mesh);s.collection.objects.link(o);o.location=(x,0,z);o.data.materials.append(mats[m])
  if en>st:
   def grow(t):
    o.hide_render=t<st;radius=rout-(rout-rin)*ramp(t,st,en)
    for ring in(0,2):
     for k in range(n+1):
      v=mesh.vertices[ring*size+k];v.co.x=radius*math.cos(math.pi*k/n);v.co.y=radius*math.sin(math.pi*k/n)
    mesh.update()
   actions.append(grow)
  return o
 def core(xs=(-1,0,1),filled=True,st=0):
  o=box('Cutaway glass',(0,.55,.88),(3.8,1.1,1.05),'glass',0)
  for x in xs:
   cutter=rod('Hole cutter',(x,0,.15),(x,0,1.65),.25,'glass');bpy.context.view_layer.objects.active=o;mod=o.modifiers.new('Through opening','BOOLEAN');mod.operation='DIFFERENCE';mod.object=cutter;bpy.ops.object.modifier_apply(modifier=mod.name);bpy.data.objects.remove(cutter,do_unlink=True)
   if filled:tube(x,.355,1.05,.001,.225,'copper',st,st+2)
  mod=o.modifiers.new('Edge highlight','BEVEL');mod.width=.025;mod.segments=2;o.modifiers.new('Normals','WEIGHTED_NORMAL');return o
 def traces(xs=(-1,0,1),st=0):
  for x in xs:
   for z in(.30,1.46):
    q=rod('Surface wiring',(x,0,z),(x,1.15,z),.035);appear(q,st,st+1)
 def package(st=0):
  core(st=st);traces(st=st+2);die=box('AI compute',(0,.7,1.72),(1.0,.75,.24),'silicon');appear(die,st,st+1)
  for x in(-1.35,1.35):
   for k in range(4):
    o=box('Memory die',(x,.65,1.56+k*.10),(.65,.7,.065),'silicon',.012);appear(o,st+.25*k,st+.25*k+1)
  return die
 if shot=='hook':
  die=package(6);move(die,8,12,(0,.7,2.5));focus=1.25
  for x in(-1,0,1):stream([(x,1,1.5),(x,0,1.5),(x,0,.3),(x,1,.3)],10)
 elif shot=='insulator':
  o=box('One shared conductor',(-1.25,0,.7),(1.75,1.9,.15),'copper');box('Insulating glass',(1.25,0,.7),(1.75,1.9,.15),'glass')
  for x in(-1.25,1.25):
   for j in(-.5,.5):
    q=rod('Separate signal',(x+j,-.75,.83),(x+j,.75,.83),.055,'silver');stream([(x+j,-.75,.9),(x+j,.75,.9)],2,count=2)
  q=rod('Unwanted shared connection',(-1.75,0,.86),(-.75,0,.86),.085,'red');appear(q,cue('한 덩어리'),cue('한 덩어리')+1);ortho=7.4
 elif shot=='elevator':
  for z in(.4,1.35,2.3):
   box('Floor',(0,.4,z),(3.5,1.75,.13),'glass');rod('Corridor',(-1.5,-.2,z+.13),(1.5,-.2,z+.13),.045)
  for x in(-.32,.32):rod('Shaft rail',(x,-.45,.47),(x,-.45,2.5),.027,'silver')
  lift=box('Lift',(0,-.38,.69),(.52,.50,.38),'copper');actions.append(lambda t:setattr(lift.location,'z',.7+1.85*(.5-.5*math.cos(t*.6))));ortho=8.0;focus=1.35
 elif shot=='route':
  core();traces();box('Top chip',(0,.8,1.67),(.8,.65,.2),'silicon');box('Bottom pad',(0,.8,.18),(.8,.65,.12),'silicon')
  for k,x in enumerate((-1,0,1)):stream([(x,1.0,1.5),(x,0,1.5),(x,0,.29),(x,1.0,.29)],cue('上',.10)+k*.2,4)
  ortho=6.5
 elif shot=='holes':
  core(filled=False)
  for x in(-1,0,1):
   q=rod('Hole center',(x,0,.20),(x,0,1.65),.018,'silver');appear(q,2,3)
  for k in range(3):
   q=rod('Magnified crack',(.2+k*.09,.01,1.36-k*.08),(.36+k*.09,.01,1.21-k*.07),.018,'red');appear(q,cue('손상'),cue('손상')+1)
  ortho=6.4;camheight=3.4
 elif shot=='laser':
  core(filled=False);fillers=[]
  for x in(-1,0,1):fillers.append(tube(x,.355,1.05,.001,.249,'glass'))
  head=box('Laser optics',(-1,0,2.5),(.48,.48,.6),'silicon');beam=rod('Laser modification',(-1,0,1.4),(-1,0,2.25),.018,'violet')
  for q in(head,beam):move(q,1,7,(1,0,q.location.z))
  hide(beam,7,8)
  for j,(x,f)in enumerate(zip((-1,0,1),fillers)):
   mark=rod('Modified region',(x,0,.38),(x,0,1.37),.07,'violet');hide(f,cue('식각')+j*.45,cue('식각')+2+j*.45)
   # The modified column is removed together with the selected glass.
   actions.append(lambda t,o=mark,j=j,orig=mark.scale.copy(),et=cue('식각'):setattr(o,'scale',orig*max(.001,ramp(t,2+j*2,3+j*2)*(1-ramp(t,et+j*.45,et+2+j*.45)))))
  focus=1.25;ortho=7.2
 elif shot=='seed':
  core(filled=False)
  for j,x in enumerate((-1,0,1)):
   tube(x,.355,1.05,.22,.245,'silver',cue('표면'),cue('표면')+2)
   tube(x,.355,1.05,.195,.22,'copper',cue('씨앗층'),cue('씨앗층')+3)
  ortho=6.2;camheight=3.2
 elif shot in('fill','void'):
  # Twin open half-vias compare controlled filling with an internal unfilled volume.
  ortho=6.7;camheight=3.1
  for x in(-1.1,1.1):
   tube(x,.35,1.55,.48,.70,'glass');tube(x,.35,1.55,.43,.48,'copper')
  st=2 if shot=='void'else cue('더 쌓아')
  for x in(-1.1,1.1):
   for j in range(7):
    q=tube(x,.35,1.55,max(.002,.43-(j+1)*.061),.43-j*.061,'copper',st+j*.65,st+j*.65+1)
    if shot=='void'and x>0 and j>3:
     actions.pop();q.hide_render=True
  if shot=='void':
   for z in(.40,1.80):tube(1.1,z,.10,.002,.47,'copper',1,3)
   for z in(.85,1.4):q=ball((1.1,-.03,z),.12,'red');appear(q,6,7)
  else:
   for x in(-1.1,1.1):stream([(x,0,1.94),(x,0,.32)],st+6,3)
 elif shot=='thermal':
  tube(0,.35,1.65,.45,.8,'glass');cu=tube(0,.35,1.65,.002,.435,'copper');ortho=5.7;camheight=3.2
  def heat(t):q=.04*(.5-.5*math.cos(t*.6));cu.scale=(1+q,1+q,1+q*.5)
  actions.append(heat)
  for x in(-.47,.47):
   q=rod('Interface stress marker',(x,-.02,.7),(x,-.02,1.6),.025,'red');appear(q,cue('부담'),cue('부담')+1)
 elif shot=='inspection':
  core();traces();head=box('Inspection scanner',(-1.4,.45,2.2),(.3,1.3,.22),'silver');move(head,1,duration-2,(1.4,.45,2.2))
  for x in(-1,0,1):
   q=ball((x,-.03,1.52),.085,'good');appear(q,3+(x+1)*3,4+(x+1)*3)
  for x in(-1,1):q=rod('Electrical probe',(x,-.05,1.8),(x,-.05,2.5),.03,'silver');move(q,8,11,(q.location.x,q.location.y,q.location.z-.25))
 elif shot=='industry':
  for x in(-1.5,0,1.5):
   box('Process station',(x,0,.42),(1.1,1.4,.3),'silicon');box('Glass sample',(x,0,.65),(.86,1.0,.12),'glass')
  q=box('Laser station',(-1.5,0,1.65),(.35,.35,.5),'silver');beam=rod('Light',(-1.5,0,.8),(-1.5,0,1.4),.02,'violet');appear(beam,2,3)
  for j in range(4):q=rod('Plating contacts',((j-1.5)*.18,0,.71),((j-1.5)*.18,0,1.05),.05);appear(q,6+j*.5,7+j*.5)
  q=box('Glass layers',(1.5,0,1.4),(.86,1.0,.12),'glass');move(q,10,14,(1.5,0,.8));ortho=8
 elif shot=='daily':
  box('Phone',(-2.2,-.1,.8),(.85,.18,1.65),'silicon');box('Screen',(-2.2,-.21,.82),(.70,.025,1.4),'glass')
  for x in(.1,1.1,2.1):
   box('Server',(x,.3,1.25),(.75,.9,2.5),'silicon')
   for z in(.3,.65,1,1.35,1.7,2.05):box('Tray',(x,-.2,z),(.62,.05,.21),'silver',.008)
  stream([(-1.7,-.3,.8),(-.5,-.3,.8),(1.1,-.3,.8)],1,3);ortho=8;focus=1.1
 elif shot=='distinction':
  tube(-1.3,.35,1.4,.32,.6,'glass');tube(-1.3,.35,1.4,.002,.3,'copper');ortho=7
  for k in range(4):
   z=.4+k*.40;box('Stacked silicon',(1.2,.2,z),(1.35,.9,.20),'silicon')
   for x in(.85,1.55):rod('Silicon via',(x,-.24,z-.1),(x,-.24,z+.3),.055)
  stream([(-1.3,0,1.85),(-1.3,0,.30)],2,3);stream([(1.2,-.3,1.9),(1.2,-.3,.3)],cue('실리콘'),3)
 elif shot=='reveal':
  die=package(1);move(die,3,7,(0,.7,2.5));focus=1.2
  for x in(-1,0,1):stream([(x,1,1.49),(x,0,1.49),(x,0,.3),(x,1,.3)],4)
 elif shot=='ending':
  box('Compute',(-1.6,0,.8),(1.3,1.4,.55),'silicon')
  for k in range(6):
   q=box('HBM layer',(1.4,0,.4+k*.20),(1.2,1.2,.13),'silicon');appear(q,2+k*.55,3+k*.55)
  for j in range(7):
   y=(j-3)*.16;q=rod('Wide memory path',(-.9,y,.5),(.75,y,.5),.027);appear(q,3+j*.3,4+j*.3);stream([(.75,y,.53),(-.9,y,.53)],4+j*.3,2.5,2)
  ortho=7.6
 else:raise ValueError(shot)
 box('Continuous warm floor',(0,0,-.1),(200,200,.15),'floor',0)
 for loc,power,size,col in[((-3,-4,7),1600,5,(1,.90,.79)),((4,3,5),1900,4,(.87,1,.96))]:
  bpy.ops.object.light_add(type='AREA',location=loc);o=bpy.context.object;o.data.energy=power;o.data.shape='DISK';o.data.size=size;o.data.color=col;o.rotation_euler=(Vector((0,0,.8))-o.location).to_track_quat('-Z','Y').to_euler()
 bpy.ops.object.camera_add();cam=bpy.context.object;s.camera=cam;cam.data.type='ORTHO';cam.data.ortho_scale=ortho
 def animate(scene):
  t=(scene.frame_current-1)/a.fps
  for fn in actions:fn(t)
  angle=-math.pi/2+.20+.22*ramp(t,0,duration);cam.location=(8*math.cos(angle),8*math.sin(angle),camheight);cam.rotation_euler=(Vector((0,0,focus))-cam.location).to_track_quat('-Z','Y').to_euler();cam.data.ortho_scale=ortho*(1-.06*ramp(t,1,duration-2))
 bpy.app.handlers.frame_change_pre.append(animate);s.frame_start=1;s.frame_end=math.ceil(duration*a.fps);return s
for i,sc in enumerate(b['scenes']):
 if a.shot!='all'and sc['id']not in a.shot.split(','):continue
 out=a.cache/(sc['id']+'.mp4')
 if out.exists()and not a.preview and not a.force:print('SKIP',sc['id'],flush=True);continue
 s=make(i)
 if a.preview:
  for frac in(.30,.75):
   s.frame_set(max(1,round(s.frame_end*frac)));s.render.image_settings.file_format='PNG';s.render.filepath=str(a.cache/(sc['id']+f'-{frac:.2f}.png'));bpy.ops.render.render(write_still=True)
 else:
  s.render.image_settings.file_format='FFMPEG';s.render.ffmpeg.format='MPEG4';s.render.ffmpeg.codec='H264';s.render.ffmpeg.constant_rate_factor='HIGH';s.render.ffmpeg.ffmpeg_preset='GOOD';s.render.filepath=str(out);bpy.ops.render.render(animation=True)
 print('COMPLETE',sc['id'],flush=True)
