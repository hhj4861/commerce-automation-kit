"""Falkirk architectural look-development: one continuous place, three cameras.
Original illustrative geometry. No borrowed imagery, physics claim or API calls.
Run in Blender 4.5; output path is mandatory. Static keyframes; --build-only exposes this same scene to the motion renderer.
"""
import argparse, hashlib, json, math, random, sys
from pathlib import Path
sys.dont_write_bytecode = True
import bpy
from mathutils import Vector
p=argparse.ArgumentParser();p.add_argument('--out',type=Path,required=True);p.add_argument('--shot',choices=['all','site','entry','water'],default='all');p.add_argument('--percent',type=int,default=50);p.add_argument('--samples',type=int,default=48)
p.add_argument('--build-only',action='store_true')
a=p.parse_args(sys.argv[sys.argv.index('--')+1:]);a.out.mkdir(parents=True,exist_ok=True)
random.seed(4109)
S=bpy.context.scene;bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
S.render.engine='CYCLES';S.cycles.samples=a.samples;S.cycles.use_denoising=True;S.cycles.max_bounces=6;S.cycles.transparent_max_bounces=6
try:
 pref=bpy.context.preferences.addons['cycles'].preferences;pref.compute_device_type='METAL';pref.get_devices()
 for d in pref.devices:d.use=d.type=='METAL'
 S.cycles.device='GPU'
except (TypeError,RuntimeError): pass
S.render.resolution_x=1080;S.render.resolution_y=1920;S.render.resolution_percentage=a.percent;S.render.fps=24
S.render.image_settings.file_format='PNG';S.render.film_transparent=False
S.view_settings.view_transform='AgX';S.view_settings.look='AgX - Medium High Contrast';S.view_settings.exposure=-.2
# Open daylight rather than a studio tabletop backdrop.
W=S.world;W.use_nodes=True;n=W.node_tree.nodes;n.clear();bg=n.new('ShaderNodeBackground');bg.inputs[1].default_value=.18
sky=n.new('ShaderNodeTexSky');sky.sky_type='NISHITA';sky.sun_elevation=math.radians(24);sky.sun_rotation=math.radians(125);sky.altitude=.15;sky.air_density=1.1;sky.dust_density=1.4;sky.sun_disc=False
out=n.new('ShaderNodeOutputWorld');W.node_tree.links.new(sky.outputs[0],bg.inputs[0]);W.node_tree.links.new(bg.outputs[0],out.inputs[0])
M={}
def mat(name,color,rough=.5,metal=0,texture=None,trans=0):
 m=bpy.data.materials.new(name);m.use_nodes=True;nt=m.node_tree;q=nt.nodes.get('Principled BSDF');q.inputs['Base Color'].default_value=(*color,1);q.inputs['Roughness'].default_value=rough;q.inputs['Metallic'].default_value=metal
 if trans:q.inputs['Transmission Weight'].default_value=trans;q.inputs['IOR'].default_value=1.333 if name=='water' else 1.45
 if texture:
  scale,distance=texture;t=nt.nodes.new('ShaderNodeTexNoise');t.inputs['Scale'].default_value=scale;t.inputs['Detail'].default_value=3;t.inputs['Roughness'].default_value=.7
  ramp=nt.nodes.new('ShaderNodeValToRGB');ramp.color_ramp.elements[0].color=tuple(v*.65 for v in color)+(1,);ramp.color_ramp.elements[1].color=tuple(min(1,v*1.12)for v in color)+(1,);nt.links.new(t.outputs['Fac'],ramp.inputs[0]);nt.links.new(ramp.outputs[0],q.inputs['Base Color'])
  b=nt.nodes.new('ShaderNodeBump');b.inputs['Distance'].default_value=distance;b.inputs['Strength'].default_value=.22;nt.links.new(t.outputs['Fac'],b.inputs['Height']);nt.links.new(b.outputs[0],q.inputs['Normal'])
 M[name]=m;return m
