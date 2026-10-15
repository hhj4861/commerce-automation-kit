import bpy, math, json, argparse, random, hashlib, subprocess, time
from pathlib import Path
from mathutils import Vector
p=argparse.ArgumentParser();p.add_argument('--out',type=Path,required=True);p.add_argument('--timeline',type=Path);p.add_argument('--preview',action='store_true');p.add_argument('--shot',default='all');p.add_argument('--engine',choices=['CYCLES','EEVEE'],default='CYCLES');p.add_argument('--percent',type=int,default=100);a=p.parse_args(__import__('sys').argv[__import__('sys').argv.index('--')+1:]);a.out.mkdir(parents=True,exist_ok=True)
bpy.ops.wm.read_factory_settings(use_empty=True);S=bpy.context.scene;S.render.engine='CYCLES' if a.engine=='CYCLES' else 'BLENDER_EEVEE_NEXT';S.cycles.samples=48;S.cycles.use_denoising=True
if a.engine=='EEVEE':
 S.eevee.taa_render_samples=128
 S.eevee.use_raytracing=True
try:
 pref=bpy.context.preferences.addons['cycles'].preferences;pref.compute_device_type='METAL';pref.get_devices()
 for dev in pref.devices:dev.use=dev.type=='METAL'
 if any(d.use for d in pref.devices):S.cycles.device='GPU'
except Exception:pass
S.render.resolution_x=1080;S.render.resolution_y=1920;S.render.resolution_percentage=a.percent;S.render.fps=24;S.render.image_settings.file_format='PNG';S.render.film_transparent=False
S.view_settings.view_transform='AgX';S.view_settings.look='AgX - Medium High Contrast';S.view_settings.exposure=-.5;S.render.image_settings.color_mode='RGB';S.world=bpy.data.worlds.new('North Sea daylight');S.world.use_nodes=True;S.world.node_tree.nodes['Background'].inputs['Color'].default_value=(.53,.66,.74,1);S.world.node_tree.nodes['Background'].inputs['Strength'].default_value=.5
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
rig=empty('same Troll A schematic platform');vessels=empty('tug formation');cutobjs=[];waterfills=[];skirtobjs=[]
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
# Nineteen connected caisson cells; a single cutaway is illustrative, not a valve drawing.
centres=[]
for row,count in enumerate([3,4,5,4,3]):
 for col in range(count):centres.append(((col-(count-1)/2)*3.45,(row-2)*2.99))
for i,(x,y) in enumerate(centres):
 cyl('concrete caisson cell %02d'%i,(x,y,2.8),1.98,5.6,'concrete',rig)
# Shafts and topsides preserve one recognizable object through the whole film.
for i,(x,y) in enumerate([(-3.45,-2.99),(3.45,-2.99),(-3.45,2.99),(3.45,2.99)]):
 cyl('concrete shaft %d'%i,(x,y,23),1.75,34.8,'concrete',rig,.8)
 for z in [6,12,18,24,30,36]:cyl('casting seam',(x,y,z),1.75-(z-5.6)/34.8*.95+.025,.035,'steel',rig)
 for z in [-1.8]:skirtobjs.append(cyl('embedded foundation skirt',(x,y,z),1.95,3.6,'concrete',rig))
