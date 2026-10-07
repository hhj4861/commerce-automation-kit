"""Original full-screen architectural cutaway and spring-isolation film.
Conceptual geometry and deliberately slowed/exaggerated motion, not engineering simulation.
Blender 4.5 / EEVEE. No frame-image cache: each shot encodes directly to H.264.
"""
import bpy,math,json,argparse,sys,subprocess,datetime
from pathlib import Path
from mathutils import Vector
from bpy.app.handlers import persistent
p=argparse.ArgumentParser();p.add_argument('--cache',type=Path,required=True);p.add_argument('--preview',action='store_true');p.add_argument('--shots',default='all');p.add_argument('--samples',type=int,default=32);a=p.parse_args(sys.argv[sys.argv.index('--')+1:]);C=a.cache;V=C/'v2'
for d in ['qa','clips','logs']:(V/d).mkdir(parents=True,exist_ok=True)
TL=json.loads((V/'timeline.json').read_text());FPS=24
bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
s=bpy.context.scene;s.render.engine='BLENDER_EEVEE_NEXT';s.render.resolution_x=1080;s.render.resolution_y=1920;s.render.resolution_percentage=100;s.render.fps=FPS;s.render.image_settings.color_mode='RGB';s.render.film_transparent=False
s.view_settings.view_transform='AgX';s.view_settings.look='AgX - Medium High Contrast';s.render.image_settings.file_format='PNG'
s.world.use_nodes=True;s.world.node_tree.nodes['Background'].inputs[0].default_value=(.025,.06,.10,1);s.world.node_tree.nodes['Background'].inputs[1].default_value=.35
if hasattr(s,'eevee'):
 s.eevee.taa_render_samples=a.samples
 if hasattr(s.eevee,'use_raytracing'):s.eevee.use_raytracing=False
M={};objects={};springs=[]
def mat(name,col,rough=.5,metal=0,noise=.0,emit=0):
 m=bpy.data.materials.new(name);m.use_nodes=True;n=m.node_tree.nodes;l=m.node_tree.links;b=n.get('Principled BSDF');b.inputs['Base Color'].default_value=(*col,1);b.inputs['Roughness'].default_value=rough;b.inputs['Metallic'].default_value=metal
 if noise:
  t=n.new('ShaderNodeTexNoise');t.inputs['Scale'].default_value=65;t.inputs['Detail'].default_value=2;r=n.new('ShaderNodeValToRGB');r.color_ramp.elements[0].position=.12;r.color_ramp.elements[0].color=tuple(v*.64 for v in col)+(1,);r.color_ramp.elements[1].position=.9;r.color_ramp.elements[1].color=tuple(min(v*1.15,1)for v in col)+(1,);l.new(t.outputs['Fac'],r.inputs[0]);l.new(r.outputs[0],b.inputs['Base Color']);bump=n.new('ShaderNodeBump');bump.inputs['Strength'].default_value=.17;bump.inputs['Distance'].default_value=noise;l.new(t.outputs['Fac'],bump.inputs['Height']);l.new(bump.outputs['Normal'],b.inputs['Normal'])
 if emit:b.inputs['Emission Color'].default_value=(*col,1);b.inputs['Emission Strength'].default_value=emit
 M[name]=m;return m
mat('concrete',(.17,.24,.29),.7,noise=.04);mat('edge',(.34,.47,.5),.4,.3);mat('shell',(.79,.62,.39),.5,noise=.018);mat('cream',(.88,.74,.53),.55,noise=.01);mat('wood',(.42,.19,.068),.36,noise=.012);mat('velvet',(.19,.045,.028),.85);mat('steel',(.46,.53,.56),.28,.8,noise=.002);mat('brass',(.68,.38,.115),.24,.82);mat('black',(.013,.025,.035),.7);mat('amber',(.95,.39,.055),.35,.2,emit=2);mat('cyan',(.04,.48,.7),.35,.25,emit=1.3);mat('skin',(.61,.37,.20),.7)
def root(name):
 o=bpy.data.objects.new(name,None);s.collection.objects.link(o);objects[name]=o;return o
