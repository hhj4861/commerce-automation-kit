"""Original architectural mechanism reconstruction; dimensions/timing are illustrative."""
import bpy,math,json,sys,argparse
from pathlib import Path
from mathutils import Vector
from bpy.app.handlers import persistent
p=argparse.ArgumentParser();p.add_argument('--cache',type=Path,required=True);p.add_argument('--preview',action='store_true');p.add_argument('--shots',default='all');a=p.parse_args(sys.argv[sys.argv.index('--')+1:]);C=a.cache;TL=json.loads((C/'timeline.json').read_text());FPS=24
bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
s=bpy.context.scene;s.render.engine='BLENDER_EEVEE_NEXT';s.render.resolution_x=1080;s.render.resolution_y=1920;s.render.resolution_percentage=100;s.render.fps=FPS;s.eevee.taa_render_samples=16;s.eevee.use_raytracing=False;s.view_settings.view_transform='AgX';s.view_settings.look='AgX - Medium High Contrast';s.world.use_nodes=True;s.world.node_tree.nodes['Background'].inputs[0].default_value=(.14,.23,.32,1);s.world.node_tree.nodes['Background'].inputs[1].default_value=.45
M={}
def mat(n,col,metal=0,rough=.45,emit=0):
 m=bpy.data.materials.new(n);m.use_nodes=True;b=m.node_tree.nodes.get('Principled BSDF');b.inputs['Base Color'].default_value=(*col,1);b.inputs['Roughness'].default_value=rough;b.inputs['Metallic'].default_value=metal
 if emit:b.inputs['Emission Color'].default_value=(*col,1);b.inputs['Emission Strength'].default_value=emit
 M[n]=m;return m
for n,c,m,r in [('glass',(.035,.20,.30),.65,.22),('cream',(.83,.70,.48),.0,.8),('steel',(.15,.22,.26),.8,.3),('stone',(.40,.47,.48),0,.85),('wall',(.59,.65,.62),0,.8),('wood',(.35,.17,.06),0,.45),('dark',(.024,.047,.059),0,.5),('paper',(.88,.83,.70),0,.8),('green',(.075,.19,.10),0,.75)]:mat(n,c,m,r)
mat('ray',(1,.53,.08),emit=2);mat('heat',(.80,.13,.025),emit=.5)
# Fine woven surface and alternating triangular planes catch the amber light.
m=M['cream'];nt=m.node_tree;n=nt.nodes.new('ShaderNodeTexNoise');n.inputs['Scale'].default_value=130;b=nt.nodes.new('ShaderNodeBump');b.inputs['Strength'].default_value=.16;b.inputs['Distance'].default_value=.018;nt.links.new(n.outputs['Fac'],b.inputs['Height']);nt.links.new(b.outputs['Normal'],nt.nodes.get('Principled BSDF').inputs['Normal'])
def mesh(n,vs,fs,m):
 d=bpy.data.meshes.new(n);d.from_pydata(vs,[],fs);d.update();o=bpy.data.objects.new(n,d);s.collection.objects.link(o);o.data.materials.append(M[m]);return o

def box(n,loc,dim,m,bevel=.025):
 bpy.ops.mesh.primitive_cube_add(size=1,location=loc);o=bpy.context.object;o.name=n;o.dimensions=dim;bpy.ops.object.transform_apply(location=False,rotation=False,scale=True);o.data.materials.append(M[m])
 if bevel:b=o.modifiers.new('edge','BEVEL');b.width=bevel;b.segments=2;o.modifiers.new('normal','WEIGHTED_NORMAL')
 return o

def line(n,pts,r,m):
 d=bpy.data.curves.new(n,'CURVE');d.dimensions='3D';d.bevel_depth=r;d.bevel_resolution=1;sp=d.splines.new('POLY');sp.points.add(len(pts)-1)
 for v,co in zip(sp.points,pts):v.co=(*co,1)
 o=bpy.data.objects.new(n,d);s.collection.objects.link(o);o.data.materials.append(M[m]);return o

def ball(n,loc,r,m):
 bpy.ops.mesh.primitive_uv_sphere_add(segments=12,ring_count=6,radius=r,location=loc);o=bpy.context.object;o.name=n;o.data.materials.append(M[m]);return o

def shade(n,center,r,normal=(0,-1,0)):
 # Six triangular folding membranes with fixed outer support topology.
 normal=Vector(normal);right=Vector((-normal.y,normal.x,0));up=Vector((0,0,1));center=Vector(center)
 o=mesh(n,[(0,0,0)]*18,[(j*3,j*3+1,j*3+2) for j in range(6)],'cream');seam=o.modifiers.new('fabric seams','WIREFRAME');seam.thickness=.012;seam.use_replace=False;wire=o.modifiers.new('thin fabric thickness','SOLIDIFY');wire.thickness=.014
 for j in range(6):
  q=center+right*(r*math.cos(j*math.tau/6))+up*(r*math.sin(j*math.tau/6));line(n+' support',[center-normal*.40,q-normal*.06],.012,'steel')
 ball(n+' hub',center,.05,'steel')
 return(o,center,right,up,normal,r)
