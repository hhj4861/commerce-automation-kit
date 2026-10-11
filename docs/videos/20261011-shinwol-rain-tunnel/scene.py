"""Original spatial reconstruction of a rainwater storage/drainage system, not a hydraulic simulation."""
import bpy,sys,math,json,argparse,random,hashlib,time
from pathlib import Path
from mathutils import Vector
P=argparse.ArgumentParser();P.add_argument('--cache',type=Path,required=True);P.add_argument('--shot',default='all');P.add_argument('--preview',action='store_true');P.add_argument('--preview-t',type=float,default=.48);P.add_argument('--samples',type=int,default=16);P.add_argument('--percent',type=int,default=100);a=P.parse_args(sys.argv[sys.argv.index('--')+1:]);C=a.cache;HERE=Path(__file__).parent
for d in ['clips','qa']:(C/d).mkdir(parents=True,exist_ok=True)
TL=json.loads((C/'timeline.json').read_text());story=json.loads((HERE/'story.json').read_text());assert story['openingStatus']=='user-approved-all-Blender-2026-10-11'
S=bpy.context.scene;FPS=24;M={};dynamic=[];updates=[]
def material(n,c,rough=.6,metal=0,noise=0,emit=0):
 m=bpy.data.materials.new(n);m.use_nodes=True;p=m.node_tree.nodes.get('Principled BSDF');p.inputs['Base Color'].default_value=(*c,1);p.inputs['Roughness'].default_value=rough;p.inputs['Metallic'].default_value=metal
 if emit:p.inputs['Emission Color'].default_value=(*c,1);p.inputs['Emission Strength'].default_value=emit
 if noise:
  nt=m.node_tree;t=nt.nodes.new('ShaderNodeTexNoise');t.inputs['Scale'].default_value=noise;t.inputs['Detail'].default_value=3;b=nt.nodes.new('ShaderNodeBump');b.inputs['Strength'].default_value=.27;b.inputs['Distance'].default_value=.035;nt.links.new(t.outputs['Fac'],b.inputs['Height']);nt.links.new(b.outputs[0],p.inputs['Normal'])
 M[n]=m;return m
def init():
 bpy.app.handlers.frame_change_pre.clear();bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False);updates.clear();dynamic.clear();M.clear()
 S.render.engine='BLENDER_EEVEE_NEXT';S.eevee.taa_render_samples=a.samples;S.render.resolution_x=1080;S.render.resolution_y=1920;S.render.resolution_percentage=a.percent;S.render.fps=FPS;S.render.film_transparent=False
 S.view_settings.view_transform='AgX';S.view_settings.look='AgX - Medium High Contrast';S.view_settings.exposure=.35
 S.world.use_nodes=True;S.world.node_tree.nodes['Background'].inputs[0].default_value=(.16,.22,.29,1);S.world.node_tree.nodes['Background'].inputs[1].default_value=.60
 for v in [('concrete',(.39,.42,.40),.86,0,7),('stone',(.22,.27,.28),.92,0,9),('road',(.047,.065,.075),.28,0,20),('line',(.73,.73,.61),.74),('steel',(.17,.24,.27),.28,.75,24),('orange',(.69,.24,.065),.38,.25,30),('wall',(.58,.50,.39),.87,0,12),('wallblue',(.23,.34,.39),.82,0,12),('glass',(.06,.19,.25),.18,.35),('soil',(.22,.16,.105),.92,0,10),('water',(.018,.105,.135),.12,.52,4),('foam',(.33,.72,.77),.38,.1,0,.4),('lamp',(1,.59,.18),.35,0,0,5),('red',(.62,.035,.02),.45),('leaf',(.13,.26,.19),.87),('white',(.82,.84,.80),.45),('mint',(.11,.79,.69),.38,0,0,.8)]:material(*v)
 # Subtle spatial albedo variation reinforces material identity without photo textures.
 for name in ['concrete','road','wall','wallblue','soil']:
  nt=M[name].node_tree;p=nt.nodes.get('Principled BSDF');base=tuple(p.inputs['Base Color'].default_value);tex=nt.nodes.new('ShaderNodeTexNoise');tex.inputs['Scale'].default_value=3 if name!='road' else 22;tex.inputs['Detail'].default_value=3
  ramp=nt.nodes.new('ShaderNodeValToRGB');ramp.color_ramp.elements[0].position=.18;ramp.color_ramp.elements[0].color=tuple(x*.68 for x in base[:3])+(1,);ramp.color_ramp.elements[1].position=.82;ramp.color_ramp.elements[1].color=tuple(min(1,x*1.12)for x in base[:3])+(1,);nt.links.new(tex.outputs['Fac'],ramp.inputs['Fac']);nt.links.new(ramp.outputs['Color'],p.inputs['Base Color'])
 p=M['water'].node_tree.nodes.get('Principled BSDF');p.inputs['Coat Weight'].default_value=.55;p.inputs['Coat Roughness'].default_value=.15
 d=bpy.data.lights.new('overcast sun','SUN');d.energy=2.8;d.angle=.22;o=bpy.data.objects.new('overcast sun',d);S.collection.objects.link(o);o.rotation_euler=(.5,-.35,-.6)
 d=bpy.data.cameras.new('camera');o=bpy.data.objects.new('camera',d);S.collection.objects.link(o);S.camera=o;d.lens=28;d.clip_end=500