H=root('hall');INNER=root('inner');INNER.parent=H;OUTER=root('outer');OUTER.parent=H
COMP=root('comparison');LEFT=root('rigid_mass');LEFT.parent=COMP;RIGHT=root('spring_mass');RIGHT.parent=COMP;BASEL=root('left_base');BASEL.parent=COMP;BASER=root('right_base');BASER.parent=COMP
AIR=root('air');AIR.parent=H;PULSE=root('pulse');PULSE.parent=H

def finish(o,name,material,parent=None):
 o.name=name;o.data.materials.append(M[material]);o.parent=parent;return o

def box(name,loc,dim,material,parent=None,bevel=.035):
 bpy.ops.mesh.primitive_cube_add(size=1,location=loc);o=bpy.context.object;o.dimensions=dim;bpy.ops.object.transform_apply(location=False,rotation=False,scale=True);finish(o,name,material,parent)
 if bevel:
  m=o.modifiers.new('Crafted edge','BEVEL');m.width=bevel;m.segments=3;o.modifiers.new('Weighted normals','WEIGHTED_NORMAL')
 return o

def cyl(name,loc,r,dep,material,parent=None,scale=(1,1,1),vertices=48):
 bpy.ops.mesh.primitive_cylinder_add(vertices=vertices,radius=r,depth=dep,location=loc);o=bpy.context.object;o.scale=scale;finish(o,name,material,parent);m=o.modifiers.new('Edge highlight','BEVEL');m.width=.025;m.segments=2
 for f in o.data.polygons:f.use_smooth=True
 return o

def curve(name,points,r,material,parent=None):
 data=bpy.data.curves.new(name,'CURVE');data.dimensions='3D';data.resolution_u=1;data.bevel_depth=r;data.bevel_resolution=3;sp=data.splines.new('POLY');sp.points.add(len(points)-1)
 for p,co in zip(sp.points,points):p.co=(*co,1)
 o=bpy.data.objects.new(name,data);s.collection.objects.link(o);finish(o,name,material,parent);return o

def band(name,rx,ry,z,h,th,material,parent,amin=0,amax=math.pi):
 verts=[];faces=[];steps=72
 for i in range(steps+1):
  t=amin+(amax-amin)*i/steps
  for radius,zz in [(0,z),(th,z),(0,z+h),(th,z+h)]:verts.append(((rx-radius)*math.cos(t),(ry-radius)*math.sin(t),zz))
 for i in range(steps):
  k=i*4;n=k+4;faces.extend([(k,n,n+2,k+2),(k+1,k+3,n+3,n+1),(k+2,n+2,n+3,k+3),(k,k+1,n+1,n)])
 faces.extend([(0,2,3,1),(steps*4,steps*4+1,steps*4+3,steps*4+2)])
 mesh=bpy.data.meshes.new(name);mesh.from_pydata(verts,[],faces);mesh.update();o=bpy.data.objects.new(name,mesh);s.collection.objects.link(o);finish(o,name,material,parent)
 for f in mesh.polygons:f.use_smooth=True
 m=o.modifiers.new('Ink-like edge highlights','BEVEL');m.width=.025;m.segments=2;return o

# Outer building fragment. Open front is a labelled sectional cut, not an open-air hall.
box('Outer structural slab',(0,0,.25),(12,8,.5),'concrete',OUTER,.09)
box('Plinth reveal',(0,0,-.12),(12.4,8.4,.18),'edge',OUTER,.05)
for x in [-5.55,5.55]:
 for y in [-2.7,3.4]:box('Outer concrete column',(x,y,4.35),(.58,.62,8.25),'concrete',OUTER,.055)
