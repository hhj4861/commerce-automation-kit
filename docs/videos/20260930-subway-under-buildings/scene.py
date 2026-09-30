"""Original diagrammatic EPB tunnelling animation. Blender 4.5; no external footage."""
import bpy, math, json, sys, argparse, random
from pathlib import Path
from mathutils import Vector
from bpy.app.handlers import persistent
ap=argparse.ArgumentParser();ap.add_argument('--cache',type=Path,required=True);ap.add_argument('--preview',action='store_true');args=ap.parse_args(sys.argv[sys.argv.index('--')+1:]);C=args.cache
T=json.loads((C/'timeline.json').read_text());random.seed(19)
bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
S=bpy.context.scene;S.render.engine='BLENDER_EEVEE_NEXT';S.render.resolution_x=1080;S.render.resolution_y=1920;S.render.resolution_percentage=100;S.render.fps=30;S.frame_start=1;S.frame_end=sum(x['frames'] for x in T)
S.render.image_settings.color_mode='RGB';S.render.film_transparent=False;S.world.color=(.45,.42,.36)
S.view_settings.view_transform='AgX';S.view_settings.look='AgX - Medium High Contrast';S.render.image_settings.file_format='PNG'
S.render.use_file_extension=True;S.render.threads_mode='AUTO'
if hasattr(S,'eevee'):S.eevee.taa_render_samples=16
M={}
def mat(name,col,metal=0,rough=.4):
 m=bpy.data.materials.new(name);m.diffuse_color=(*col,1);m.use_nodes=True;n=m.node_tree.nodes.get('Principled BSDF');n.inputs['Base Color'].default_value=(*col,1);n.inputs['Metallic'].default_value=metal;n.inputs['Roughness'].default_value=rough;M[name]=m;return m
mat('ivory',(.84,.79,.67),0,.8);mat('earth',(.37,.18,.08),0,.95);mat('layer',(.55,.31,.13),0,.85);mat('sand',(.70,.47,.25));mat('teal',(.015,.35,.36),.45);mat('mint',(.12,.68,.55));mat('orange',(1,.29,.045),.3);mat('dark',(.035,.055,.065),.6);mat('concrete',(.63,.68,.65));mat('white',(.88,.91,.86));mat('glass',(.035,.17,.21),.65);mat('red',(.75,.09,.045));mat('gold',(.95,.66,.16),.3)
iv=M['ivory'].node_tree.nodes.get('Principled BSDF');iv.inputs['Emission Color'].default_value=(.84,.79,.67,1);iv.inputs['Emission Strength'].default_value=.35
ORIGIN=0;dynamic=[];cameras=[]
def finish(o,name,material,bevel=0):
 o.name=name;o.data.materials.append(M[material]);o.location.x+=ORIGIN
 if bevel:
  b=o.modifiers.new('Soft manufactured edges','BEVEL');b.width=bevel;b.segments=2
  n=o.modifiers.new('Weighted normals','WEIGHTED_NORMAL')
 return o
def box(name,loc,dim,material,bevel=.04):
 bpy.ops.mesh.primitive_cube_add(size=1,location=loc);o=bpy.context.object;o.dimensions=dim;bpy.ops.object.transform_apply(location=False,rotation=False,scale=True);return finish(o,name,material,bevel)
def cyl(name,loc,r,depth,material,axis='X',vertices=40):
 bpy.ops.mesh.primitive_cylinder_add(vertices=vertices,radius=r,depth=depth,location=loc);o=bpy.context.object
 if axis=='X':o.rotation_euler[1]=math.pi/2
 elif axis=='Y':o.rotation_euler[0]=math.pi/2
 return finish(o,name,material,.018)
def ball(name,loc,r,material):
 bpy.ops.mesh.primitive_uv_sphere_add(segments=12,ring_count=8,radius=r,location=loc);return finish(bpy.context.object,name,material)
def line(name,a,b,r,material):
 av,bv=Vector(a),Vector(b);o=cyl(name,(av+bv)/2,r,(bv-av).length,material,'Z',12);o.rotation_euler=(bv-av).to_track_quat('Z','Y').to_euler();return o