def reg(o,n,m):o.name=n;o.data.materials.append(M[m]);return o
def box(n,p,dim,m,bevel=.035):
 bpy.ops.mesh.primitive_cube_add(size=1,location=p);o=reg(bpy.context.object,n,m);o.dimensions=dim;bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
 if bevel:b=o.modifiers.new('edge highlights','BEVEL');b.width=bevel;b.segments=2;o.modifiers.new('weighted normals','WEIGHTED_NORMAL')
 return o
def rod(n,p,q,r,m,vertices=16):
 p,q=Vector(p),Vector(q);bpy.ops.mesh.primitive_cylinder_add(vertices=vertices,radius=r,depth=(q-p).length,location=(p+q)/2);o=reg(bpy.context.object,n,m);o.rotation_euler=(q-p).to_track_quat('Z','Y').to_euler()
 for f in o.data.polygons:f.use_smooth=True
 return o
def sphere(n,p,dim,m):
 bpy.ops.mesh.primitive_uv_sphere_add(segments=24,ring_count=12,location=p);o=reg(bpy.context.object,n,m);o.scale=dim
 for f in o.data.polygons:f.use_smooth=True
 return o
def mesh(n,verts,faces,m):
 d=bpy.data.meshes.new(n);d.from_pydata(verts,[],faces);d.update();o=bpy.data.objects.new(n,d);S.collection.objects.link(o);return reg(o,n,m)
def area(n,p,t,power,col,size):
 d=bpy.data.lights.new(n,'AREA');d.energy=power;d.color=col;d.shape='DISK';d.size=size;o=bpy.data.objects.new(n,d);S.collection.objects.link(o);o.location=p;o.rotation_euler=(Vector(t)-o.location).to_track_quat('-Z','Y').to_euler()
def cam(p,t,lens=28):S.camera.location=p;S.camera.rotation_euler=(Vector(t)-Vector(p)).to_track_quat('-Z','Y').to_euler();S.camera.data.lens=lens
def move_cam(p1,p2,t1,t2,lens=28):
 def fn(t):u=t*t*(3-2*t);cam(Vector(p1).lerp(Vector(p2),u),Vector(t1).lerp(Vector(t2),u),lens)
 updates.append(fn)
