import bpy, math, json, argparse, random, hashlib, subprocess, time
from pathlib import Path
from mathutils import Vector
p=argparse.ArgumentParser();p.add_argument('--out',type=Path,required=True);p.add_argument('--timeline',type=Path);p.add_argument('--preview',action='store_true');p.add_argument('--motion-test',action='store_true');p.add_argument('--shot',default='all');p.add_argument('--samples',type=int,choices=[32,64,128,256]);p.add_argument('--engine',choices=['CYCLES','EEVEE'],default='CYCLES');p.add_argument('--percent',type=int,default=100);a=p.parse_args(__import__('sys').argv[__import__('sys').argv.index('--')+1:]);a.out.mkdir(parents=True,exist_ok=True)
bpy.ops.wm.read_factory_settings(use_empty=True);S=bpy.context.scene;S.render.engine='CYCLES' if a.engine=='CYCLES' else 'BLENDER_EEVEE_NEXT';S.cycles.samples=a.samples or 48;S.cycles.use_denoising=True
if a.engine=='EEVEE':
 S.eevee.taa_render_samples=a.samples or 128
 S.eevee.use_raytracing=True
try:
 pref=bpy.context.preferences.addons['cycles'].preferences;pref.compute_device_type='METAL';pref.get_devices()
 for dev in pref.devices:dev.use=dev.type=='METAL'
 if any(d.use for d in pref.devices):S.cycles.device='GPU'
except Exception:pass
S.render.resolution_x=1080;S.render.resolution_y=1920;S.render.resolution_percentage=a.percent;S.render.fps=24;S.render.image_settings.file_format='PNG';S.render.film_transparent=False
S.view_settings.view_transform='AgX';S.view_settings.look='AgX - Medium High Contrast';S.view_settings.exposure=-.5;S.render.image_settings.color_mode='RGB';S.world=bpy.data.worlds.new('Abu Dhabi daylight');S.world.use_nodes=True;S.world.node_tree.nodes['Background'].inputs['Color'].default_value=(.53,.66,.74,1);S.world.node_tree.nodes['Background'].inputs['Strength'].default_value=.5
sky=S.world.node_tree.nodes.new('ShaderNodeTexSky');sky.sky_type='NISHITA';sky.sun_elevation=math.radians(28);sky.sun_rotation=math.radians(125);S.world.node_tree.links.new(sky.outputs['Color'],S.world.node_tree.nodes['Background'].inputs['Color']);S.world.node_tree.nodes['Background'].inputs['Strength'].default_value=.22
M={}
def mat(name,color,rough=.5,metal=0):
 m=bpy.data.materials.new(name);m.use_nodes=True;n=m.node_tree.nodes;bs=n.get('Principled BSDF');bs.inputs['Base Color'].default_value=(*color,1);bs.inputs['Roughness'].default_value=rough;bs.inputs['Metallic'].default_value=metal
 if name in ['concrete','bed','land']:
  tex=n.new('ShaderNodeTexNoise');tex.inputs['Scale'].default_value=9 if name=='concrete' else .6;tex.inputs['Detail'].default_value=3;b=n.new('ShaderNodeBump');b.inputs['Strength'].default_value=.23;b.inputs['Distance'].default_value=.055;m.node_tree.links.new(tex.outputs['Fac'],b.inputs['Height']);m.node_tree.links.new(b.outputs['Normal'],bs.inputs['Normal'])
 M[name]=m;return m
mat('concrete',(.44,.42,.36),.72);mat('steel',(.22,.27,.28),.3,.75);mat('deck',(.32,.35,.31),.58,.3);mat('orange',(.94,.27,.045),.35);mat('white',(.9,.92,.85),.36);mat('dark',(.027,.049,.06),.45);mat('glass',(.075,.22,.29),.15,.5);mat('mint',(.1,.88,.65),.3);mat('bed',(.13,.27,.26),.9);mat('land',(.13,.21,.12),.9);mat('water',(.018,.19,.23),.18,.25)
bs=M['water'].node_tree.nodes.get('Principled BSDF');bs.inputs['Coat Weight'].default_value=.6
noise=M['water'].node_tree.nodes.new('ShaderNodeTexNoise');noise.inputs['Scale'].default_value=1.7;noise.inputs['Detail'].default_value=2;b=M['water'].node_tree.nodes.new('ShaderNodeBump');b.inputs['Strength'].default_value=.22;b.inputs['Distance'].default_value=.12;M['water'].node_tree.links.new(noise.outputs['Fac'],b.inputs['Height']);M['water'].node_tree.links.new(b.outputs['Normal'],bs.inputs['Normal'])
def empty(name):o=bpy.data.objects.new(name,None);S.collection.objects.link(o);return o
rig=empty('Al Bahr twin towers');vessels=empty('city traffic');cutobjs=[];waterfills=[];skirtobjs=[]
def finish(o,name,material,parent=None):
 o.name=name;o.data.materials.append(M[material]);o.parent=parent
 if o.type=='MESH':
  for face in o.data.polygons:face.use_smooth=True
 return o