def sector(name,x,width,ri,ro,a,b,material):
 N=max(3,int(abs(b-a)*12));verts=[]
 for xx in (x-width/2,x+width/2):
  for rr in (ri,ro):
   verts.extend((xx,rr*math.cos(a+(b-a)*j/N),rr*math.sin(a+(b-a)*j/N)) for j in range(N+1))
 k=N+1;faces=[]
 for j in range(N):
  faces.extend([(j,j+1,k+j+1,k+j),(2*k+j,3*k+j,3*k+j+1,2*k+j+1),(j,2*k+j,2*k+j+1,j+1),(k+j,k+j+1,3*k+j+1,3*k+j)])
 faces.extend([(0,k,3*k,2*k),(N,2*k+N,3*k+N,k+N)])
 mesh=bpy.data.meshes.new(name);mesh.from_pydata(verts,[],faces);mesh.update();o=bpy.data.objects.new(name,mesh);S.collection.objects.link(o);return finish(o,name,material,.012)
def ring(x,ri=1.2,ro=1.45,width=.65,cut=False,material='concrete'):
 arr=[]
 for j in range(8):
  a=j*math.tau/8+.025;b=(j+1)*math.tau/8-.025
  if cut and math.cos((a+b)/2)<-.1:continue
  arr.append(sector('Precast concrete segment',x,width,ri,ro,a,b,material))
 return arr
def arrow(a,b,material,r=.055):
 av,bv=Vector(a),Vector(b);d=(bv-av).normalized();line('Pressure shaft',av,bv-d*.25,r,material)
 bpy.ops.mesh.primitive_cone_add(vertices=16,radius1=r*2.8,radius2=0,depth=.38,location=bv-d*.15);o=bpy.context.object;o.rotation_euler=d.to_track_quat('Z','Y').to_euler();return finish(o,'Pressure arrow',material)
def build_city(risk=False):
 box('Soil back bank',(0,2.7,1.2),(15,3.2,8.6),'earth',.12)
 box('Ground upper section',(0,.1,4.4),(15,2.1,2.5),'layer',.1)
 box('Ground lower section',(0,.1,-2.4),(15,2.1,1.5),'earth',.1)
 for z in (3.45,4.25,5.05):box('Visible stratum',(0,-.96,z),(14.8,.035,.085),'sand',.01)
 box('Street',(0,1.7,5.9),(15,5.1,.22),'concrete');box('Road',(0,-.1,6.05),(15,1.45,.08),'dark')
 for x in range(-6,8,2):box('Road marking',(x,-.1,6.10),(.7,.05,.02),'white',0)
 buildings=[]
 for x,h in [(-4.6,3.5),(-.4,5),(4.0,3.2)]:
  base=box('Building shallow footing',(x,2.2,5.6),(2.9,2.3,.5),'concrete');body=box('Occupied building',(x,2.2,6.1+h/2),(2.5,1.8,h),'white',.07);parts=[base,body]
  for zz in range(int(h/.6)):
   for xx in (-.7,0,.7):parts.append(box('Window',(x+xx,1.278,6.45+zz*.6),(.42,.035,.32),'glass',.018))
  buildings+=parts
 car=box('Car',(0,-.1,6.4),(1,.55,.36),'orange',.12);dynamic.append(('car',car,Vector(car.location)))
 return buildings

