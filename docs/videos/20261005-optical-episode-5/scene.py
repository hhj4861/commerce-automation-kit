"""Original illustrative geometry; no measured thermal/airflow simulation or reference assets."""
import bpy,sys,math,json,argparse,random
from pathlib import Path
from mathutils import Vector
p=argparse.ArgumentParser();p.add_argument('--cache',type=Path,required=True);p.add_argument('--variant',choices=['long','short'],default='long');p.add_argument('--shots');p.add_argument('--preview',action='store_true');p.add_argument('--force',action='store_true');p.add_argument('--test-seconds',type=float);a=p.parse_args(sys.argv[sys.argv.index('--')+1:]);FPS=24
plan=json.loads((a.cache/(a.variant+'-plan.json')).read_text());folder=a.cache/('3d-'+a.variant);folder.mkdir(parents=True,exist_ok=True)
def smooth(x):x=max(0,min(1,x));return x*x*(3-2*x)
def make(seg):
 bpy.app.handlers.frame_change_pre.clear();bpy.ops.wm.read_factory_settings(use_empty=True);s=bpy.context.scene
 s.render.engine='BLENDER_EEVEE_NEXT';s.eevee.taa_render_samples=12;s.render.resolution_x=plan['width'];s.render.resolution_y=plan['height'];s.render.resolution_percentage=100;s.render.fps=FPS
 s.view_settings.view_transform='AgX';s.view_settings.look='AgX - Medium High Contrast';s.world=bpy.data.worlds.new('World');s.world.use_nodes=True;s.world.node_tree.nodes['Background'].inputs[0].default_value=(.13,.18,.22,1);s.world.node_tree.nodes['Background'].inputs[1].default_value=.32
 anim=[];mats={};sid=seg['id'];D=seg['duration'];portrait=a.variant!='long';rng=random.Random(42);kind=next(x['scene'] for x in json.loads((Path(__file__).parent/'story.json').read_text())['beats'] if x['id']==sid)
 def mat(n,c,metal=0,rough=.35,emit=0,noise=False):
  m=bpy.data.materials.new(n);m.use_nodes=True;nt=m.node_tree;bs=nt.nodes.get('Principled BSDF');bs.inputs['Base Color'].default_value=(*c,1);bs.inputs['Metallic'].default_value=metal;bs.inputs['Roughness'].default_value=rough
  if emit:bs.inputs['Emission Color'].default_value=(*c,1);bs.inputs['Emission Strength'].default_value=emit
  if noise:
   no=nt.nodes.new('ShaderNodeTexNoise');no.inputs['Scale'].default_value=19;no.inputs['Detail'].default_value=3;bu=nt.nodes.new('ShaderNodeBump');bu.inputs['Strength'].default_value=.3;bu.inputs['Distance'].default_value=.06;nt.links.new(no.outputs['Fac'],bu.inputs['Height']);nt.links.new(bu.outputs['Normal'],bs.inputs['Normal'])
  mats[n]=m;return m
 for args in [('floor',(.025,.038,.049),.2,.45),('board',(.028,.15,.107),.25,.34),('silicon',(.11,.15,.21),.78,.21),('cache',(.015,.4,.47),.65,.28),('copper',(.7,.28,.085),.82,.24),('silver',(.52,.61,.66),.85,.24),('dark',(.021,.029,.04),.4,.35),('signal',(.035,.8,.66),.2,.3,2),('hot',(1,.12,.015),.15,.35,1.1),('warm',(1,.49,.045),.2,.3,1.2),('water',(.01,.32,.8),.5,.16,.45),('stone',(.48,.43,.35),0,.8,0,True),('soil',(.22,.135,.07),0,.95,0,True),('grass',(.16,.255,.066),0,.85,0,True),('ice',(.42,.76,.87),.2,.16)]:mat(*args)
 def box(n,loc,dim,ma,bev=.04):
  bpy.ops.mesh.primitive_cube_add(size=1,location=loc);o=bpy.context.object;o.name=n;o.dimensions=dim;bpy.ops.object.transform_apply(location=False,rotation=False,scale=True);o.data.materials.append(mats[ma]);
  if bev:b=o.modifiers.new('Edge highlights','BEVEL');b.width=bev;b.segments=2;o.modifiers.new('Normals','WEIGHTED_NORMAL')
  return o
 def rod(n,p,q,r,ma):
  v,w=Vector(p),Vector(q);bpy.ops.mesh.primitive_cylinder_add(vertices=12,radius=r,depth=(w-v).length,location=(v+w)/2);o=bpy.context.object;o.name=n;o.rotation_euler=(w-v).to_track_quat('Z','Y').to_euler();o.data.materials.append(mats[ma]);return o
 def ball(n,loc,r,ma):
  bpy.ops.mesh.primitive_uv_sphere_add(segments=10,ring_count=6,radius=r,location=loc);o=bpy.context.object;o.name=n;o.data.materials.append(mats[ma]);return o
 def wire(points,ma='copper',r=.045):
  for j in range(len(points)-1):rod('Physical connection',points[j],points[j+1],r,ma)
 def path_at(points,phase):
  distances=[(Vector(points[j+1])-Vector(points[j])).length for j in range(len(points)-1)];d=sum(distances)*phase
  for j,l in enumerate(distances):
   if d<=l:return Vector(points[j]).lerp(Vector(points[j+1]),d/l if l else 0)
   d-=l
  return Vector(points[-1])
 def packets(points,n=4,period=3,ma='signal',start=0,r=.09):
  for j in range(n):
   o=ball('Illustrative moving signal',points[0],r,ma)
   def f(t,o=o,j=j):o.hide_render=t<start;o.location=path_at(points,((t-start)/period+j/n)%1)
   anim.append(f)
 def chip(loc=(0,0,.5),ma='silicon',scale=1):
  root=bpy.data.objects.new('Die assembly',None);s.collection.objects.link(root);root.location=loc
  parts=[box('Silicon die',(0,0,0),(3*scale,2.8*scale,.22),ma),box('Die edge',(0,0,.12),(3.02*scale,2.82*scale,.03),ma,.008)]
  for x in range(5):
   for y in range(4):parts.append(box('Circuit tile',((x-2)*.52*scale,(y-1.5)*.60*scale,.15),(.40*scale,.44*scale,.035),ma,.018))
  for o in parts:o.parent=root
  return root
 def context():
  box('Laboratory floor',(0,0,-1),(45,45,.3),'floor')
  for x in(-10,10):
   for y in(6,10,14):
    box('Server rack',(x,y,3),(3,2,8),'dark')
    for z in range(9):
     box('Server tray',(x,y-1.02,.2+z*.65),(2.6,.06,.40),'silicon',.02)
     box('Status indicator',(x-.9,y-1.07,.2+z*.65),(.08,.015,.08),'signal',.01)
  box('Circuit board',(0,0,-.35),(11,8,.25),'board')
  for k in range(14):
   for x in(-4.8,4.8):box('Power component',(x,-3.2+k*.48,-.09),(.45,.28,.28),'silicon',.015)
  for k in range(22):box('Board copper routing',(-.3,-3.6+k*.32,-.215),(8,.014,.012),'copper',.001)
 def coolplate(z):
  root=bpy.data.objects.new('Cooling assembly',None);s.collection.objects.link(root);root.location.z=z
  o=box('Heat spreader',(0,.95,0),(3.6,1.4,.25),'silver');o.parent=root
  for i in range(11):o=box('Heatsink fin',(-1.55+i*.31,.95,.63),(.075,1.3,1.1),'silver',.012);o.parent=root
  return root
 # Every schematic is original geometry; packets/colors are symbolic, not measured simulation.
 mat('violet',(.48,.13,.85),.25,.25,1.2);mat('white',(.85,.9,.9),.5,.26)
 box('Studio base',(0,0,-.7),(45,45,.3),'floor',.05)
 board=box('Circuit carrier',(0,0,-.3),(14,7,.25),'board',.12)
 for k in range(12):
  for x in(-6.4,6.4):box('Soldered peripheral',(x,-2.7+k*.48,-.08),(.45,.21,.16),'silicon',.02)
 # Background is deliberately a different value/color from the main silver and amber parts.
 for x in(-10,10):
  box('Context rack',(x,7,3.3),(2.8,2,8),'dark')
  for z in range(8):
   box('Rack panel',(x,5.96,z*.72+.5),(2.4,.08,.5),'silicon',.015)
   box('Rack status',(x-.8,5.9,z*.72+.5),(.12,.03,.08),'signal',.006)
 def module(x,y=0,scale=1,name='Electrical processor'):
  box(name+' substrate',(x,y,.02),(2*scale,2*scale,.2),'dark')
  body=box(name,(x,y,.30),(1.8*scale,1.8*scale,.4),'silver',.07)
  box(name+' die',(x,y,.53),(.85*scale,.85*scale,.06),'silicon',.025)
  for k in range(6):
   box('Package contact',(x-.76*scale+k*.3*scale,y-.98*scale,.05),(.1*scale,.22*scale,.07),'copper',.005)
  return body
 def group_module(x,y=0,name='Optical converter'):
  before=set(s.objects);module(x,y,.67,name)
  root=bpy.data.objects.new(name+' group',None);s.collection.objects.link(root)
  for o in set(s.objects)-before:
   if o!=root:o.parent=root
  return root
 def tube(points,ma='cache',r=.095):wire(points,ma,r)
 def label(text,loc,size=.26,ma='white'):
  cu=bpy.data.curves.new('Engraved annotation','FONT');cu.body=text;cu.align_x='CENTER';cu.size=size;cu.extrude=.001
  o=bpy.data.objects.new(text,cu);s.collection.objects.link(o);o.location=loc;o.data.materials.append(mats[ma]);return o
 def local_pulse(o,delay=0):
  def f(t):o.scale.z=.55+.45*(.5+.5*math.sin(t*3+delay))
  anim.append(f)
 target=Vector((0,0,.7));cam0=Vector((9,-14,16));lens=48
 if kind in ('cluster','sync','network','ending'):
  # Four processors join a central switching node; after the exchange the next compute phase lights up.
  locs=[(-4,-1.6),(-4,1.6),(4,-1.6),(4,1.6)]
  center=module(0,0,1.0,'Network switch');label('EXCHANGE',(0,-1.45,.05),.32)
  for j,(x,y) in enumerate(locs):
   module(x,y,.76,'GPU node');status=box('Compute activity',(x,y,.76),(.55,.55,.07),'signal',.02)
   pts=[(x,y,.65),(x/2,y,.65),(x/2,0,.65),(0,0,.65)];tube(pts,'copper',.05)
   for k in range(3):
    o=ball('Result data',(x,y,.65),.12,'warm')
    def cycle(t,o=o,j=j,k=k,pts=pts,status=status):
     ph=(t+j*.3)%7;u=(ph-1.3-k*.36)/2.5;o.hide_render=not 0<=u<=1;o.location=path_at(pts,max(0,min(1,u)));status.hide_render=2.8<ph<5.4
    anim.append(cycle)
   if kind=='ending':tube([(x,y,.7),(x/2,y,.7),(x/2,0,.7),(0,0,.7)],'cache',.08)
  if kind=='network':
   for x in(-4,4):
    for z in range(3):box('Server chassis',(x,0,1.25+z*.52),(2.0,3.9,.38),'silver',.04)
  if kind=='sync':label('WAIT / EXCHANGE / COMPUTE',(0,-2.6,.05),.28)
 elif kind in ('copper','signal','speed','lanes'):
  module(-5);module(5);label('TX',(-5,-1.5,.1),.4);label('RX',(5,-1.5,.1),.4)
  pts=[(-4,0,.65),(-2,0,.65),(0,0,.65),(2,0,.65),(4,0,.65)];tube(pts,'copper',.10)
  if kind=='lanes':
   for j in range(7):
    y=-1.7+j*.54;pts=[(-4.1,y*.42,.5),(-3,y,.5),(3,y,.5),(4.1,y*.42,.5)];tube(pts,'copper',.055);packets(pts,2,4,'warm',start=j*.4)
   label('SPACE + POWER',(0,-2.6,.05),.35)
  else:
   # A chain of bars is a schematic signal trace, whose contrast reduces along a long electrical path.
   for k in range(40):
    x=-3.9+k*.2;o=box('Signal trace',(x,0,1.15),(.11,.10,.2),'warm',.025)
    def waveform(t,o=o,k=k,x=x):
     amplitude=.55*(1-.65*k/39);h=.18+amplitude*(.5+.5*math.sin(k*.6-t*5));o.dimensions.z=h;o.location.z=.95+h/2
    anim.append(waveform)
   for x in(-1.8,1.8):
    module(x,-1.5,.43,'Signal compensation');heat=box('Power burden',(x,-1.5,.66),(.42,.42,.06),'hot');local_pulse(heat,x)
   label('SIGNAL RECOVERY',(0,-2.55,.07),.30)
   if kind=='speed':
    opt=[(-4,1.9,.55),(4,1.9,.55)];tube(opt,'cache',.1);packets(opt,3,3,'signal');label('ELECTRICAL / OPTICAL',(0,2.65,.06),.3)
 elif kind in ('conversion','modulator','receiver','industry'):
  # Distinct transmitter, optical route and receiver; no optical computing claim.
  module(-5);module(5);group_module(-2.8);group_module(2.8)
  e1=[(-4.1,0,.6),(-2.8,0,.6)];op=[(-2.4,0,.6),(-1.5,0,.6),(1.5,0,.6),(2.4,0,.6)];e2=[(2.8,0,.6),(4.1,0,.6)]
  tube(e1,'copper',.07);tube(op,'cache',.12);tube(e2,'copper',.07)
  label('ELECTRICAL',(-4,-1.65,.07),.27,'warm');label('LIGHT',(0,-1.25,.07),.34,'signal');label('ELECTRICAL',(4,-1.65,.07),.27,'warm')
  label('MODULATOR',(-2.8,1.0,.07),.25);label('DETECTOR',(2.8,1.0,.07),.25)
  # A packet completes each phase in order, then the receiving die responds.
  for j in range(4):
   objs=[ball('Electrical input',e1[0],.13,'warm'),ball('Optical symbol',op[0],.15,'signal'),ball('Electrical output',e2[0],.13,'warm')]
   def convert(t,objs=objs,j=j):
    u=(t+j*1.2)%6
    for o,(start,end),path in zip(objs,[(0,1.2),(1.2,4.6),(4.6,6)],[e1,op,e2]):o.hide_render=not start<=u<end;o.location=path_at(path,max(0,min(1,(u-start)/(end-start))))
   anim.append(convert)
  if kind=='modulator':
   module(-2.8,2.4,.48,'External laser');tube([(-2.8,2.0,.5),(-2.8,0,.55)],'cache',.07);packets([(-2.8,2,.5),(-2.8,0,.55)],2,2,'signal');label('LASER',(-2.8,3,.1),.25)
  if kind=='receiver':
   for j in range(6):
    o=box('Recovered bits',(4.7+j*.16,-.45,.8),(.1,.12,.3),'warm');anim.append(lambda t,o=o,j=j:setattr(o,'scale',(1,1,.3+.7*(math.sin(t*4+j)>0))))
  if kind=='industry':label('SWITCH / CPU I-O DEMONSTRATION',(0,-2.7,.08),.30)
 elif kind in ('wdm','split'):
  module(-5);module(5);group_module(-2.6,name='Wavelength multiplexer');group_module(2.6,name='Wavelength demultiplexer')
  # One physical center fiber; colored symbols occupy that same route at different times.
  tube([(-2.2,0,.65),(2.2,0,.65)],'silver',.12)
  for j,ma in enumerate(('signal','warm','violet')):
   y=(j-1)*1.3;left=[(-4.3,y*.5,.65),(-3.1,y,.65),(-2.2,0,.65)];right=[(2.2,0,.65),(3.1,y,.65),(4.3,y*.5,.65)]
   tube(left,ma,.05);tube(right,ma,.05)
   pts=left+[(2.2,0,.65)]+right[1:]
   for k in range(2):
    o=ball('Independent wavelength data',pts[0],.13,ma)
    anim.append(lambda t,o=o,j=j,k=k,pts=pts:setattr(o,'location',path_at(pts,(t/7+j*.12+k*.5)%1)))
  label('MULTIPLEX',(-2.6,-2.1,.08),.32);label('ONE FIBER',(0,1,.08),.28);label('DEMULTIPLEX',(2.6,-2.1,.08),.3)
 elif kind in ('pluggable','cpo','compare','repair','thermal'):
  # ASIC on the left, front-edge pluggable on the right; the optical engine migrates only in the comparison shots.
  module(-3,0,1.65,'Switch ASIC');front=group_module(4.8,name='Front optical module')
  box('Front panel',(5.9,0,.6),(.20,5.4,1.5),'silver',.03)
  for y in(-1.8,-.9,.9,1.8):box('Empty front port',(5.76,y,.7),(.08,.58,.52),'dark',.01)
  move=kind in('cpo','compare');startx=4.8
  bars=[box('Electrical board segment',(-1.5+k*.22,0,.25),(.18,.12,.035),'copper',.01) for k in range(27)]
  # Separate optical route visibly extends when conversion moves closer to ASIC.
  fiber=rod('Optical route',(4.8,0,.6),(7,0,.6),.105,'cache');packet=ball('Optical symbol',(4.8,0,.6),.15,'signal')
  def colocate(t):
   f=smooth((t-D*.22)/(D*.45)) if move else 0;x=4.8-5.0*f;front.location.x=-5*f
   for k,o in enumerate(bars):o.hide_render=o.location.x>x
   p=Vector((x+.4,0,.6));q=Vector((7,0,.6));fiber.location=(p+q)/2;fiber.dimensions.z=(q-p).length;packet.location=p.lerp(q,(t/3)%1)
  anim.append(colocate)
  label('ASIC',(-3,-2.0,.1),.4);label('ELECTRICAL TO OPTICAL',(1,-2.2,.07),.29,'warm')
  if kind=='repair':
   box('Removed spare module',(2.7,2.3,.55),(1.3,1.3,.55),'silver')
   label('SERVICE + ALIGNMENT',(0,3,.08),.32)
  if kind=='thermal':
   group_module(-3,2.5,name='External laser');tube([(-3,2.2,.65),(-3,1.4,.65),(-1,1.4,.65),(0,0,.65)],'cache',.06)
   for j in range(8):box('Cooling fin',(-3.9+j*.25,0,1.15),(.07,1.8,.65),'silver',.015)
   for x in(-3.5,-3,-2.5):packets([(x,0,1.4),(x,0,2.4),(x+.5,0,3)],2,4,'hot',r=.065)
   label('THERMAL MANAGEMENT',(0,-2.8,.07),.3)
 elif kind=='layers':
  module(-4,0,1.2,'Compute package')
  for x in(-5.4,-2.6):
   for j in range(4):box('HBM stack',(x,.3,.22+j*.13),(.7,.8,.10),'cache',.015)
  module(4,0,1.2,'Remote compute')
  route=[(-3.05,-.65,.43),(-2,-1.2,.43),(2,-1.2,.43),(3.05,-.65,.43)];tube(route,'cache',.08);packets(route,3,3,'signal')
  label('NEAR MEMORY',(-4,-2,.08),.32);label('SERVER NETWORK',(2,-2,.08),.32)
 else:
  # Everyday interface in foreground, connected to several back-end compute boxes.
  box('Display stand',(0,-1,.5),(.45,.45,1.6),'silver');box('Display frame',(0,-1,2.2),(5,.35,2.8),'dark',.12)
  screen=box('Display surface',(0,-1.2,2.2),(4.55,.07,2.35),'silicon',.035)
  for j in range(5):
   row=box('Generated answer',(0,-1.26,2.95-j*.36),(3.8,.03,.09),'signal',.015)
   anim.append(lambda t,o=row,j=j:setattr(o,'scale',(max(.015,smooth((t-j*.8)/3)),1,1)))
  for x in(-4,4):
   module(x,1.5,.8);pts=[(x,1.5,.7),(x,3,.7),(0,3,.7),(0,0,.7)];tube(pts,'cache',.06);packets(pts,3,4,'signal')
 # Recompose the same assets vertically instead of placing a landscape clip in a portrait frame.
 if portrait:
  root=bpy.data.objects.new('Portrait composition',None);s.collection.objects.link(root)
  for o in list(s.objects):
   if o.type=='FONT':o.hide_render=True
   if o!=root and o.parent is None:o.parent=root
  root.rotation_euler.z=math.pi/2
  cam0=Vector((1,-10,19));target=Vector((0,0,.4))
 for loc,power,size,col in [((-5,-8,12),2600,7,(1,.83,.63)),((8,4,10),3000,6,(.64,.83,1)),((-6,8,6),1900,5,(1,.68,.38))]:
  bpy.ops.object.light_add(type='AREA',location=loc);l=bpy.context.object;l.data.energy=power;l.data.size=size;l.data.color=col;l.rotation_euler=(target-l.location).to_track_quat('-Z','Y').to_euler()
 bpy.ops.object.camera_add(location=cam0);cam=bpy.context.object;s.camera=cam;cam.data.type='ORTHO';cam.data.ortho_scale=17.5 if portrait else 17
 def update(scene):
  t=(scene.frame_current-1)/FPS
  for fn in anim:fn(t)
  progress=smooth(t/max(D,1));cam.data.ortho_scale=(17.5 if portrait else 17)*(1-.045*progress)
  cam.location=cam0+Vector((.15*math.sin(t*.12),0,.15*progress));cam.rotation_euler=(target-cam.location).to_track_quat('-Z','Y').to_euler()
 bpy.app.handlers.frame_change_pre.append(update);s.frame_start=1;s.frame_end=round((min(D,a.test_seconds) if a.test_seconds else D)*FPS);return s
for seg in plan['segments']:
 if a.shots and seg['id']not in a.shots.split(','):continue
 path=folder/(seg['id']+('-test' if a.test_seconds else '')+'.mp4')
 if path.exists()and not a.force and not a.preview:print('EXISTS',path,flush=True);continue
 s=make(seg)
 if a.preview:
  for fraction in(.15,.65):
   s.frame_set(max(1,round(s.frame_end*fraction)));s.render.image_settings.file_format='PNG';s.render.filepath=str(folder/(seg['id']+f'-{int(fraction*100)}.png'));bpy.ops.render.render(write_still=True)
 else:
  s.render.image_settings.file_format='FFMPEG';s.render.ffmpeg.format='MPEG4';s.render.ffmpeg.codec='H264';s.render.ffmpeg.constant_rate_factor='HIGH';s.render.ffmpeg.ffmpeg_preset='GOOD';s.render.filepath=str(path);bpy.ops.render.render(animation=True)
 print('COMPLETE',a.variant,seg['id'],seg['duration'],flush=True)