box('Back outer wall',(0,3.62,4.35),(11.6,.45,8.2),'concrete',OUTER,.07)
box('Upper back beam',(0,3.3,8.55),(11.9,.8,.6),'concrete',OUTER,.06)
for x in [-5.55,5.55]:box('Side upper beam',(x,.3,8.55),(.65,6.8,.6),'concrete',OUTER,.07)
for y in [-3.45,-1.5,.5,2.5]:box('Construction joint',(0,y,.506),(11.8,.018,.016),'edge',OUTER,.002)
# Independent inner hall shell, an oval with the viewer-facing wall removed.
cyl('Heavy inner hall floor',(0,0,2.38),1,.42,'shell',INNER,scale=(4.65,2.97,1),vertices=96)
band('Heavy curved inner shell',4.68,3.0,2.38,5.05,.23,'shell',INNER)
band('Acoustic cream inner lining',4.39,2.72,3.2,4.08,.1,'cream',INNER)
for j in range(46):
 t=.035+(math.pi-.07)*j/45;x=4.29*math.cos(t);y=2.63*math.sin(t)
 o=box('Carved acoustic rib',(x,y,5.59),(.045,.045,3.15),'cream',INNER,.012)
for k in range(3):
 rx=2.2+k*.73;ry=1.45+k*.49;z=2.69+k*.46
 band('Terraced seating deck',rx,ry,z,.20,.54,'wood',INNER)
 curve('Thin balcony brass trim',[(rx*math.cos(i*math.pi/60),ry*math.sin(i*math.pi/60),z+.26)for i in range(61)],.023,'brass',INNER)
 n=14+k*6
 for j in range(n):
  t=.12+(math.pi-.24)*j/(n-1);x=(rx-.27)*math.cos(t);y=(ry-.23)*math.sin(t)
  seat=box('Audience seat',(x,y,z+.34),(.24,.24,.12),'velvet',INNER,.018);seat.rotation_euler.z=t-math.pi/2
  back=box('Seat back',(x+.08*math.cos(t),y+.08*math.sin(t),z+.55),(.23,.08,.38),'velvet',INNER,.02);back.rotation_euler.z=t-math.pi/2
  # Low-detail audience heads provide scale without becoming a separate visual topic.
  bpy.ops.mesh.primitive_uv_sphere_add(segments=8,ring_count=4,radius=.075,location=(x,y,z+.75));finish(bpy.context.object,'Audience silhouette','black',INNER)
cyl('Central wooden stage',(0,-.63,2.77),1,.17,'wood',INNER,scale=(1.1,.8,1))
cyl('Acoustic reflector',(0,.18,6.85),1,.13,'cream',INNER,scale=(1.6,1.12,1),vertices=72)
for x in [-.9,.9]:curve('Reflector suspension',[(x,.18,6.9),(x,.18,7.68)],.013,'steel',INNER)
box('Musician silhouette',(0,-.6,3.15),(.14,.14,.58),'black',INNER,.03)
bpy.ops.mesh.primitive_uv_sphere_add(segments=12,ring_count=8,radius=.11,location=(0,-.6,3.57));finish(bpy.context.object,'Musician head','skin',INNER)
curve('Music stand',[(.25,-.4,2.86),(.25,-.4,3.45)],.014,'black',INNER);box('Music score',(.25,-.4,3.48),(.3,.22,.02),'cream',INNER,.01)
# Spring groups: multiple helical coils between load spreader plates.
def spring_group(x,y,bottom,top,parent_top,parent_base,name,r=.23,group=True):
 offsets=[(-.31,-.18),(.31,-.18),(0,.28)] if group else [(0,0)]
 box(name+' bottom plate',(x,y,bottom-.075),(1.35,1.18,.15),'steel',parent_base,.035)
 box(name+' load plate',(x,y,top+.075),(1.35,1.18,.15),'steel',parent_top,.035)
 for dx,dy in [(-.52,-.43),(.52,-.43),(-.52,.43),(.52,.43)]:
  cyl('Hex fixing bolt',(x+dx,y+dy,bottom+.025),.055,.1,'brass',parent_base,vertices=6)
 for dx,dy in offsets:
  turns=5;pts=[]
  for j in range(181):
   u=j/180;t=u*turns*math.tau;pts.append((x+dx+r*math.cos(t),y+dy+r*math.sin(t),bottom+(top-bottom)*u))
  o=curve(name+' helical steel coil',pts,.047,'steel',parent_base);springs.append((o,x+dx,y+dy,bottom,top,r,turns,parent_top,parent_base))