def fold(obj,spread):
 o,c,right,up,no,r=obj
 for j in range(6):
  angle=j*math.tau/6;rad=r*(.16+.84*spread);depth=.12+.55*(1-spread)
  for k,pt in enumerate([c+no*depth,c+right*(rad*math.cos(angle))+up*(rad*math.sin(angle)),c+right*(rad*math.cos(angle+math.tau/6))+up*(rad*math.sin(angle+math.tau/6))]):o.data.vertices[j*3+k].co=pt
 o.data.update()
# Two detailed rounded towers, external shade on three quadrants, north facade bare.
tower=[];towerobjects=[]
start=set(bpy.data.objects)
for cx,cy in [(-2.5,2),(4,6)]:
 bpy.ops.mesh.primitive_cylinder_add(vertices=48,radius=2.4,depth=19,location=(cx,cy,9.5));o=bpy.context.object;o.data.materials.append(M['glass'])
 for z in range(1,20):line('curved floor reveal',[(cx+2.42*math.cos(i*math.tau/48),cy+2.42*math.sin(i*math.tau/48),z)for i in range(49)],.026,'steel')
 for j in range(24):
  ang=j*math.tau/24;line('mullion',[(cx+2.43*math.cos(ang),cy+2.43*math.sin(ang),0),(cx+2.43*math.cos(ang),cy+2.43*math.sin(ang),19)],.023,'steel')
 for j in range(12):
  ang=math.pi*.75+j*math.pi*1.5/11;normal=(math.cos(ang),math.sin(ang),0)
  for row in range(10):tower.append((shade('tower shading module',(cx+2.8*normal[0],cy+2.8*normal[1],1.0+row*1.8),.88,normal),ang))
 box('entrance',(cx,cy-2.0,.8),(2,.7,1.6),'glass')
for x,y,w,h in [(-9,8,3,5),(11,13,4,8),(-10,18,4,10),(15,21,5,13)]:
 box('neighbouring city',(x,y,h/2),(w,w,h),'stone',.06)
 for z in range(1,h):box('city windows',(x,y-w/2-.01,z),(w*.8,.02,.22),'glass',0)
box('plaza',(0,4,-.25),(50,50,.5),'stone')
for x in range(-8,11,3):
 line('tree trunk',[(x,-2,0),(x,-2,2.5)],.075,'wood');ball('tree crown',(x,-2,2.8),.7,'green')
for x,y in [(-1,-3),(2,-4),(5,-2)]:
 box('pedestrian',(x,y,.65),(.18,.18,.6),'dark');ball('head',(x,y,1.08),.14,'cream')
towerobjects=list(set(bpy.data.objects)-start)
# Close-up of one room; transparent window is represented by mullions and a slim glass rim.
start=set(bpy.data.objects)
box('office slab',(0,1.5,-.15),(7,7,.3),'stone');box('office back',(0,4.9,1.7),(7,.2,3.7),'wall');box('office side',(-3.45,1.5,1.7),(.18,7,3.7),'wall')
for x in [-3,-1,1,3]:line('window mullion',[(x,-1.7,0),(x,-1.7,3.5)],.032,'steel')
for z in [0,3.5]:line('window frame',[(-3.1,-1.7,z),(3.1,-1.7,z)],.035,'steel')
for x in [-1.7,1.7]:
 box('oak desk',(x,1.4,.85),(2.1,1.3,.10),'wood')
 for dx in [-.85,.85]:
  for dy in [-.45,.45]:box('desk leg',(x+dx,1.4+dy,.4),(.06,.06,.8),'steel')
 box('monitor',(x,1.6,1.2),(.75,.08,.45),'dark');box('keyboard',(x,1.02,.915),(.65,.22,.025),'paper');box('chair seat',(x,2.4,.55),(.65,.6,.12),'dark');box('chair back',(x,2.7,.98),(.65,.08,.75),'dark');line('chair stem',[(x,2.4,.1),(x,2.4,.5)],.07,'steel')
box('ceiling AC unit',(1,4.75,2.9),(1.5,.24,.36),'paper')
for x in [2.8]:line('plant stem',[(x,3.8,0),(x,3.8,1.4)],.035,'green');ball('leaves',(x,3.8,1.5),.45,'green')
roomshades=[]
for x in [-2,0,2]:
 for z in [.95,2.65]:roomshades.append(shade('external folding shade',(x,-2.18,z),1.02))