mat('structure',(.23,.27,.29),.42,.38,(8,.012));mat('steel edge',(.23,.27,.29),.28,.8,(35,.005));mat('dark',(.015,.025,.03),.38,.25);mat('rubber',(.012,.016,.018),.9)
mat('concrete',(.42,.41,.35),.88,texture=(4,.08));mat('stone',(.25,.28,.25),.86,texture=(5,.08));mat('path',(.37,.36,.30),.9,texture=(10,.05));mat('soil',(.12,.10,.056),.98,texture=(7,.05))
mat('grass',(.055,.11,.026),.94,texture=(.25,.04));mat('trunk',(.11,.063,.027),.95,texture=(8,.06))
for i,c in enumerate([(.09,.16,.04),(.14,.23,.06),(.2,.28,.08),(.11,.21,.08),(.28,.25,.065)]):mat('leaf'+str(i),c,.93)
mat('orange',(.8,.20,.055),.3,.23,(9,.006));mat('ivory',(.79,.74,.57),.46,.1,(15,.007));mat('glass',(.07,.14,.16),.13,.2,trans=.65);mat('wood',(.32,.12,.032),.56,texture=(14,.013));mat('brass',(.56,.31,.075),.25,.75)
mat('water',(.025,.075,.065),.095,.0,texture=(30,.005),trans=.12);mat('foam',(.62,.76,.70),.38);mat('wet edge',(.14,.18,.16),.32,.15)
mat('coat blue',(.025,.08,.19),.7);mat('coat red',(.45,.05,.025),.7);mat('skin',(.58,.36,.22),.7)
def finish(o,name,m,parent=None):o.name=name;o.data.materials.append(M[m]);o.parent=parent;return o
def mesh(name,vs,fs,m,parent=None):
 d=bpy.data.meshes.new(name);d.from_pydata(vs,[],fs);d.update();o=bpy.data.objects.new(name,d);S.collection.objects.link(o);return finish(o,name,m,parent)
def bevel(o,w=.04):
 b=o.modifiers.new('edge radius','BEVEL');b.width=w;b.segments=3;o.modifiers.new('weighted normals','WEIGHTED_NORMAL');return o
def box(name,loc,size,m,parent=None,b=.025):
 x,y,z=[v/2 for v in size];v=[(-x,-y,-z),(x,-y,-z),(x,y,-z),(-x,y,-z),(-x,-y,z),(x,-y,z),(x,y,z),(-x,y,z)];o=mesh(name,v,[(0,3,2,1),(4,5,6,7),(0,1,5,4),(1,2,6,5),(2,3,7,6),(3,0,4,7)],m,parent);o.location=loc
 return bevel(o,b) if b else o
def root(name):o=bpy.data.objects.new(name,None);S.collection.objects.link(o);return o
def line(name,points,r,m,parent=None):
 d=bpy.data.curves.new(name,'CURVE');d.dimensions='3D';d.resolution_u=2;d.bevel_depth=r;d.bevel_resolution=2;sp=d.splines.new('POLY');sp.points.add(len(points)-1)
 for p0,co in zip(sp.points,points):p0.co=(*co,1)
 o=bpy.data.objects.new(name,d);S.collection.objects.link(o);return finish(o,name,m,parent)
def rod(name,p0,p1,r,m,parent=None,verts=16):
 v=Vector(p1)-Vector(p0);bpy.ops.mesh.primitive_cylinder_add(vertices=verts,radius=r,depth=v.length,location=(Vector(p0)+Vector(p1))/2);o=finish(bpy.context.object,name,m,parent);o.rotation_euler=v.to_track_quat('Z','Y').to_euler()
 for f in o.data.polygons:f.use_smooth=True
 return o
def sphere(name,loc,scale,m,parent=None):
 bpy.ops.mesh.primitive_uv_sphere_add(segments=16,ring_count=8,radius=1,location=loc);o=finish(bpy.context.object,name,m,parent);o.scale=scale
 for f in o.data.polygons:f.use_smooth=True
 return o
def polygon_xz(name,points,y,depth,m,parent=None):
 vs=[(x,yy,z)for yy in [y-depth/2,y+depth/2]for x,z in points];N=len(points);fs=[tuple(range(N-1,-1,-1)),tuple(range(N,N*2))]+[(i,(i+1)%N,(i+1)%N+N,i+N)for i in range(N)];return bevel(mesh(name,vs,fs,m,parent),.055)
# Terrain carries the elevated approach; basin and waterfront continue beyond the camera.
def height(x,y):
 h=3+max(0,min(1,(y-25)/65))*26
 h+=math.sin(x*.035+y*.016)*1.3+math.sin(x*.076-y*.03)*.75
 if -36<x<36 and -105<y<23:return -.5
 return h