for x in [-3.05,3.05]:
 for y in [-1.46,1.46]:spring_group(x,y,.66,2.03,INNER,OUTER,'Hall isolation group')
# Fine outer-edge accent keeps the architectural-webtoon palette without flat diagram boxes.
for x in [-5.55,5.55]:curve('Outer cut edge',[(x,-3,1),(x,-3,7.95)],.025,'cyan',OUTER)
# Comparison rigs: identical concrete masses, different support detail.
for x,top,base,kind in [(-3.3,LEFT,BASEL,'rigid'),(3.3,RIGHT,BASER,'spring')]:
 box(kind+' foundation',(x,0,.42),(5.2,4,.45),'concrete',base,.08)
 box(kind+' heavy room mass',(x,0,3.45),(4.25,3.0,1.28),'shell',top,.1)
 box(kind+' room floor reveal',(x,-.03,2.76),(4.48,3.17,.18),'brass',top,.04)
 # Architectural inset rather than an abstract untextured block.
 for xx in [-1.5,-.9,-.3,.3,.9,1.5]:box('Inset fluted panel',(x+xx,-1.516,3.5),(.29,.045,.82),'cream',top,.01)
 if kind=='spring':
  for xx in [-1.22,1.22]:spring_group(x+xx,-.18,.82,2.57,top,base,'Comparison spring',r=.22)
 else:
  for xx in [-1.22,1.22]:box('Rigid steel support',(x+xx,-.18,1.70),(.8,.9,1.8),'steel',top,.04)
# Stationary reference marks make relative mass movement readable without graph panels.
for x in [-3.3,3.3]:
 for y in [-1.7]:
  curve('Fixed movement reference',[(x-2.5,y,3.45),(x+2.5,y,3.45)],.018,'cyan',COMP)
# Vibration radiation intensity is illustrative; no measured amplitude is claimed.
compare_wave=[]
for x,parent,amp in [(-3.3,LEFT,1.0),(3.3,RIGHT,.22)]:
 for j in range(3):
  o=curve('Illustrative radiated vibration',[(0,0,0),(0,0,.1)],.014,'amber',COMP);compare_wave.append((o,x,amp,j))
# Light traces follow structural path, never a text-filled explainer panel.
trace=[]
for i in range(12):
 bpy.ops.mesh.primitive_uv_sphere_add(segments=12,ring_count=6,radius=.07,location=(0,0,0));o=finish(bpy.context.object,'Travelling structural vibration','amber',PULSE);trace.append(o)
wave=[]
for i in range(4):wave.append(curve('Airborne pressure wave',[(0,0,0),(0,0,.1)],.018,'cyan',AIR))
inside=[]
for i in range(3):inside.append(curve('Wall vibration radiated into the room',[(0,0,0),(0,0,.1)],.018,'cyan',H))
# Seamless charcoal blue studio ground with thin architectural line-work.
box('Ground',(0,0,-.46),(160,160,.18),'black',None,.0)
for typ,loc,color,power,size in [('AREA',(-8,-10,14),(1,.70,.38),2300,10),('AREA',(7,-3,9),(.31,.63,1),1800,8),('AREA',(0,8,12),(1,.40,.14),2600,7)]:
 bpy.ops.object.light_add(type=typ,location=loc);o=bpy.context.object;o.data.energy=power;o.data.color=color;o.data.shape='DISK';o.data.size=size;o.rotation_euler=(Vector((0,0,3.5))-o.location).to_track_quat('-Z','Y').to_euler()