def water(n,xwidth,ylen,z,center=(0,0),amp=.06):
 nx,ny=24,90;verts=[((i/nx-.5)*xwidth+center[0],(j/ny-.5)*ylen+center[1],z)for j in range(ny+1)for i in range(nx+1)];faces=[]
 for j in range(ny):
  for i in range(nx):k=j*(nx+1)+i;faces.append((k,k+1,k+nx+2,k+nx+1))
 o=mesh(n,verts,faces,'water')
 for f in o.data.polygons:f.use_smooth=True
 def update(t):
  for v,(x,y,zz)in zip(o.data.vertices,verts):v.co.z=z+amp*math.sin(y*2.3-t*35)*math.cos(x*1.7-t*5)+amp*.3*math.sin(y*5+x*2-t*20)
 updates.append(update);return o

def tube(n,r,length,center=(0,0,0),cut=False):
 # Tube axis Y. Cut version exposes the near/front half from +X viewing side.
 cx,cy,cz=center;N=64;start=math.pi/2 if cut else 0;span=math.pi if cut else math.tau
 verts=[]
 for y in [-length/2,length/2]:
  for i in range(N+1):th=start+i/N*span;verts.append((cx+r*math.cos(th),cy+y,cz+r*math.sin(th)))
 o=mesh(n,verts,[(i,i+1,i+N+2,i+N+1)for i in range(N)],'concrete');solid=o.modifiers.new('reinforced lining','SOLIDIFY');solid.thickness=.22
 for f in o.data.polygons:f.use_smooth=True
 for y in range(round(-length/2)+1,round(length/2),4):
  points=[(cx+(r-.025)*math.cos(start+i/N*span),cy+y,cz+(r-.025)*math.sin(start+i/N*span))for i in range(N+1)]
  curve=bpy.data.curves.new('segment joint','CURVE');curve.dimensions='3D';curve.bevel_depth=.025;curve.bevel_resolution=1;sp=curve.splines.new('POLY');sp.points.add(N)
  for pt,co in zip(sp.points,points):pt.co=(*co,1)
  ob=bpy.data.objects.new('concrete segment joint',curve);S.collection.objects.link(ob);reg(ob,'joint','steel')
 return o

def street(z=0,scale=1,rain=True):
 random.seed(56);box('street',(0,0,z-.14),(16,62,.26),'road',.02)
 for x in [-8,8]:box('sidewalk',(x,0,z+.04),(2.0,62,.22),'concrete')
 for y in range(-28,29,7):box('lane marking',(0,y,z+.006),(.14,3,.012),'line',0)
 for side in [-1,1]:
  for j in range(9):
   y=-26+j*6.5;h=random.uniform(7,15);x=side*13;mat='wall'if j%2 else 'wallblue';box('Seoul neighbourhood facade',(x,y,z+h/2),(8,5.7,h),mat,.07);box('roof coping',(x,y,z+h+.08),(8.15,5.85,.18),'concrete')
   # Roof equipment, facade bands, sill shadows and a ground-floor shop give human scale.
   box('rooftop utility',(x,y+.9,z+h+.6),(1.4,1.9,1.0),'steel',.05)
   for k in range(4):box('utility louvre',(x-side*.72,y+.35+k*.3,z+h+.6),(.04,.17,.7),'road',.003)
   for floor in range(1,int(h/2.5)):
    box('floor shadow band',(side*8.94,y,z+floor*2.5-.93),(.15,5.5,.10),'concrete',.01)
    for yy in [-1.8,0,1.8]:
     xx=side*8.96;box('recessed window',(xx,y+yy,z+floor*2.5),(.05,1.15,1.45),'glass',.01)
     box('window sill',(xx-side*.08,y+yy,z+floor*2.5-.75),(.24,1.28,.12),'concrete',.01)
     box('window mullion',(xx-side*.04,y+yy,z+floor*2.5),(.08,.045,1.44),'steel',.002)
   box('shop entrance',(side*8.94,y,z+1.05),(.09,1.15,1.95),'glass',.01)
   rod('door pull',(side*8.86,y+.38,z+.80),(side*8.86,y+.38,z+1.30),.025,'steel')
   box('shop awning',(side*8.45,y,z+2.5),(1.3,4.5,.13),'orange'if j%3==0 else 'steel')
 for side in [-1,1]:
  for yy in range(-28,29,2):box('pavement seam',(side*8,yy,z+.16),(1.9,.018,.009),'stone',0)
 for y in [-16,-5,6,17]:
  x=6.2;box('drain frame',(x,y,z+.025),(.8,1.4,.075),'steel',.02)
  for i in range(8):box('drain slot',(x,y-.58+i*.16,z+.071),(.62,.054,.012),'road',.002)
 for x,y in [(-7,0),(7,13),(-7,24)]:
  rod('streetlight',(x,y,z),(x,y,z+5),.075,'steel');rod('lamp arm',(x,y,z+5),(x*.76,y,z+5.4),.055,'steel');box('lamp',(x*.76,y,z+5.38),(.75,.32,.10),'lamp')
 cars=[]
 for x,y,col in [(-2.1,-13,'white'),(2.2,16,'orange')]:
  body=box('car body',(x,y,z+.7),(1.8,3.5,.7),col,.20);cab=box('car glass',(x,y-.15,z+1.26),(1.55,1.8,.65),'glass',.17);parts=[body,cab]
  for xx in [-.85,.85]:
   for yy in [-1.08,1.05]:parts.append(rod('car tyre',(x+xx-.10,y+yy,z+.43),(x+xx+.10,y+yy,z+.43),.35,'road'))
  cars.append((y,parts))
 if rain:
  drops=[]
  for i in range(170):
   x=random.uniform(-9,9);y=random.uniform(-28,28);zz=random.uniform(.7,16);o=rod('rain streak',(x,y,z+zz),(x+.06,y,z+zz+.24),.007,'foam',6);drops.append((o,z+zz))
  updates.append(lambda t:[setattr(o.location,'z',z+.5+(zz-z-t*75)%16)for o,zz in drops])
 return cars