rays=[];incoming=[]
for i in range(7):
 x=-2.5+i*.8;incoming.append(line('incoming sunlight',[(x,-5,4.5),(x,-2.25,2.0)],.018,'ray'));rays.append(line('transmitted sunlight',[(x,-2.25,2.0),(x,.2,.06)],.018,'ray'))
heat=box('warmed floor',(0,.4,.02),(5.8,1.7,.025),'heat',0)
officeobjects=list(set(bpy.data.objects)-start)
# Lighting and moving camera.
ld=bpy.data.lights.new('warm sun','SUN');sun=bpy.data.objects.new('warm sun',ld);s.collection.objects.link(sun);ld.energy=2.8;ld.color=(1,.82,.60);ld.angle=.09;sun.rotation_euler=(math.radians(32),math.radians(-18),math.radians(-25))
ld=bpy.data.lights.new('cool fill','AREA');o=bpy.data.objects.new('cool fill',ld);s.collection.objects.link(o);o.location=(1,-5,10);ld.energy=1300;ld.shape='DISK';ld.size=8;ld.color=(.66,.81,1)
ld=bpy.data.lights.new('warm interior','AREA');o=bpy.data.objects.new('warm interior',ld);s.collection.objects.link(o);o.location=(0,3,3.4);ld.energy=150;ld.size=4;ld.color=(1,.78,.52)
cd=bpy.data.cameras.new('camera');cam=bpy.data.objects.new('camera',cd);s.collection.objects.link(cam);s.camera=cam;cd.lens=43;cd.clip_end=400
state={'id':'problem','D':10}
def ease(x):x=max(0,min(1,x));return x*x*(3-2*x)
def look(pos,target,lens=43):cam.location=pos;cam.rotation_euler=(Vector(target)-cam.location).to_track_quat('-Z','Y').to_euler();cd.lens=lens
@persistent
def update(scene):
 t=(scene.frame_current-1)/FPS;u=min(1,t/state['D']);id=state['id'];wide=id in ['hook','follow','ending']
 for o in towerobjects:o.hide_render=not wide
 for o in officeobjects:o.hide_render=wide
 if wide:
  az=-math.pi/2+u*math.pi if id=='follow' else -math.pi/3
  for obj,ang in tower:fold(obj,ease((math.cos(ang-az)-.05)*2))
  if id=='follow':look((13-6*u,-21,13+3*u),(0,3,10),40)
  elif id=='ending':look((9+5*u,-17-6*u,12+3*u),(0,3,9.5),43)
  else:look((9,-20,12+u*2),(-1,3,10),43)
  sun.rotation_euler.z=az+.2
 else:
  spread=0 if id=='problem'else ease((u-.08)/.34)if id=='shade'else 1
  for obj in roomshades:fold(obj,spread)
  for i,o in enumerate(rays):o.hide_render=(id=='limit')or(u<.12 if id=='problem'else spread>.70)
  for o in incoming:o.hide_render=id=='limit' or (id=='problem' and u<.12)
  heat.hide_render=id=='limit' or (spread>.75) or (id=='problem' and u<.42)
  if id=='shade' and u<.5:look((5.5-2*u,-8,4.0),(.1,-1.6,1.7),43)
  else:look((7-1.5*u,-9,6.3),(0,1.1,1.15),43)
  sun.rotation_euler.z=-.45
bpy.app.handlers.frame_change_pre.clear();bpy.app.handlers.frame_change_pre.append(update)
for beat in TL['beats']:
 if a.shots!='all' and beat['id']not in a.shots.split(','):continue
 if beat['id']=='hook':continue
 state.update(id=beat['id'],D=beat['duration']);s.frame_start=1;s.frame_end=round(beat['duration']*FPS)
 if a.preview:
  for frac in ([.15,.6,.9] if beat['id']=='shade'else[.55]):
   s.frame_set(max(1,round(frac*s.frame_end)));s.render.image_settings.file_format='PNG';s.render.filepath=str(C/'qa'/f"{beat['id']}-{frac}.png");bpy.ops.render.render(write_still=True)
 else:
  target=C/'clips'/(beat['id']+'.mp4')
  if target.exists():raise RuntimeError('Existing clip; inspect before overwrite '+str(target))
  s.render.image_settings.file_format='FFMPEG';s.render.ffmpeg.format='MPEG4';s.render.ffmpeg.codec='H264';s.render.ffmpeg.constant_rate_factor='MEDIUM';s.render.ffmpeg.ffmpeg_preset='GOOD';s.render.filepath=str(target);s.frame_set(1);bpy.ops.render.render(animation=True);print('DONE',beat['id'],flush=True)