bpy.ops.object.camera_add();cam=bpy.context.object;s.camera=cam;cam.data.type='PERSP';cam.data.lens=43;cam.data.clip_end=240
# Entire shot list follows unchanged narration timing.
def cap(prefix):return next(x['start']for x in TL['captions']if x['text'].startswith(prefix))
def beat(id):return next(x for x in TL['beats']if x['id']==id)['start']
shots=[('approach',beat('problem'),beat('transmission')),('transmission',beat('transmission'),beat('separate')),('cutaway',beat('separate'),cap('대공연장 아래에는')),('spring_detail',cap('대공연장 아래에는'),beat('mechanism')),('comparison',beat('mechanism'),cap('단단한 받침')),('rigid',cap('단단한 받침'),cap('스프링은')),('spring_action',cap('스프링은'),cap('무거운 방이')),('mass',cap('무거운 방이'),beat('limit')),('isolation',beat('limit'),cap('또 공기를')),('air',cap('또 공기를'),beat('payoff')),('closing',cap('이 공연장을 스프링'),cap('바깥의 흔들림이'))]
shots=[{'id':id,'startFrame':round(st*FPS),'endFrame':round(en*FPS),'frames':round(en*FPS)-round(st*FPS)}for id,st,en in shots]
(V/'shots.json').write_text(json.dumps(shots,indent=2))
SHOT=None

def descendants(r):
 yield r
 for o in r.children:yield from descendants(o)
def visible(r,value):
 for o in descendants(r):o.hide_render=not value

def lerp(a,b,u):return Vector(a).lerp(Vector(b),u)
def camera(pos,target,lens):cam.location=pos;cam.rotation_euler=(Vector(target)-cam.location).to_track_quat('-Z','Y').to_euler();cam.data.lens=lens

def update_springs():
 for o,x,y,z0,z1,r,turns,top,base in springs:
  dz0=base.location.z;dz1=top.location.z
  for j,p in enumerate(o.data.splines[0].points):
   u=j/(len(o.data.splines[0].points)-1);theta=u*turns*math.tau;p.co=(x+r*math.cos(theta),y+r*math.sin(theta),z0+(z1+dz1-dz0-z0)*u,1)
@persistent
def animate(scene):
 if not SHOT:return
 u=(scene.frame_current-1)/max(1,SHOT['frames']-1);t=(SHOT['startFrame']+scene.frame_current-1)/FPS;id=SHOT['id'];w=math.sin(t*7)
 comparison=id in ['comparison','rigid','spring_action','mass'];visible(H,not comparison);visible(COMP,comparison)
 visible(AIR,id=='air');visible(PULSE,id in ['approach','isolation'])
 OUTER.location.z=.028*w;INNER.location.z=.003*math.sin(t*7-.8)
 BASEL.location.z=.16*w;BASER.location.z=.16*w;LEFT.location.z=.16*w;RIGHT.location.z=.025*math.sin(t*7-.8)
 update_springs()
 if id=='approach':camera(lerp((12,-21,13),(9,-18,10.6),u),(0,0,4.0),43)
 elif id=='transmission':camera(lerp((6,-12,8.7),(3,-10,7.8),u),(0,1.1,4.5),48)
 elif id=='cutaway':camera(lerp((9,-17,10.6),(-7,-17,10.0),u),(0,.1,4.35),46)
 elif id=='spring_detail':camera(lerp((5.8,-8,3.15),(4.5,-6.5,2.55),u),(3.05,-1.46,1.45),64)
 elif id=='comparison':camera(lerp((10,-20,13),(8,-20,11.5),u),(0,0,2.1),42)
 elif id=='rigid':camera(lerp((-8.4,-9,5.6),(-7,-8.5,4.7),u),(-3.3,-.2,1.8),49)
 elif id=='spring_action':camera(lerp((7.8,-9,4.9),(6.9,-7.8,4.2),u),(3.3,-.1,1.75),51)
 elif id=='mass':camera(lerp((9,-20,11.5),(6.5,-19,10.5),u),(0,0,2.15),42)
 elif id=='isolation':camera(lerp((-9,-17,9.8),(-6,-17,8.8),u),(0,0,3.9),46)
 elif id=='air':camera(lerp((9,-18,11),(-5,-19,11),u),(0,0,4),43)
 else:camera(lerp((7,-16,9),(11,-22,13),u),(0,0,4),45)
 for o,x,amp,j in compare_wave:
  o.hide_render=id not in ['comparison','mass']
  q=(t*.65+j/3)%1;radius=(.12+q*.8)*amp
  pts=[(x+radius*math.cos(k*math.tau/48),-1.7-q*.65,3.7+radius*math.sin(k*math.tau/48))for k in range(49)]
  sp=o.data.splines[0]
  if len(sp.points)!=len(pts):sp.points.add(len(pts)-len(sp.points))
  for pp,co in zip(sp.points,pts):pp.co=(*co,1)
 for j,o in enumerate(inside):
  o.hide_render=id!='transmission'
  q=(t*.6+j/3)%1;radius=.15+q*.65;pts=[(radius*math.cos(k*math.tau/48),2.5-q*3.0,4.1+radius*math.sin(k*math.tau/48))for k in range(49)]
  sp=o.data.splines[0]
  if len(sp.points)!=len(pts):sp.points.add(len(pts)-len(sp.points))
  for pp,co in zip(sp.points,pts):pp.co=(*co,1)
 path=[(-5.55,-2.7,.6),(-5.55,-2.7,7.8),(-5.55,3.3,7.8),(5.55,3.3,7.8)]
 lengths=[(Vector(b)-Vector(a)).length for a,b in zip(path,path[1:])];total=sum(lengths)
 for j,o in enumerate(trace):
  dist=(t*3+j*total/len(trace))%total
  for aa,bb,ll in zip(path,path[1:],lengths):
   if dist<ll:o.location=lerp(aa,bb,dist/ll);break
   dist-=ll
 for j,o in enumerate(wave):
  x=-7.8+((t*.7+j*.75)%3);points=[(x,-.2+1.5*math.sin(q),4.5+1.5*math.cos(q))for q in [(-.7+k/30*1.4)for k in range(31)]]
  sp=o.data.splines[0]
  if len(sp.points)!=len(points):sp.points.add(len(points)-len(sp.points))
  for pp,co in zip(sp.points,points):pp.co=(*co,1)