def interior(fill=True):
 S.world.node_tree.nodes['Background'].inputs[1].default_value=.13
 tube('10m storage tunnel',5,85,(0,15,0));box('invert channel',(0,15,-4.88),(1.8,85,.13),'stone')
 for y in range(-23,54,8):
  box('maintenance lamp',(-3.8,y,2.8),(.12,.50,.18),'lamp');area('warm tunnel pool',(-3.55,y,2.5),(0,y+2,-3),500,(1,.71,.42),2.4)
 for x in [-3.5,3.5]:rod('service conduit',(x,-25,3.25),(x,56,3.25),.065,'steel')
 area('cool entrance',(0,-22,3),(0,15,-2),2300,(.53,.78,1),7)
 w=water('stored rainwater',8.7,81,-3.1,(0,14),.09)
 if fill:updates.append(lambda t:setattr(w.location,'z',-1.0+1.35*t))
 if fill:updates.append(lambda t:setattr(w.scale,'x',2*math.sqrt(25-(-4.1+1.35*t)**2)/8.7*.985))
 # Bright directional ripples advance down the same tunnel.
 for i in range(30):
  x=math.sin(i*2.3)*3.1;y=-24+i*2.6;o=sphere('moving water ripple',(x,y,-3.05),(.022,.34,.01),'foam');updates.append(lambda t,o=o,x=x,y=y:setattr(o,'location',(x,-25+(y+25+t*33)%80,-3.05+(-1+1.35*t if fill else 0))))
 return w