def box(name,pos,size,material,parent=None,bevel=.04):
 bpy.ops.mesh.primitive_cube_add(size=1,location=pos);o=bpy.context.object;o.scale=size;bpy.ops.object.transform_apply(location=False,rotation=False,scale=True);finish(o,name,material,parent)
 if bevel:mod=o.modifiers.new('real edge highlights','BEVEL');mod.width=bevel;mod.segments=2;o.modifiers.new('weighted normals','WEIGHTED_NORMAL')
 return o
def cyl(name,pos,r,depth,material,parent=None,r2=None):
 bpy.ops.mesh.primitive_cone_add(vertices=48,radius1=r,radius2=r if r2 is None else r2,depth=depth,location=pos);return finish(bpy.context.object,name,material,parent)
def tube(name,pts,r,material,parent=None):
 cu=bpy.data.curves.new(name,'CURVE');cu.dimensions='3D';cu.bevel_depth=r;cu.bevel_resolution=2;sp=cu.splines.new('POLY');sp.points.add(len(pts)-1)
 for dest,co in zip(sp.points,pts):dest.co=(*co,1)
 o=bpy.data.objects.new(name,cu);S.collection.objects.link(o);o.data.materials.append(M[material]);o.parent=parent;return o
# Own illustrative geometry: the textile units use a simplified triangular fold.
mat('cloth',(.76,.60,.38),.78);mat('aluminium',(.59,.64,.65),.23,.8);mat('glazing',(.075,.18,.22),.19,.6);mat('paving',(.51,.44,.32),.75);mat('asphalt',(.055,.065,.072),.8);mat('leaf',(.095,.22,.095),.85);mat('wood',(.29,.16,.075),.6);mat('paper',(.86,.85,.78),.8)
cloth=M['cloth'].node_tree;tex=cloth.nodes.new('ShaderNodeTexNoise');tex.inputs['Scale'].default_value=160;bump=cloth.nodes.new('ShaderNodeBump');bump.inputs['Strength'].default_value=.12;bump.inputs['Distance'].default_value=.012;cloth.links.new(tex.outputs['Fac'],bump.inputs['Height']);cloth.links.new(bump.outputs['Normal'],cloth.nodes.get('Principled BSDF').inputs['Normal'])
glass=bpy.data.materials.new('explanatory window glass');glass.use_nodes=True;nodes=glass.node_tree.nodes;nodes.clear();out=nodes.new('ShaderNodeOutputMaterial');mix=nodes.new('ShaderNodeMixShader');mix.inputs[0].default_value=.10;tr=nodes.new('ShaderNodeBsdfTransparent');gl=nodes.new('ShaderNodeBsdfPrincipled');gl.inputs['Base Color'].default_value=(.1,.22,.25,1);gl.inputs['Metallic'].default_value=.4;gl.inputs['Roughness'].default_value=.18;glass.node_tree.links.new(tr.outputs[0],mix.inputs[1]);glass.node_tree.links.new(gl.outputs[0],mix.inputs[2]);glass.node_tree.links.new(mix.outputs[0],out.inputs[0]);M['clear']=glass
S.world.node_tree.nodes['Background'].inputs['Strength'].default_value=.18
modules=[];shadeMeshes=[];metalMeshes=[];centres=[(-6.3,0),(6.3,2.5)];hero=(-6.3,-5.23,13.56)
def radius(z,phi):return (4.05+.55*math.sin(math.pi*max(0,min(1,(z-1)/29))))*(1+.045*math.cos(3*phi))
def coord(cx,cy,z,phi,r=0):return Vector((cx+(radius(z,phi)+r)*math.cos(phi),cy+(radius(z,phi)+r)*math.sin(phi),z))
def mesh(name,verts,faces,material):
 data=bpy.data.meshes.new(name);data.from_pydata(verts,[],faces);data.update();o=bpy.data.objects.new(name,data);S.collection.objects.link(o);o.data.materials.append(M[material]);return o