N=111;verts=[]
for j in range(N):
 y=-110+j*3
 for i in range(N):
  x=-165+i*3;verts.append((x,y,height(x,y)))
land=mesh('continuous landscaped terrain',verts,[(j*N+i,j*N+i+1,(j+1)*N+i+1,(j+1)*N+i)for j in range(N-1)for i in range(N-1)],'grass')
for f in land.data.polygons:f.use_smooth=True
box('basin floor',(0,-37,.1),(72,150,.4),'soil',b=0)
# Water: explicit small ripples plus bow disturbance; no fictitious drop in water level.
BOAT_Y=-8.3;BOW_Y=BOAT_Y+6.65;WATER_Z=2.0
water_verts=[];nx,ny=151,231
for j in range(ny):
 y=-105+j*(127/(ny-1))
 for i in range(nx):
  x=-35+i*(70/(nx-1));r=math.sqrt((x/1.3)**2+(y-BOW_Y)**2)
  z=WATER_Z+.012*math.sin(x*.72+y*.49)+.005*math.sin(y*1.05-x*.71)
  z+=.02*math.sin(r*2.2)*math.exp(-r*.35)*math.exp(-abs(x)*.07)
  water_verts.append((x,y,z))
water=mesh('basin ripples around entering bow',water_verts,[(j*nx+i,j*nx+i+1,(j+1)*nx+i+1,(j+1)*nx+i)for j in range(ny-1)for i in range(nx-1)],'water')
for f in water.data.polygons:f.use_smooth=True
# Walkways, masonry joints, wet waterline and safety rails establish scale.
for x in [-35.8,35.8]:
 box('stone retaining bank',(x,-39,1.15),(1.7,128,2.4),'stone',b=.08);box('waterside path',(x+(-2.8 if x<0 else 2.8),-39,2.48),(4.5,128,.22),'path')
 box('dark wet waterline',(x+(.86 if x<0 else -.86),-39,1.95),(.02,128,.23),'wet edge',b=0)
 for y in range(-99,23,3):
  rod('rail post',(x,y,2.55),(x,y,3.6),.045,'steel edge');box('coping joint',(x,y,2.37),(1.68,.035,.04),'dark',b=0)
 for z in [3.12,3.6]:line('continuous waterfront rail',[(x,-101,z),(x,23,z)],.04,'steel edge')
box('rear basin bank',(0,22,1.2),(72,1.6,2.6),'stone');box('rear pedestrian path',(0,24.2,2.65),(70,3,.25),'path')
# Tree crowns are instanced organic clusters, not single polygon blobs.
protos=[]
for k in range(5):
 vs=[];faces=[]
 for leaf in range(1600):
  pos=Vector((random.uniform(-1,1),random.uniform(-1,1),random.uniform(-1,1)))
  if pos.length>1:continue
  normal=Vector((random.uniform(-1,1),random.uniform(-1,1),random.uniform(-1,1))).normalized();axis=normal.cross(Vector((0,0,1))).normalized();other=normal.cross(axis);size=random.uniform(.085,.17);idx=len(vs)
  vs.extend([pos-axis*size,pos+other*size*.4,pos+axis*size,pos-other*size*.4]);faces.extend([(idx,idx+1,idx+2),(idx,idx+2,idx+3)])
 d=bpy.data.meshes.new('porous leaf canopy');d.from_pydata(vs,[],faces);d.update();d.materials.append(M['leaf'+str(k)]);protos.append(d)
for n in range(290):
 x=random.uniform(-100,100);y=random.uniform(22,145)
 if abs(x)<40 and y<28:continue
 if abs(x)<12 and y<125:continue
 z=height(x,y);h=random.uniform(4.3,8.8)
 rod('woodland trunk',(x,y,z),(x+.3,y,z+h*.77),.12,'trunk',verts=8)
 for k in range(5):
  o=bpy.data.objects.new('leaf canopy',protos[(n+k)%5]);S.collection.objects.link(o);o.location=(x+random.uniform(-1.5,1.5),y+random.uniform(-1.5,1.5),z+h*.6+random.uniform(-.5,1.8));o.scale=(h*.29,h*.26,h*.32)