def machine(x=0):
 # Open near-side shield: chamber, jack cylinders, screw and lining remain visible.
 parts=[]
 for a,b in [(-math.pi/2,math.pi/2), (math.pi,math.pi*1.5)]:parts.append(sector('Steel shield',x,.01+4,1.48,1.60,a,b,'teal'))
 front=sector('Cutter wheel cutaway',x+2.04,.18,.10,1.58,-math.pi/2,math.pi/2,'dark')
 for j in range(8):
  a=j*math.tau/8;blade=box('Orange cutting arm',(x+2.16,.83*math.cos(a),.83*math.sin(a)),(.16,1.37,.20),'orange',.03);blade.rotation_euler[0]=a
  dynamic.append(('blade',blade,(x+2.16,ORIGIN,a,.83)))
  for r in (.5,1.15):
   tooth=cyl('Cutter tooth',(x+2.27,r*math.cos(a),r*math.sin(a)),.105,.11,'white');dynamic.append(('tooth',tooth,(x+2.27,ORIGIN,a,r)))
 cyl('Drive hub',(x+2.27,0,0),.33,.25,'orange')
 for i in range(50):
  a=random.uniform(0,math.tau);r=random.uniform(.15,1.25);ball('Conditioned soil in chamber',(x+1.65,math.cos(a)*r,math.sin(a)*r),.16,'sand')
 sector('Chamber bulkhead',x+1.15,.12,.28,1.46,-math.pi/2,math.pi/2,'dark')
 for z in (-.9,.9):line('Hydraulic thrust jack',(x-1.85,.85,z),(x+.8,.85,z),.14,'gold')
 line('Screw conveyor axis',(x-2.7,-.18,-.82),(x+1.4,-.18,-.82),.10,'dark')
 # Helical strip modelled with a tube, rotating around its actual X axis.
 pts=[]
 for j in range(180):
  xx=x-2.6+j/179*4;ang=j/179*math.tau*7;pts.append((xx,.25*math.cos(ang),.25*math.sin(ang)))
 curve=bpy.data.curves.new('Screw flights','CURVE');curve.dimensions='3D';curve.bevel_depth=.065;curve.bevel_resolution=2;sp=curve.splines.new('POLY');sp.points.add(len(pts)-1)
 for p,co in zip(sp.points,pts):p.co=(*co,1)
 o=bpy.data.objects.new('Screw flights',curve);S.collection.objects.link(o);finish(o,'Screw flights','orange');o.location.y=-.18;o.location.z=-.82;dynamic.append(('screw',o,Vector(o.location)))
 for i in range(7):
  o=ball('Extracted soil',(x-2.7+i*.53,-.5,-.8),.14,'sand');dynamic.append(('soilflow',o,(Vector(o.location),i)))
 for k in range(4):ring(x-2.4-k*.72,cut=True)
 return parts

for idx,t in enumerate(T):
 ORIGIN=idx*80;start=len(dynamic)
 if idx in (0,1,7,8):
  buildings=build_city(idx==1)
  if idx in (0,7):machine(-.3)
  elif idx==1:
   for x in range(-6,7):ring(x,cut=True) if x<-3 else None
   for i in range(24):
    o=ball('Unsupported soil',(random.uniform(-2,2),-.55,random.uniform(2,3.1)),.17,'sand');dynamic.append(('fall',o,Vector(o.location)))
   for o in [ob for ob in buildings if abs(ob.location.x-ORIGIN+.4)<1.5]:dynamic.append(('settle',o,Vector(o.location)))
  else:
   for j in range(18):ring(-6.7+j*.76,cut=True)
   for y in (-.5,.5):line('Rail',(-7,y,-.95),(7,y,-.95),.045,'dark')
   for j in range(3):
    o=box('Metro carriage',(-5+j*2.3,-.1,-.12),(2.15,1.35,1.25),'teal',.14);dynamic.append(('train',o,Vector(o.location)))
    for k in range(3):
     o=box('Train window',(-5+j*2.3+(k-1)*.55,-.79,.08),(.42,.025,.40),'glass',.01);dynamic.append(('train',o,Vector(o.location)))
  if idx==7:
   for x in (-4.6,-.4,4):
    prism=ball('Monitoring prism',(x,1.17,7.1),.13,'orange');line('Survey beam',(6,-.7,7.05),(x,1.17,7.1),.022,'mint')
   for dx,dy in ((-.4,-.3),(.4,-.3),(0,.4)):line('Tripod',(6+dx,-.7+dy,6.1),(6,-.7,7.05),.035,'dark')
   box('Survey instrument',(6,-.7,7.2),(.45,.28,.3),'teal')
  cameras.append(((21,-32,21),(0,0,3.7),33))
 elif idx in (2,3,4):
  machine()
  box('Undisturbed ground ahead',(3.5,1.5,0),(2.6,2.1,4.2),'earth',.10)
  if idx==3:
   for z in (-.65,.4,1.15):
    arrow((3.3,-1.8,z),(2.1,-1.8,z),'orange',.08);arrow((.5,-1.8,z),(1.65,-1.8,z),'mint',.08)
  if idx==4:
   box('Conveyor belt',(-3.8,-.1,-1.35),(3.8,1,.2),'dark');
   for j in range(9):cyl('Belt roller',(-5.3+j*.4,-.1,-1.44),.14,1.2,'teal','Y')
  cameras.append(((13,-20,11),(0,0,.1),21.5))
 elif idx==5:
  for x in (-2.1,-1.35,-.6):ring(x)
  for j,o in enumerate(ring(.2)):
   mid=(j+.5)*math.tau/8;dynamic.append(('segment',o,(Vector(o.location),mid,j)))
  line('Erector arm',(-3,0,0),(0,.3,.45),.16,'orange');cyl('Erector grip',(.05,.3,.45),.3,.16,'dark')
  cameras.append(((16,-19,11),(0,0,0),12))
 else:
  ring(0,1.2,1.50,1.0)
  for j in range(24):
   aa=j*math.tau/24;sector('Undisturbed surrounding soil',0,1,1.9,2.9,aa+.008,aa+math.tau/24-.008,'earth')
   o=sector('Annular grout',0,1.02,1.51,1.89,aa+.008,aa+math.tau/24-.008,'mint');dynamic.append(('grout',o,j))
  line('Grout injection hose',(.6,-3,-2),(.6,-1.4,-.8),.075,'orange');arrow((.6,-2.1,-1.5),(.6,-1.4,-.8),'orange',.065)
  cameras.append(((19,-8,7),(0,0,0),12))
 for k in range(start,len(dynamic)):dynamic[k]=(idx,)+dynamic[k]