for ti,(cx,cy) in enumerate(centres):
 verts=[];faces=[];clearFaces=[];n=64;nz=30
 for j in range(nz+1):
  z=1+j*29/nz
  for k in range(n):verts.append(coord(cx,cy,z,k*math.tau/n))
 for j in range(nz):
  for k in range(n):
   faces.append((j*n+k,j*n+(k+1)%n,(j+1)*n+(k+1)%n,(j+1)*n+k));phi=(k+.5)*math.tau/n;z=1+(j+.5)*29/nz
   clearFaces.append(ti==0 and abs((phi-1.5*math.pi+math.pi)%math.tau-math.pi)<.40 and 12.5<z<15)
 body=mesh('continuous curved curtain wall '+str(ti),verts,faces,'glazing');body.data.materials.append(glass)
 for face,isclear in zip(body.data.polygons,clearFaces):face.material_index=1 if isclear else 0
 for j in range(30):
  z=1+j*29/29;tube('horizontal floor shadow gap',[coord(cx,cy,z,k*math.tau/n,.025) for k in range(n+1)],.028,'aluminium')
 for k in range(64):
  phi=k*math.tau/64;tube('vertical mullion',[coord(cx,cy,1+j*29/15,phi,.04) for j in range(16)],.018,'aluminium')
 cyl('tower podium '+str(ti),(cx,cy,.7),5.2,1.4,'concrete');cyl('roof cap '+str(ti),(cx,cy,30.05),4.15,.18,'aluminium')
 this=[]
 for row in range(28):
  z=1.6+row*.92
  for col in range(32):
   phi=col*math.tau/32
   if math.sin(phi)>.70:continue # north-facing zone remains unshaded
   c=coord(cx,cy,z,phi,.72);normal=Vector((math.cos(phi),math.sin(phi),0));tangent=Vector((-math.sin(phi),math.cos(phi),0));this.append((c,normal,tangent,row,col))
 modules.append(this);shadeMeshes.append(mesh('folding textile field '+str(ti),[],[],'cloth'));metalMeshes.append(mesh('folding frame field '+str(ti),[],[],'aluminium'))
# The same office bay remains behind the same front-facing facade.
box('same office floor',(-6.3,-2.7,12.87),(3.15,4.1,.12),'wood',bevel=.01)
for x in [-7.9,-4.7]:box('office sidewall',(x,-2.7,13.65),(.08,4.1,1.55),'white',bevel=.01)
box('office back wall',(-6.3,-.62,13.65),(3.2,.08,1.55),'white',bevel=.01);box('office ceiling',(-6.3,-2.7,14.44),(3.2,4.1,.08),'white',bevel=.01)
for x in [-6.3,-5.3]:
 box('same pale desk',(x,-2.6,13.08),(.7,.46,.045),'paper',bevel=.012)
 for dx in [-.28,.28]:
  for dy in [-.17,.17]:box('desk leg',(x+dx,-2.6+dy,12.98),(.023,.023,.2),'aluminium',bevel=0)
 box('laptop base',(x,-2.62,13.12),(.21,.15,.015),'dark',bevel=.004);box('laptop screen',(x,-2.68,13.21),(.21,.018,.16),'dark',bevel=.004);box('laptop display',(x,-2.668,13.21),(.18,.005,.13),'glass',bevel=0)
 cyl('coffee cup',(x+.22,-2.65,13.14),.026,.065,'white');box('office chair seat',(x,-2.08,13.0),(.24,.25,.035),'dark',bevel=.018);box('office chair back',(x,-1.93,13.12),(.24,.035,.25),'dark',bevel=.018)
# Landscape is context, not a surveyed reconstruction of the actual parcel.
box('desert city ground',(0,0,-.2),(500,500,.35),'paving',bevel=0);box('low linked podium',(0,1,.2),(23,14,.4),'concrete',bevel=.2)
box('street',(0,-17,.015),(220,8,.06),'asphalt',bevel=0)
for x in range(-90,91,5):box('lane dash',(x,-17,.055),(2,.1,.01),'white',bevel=0)
for y in [-11.8,-22]:box('walkway',(0,y,.06),(210,1.8,.12),'white',bevel=0)
random.seed(89)
for i in range(28):
 x=random.choice([-1,1])*random.uniform(20,100);y=random.uniform(25,120);w=random.uniform(4,10);h=random.uniform(8,36)
 box('surrounding city block',(x,y,h/2),(w,w*.8,h),'concrete',bevel=.1)
 for z in range(2,int(h),2):box('background glazing strip',(x,y-w*.405,z),(w*.9,.03,.7),'glazing',bevel=0)