bpy.app.handlers.frame_change_pre.clear();bpy.app.handlers.frame_change_pre.append(animate)
for shot in shots:
 if a.shots!='all' and shot['id'] not in a.shots.split(','):continue
 SHOT=shot;s.frame_start=1;s.frame_end=shot['frames']
 if a.preview:
  s.render.resolution_percentage=65;s.frame_set(max(1,round(shot['frames']*.5)));s.render.image_settings.file_format='PNG';s.render.filepath=str(V/'qa'/(shot['id']+'.png'));bpy.ops.render.render(write_still=True)
 else:
  s.render.resolution_percentage=100;s.render.image_settings.file_format='FFMPEG';s.render.ffmpeg.format='MPEG4';s.render.ffmpeg.codec='H264';s.render.ffmpeg.constant_rate_factor='HIGH';s.render.ffmpeg.ffmpeg_preset='GOOD';s.render.filepath=str(V/'clips'/(shot['id']+'.mp4'))
  if Path(s.render.filepath).exists():
   f=Path(s.render.filepath)
   result=subprocess.run(['ffprobe','-v','error','-select_streams','v:0','-show_entries','stream=nb_frames,width,height','-of','json',str(f)],capture_output=True,text=True)
   valid=False
   if result.returncode==0:
    v=json.loads(result.stdout)['streams'][0];valid=int(v.get('nb_frames',0))==shot['frames'] and (v['width'],v['height'])==(1080,1920)
   if valid:print('VERIFIED_CACHED',shot['id'],flush=True);continue
   archive=V/'aborted';archive.mkdir(exist_ok=True);f.rename(archive/(f.stem+'-'+datetime.datetime.now().strftime('%H%M%S')+f.suffix))
   print('INCOMPLETE_CLIP_ARCHIVED',shot['id'],flush=True)
  bpy.ops.render.render(animation=True)
 print('SHOT_COMPLETE',shot['id'],flush=True)
print('RENDER_COMPLETE',flush=True)