# Wheel axis along Y, two level troughs at opposite ends.
CENTER=15.5;RADIUS=13.5;FRONT=-4;REAR=17
for yy in [FRONT,REAR]:
 arm=root('wheel arm front' if yy==FRONT else 'wheel arm rear')
 polygon_xz('tapered arm web',[(-2.4,4),(-1.8,10),(-2,18),(-3.8,26),(-1.1,27),(2.6,20),(2.7,13),(1.1,6)],yy,1.05,'structure',arm)
 # Opposing broad crescent ends, the distinctive architectural silhouette.
 for zc,rot in [(2,math.pi),(29,0)]:
  points=[]
  for j in range(65):
   ang=math.radians(-65+j*285/64)+rot;points.append((5.95*math.cos(ang),zc+5.95*math.sin(ang)))
  for j in range(64,-1,-1):
   ang=math.radians(-65+j*285/64)+rot;points.append((4.82*math.cos(ang),zc+4.82*math.sin(ang)))
  polygon_xz('sculpted crescent arm',points,yy,1.05,'structure',arm)
  line('crescent edge seam',[(x,yy-.54,z)for x,z in points[:65]],.026,'steel edge',arm)
 rod('axle bearing',(0,yy-.72,CENTER),(0,yy+.72,CENTER),1.45,'steel edge',arm,32)
 for k in range(16):
  angle=k*math.tau/16;rod('bearing fastener',(1.17*math.cos(angle),yy-.8,CENTER+1.17*math.sin(angle)),(1.17*math.cos(angle),yy-.92,CENTER+1.17*math.sin(angle)),.075,'structure',arm,8)
rod('central axle',(0,-4.7,CENTER),(0,20.5,CENTER),1.15,'structure',verts=48)
# Fixed support is behind the rotating rear face.
for x in [-4.3,4.3]:
 polygon_xz('fixed tapered support',[(x-1.4,1),(x+1.4,1),(1.5 if x>0 else -1.5,15.5),(0,16)],20.5,3,'concrete')
box('mechanical enclosure',(0,21.9,15.3),(7,3,4.2),'concrete',b=.12)
for j in range(10):box('motor-room ventilation',(-2.5+j*.54,20.35,15.3),(.23,.04,1.7),'dark',b=.005)

def trough(z):
 box('gondola bottom',(0,6.5,z-1.35),(6.9,21,1),'structure',b=.2)
 for x in [-3.5,3.5]:
  box('gondola side',(x,6.5,z-.35),(.32,21,1.1),'structure',b=.06)
  for y in range(-3,18,2):
   rod('gondola railing',(x,y,z+.12),(x,y,z+1.15),.045,'steel edge')
  for h in [.62,1.15]:line('gondola rail',[(x,-3.7,z+h),(x,17,z+h)],.04,'steel edge')
 for y in [-3.6,16.5]:
  line('gondola rotating bearing',[(4.5*math.cos(t*math.tau/96),y,z+4.5*math.sin(t*math.tau/96))for t in range(97)],.16,'steel edge')
 if z>10:
  box('upper trough water',(0,6.5,z),(6.5,20.6,.035),'water',b=0)
  box('closed far gate',(0,-3.8,z-.3),(6.5,.15,1.25),'steel edge')
trough(2);trough(29)
# Open entrance retains a common water level. The lowered gate is underwater.
box('lowered gate',(0,-4.7,.95),(6.3,.3,.5),'steel edge')
for x in [-3.12,3.12]:
 box('entry guide pier',(x,-5.1,1.4),(.7,1.1,2.3),'concrete',b=.1)
 box('fender strip',(x+(.38 if x<0 else -.38),-5.1,2.05),(.12,.85,.8),'rubber')
 rod('yellow mooring bollard',(x,-5.1,2.6),(x,-5.1,3),.1,'brass')
# Upper aqueduct reaches into the hillside; varied piers, ribs and railings.
box('high aqueduct floor',(0,54,27.8),(7.5,74,1.7),'concrete',b=.16);box('upper canal surface',(0,54,29),(6.2,74,.04),'water',b=0)
for x in [-3.65,3.65]:
 box('high aqueduct wall',(x,54,28.9),(.45,74,1.55),'concrete',b=.06)
 for y in range(18,91,3):rod('aqueduct safety post',(x,y,29.7),(x,y,30.8),.048,'steel edge')
 for h in [30.25,30.8]:line('upper walkway handrail',[(x,17,h),(x,91,h)],.035,'steel edge')