def section(level='rising'):
 # A compressed vertical context model: no dimensional claim on ground depth.
 box('earth rear',(0,1,-5),(27,49,15),'soil',.15);box('street cap',(-8,1,3),(11,49,.4),'road')
 # Expose front X face of the ground and half tube; behind it remains geological context.
 ground=bpy.data.objects['earth rear'];ground.location.x=-9.5;ground.dimensions.x=8
 for y in [-17,-9,0,10,19]:
  h=7+(int(y)%3);box('neighbourhood building',(-8,y,3+h/2),(5,5,h),'wallblue',.08)
  for z in [5,7.4,9.8]:
   for yy in [-1.4,1.4]:box('windows',(-5.48,y+yy,z),(.04,1.1,1.4),'glass',.01)
 # Cutaway near half removed, real circular shell retained.
 tube('cutaway storage tunnel',3.3,44,(0,0,-5),True)
 w=water('reservoir free surface',5.6,43,-6.9,(0,0),.035)
 updates.append(lambda t:setattr(w.location,'z',t*1.6 if level=='rising' else 1.6-t*1.4))
 for y in [-14,8]:
  # Rear wall of vertical inlet shaft; opening preserved for flow visibility.
  box('shaft back',(-1.2,y,-.5),(.25,2.4,8.4),'concrete');box('shaft side',(0,y-1.2,-.5),(2.4,.2,8.4),'concrete');box('shaft side',(0,y+1.2,-.5),(2.4,.2,8.4),'concrete')
  rod('surface collector',(-6,y,2.7),(0,y,2.7),.65,'steel')
  for j in range(2):
   verts=[(.1+j*.18,y-.72+k/8*1.44,-4.5+i/36*7.1)for i in range(37)for k in range(9)];faces=[]
   for i in range(36):
    for k in range(8):n=i*9+k;faces.append((n,n+1,n+10,n+9))
   flow=mesh('continuous falling water',verts,faces,'water')
   def flow_fn(t,o=flow,base=verts):
    for v,(xx,yy,zz)in zip(o.data.vertices,base):v.co.x=xx+.05*math.sin(zz*4+t*45)+.025*math.sin(yy*7-t*25)
   updates.append(flow_fn)
  for i in range(26):
   o=sphere('falling spray',(.18,y,-4+i*.23),(.03,.05,.16),'foam');updates.append(lambda t,o=o,y=y,i=i:setattr(o,'location',(.18+.1*math.sin(i),y+.65*math.sin(i*3),-4.6+(i*.29-t*21)%7.1)))
 return w

def pump():
 # Explanatory pump, not an as-built representation of Mokdong machinery.
 box('pump floor',(0,0,-.3),(20,24,.5),'concrete');box('back wall',(0,6,4),(20,.25,9),'wallblue')
 for x in [-7,-4,4,7]:box('wall stiffener',(x,5.8,4),(.18,.28,8),'steel')
 rotor=bpy.data.objects.new('rotor',None);S.collection.objects.link(rotor);rotor.location=(0,0,2.2)
 rod('motor',(0,1.5,2.2),(0,3,2.2),1.2,'steel',48);rod('shaft',(0,-.3,2.2),(0,2,2.2),.19,'orange',32)
 # Rear half volute and flange bolts; near side deliberately open for visibility.
 tube('open casing',1.5,1.6,(0,.6,2.2),True)
 for i in range(7):
  theta=i/7*math.tau;o=box('impeller blade',(math.cos(theta)*.70,-.12,2.2+math.sin(theta)*.70),(.83,.15,.28),'orange',.10);o.rotation_euler[1]=-theta+.45;mw=o.matrix_world.copy();o.parent=rotor;o.matrix_world=mw
 updates.append(lambda t:setattr(rotor.rotation_euler,'y',-t*math.tau*5))
 rod('inlet pipe',(-6,0,.35),(-1.4,0,.35),.67,'steel',32);verts=[(1.7+.54*math.cos(i/32*math.pi),.4+.54*math.sin(i/32*math.pi),z)for z in [2.1,6.7]for i in range(33)];mesh('discharge pipe exposed front',verts,[(i,i+1,i+34,i+33)for i in range(32)],'steel');rod('outlet',(1.7,.4,6.7),(6,.4,6.7),.54,'steel',32)
 for zz in [3.4,5.5]:rod('flange',(1.7,.4,zz-.08),(1.7,.4,zz+.08),.68,'orange',32)
 for i in range(16):
  o=sphere('flow marker',(1.7,.35,2+i*.3),(.07,.07,.16),'mint');updates.append(lambda t,o=o,i=i:setattr(o.location,'z',2+(i*.3+t*13)%4.6))
 area('pump key',(3,-5,7),(0,0,2.5),1800,(.78,.88,1),5);area('pump rim',(-4,3,6),(0,0,2),1400,(1,.59,.26),4)

