"""Original illustrative geometry; no measured thermal/airflow simulation or reference assets."""
import bpy,sys,math,json,argparse,random
from pathlib import Path
from mathutils import Vector
p=argparse.ArgumentParser();p.add_argument('--cache',type=Path,required=True);p.add_argument('--variant',choices=['long','short','ice'],default='long');p.add_argument('--shots');p.add_argument('--preview',action='store_true');p.add_argument('--force',action='store_true');a=p.parse_args(sys.argv[sys.argv.index('--')+1:]);FPS=24
plan=json.loads((a.cache/(a.variant+'-plan.json')).read_text());folder=a.cache/('3d-'+a.variant);folder.mkdir(parents=True,exist_ok=True)
def smooth(x):x=max(0,min(1,x));return x*x*(3-2*x)
def make(seg):
 bpy.app.handlers.frame_change_pre.clear();bpy.ops.wm.read_factory_settings(use_empty=True);s=bpy.context.scene
 s.render.engine='BLENDER_EEVEE_NEXT';s.eevee.taa_render_samples=12;s.render.resolution_x=plan['width'];s.render.resolution_y=plan['height'];s.render.resolution_percentage=100;s.render.fps=FPS
 s.view_settings.view_transform='AgX';s.view_settings.look='AgX - Medium High Contrast';s.world=bpy.data.worlds.new('World');s.world.use_nodes=True;s.world.node_tree.nodes['Background'].inputs[0].default_value=(.13,.18,.22,1);s.world.node_tree.nodes['Background'].inputs[1].default_value=.32
 anim=[];mats={};sid=seg['id'];D=seg['duration'];portrait=a.variant!='long';rng=random.Random(42)
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
 if a.variant=='ice':
  s.eevee.taa_render_samples=32;s.eevee.use_raytracing=False
  s.world.node_tree.nodes['Background'].inputs[1].default_value=.16
  # Local procedural surfaces: no external textures or reference-video assets.
  for name,lo,hi,scale in [('stone',(.09,.085,.075),(.38,.35,.29),5),('soil',(.035,.018,.008),(.18,.10,.045),8),('grass',(.035,.055,.011),(.18,.22,.055),16)]:
   nt=mats[name].node_tree;bs=nt.nodes.get('Principled BSDF');noise=nt.nodes.new('ShaderNodeTexNoise');noise.inputs['Scale'].default_value=scale;noise.inputs['Detail'].default_value=5
   ramp=nt.nodes.new('ShaderNodeValToRGB');ramp.color_ramp.elements[0].color=(*lo,1);ramp.color_ramp.elements[1].color=(*hi,1);nt.links.new(noise.outputs['Fac'],ramp.inputs[0]);nt.links.new(ramp.outputs['Color'],bs.inputs['Base Color'])
  for material in (mats['stone'],mats['soil'],mats['grass']):
   nt=material.node_tree;position=nt.nodes.new('ShaderNodeNewGeometry')
   for node in tuple(nt.nodes):
    if node.bl_idname=='ShaderNodeTexNoise':nt.links.new(position.outputs['Position'],node.inputs['Vector'])
    if node.bl_idname=='ShaderNodeBump':node.inputs['Strength'].default_value=.16;node.inputs['Distance'].default_value=.025
  nt=mats['ice'].node_tree;bs=nt.nodes.get('Principled BSDF');bs.inputs['Base Color'].default_value=(.72,.9,.94,1);bs.inputs['Metallic'].default_value=0;bs.inputs['Roughness'].default_value=.1;bs.inputs['Transmission Weight'].default_value=.18;bs.inputs['Coat Weight'].default_value=.35;bs.inputs['IOR'].default_value=1.31
  noise=nt.nodes.new('ShaderNodeTexNoise');noise.inputs['Scale'].default_value=7;noise.inputs['Detail'].default_value=3;bump=nt.nodes.new('ShaderNodeBump');bump.inputs['Strength'].default_value=.06;bump.inputs['Distance'].default_value=.015;nt.links.new(noise.outputs['Fac'],bump.inputs['Height']);nt.links.new(bump.outputs['Normal'],bs.inputs['Normal'])
  box('Landscape',(0,0,-.65),(26,28,.6),'soil',.25);floor=box('Sloping stone floor',(0,0,-.09),(5.6,11,.35),'stone',.07);floor.rotation_euler.x=.03
  # Illustrative open cutaway: near wall and half the earth cover omitted deliberately.
  for y in range(11):
   for z in range(3):box('Masonry wall',(-2.72,-5+y,.3+z*.45),(.50,.94,.43),'stone',.04)
  for y in(-4.8,-2.4,0,2.4,4.8):
   for k in range(15):
    theta=(k+.5)*math.pi/15;o=box('Vault voussoir',(2.68*math.cos(theta),y,1.2+2.68*math.sin(theta)),(.59,.45,.48),'stone',.025);o.rotation_euler.y=math.pi/2-theta
  for k in range(7):
   theta=(k+.5)*math.pi/14+math.pi/2
   o=box('Earth cover section',(3.18*math.cos(theta),0,1.2+3.18*math.sin(theta)),(.82,10.9,.75),'soil',.09);o.rotation_euler.y=math.pi/2-theta
   g=box('Grass cap',(3.59*math.cos(theta),0,1.2+3.59*math.sin(theta)),(.83,10.9,.12),'grass',.06);g.rotation_euler.y=math.pi/2-theta
  for y in(-3,0,3):
   # Open vent: four stone side walls, visibly open top.
   for x in(-.35,.35):box('Vent side',(x,y,4.22),(.16,.8,1.3),'stone')
   for dy in(-.35,.35):box('Vent side',(0,y+dy,4.22),(.7,.16,1.3),'stone')
  for y in(-3.2,-1.7,-.2,1.3,2.8):
   for x in(-1.5,-.2,1.1):
    for z in range(2):
     o=box('Stored winter ice',(x,y,.40+z*.6),(1.12,1.3,.54),'ice',.13);o.rotation_euler.z=rng.uniform(-.045,.045)
     if sid=='winter':
      original=o.location.copy()
      anim.append(lambda t,o=o,v=original:setattr(o,'location',v+Vector((0,-6*(1-smooth(t/6)),0))))
  # Drain channel visibly exits downslope, never represented as a sealed refrigeration loop.
  wire([(2.25,4.8,.14),(2.25,-5,.0),(2.25,-7,-.4)],'dark',.11)
  if sid in('drain','iceending'):
   box('Shallow meltwater channel',(2.25,-1,.1),(.13,8,.035),'water',.025)
   packets([(1.8,3,.25),(2.25,3,.2),(2.25,-5,.05),(2.25,-7,-.3)],7,4,'water',r=.095)
  if sid in('vent','iceending'):
   for y in(-3,0,3):packets([(0,y,2.3),(0,y,3.4),(0,y,5.7)],3,3.1,'warm',r=.085)
  if sid=='insulation':
   for y in(-3,0,3):packets([(-6,y,7),(-3.2,y,4),(-5,y,4.9)],4,4,'warm',r=.11)
  target=Vector((0,0,1.6));cam0=Vector((12,-16,11));lens=44
  if sid=='winter':target=Vector((0,-.7,.7));cam0=Vector((6,-8,4));lens=42
  if sid=='insulation':target=Vector((-1,0,2.8));cam0=Vector((7,-7,6));lens=40
  if sid=='drain':target=Vector((1.65,-2,.4));cam0=Vector((5.3,-7,2.6));lens=48
  if sid=='vent':target=Vector((0,-.4,3.7));cam0=Vector((5.5,-7,7));lens=43
 else:
  context();target=Vector((0,0,1));cam0=Vector((10,-14,12));lens=48
  close=sid in('contacts','bumps','hybrid','precision');stacked=sid not in('distance','analogy','energy','layout','daily','system')
  if sid in('distance','analogy','energy','layout','daily','system'):
   left=chip((-2.7,0,.32),'cache',.80);right=chip((2.7,0,.32),'silicon',.80)
   for j in range(4):
    y=-.8+j*.53;pts=[(-1.5,y,.13),(-1.1,y-1,.13),(1.1,y-1,.13),(1.5,y,.13)];wire(pts,r=.035);packets(pts,2,2.8)
   if sid=='layout':
    for j in range(1,4):chip((-2.7,0,.32+j*.25),'cache',.80)
   if sid in('daily','system'):
    box('User display',(0,2.3,3.5),(6.5,.30,3.6),'silver',.12);box('Display glass',(0,2.11,3.5),(6.15,.06,3.25),'dark',.10);rod('Monitor stand',(0,2.3,.2),(0,2.3,1.7),.16,'silver')
    for j in range(6):
     line=box('Illustrative response line',(-.1,2.04,4.6-j*.37),(4.8-j*.23,.025,.075),'signal',.02)
     anim.append(lambda t,o=line,j=j:setattr(o,'hide_render',t<1+j*1.3))
    target=Vector((0,1,2));cam0=Vector((10,-16,12));lens=42
   if sid=='analogy':
    for x in(-2.7,2.7):
     for z in range(3):box('Office analogy floor',(x,0,1+z*.75),(2.7,3,.12),'silver');
    for x in(-3.9,-1.5,1.5,3.9):rod('Office analogy column',(x,1.1,.45),(x,1.1,3),.07,'silver')
  elif close:
   low=chip((0,0,.3),'cache');up=chip((0,0,2.1),'silicon');target=Vector((0,0,1));cam0=Vector((5,-9,5.7));lens=53
   # Two matching grids, not nonsensical pins that float away from their parent dies.
   for x in range(7):
    for y in range(6):
     loc=((x-3)*.39,(y-2.5)*.40)
     for parent,dz in((low,.20 if sid in('hybrid','precision')else .25),(up,-.13 if sid in('hybrid','precision')else -.18)):
      o=rod('Copper bonding contact',(loc[0],loc[1],dz-.04),(loc[0],loc[1],dz+.04),.068,'copper');o.parent=parent
   if sid in('hybrid','precision'):
    for parent,z in((low,.20),(up,-.13)):
     o=box('Dielectric bonding layer',(0,0,z),(2.95,2.75,.045),'silver',.008);o.parent=parent
   def bond(t):
    f=smooth((t-2)/max(3,D*.55));up.location.z=2.1-(1.47 if sid in('hybrid','precision')else 1.29)*f
    if sid=='precision':up.location.x=.40*(1-smooth(t/3))
   anim.append(bond)
  else:
   bottom=chip((0,0,.32),'cache');top=chip((0,0,1.08),'silicon');layergap=.76
   if sid in('hook','stack','ending'):
    def stack(t):
     f=smooth((t-1)/max(4,D*.45));top.location=Vector((3.2*(1-f),0,.32+f*.76))
    anim.append(stack)
   if sid in('heat','thermal','amd','ending'):
    plate=coolplate(2.3 if sid!='amd'else 1.5)
    if sid=='thermal':
     for i in range(2):chip((0,0,1.7+i*.56),'silicon')
     plate.location.z=3.45
    # Heat markers show direction only, not a temperature or quantitative heat map.
    for x in(-.8,0,.8):packets([(x,0,.52),(x,0,plate.location.z),(x,0,plate.location.z+1.3),(x+.6,0,plate.location.z+2)],3,4,'hot',r=.08)
   if sid=='amd':
    # Earlier order appears left; central stack has cache below compute, cooler above.
    oldbase=chip((-3.1,.5,.32),'silicon',.5);oldcache=chip((-3.1,.5,.80),'cache',.5)
   if sid=='yield':
    rod('Inspection mast',(-3,1,-.2),(-3,1,4),.18,'silver');box('Inspection arm',(-1.5,1,4),(3.2,.5,.45),'silver');probe=box('Inspection head',(0,0,3.5),(.65,.65,.7),'silicon')
    anim.append(lambda t:setattr(probe,'location',(.7*math.sin(t*.7),.5*math.cos(t*.7),3.5)))
   if sid in('industry','yield'):target.z=1.4
   for j in range(4):
    x=-1+j*.66;pts=[(x,-1,.48),(x,-1,1.02)];wire(pts,r=.035);packets(pts,1,1.5,start=(1+max(4,D*.45) if sid in('hook','stack','ending')else 0))
 if portrait and a.variant!='ice':
  cam0=Vector((10,-16,15));lens=43
  if sid in('contacts','bumps','hybrid','precision'):cam0=Vector((6,-10,6.5));lens=47
 # Soft warm key and cool edge separate metal/stone from the darker background.
 for loc,power,size,col in [((-5,-8,12),2600,7,(1,.83,.63)),((8,4,10),3000,6,(.64,.83,1)),((-6,8,6),1900,5,(1,.68,.38))]:
  bpy.ops.object.light_add(type='AREA',location=loc);l=bpy.context.object;l.data.energy=power;l.data.size=size;l.data.color=col;l.rotation_euler=(target-l.location).to_track_quat('-Z','Y').to_euler()
 bpy.ops.object.camera_add(location=cam0);cam=bpy.context.object;s.camera=cam;cam.data.lens=lens
 def update(scene):
  t=(scene.frame_current-1)/FPS
  for fn in anim:fn(t)
  # Restrained move; comparison and bonding keep a stable viewpoint.
  drift=0 if sid in('contacts','hybrid','precision','amd','stack')else .035*math.sin(math.pi*t/max(D,1))
  cam.location=cam0+Vector((drift*cam0.y,0,.10*math.sin(t*.16)))
  if a.variant=='ice':cam.location=target+(cam.location-target)*(1-.07*smooth(t/max(D,1)))
  cam.rotation_euler=(target-cam.location).to_track_quat('-Z','Y').to_euler()
 bpy.app.handlers.frame_change_pre.append(update);s.frame_start=1;s.frame_end=round(D*FPS);return s
for seg in plan['segments']:
 if a.shots and seg['id']not in a.shots.split(','):continue
 path=folder/(seg['id']+'.mp4')
 if path.exists()and not a.force and not a.preview:print('EXISTS',path,flush=True);continue
 s=make(seg)
 if a.preview:
  for fraction in(.15,.65):
   s.frame_set(max(1,round(s.frame_end*fraction)));s.render.image_settings.file_format='PNG';s.render.filepath=str(folder/(seg['id']+f'-{int(fraction*100)}.png'));bpy.ops.render.render(write_still=True)
 else:
  s.render.image_settings.file_format='FFMPEG';s.render.ffmpeg.format='MPEG4';s.render.ffmpeg.codec='H264';s.render.ffmpeg.constant_rate_factor='HIGH';s.render.ffmpeg.ffmpeg_preset='GOOD';s.render.filepath=str(path);bpy.ops.render.render(animation=True)
 print('COMPLETE',a.variant,seg['id'],seg['duration'],flush=True)