for y in [29,44,59,74]:
 ground=height(7,y)
 for x in [-2.7,2.7]:rod('aqueduct supporting pier',(x,y,ground),(x,y,27.4),.63,'concrete',verts=24)
 box('aqueduct cross beam',(0,y,26.8),(8.2,1.1,1.3),'concrete')
# Same boat in all three shots; detail proportional to the nearby human scale.
B=root('same orange canal boat');B.location=(0,BOAT_Y,2.05)
outline=[(-1.15,-6),(-1.25,4.6),(-.74,6.1),(0,6.65),(.74,6.1),(1.25,4.6),(1.15,-6)]
vs=[(x,y,z)for z in [-.8,.7]for x,y in outline];n=len(outline)
hull=mesh('shaped displacement hull',vs,[tuple(range(n-1,-1,-1)),tuple(range(n,n*2))]+[(i,(i+1)%n,(i+1)%n+n,i+n)for i in range(n)],'orange',B);bevel(hull,.12)
line('black rubbing strake',[(x,y,.52)for x,y in outline+[outline[0]]],.09,'rubber',B)
box('cabin floor',(0,-.6,.76),(2.12,8.6,.16),'wood',B,b=.04)
for x in [-1.025,1.025]:
 box('lower cabin side',(x,-.6,.95),(.10,8.6,.37),'ivory',B,b=.035)
 box('upper cabin fascia',(x,-.6,2.15),(.10,8.6,.17),'ivory',B,b=.035)
 for y in [-4.85,-3.05,-1.65,-.25,1.15,2.55,3.65]:box('cabin window pillar',(x,y,1.61),(.12,.13,1.02),'ivory',B,b=.022)
for y in [-3.7,-2.3,-.9,.5,1.9]:
 for x in [-.64,.64]:
  box('passenger seat',(x,y,1.02),(.55,.54,.20),'coat blue',B,b=.045)
  box('seat back',(x,y-.24,1.30),(.55,.13,.68),'coat blue',B,b=.045)
box('rear bulkhead',(0,-4.85,1.42),(2.04,.10,1.22),'ivory',B,b=.04)
box('rear door glazing',(0,-4.92,1.48),(.85,.025,.85),'glass',B,b=.025)
box('front console',(0,3.25,1.03),(1.85,.55,.33),'wood',B,b=.035)
for side in [-1,1]:
 for y in [-3.75,-2.35,-.95,.45,1.85]:
  box('window surround',(side*1.076,y,1.56),(.065,1.1,1.05),'steel edge',B,b=.035)
  box('reflective cabin glass',(side*1.115,y,1.57),(.018,.98,.93),'glass',B,b=.025)
  box('window divider',(side*1.13,y,1.57),(.024,.035,.93),'ivory',B,b=.008)
 for j in range(18):box('lower cabin plank seam',(side*1.067,-4.45+j*.47,.84),(.02,.02,.25),'wood',B,b=0)
roof=[]
for y in [-5.0,3.85]:
 for j in range(25):
  x=-1.2+j*.1;roof.append((x,y,2.21+.14*(1-(x/1.2)**2)))
ro=mesh('arched cabin roof',roof,[(j,j+1,j+26,j+25)for j in range(24)],'dark',B);sol=ro.modifiers.new('roof thickness','SOLIDIFY');sol.thickness=.08;bevel(ro,.025)
for y in [-3,-.5,2]:
 rod('roof mushroom vent',(0,y,2.31),(0,y,2.44),.13,'brass',B,24);sphere('vent cap',(0,y,2.43),(.20,.20,.055),'brass',B)
box('front cabin window',(0,3.71,1.6),(1.72,.04,1.03),'glass',B,b=.035)
for x in [-.85,.85]:
 line('bow safety rail',[(x,3.8,.8),(x,3.8,1.23),(x,5.5,1.23),(x*.5,6.05,1.05)],.038,'steel edge',B)
for j in range(9):box('bow deck timber',(-.72+j*.18,4.6,.75),(.165,1.56,.055),'wood',B,b=.008)
for x in [-1.25,1.25]:
 for y in [-4,1.6]:
  line('fender cord',[(x,y,1),(x+.06,y,.3)],.018,'ivory',B);sphere('rubber fender',(x+.06,y,.1),(.12,.14,.34),'rubber',B)