for i,x in enumerate([-27,-11,4,18,35]):
 y=-55-i*7;h=[16,23,12,19,27][i];w=7
 box('opposite street block',(x,y,h/2),(w,6,h),'concrete',bevel=.12)
 for z in range(2,h,2):box('visible opposite glazing',(x,y+3.04,z),(w*.88,.04,.8),'glazing',bevel=0)
for x in [-17,-11,-4,4,11,17]:
 for y in [-9,10]:
  tube('palm trunk',[(x,y,0),(x+.2,y,2.4)],.09,'wood')
  for k in range(8):
   phi=k*math.tau/8;c=Vector((x+.2,y,2.4));tip=c+Vector((1.1*math.cos(phi),1.1*math.sin(phi),-.35));side=Vector((-.18*math.sin(phi),.18*math.cos(phi),0));mesh('palm frond',[c,c+(tip-c)*.5+side,tip,c+(tip-c)*.5-side],[(0,1,2,3)],'leaf')
traffic=[]
for i in range(7):
 car=empty('moving car '+str(i));car.location=(i*9-27,-16 if i%2 else -18,0);box('car body',(0,0,.18),(.85,.38,.25),'white' if i%2 else 'dark',car,.08);box('car roof',(0,0,.36),(.4,.34,.17),'glass',car,.07);traffic.append(car)
for i in range(12):
 x=random.uniform(-14,14);y=random.choice([-10.6,8.6]);cyl('person body',(x,y,.17),.045,.23,'dark');bpy.ops.mesh.primitive_uv_sphere_add(segments=8,ring_count=4,radius=.04,location=(x,y,.33));finish(bpy.context.object,'person head','white')
bpy.ops.object.light_add(type='SUN');sun=bpy.context.object;sun.data.energy=3.5;sun.data.angle=.035
bpy.ops.object.camera_add();cam=bpy.context.object;S.camera=cam;cam.data.clip_start=.03;cam.data.clip_end=1000
smooth=lambda v:max(0,min(1,v))**2*(3-2*max(0,min(1,v)))
def folded(c,n,t,d):
 # Six textile triangles, paired into three creases; illustrative fold, not shop drawings.
 outer=[Vector((.52*math.cos(math.pi/2+k*math.tau/3),.52*math.sin(math.pi/2+k*math.tau/3))) for k in range(3)]
 pts=[c+n*(.05+.47*(1-d))]
 for k in range(3):
  q=outer[k];pts.append(c+t*q.x+Vector((0,0,q.y)))
  m=(outer[k]+outer[(k+1)%3])*.5*(.07+.93*d);pts.append(c+t*m.x+Vector((0,0,m.y))+n*(.28*(1-d)))
 return pts
sunDir=-math.pi/2
# Rebuild only two compact dynamic meshes per tower, not thousands of object transforms.
def update_shades(shot,u,bearing):
 for ti,items in enumerate(modules):
  pv=[];pf=[];rv=[];rf=[]
  for c,n,t,row,col in items:
   phi=col*math.tau/32;d=smooth((math.cos(phi-bearing)-.15)/.55)
   ishero=ti==0 and abs((phi-1.5*math.pi+math.pi)%math.tau-math.pi)<.42 and 11.8<c.z<15.5
   if shot=='hook':d=.08+.92*smooth(math.sin(math.pi*u)**2)
   if ishero:
    if shot=='problem':d=0
    elif shot=='mechanism':d=smooth(u/.62)*(1-smooth((u-.7)/.3))
    elif shot=='example':d=smooth((u-.15)/.25)*(1-smooth((u-.66)/.32))
   pts=folded(c,n,t,d);base=len(pv);pv.extend(pts)
   for k in range(3):
    q=1+k*2;m=q+1;nextq=1+((k+1)%3)*2;pf.extend([(base,base+q,base+m),(base,base+m,base+nextq)])
   for j,k in [(0,1),(0,3),(0,5),(1,2),(2,3),(3,4),(4,5),(5,6),(6,1)]:
    aa,bb=pts[j],pts[k];axis=(bb-aa).normalized();side=axis.cross(Vector((0,0,1)))
    if side.length<.01:side=axis.cross(Vector((0,1,0)))
    side.normalize();up=axis.cross(side).normalized();r=.012;b=len(rv)
    rv.extend([q+(side*math.cos(k*math.pi/2)+up*math.sin(k*math.pi/2))*r for q in [aa,bb] for k in range(4)])
    rf.extend([(b+k,b+(k+1)%4,b+4+(k+1)%4,b+4+k) for k in range(4)])
  for ob,vs,fs in [(shadeMeshes[ti],pv,pf),(metalMeshes[ti],rv,rf)]:
   ob.data.clear_geometry();ob.data.from_pydata(vs,[],fs);ob.data.update()