# Continuous ivory studio ground, soft global light and camera-following key.
ORIGIN=0;box('Ivory studio floor',(320,0,-3.55),(1000,200,.18),'ivory',0)
bpy.ops.object.light_add(type='SUN',location=(0,0,20));sun=bpy.context.object;sun.data.energy=2.2;sun.data.angle=.15;sun.rotation_euler=(.35,-.45,-.35)
bpy.ops.object.light_add(type='AREA',location=(0,-12,18));key=bpy.context.object;key.data.energy=2300;key.data.shape='DISK';key.data.size=9
bpy.ops.object.camera_add();cam=bpy.context.object;S.camera=cam;cam.data.type='ORTHO';cam.data.lens=50;cam.data.shift_y=.12
@persistent
def animate(scene):
 f=scene.frame_current;idx=next((i for i,t in enumerate(T) if t['start']<=f<t['start']+t['frames']),len(T)-1);t=T[idx];u=min(1,max(0,(f-t['start'])/max(1,t['frames']-1)))
 pos,target,scale=cameras[idx];target=Vector(target)+Vector((idx*80,0,0));pos=Vector(pos)+Vector((idx*80,0,0));pos.x+=(u-.5)*1.15
 cam.location=pos;cam.rotation_euler=(target-pos).to_track_quat('-Z','Y').to_euler();cam.data.ortho_scale=scale*(1-.045*u)
 key.location=(idx*80-5,-9,15);key.rotation_euler=(target-key.location).to_track_quat('-Z','Y').to_euler()
 for si,kind,o,data in dynamic:
  if si!=idx:continue
  spin=u*math.tau*2
  if kind=='car':o.location.x=data.x-5+u*10
  elif kind=='spin':o.rotation_euler[0]=spin
  elif kind in ('blade','tooth'):
   x,origin,a,r=data;aa=a+spin;o.location=(origin+x,math.cos(aa)*r,math.sin(aa)*r)
   if kind=='blade':o.rotation_euler[0]=aa
  elif kind=='screw':o.rotation_euler[0]=spin # flight rotation accent, axis core remains fixed
  elif kind=='soilflow':
   base,j=data;o.location.x=idx*80+1.3-((u*3+j/7)%1)*4.5
  elif kind=='fall':o.location.z=data.z-min(1,u*2)*.8
  elif kind=='settle':o.location.z=data.z-max(0,u-.3)*.16
  elif kind=='train':o.location.x=data.x+u*5
  elif kind=='segment':
   base,a,j=data;k=max(0,1-max(0,(u-.08-j*.085))*7);o.location=base+Vector((0,math.cos(a)*k*1.6,math.sin(a)*k*1.6))
  elif kind=='grout':o.hide_render=u<(data+1)/28
bpy.app.handlers.frame_change_pre.append(animate)
if args.preview:
 for i,t in enumerate(T):
  S.frame_set(t['start']+int(t['frames']*.65));S.render.filepath=str(C/f'preview-{i:02}.png');bpy.ops.render.render(write_still=True)
 print('PREVIEW_COMPLETE',flush=True)
else:
 S.render.image_settings.file_format='FFMPEG';S.render.ffmpeg.format='MPEG4';S.render.ffmpeg.codec='H264';S.render.ffmpeg.constant_rate_factor='HIGH';S.render.ffmpeg.ffmpeg_preset='GOOD';S.render.filepath=str(C/'silent.mp4');bpy.ops.render.render(animation=True);print('RENDER_COMPLETE',flush=True)