line('mooring rope coil',[(.35+.23*math.cos(j*.4),5.1+.23*math.sin(j*.4),.8+j*.0008)for j in range(100)],.018,'ivory',B)
# Subtle wake threads follow the hull; retained as separate objects for later motion.
for side in [-1,1]:
 for j in range(7):
  pts=[]
  for k in range(35):
   u=k/34;y=BOW_Y-.2-u*(5.5+j*.6);x=side*(.25+u*(1.7+j*.11));pts.append((x,y,2.045+.018*math.sin(u*19+j)))
  line('bow disturbance crest',pts,.009+j*.0004,'foam')
# Coherent continuous-space close view includes shore reflections and wake, no arrows.
# Sparse visitors supply a familiar scale in the establishing frame.
for k,(x,y) in enumerate([(-36,-7),(-37,-10),(36,3),(36,5)]):
 z=2.62;rod('visitor trousers',(x,y,z),(x,y,z+.75),.13,'dark');rod('visitor coat',(x,y,z+.7),(x,y,z+1.34),.22,'coat blue' if k%2 else 'coat red');sphere('visitor head',(x,y,z+1.57),(.15,.14,.2),'skin')
# Skylight plus large soft bounce in the entry area avoids a black toy-model silhouette.
d=bpy.data.lights.new('late afternoon sun','SUN');d.energy=2.4;d.angle=.08;d.color=(1,.90,.75);sun=bpy.data.objects.new('late afternoon sun',d);S.collection.objects.link(sun);sun.rotation_euler=(Vector((0,0,0))-Vector((-40,-70,90))).to_track_quat('-Z','Y').to_euler()
d=bpy.data.lights.new('soft waterside bounce','AREA');d.energy=600;d.color=(.78,.86,1);d.shape='DISK';d.size=15;o=bpy.data.objects.new('soft waterside bounce',d);S.collection.objects.link(o);o.location=(9,-24,16);o.rotation_euler=(Vector((0,-4,4))-o.location).to_track_quat('-Z','Y').to_euler()
d=bpy.data.cameras.new('scene camera');cam=bpy.data.objects.new('scene camera',d);S.collection.objects.link(cam);S.camera=cam
SHOTS={
 'site':{'camera':[-24,-48,20],'target':[0,6,17],'lens':34,'focus':[0,3,15],'fstop':11,'role':'facility, hillside, lower basin and elevated canal'},
 'entry':{'camera':[10,-32,5.0],'target':[0,-5,3.5],'lens':35,'focus':[0,-4,3.4],'fstop':8,'role':'same boat enters open lower gondola at water level'},
 'water':{'camera':[-3.0,2.3,3.0],'target':[-.45,-2.3,2.15],'lens':36,'focus':[-1.05,-2.5,2.1],'fstop':7.1,'role':'same bow, water contact and displacement disturbance'},
}
# Checks concern scene continuity and geometry, not aesthetic acceptance or CFD validity.
assert abs(B.location.z-2.05)<1e-5;assert WATER_Z==2;assert BOAT_Y+6.65>-4.7;assert len(SHOTS)==3
records=[]
for name,c in SHOTS.items():
 if a.build_only or a.shot not in ['all',name]:continue
 cam.location=c['camera'];cam.rotation_euler=(Vector(c['target'])-cam.location).to_track_quat('-Z','Y').to_euler();d.type='PERSP';d.lens=c['lens'];d.clip_end=1500;d.dof.use_dof=True;d.dof.focus_distance=(Vector(c['focus'])-cam.location).length;d.dof.aperture_fstop=c['fstop']
 S.render.filepath=str(a.out/(name+'.png'));bpy.ops.render.render(write_still=True)
 records.append(dict(shot=name,**c,file=str(a.out/(name+'.png')),sha256=hashlib.sha256((a.out/(name+'.png')).read_bytes()).hexdigest()))
manifest={'sourceHash':hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),'engine':S.render.engine,'samples':a.samples,'size':[round(1080*a.percent/100),round(1920*a.percent/100)],'world':'outdoor Nishita daylight','boatLocation':list(B.location),'waterLevel':WATER_Z,'shots':records,'limitations':['Illustrative proportions; not a surveyed or engineering model','Ripple/wake geometry is illustrative, not CFD','Keyframes only; motion continuity not yet rendered or approved'],'paidCalls':0}
(a.out/'manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2))
print('LOOKDEV_KEYFRAMES_DONE',json.dumps(manifest),flush=True)