box('main support deck',(0,0,40.8),(13,12,1.2),'steel',rig,.08);box('weather deck',(0,0,41.55),(14,12.5,.3),'deck',rig)
random.seed(23)
for i in range(12):
 x=-4.5+(i%4)*3;y=-4+(i//4)*3.5;h=random.uniform(1.3,3.4)
 box('process module %02d'%i,(x,y,41.8+h/2),(2.5,2.9,h),'white' if i%3 else 'steel',rig,.08)
 for j in range(4):box('module panel seam',(x-1.2+j*.8,y-1.46,41.8+h*.55),(.035,.018,h*.7),'steel',rig,0)
for y in [-6,6]:
 for x in [i*.75-6.75 for i in range(19)]:tube('guard rail stanchion',[(x,y,41.8),(x,y,42.5)],.025,'orange',rig)
 for z in [42.15,42.5]:tube('continuous rail',[(-6.8,y,z),(6.8,y,z)],.025,'orange',rig)
for x in [-6.5,6.5]:
 for z in [42.15,42.5]:tube('edge rail',[(x,-6,z),(x,6,z)],.025,'orange',rig)
for i in range(5):tube('visible process pipe',[(-5+i*.38,-5.5,43),(-5+i*.38,4.5,43),(-4+i*.38,4.5,42)],.09,'orange' if i==0 else 'steel',rig)
# Crane and helipad are scale cues, never lift the platform.
tube('deck crane boom',[(4,3,42.3),(5,4,47.2),(9,4,45)],.1,'orange',rig);tube('crane cable',[(9,4,45),(9,4,42)],.02,'steel',rig)
cyl('helipad',(9,-3,42.1),2.7,.18,'deck',rig);tube('helipad border',[(9+2.5*math.cos(i*math.tau/64),-3+2.5*math.sin(i*math.tau/64),42.22) for i in range(65)],.035,'white',rig)
# Representative closed-tank cutaway shown separately at the same base: front wall removed only for illustration.
cut=empty('illustrative single ballast cell');cut.parent=rig;cut.location=(0,-13,3.2)
box('section floor',(0,0,-2.5),(6,4.8,.32),'concrete',cut)
for x in [-2.85,2.85]:box('section sidewall',(x,0,0),(.3,4.8,5.3),'concrete',cut)
box('section back wall',(0,2.25,0),(6,.3,5.3),'concrete',cut);box('cutaway top cap',(0,1.5,2.55),(6,1.8,.3),'concrete',cut)
fill=box('ballast water level',(0,0,-2.2),(5.6,4.4,.2),'water',cut,0)
tube('conceptual inlet',[(-4,1.3,2),(-2.3,1.3,2),(-2.3,1.3,-1.7)],.13,'mint',cut)
for z in [i*.15-1.7 for i in range(24)]:waterfills.append(cyl('inlet water particle',(-2.3,1.3,z),.07,.10,'mint',cut))
arrows=[]
for x,material,direction in [(-4.2,'mint',1),(4.2,'orange',-1)]:
 shaft=cyl('concept force arrow shaft',(x,-3.5,0),.095,2,'mint' if direction==1 else 'orange',cut);tip=cyl('concept force arrow tip',(x,-3.5,direction*1.25),.3,.55,material,cut,0)
 if direction<0:tip.rotation_euler[1]=math.pi
 arrows.extend([shaft,tip])
forcegroups=[]
for x,material,direction in [(-11,'mint',1),(11,'orange',-1)]:
 group=empty('whole facility force '+material);group.parent=rig;group.location=(x,-5,5)
 cyl('whole facility force shaft',(0,0,0),.12,2,material,group);tip=cyl('whole facility force tip',(0,0,direction*1.3),.4,.65,material,group,0)
 if direction<0:tip.rotation_euler[1]=math.pi
 forcegroups.append(group)
# Tugs keep their hulls at the actual sea surface while the GBS sinks.
for i,(x,y) in enumerate([(-9,-10),(9,-10),(-11,-5),(11,-5)]):
 boat=empty('same orange tug %d'%i);boat.parent=vessels;boat.location=(x,y,0)
 box('tug dark hull',(0,0,.2),(1.9,4.5,.9),'dark',boat,.35);box('tug orange deck',(0,0,.75),(1.85,4.4,.25),'orange',boat,.2);box('tug wheelhouse',(0,-.3,1.35),(1.3,1.8,1),'white',boat,.12);box('tug window',(0,-1.22,1.52),(1.15,.04,.4),'glass',boat)
 tube('tug mast',[(0,.1,1.85),(0,.1,2.9)],.04,'steel',boat)
 for j in range(3):tube('boat wake',[(sg*(.9+u*.6),2.2+u*1.2,.025) for u,sg in [(0,1),(1+j,1),(2+j,1)]],.025,'white',boat)
 tube('taut tow line',[(x,y+2,1),(x*.55,-4,3)],.025,'steel',vessels)
# Environment continues behind every shot: seabed, sea and a fjord skyline.
box('seabed',(0,18,-32.6),(300,180,4.6),'bed',bevel=0)
box('open water back',(0,75,-.12),(500,150,.18),'water',bevel=0)
# A vertical distant water section separates the submerged region from the sky.
box('deep water background',(0,30,-16),(400,.2,32),'water',bevel=0)
front=box('near sea surface',(0,-75,-.12),(500,150,.18),'water',bevel=0)
from mathutils import noise as mnoise
for index in range(7):
 verts=[];faces=[];n=24
 for j in range(n):
  for i in range(n):
   x=(i/(n-1)-.5)*42;y=(j/(n-1)-.5)*34
   z=max(0,(1-(x/23)**2-(y/21)**2))*14*(.7+.3*math.sin(index*1.7))+2*mnoise.fractal(Vector((x*.13,y*.13,index)),1,2,3)
   verts.append((x+index*38-110,y+110,z-2))
 for j in range(n-1):
  for i in range(n-1):k=j*n+i;faces.append((k,k+1,k+n+1,k+n))
 me=bpy.data.meshes.new('fjord terrain');me.from_pydata(verts,[],faces);me.update();o=bpy.data.objects.new('rocky fjord terrain',me);S.collection.objects.link(o);finish(o,'rocky fjord terrain','land')
bpy.ops.object.light_add(type='SUN',location=(-35,-25,60));sun=bpy.context.object;sun.data.energy=3;sun.data.angle=.08;sun.rotation_euler=(.4,-.45,-.45)
bpy.ops.object.light_add(type='AREA',location=(0,-30,28));lamp=bpy.context.object;lamp.data.energy=14000;lamp.data.size=35;lamp.rotation_euler=(Vector((0,0,10))-lamp.location).to_track_quat('-Z','Y').to_euler()
bpy.ops.object.camera_add();cam=bpy.context.object;S.camera=cam;cam.data.clip_start=.1;cam.data.clip_end=800
smooth=lambda v:max(0,min(1,v))**2*(3-2*max(0,min(1,v)))
def pose(shot,u):
 q=smooth(u);installed=shot in ['foundation','payoff'];sink=smooth((u-.6)/.4) if shot=='ballast' else 1 if installed else 0
 rig.location=(0,-2+4*u if shot in ['hook','harbour','tow'] else 0,-22.5-7.8*sink);vessels.location=(0,rig.location.y,0)
 front.hide_render=shot in ['hook','buoyancy','tow','ballast','foundation'];near=shot=='buoyancy' or (shot=='ballast' and u<.6)
 for o in [cut,*cut.children]:o.hide_render=not near
 for o in arrows:o.hide_render=shot!='buoyancy'
 for i,g in enumerate(forcegroups):
  for o in [g,*g.children]:o.hide_render=shot!='ballast' or near
  g.scale.z=1+.7*(sink if i==0 else min(1,u/.6))
 for i,o in enumerate(waterfills):
  o.hide_render=shot!='ballast' or not near;o.location.z=2-((i*.15+u*5)%3.7)
 level=.15+4.5*smooth(u/.6) if shot=='ballast' else .15;fill.scale.z=level/.2;fill.location.z=-2.3+level/2
 for o in [vessels,*vessels.children_recursive]:o.hide_render=near or installed
 if near:
  # Isolate a representative cell without implying the actual whole caisson is open.
  target=rig.location+Vector((0,-13,3.2));cam.location=target+Vector((11-1.5*u,-20,7));cam.data.lens=40
 else:
  views={'hook':((46,-82,13),(0,0,0),36),'harbour':((53,-100,30),(0,0,8),36),'tow':((52,-93,16),(0,0,-1),34),'ballast':((28,-45,-9),(0,0,-24),36),'foundation':((28,-45,-9),(0,0,-24),36),'payoff':((42,-77,24),(0,0,7),36)}
  cp,tp,l=views[shot];cam.location=Vector(cp)+Vector((-3*u,2*u,0));target=Vector(tp);cam.data.lens=l
 cam.rotation_euler=(target-cam.location).to_track_quat('-Z','Y').to_euler()
 bpy.context.view_layer.update()
 assert abs(rig.rotation_euler.x)<1e-8 and abs(rig.rotation_euler.y)<1e-8,'platform must remain upright'
 assert rig.location.z>=-30.3-1e-6,'no free fall through seabed'
shots=['hook','harbour','buoyancy','tow','ballast','foundation','payoff'];manifest={'sourceHash':hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),'engine':S.render.engine,'samples':48 if a.engine=='CYCLES' else 128,'percent':a.percent,'device':S.cycles.device,'illustrativeGeometry':True,'uprightTow':True,'shots':[]}
if a.preview:
 for sh in shots if a.shot=='all' else [a.shot]:
  pose(sh,.5);S.render.filepath=str(a.out/(sh+'.png'));bpy.ops.render.render(write_still=True)
 (a.out/'preview-manifest.json').write_text(json.dumps(manifest,indent=2));raise SystemExit()
tl=json.loads(a.timeline.read_text());mp=a.out/'render-manifest.json'
if mp.exists():
 old=json.loads(mp.read_text())
 if all(old.get(k)==manifest[k] for k in ['sourceHash','percent','samples','engine']):manifest=old
started=time.time()
for beat in tl['beats']:
 sh=beat['id']
 if a.shot!='all' and sh!=a.shot:continue
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