def pose(shot,u):
 global sunDir
 q=smooth(u);sunDir=-math.pi/2+(1.05*smooth((u-.55)/.45) if shot=='example' else .7*q if shot in ['origin','payoff'] else 0)
 sun.location=(math.cos(sunDir)*50,math.sin(sunDir)*50,25);sun.rotation_euler=(-sun.location).to_track_quat('-Z','Y').to_euler()
 sky.sun_rotation=sunDir;sky.sun_elevation=math.radians(26)
 mix.inputs[0].default_value=.10+.70*q if shot=='problem' else .1
 update_shades(shot,u,sunDir)
 for i,car in enumerate(traffic):car.location.x=i*9-27+u*4*(1 if i%2 else -1)
 if shot=='example' or (shot=='problem' and u>.24):cp=(-5.10,-1.0,14.05);target=(-6.25,-2.65,13.08);lens=31
 elif shot=='mechanism' or (shot=='hook' and u<.62):cp=(-3.9,-10.2,14.4);target=(-6.3,-5.25,13.55);lens=49
 else:cp=(35-3*q,-60-4*q,18+4*q);target=(0,1,15.5);lens=38
 cam.location=cp;cam.data.lens=lens;cam.rotation_euler=(Vector(target)-cam.location).to_track_quat('-Z','Y').to_euler();bpy.context.view_layer.update()
shots=['hook','problem','mechanism','example','origin','payoff'];manifest={'sourceHash':hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),'engine':S.render.engine,'samples':S.cycles.samples if a.engine=='CYCLES' else S.eevee.taa_render_samples,'percent':a.percent,'illustrativeGeometry':True,'simplifiedFold':True,'shots':[]}
if a.preview:
 for sh,u,name in [('origin',.5,'wide'),('mechanism',.1,'folded'),('mechanism',.6,'spread'),('example',.05,'room-before'),('example',.55,'room-shaded'),('example',1,'room-reopened')]:
  if a.shot!='all' and sh not in a.shot.split(','):continue
  pose(sh,u);S.render.filepath=str(a.out/(name+'.png'));bpy.ops.render.render(write_still=True)
 (a.out/'preview-manifest.json').write_text(json.dumps(manifest,indent=2));raise SystemExit()
tl={'beats':[{'id':'example','duration':2}]} if a.motion_test else json.loads(a.timeline.read_text());mp=a.out/'render-manifest.json'
if mp.exists():
 old=json.loads(mp.read_text())
 if all(old.get(k)==manifest[k] for k in ['sourceHash','percent','samples','engine']):manifest=old
started=time.time()
for beat in tl['beats']:
 sh=beat['id']
 if a.shot!='all' and sh not in a.shot.split(','):continue
 n=round(beat['duration']*24);out=a.out/(sh+'.mp4')
 if any(v['id']==sh and v['frames']==n for v in manifest['shots']) and out.exists():continue
 temp=a.out/(sh+'-current.png');S.render.filepath=str(temp)
 with (a.out/(sh+'-encode.log')).open('wb') as log:
  proc=subprocess.Popen(['ffmpeg','-v','error','-y','-f','image2pipe','-framerate','24','-vcodec','png','-i','pipe:0','-an','-c:v','libx264','-crf','17','-preset','fast','-pix_fmt','yuv420p','-movflags','+faststart',str(out)],stdin=subprocess.PIPE,stderr=log)
  try:
   for f in range(n):
    pose(sh,f/max(1,n-1));bpy.ops.render.render(write_still=True);proc.stdin.write(temp.read_bytes())
    if f%24==0:print('PROGRESS',sh,f,n,round(time.time()-started,1),flush=True)
   proc.stdin.close();assert proc.wait()==0
  finally:
   if proc.poll() is None:proc.kill();proc.wait()
 temp.unlink();manifest['shots']=[v for v in manifest['shots'] if v['id']!=sh]+[{'id':sh,'frames':n,'sha256':hashlib.sha256(out.read_bytes()).hexdigest()}];mp.write_text(json.dumps(manifest,indent=2));print('SHOT_COMPLETE',sh,flush=True)
print('RENDER_COMPLETE',round(time.time()-started,1),flush=True)