def outfall():
 # A separate river view shows where the pumped rainwater goes.
 water('Anyangcheon conceptual river',24,76,1,(30,48),.045)
 for x in [15,45]:
  box('river embankment',(x,48,.8),(5.8,80,1.9),'stone',.12);box('riverside path',(x,48,1.9),(5.5,80,.15),'concrete',.03)
  for y in range(12,86,4):
   rod('railing post',(x+(-2.8 if x>30 else 2.8),y,2),(x+(-2.8 if x>30 else 2.8),y,3.05),.045,'steel')
  for z in [2.5,3.0]:rod('river rail',(x+(-2.8 if x>30 else 2.8),10,z),(x+(-2.8 if x>30 else 2.8),86,z),.045,'steel')
 verts=[(x,45+1.05*math.cos(i/48*math.tau),2.55+1.05*math.sin(i/48*math.tau))for x in [15.5,21.5]for i in range(49)]
 o=mesh('outfall pipe',verts,[(i,i+1,i+50,i+49)for i in range(48)],'concrete');o.modifiers.new('outfall wall','SOLIDIFY').thickness=.18
 # Continuous curved surface connects pipe mouth to receiving water.
 verts=[(21.4+j/22*3.5,45+(i/10-.5)*1.5,2.0-.95*(j/22)**1.7)for j in range(23)for i in range(11)];faces=[]
 for j in range(22):
  for i in range(10):k=j*11+i;faces.append((k,k+1,k+12,k+11))
 jet=mesh('outflow sheet',verts,faces,'water')
 for f in jet.data.polygons:f.use_smooth=True
 def jet_fn(t):
  for v,(x,y,z)in zip(jet.data.vertices,verts):v.co.z=z+.06*math.sin(x*5-t*42)*math.cos(y*6)
 updates.append(jet_fn)
 for i in range(18):
  angle=i*.75;o=sphere('outfall spray',(24.7,45,1.07),(.025,.12,.024),'foam');updates.append(lambda t,o=o,angle=angle,i=i:setattr(o,'location',(24.7+(t*3+i*.15)%2*math.cos(angle),45+(t*3+i*.15)%2*math.sin(angle),1.07)))
 for x in [12,48]:
  for y in range(19,82,10):
   rod('river tree',(x,y,2),(x,y,5.1),.14,'soil');sphere('tree canopy core',(x,y,5.5),(1.2,1.4,1.7),'leaf')
   for k in range(9):
    theta=k*2.4;rr=.8 if k%2 else 1.0;sphere('leaf cluster',(x+math.cos(theta)*rr,y+math.sin(theta)*rr,4.9+(k%3)*.7),(.72,.8,.88),'leaf')
 box('distant road bridge',(30,77,6),(39,5,.9),'concrete',.1)
 for x in [21,39]:box('bridge pier',(x,77,3),(1.1,3.5,6),'concrete',.1)
 area('river soft sun',(30,36,20),(23,45,1),2600,(1,.79,.53),12)

def build(sid):
 init()
 if sid=='opening':interior(True);move_cam((.25,-20,-.6),(.1,-11,-.2),(0,18,-1.6),(0,24,-1.1),25)
 elif sid=='street':
  street();w=water('street runoff',12.4,57,.11,amp=.025);updates.append(lambda t:setattr(w.location,'z',t*.30));move_cam((5,-16,1.8),(4,-10,1.55),(5.5,-5,.1),(5.6,-1,.2),29);area('rain soft light',(0,-4,12),(0,0,0),1300,(.57,.79,1),12)
 elif sid=='reveal':section();move_cam((27,-30,5),(24,-26,3),(0,0,-2),(0,0,-2.6),31);area('cutaway fill',(14,-15,8),(0,0,-4),2400,(.7,.85,1),14)
 elif sid=='shaft':section();move_cam((9,-23,1),(8,-21,-.8),(0,-14,-1),(0,-14,-3),27);area('shaft fill',(5,-19,3),(0,-14,-4),3200,(.71,.87,1),8)
 elif sid=='buffer':
  interior(True);move_cam((3.3,-7,1.0),(3.0,-2,1.0),(-1,2,-3.3),(-1,7,-2.5),30)
 elif sid=='pump':
  pump();outfall()
  def pump_camera(t):
   if t<.52:cam(Vector((6,-9,5)).lerp(Vector((4,-7,4)),t/.52),Vector((0,0,2.6)).lerp(Vector((1,.2,3.1)),t/.52),32)
   else:cam(Vector((33,34,7)).lerp(Vector((31,35,5.3)),(t-.52)/.48),(22.5,45,2.1),31)
  updates.append(pump_camera)
 elif sid=='limit':section('draining');move_cam((25,-24,3),(26,-20,3),(0,2,-3),(0,2,-3),32);area('cutaway fill',(12,-5,12),(0,0,-4),2200,(.75,.85,1),10)
 elif sid=='payoff':
  cars=street(rain=False);water('wet gutter',1.0,56,.025,(5.7,0),amp=.005);move_cam((4,-17,2.7),(5,-13,4.0),(0,2,2),(0,10,4),28)
  for yy,parts in cars:
   for o in parts:
    y=o.location.y;updates.append(lambda t,o=o,y=y:setattr(o.location,'y',y+t*7))
  area('sun through clouds',(-8,-12,16),(0,3,0),2500,(1,.74,.44),10)
 else:raise ValueError(sid)

def update(scene):
 t=(scene.frame_current-S.frame_start)/max(1,S.frame_end-S.frame_start)
 for f in updates:f(t)

manpath=C/'clips/render-manifest.json';manifest=json.loads(manpath.read_text())if manpath.exists()else{};digest=hashlib.sha256(Path(__file__).read_bytes()).hexdigest()
shots=TL['shots'] if a.shot=='all' else [s for s in TL['shots']if s['id']in a.shot.split(',')]
for shot in shots:
 sid=shot['id'];build(sid);S.frame_start=1;S.frame_end=shot['frames'];bpy.app.handlers.frame_change_pre.append(update)
 if a.preview:
  S.render.image_settings.file_format='PNG';S.render.filepath=str(C/'qa'/f'{sid}.png');S.frame_set(max(1,round(shot['frames']*a.preview_t)));update(S);bpy.ops.render.render(write_still=True)
 else:
  out=C/'clips'/f'{sid}.mp4'
  if manifest.get(sid,{}).get('sourceHash')==digest and manifest[sid].get('frames')==shot['frames'] and out.exists():print('REUSE',sid,flush=True);continue
  S.render.image_settings.file_format='FFMPEG';S.render.ffmpeg.format='MPEG4';S.render.ffmpeg.codec='H264';S.render.ffmpeg.constant_rate_factor='HIGH';S.render.ffmpeg.ffmpeg_preset='GOOD';S.render.filepath=str(out)
  print('START_SHOT',sid,shot['frames'],flush=True);bpy.ops.render.render(animation=True)
  manifest[sid]={'sourceHash':digest,'frames':shot['frames'],'width':1080,'height':1920,'samples':a.samples,'percent':a.percent,'sha256':hashlib.sha256(out.read_bytes()).hexdigest(),'bytes':out.stat().st_size};manpath.write_text(json.dumps(manifest,indent=2));print('DONE_SHOT',sid,flush=True)
print('RENDER_FINISHED',flush=True)
