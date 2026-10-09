"""Original illustrative Falkirk model, rigid kinematics and horizontal gondolas.
Not a dimensioned replica; water arrows indicate displacement, not a CFD result.
"""
import bpy,math,json,sys,argparse,subprocess
from pathlib import Path
from mathutils import Vector
from bpy.app.handlers import persistent
p=argparse.ArgumentParser();p.add_argument('--cache',type=Path,required=True);p.add_argument('--shot',default='problem');p.add_argument('--preview',action='store_true');a=p.parse_args(sys.argv[sys.argv.index('--')+1:]);C=a.cache
# Return to the same already-rendered lift cycle after the displacement close-up.
# Preserve full-quality Cycles pixels; only conform the silent visual to narration length.
if a.shot=='balance' and not a.preview:
 source=C/'clips/problem.mp4';tl=json.loads((C/'timeline.json').read_text());d0=next(b['duration']for b in tl['beats']if b['id']=='problem');d1=next(b['duration']for b in tl['beats']if b['id']=='balance')
 subprocess.run(['ffmpeg','-v','error','-y','-i',str(source),'-vf',f'setpts={d1/d0}*PTS,fps=24','-frames:v',str(round(d1*24)),'-an','-c:v','libx264','-crf','18','-pix_fmt','yuv420p',str(C/'clips/balance.mp4')],check=True)
 (C/'qa/balance-reuse.json').write_text(json.dumps({'source':'clips/problem.mp4','sourceEngine':'CYCLES','samples':48,'width':1080,'height':1920,'frames':round(d1*24),'purpose':'revisit same balanced half turn following close-up','narrationSpeedUnchanged':True}))
 print('DONE balance',flush=True);raise SystemExit(0)
S=bpy.context.scene;bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
S.render.engine='CYCLES';S.cycles.samples=48;S.cycles.use_denoising=True;S.render.use_persistent_data=True
prefs=bpy.context.preferences.addons['cycles'].preferences
try:
 prefs.compute_device_type='METAL';prefs.get_devices()
 for d in prefs.devices:d.use=d.type=='METAL'
 S.cycles.device='GPU'
except Exception:pass
S.render.resolution_x=1080;S.render.resolution_y=1920;S.render.resolution_percentage=100;S.render.fps=24
S.view_settings.view_transform='AgX';S.view_settings.look='AgX - Medium High Contrast'
S.world.use_nodes=True;S.world.node_tree.nodes['Background'].inputs[0].default_value=(.13,.20,.28,1);S.world.node_tree.nodes['Background'].inputs[1].default_value=.45
M={}
def mat(name,color,metal=0,rough=.4):
 m=bpy.data.materials.new(name);m.use_nodes=True;n=m.node_tree.nodes.get('Principled BSDF');n.inputs['Base Color'].default_value=(*color,1);n.inputs['Metallic'].default_value=metal;n.inputs['Roughness'].default_value=rough;M[name]=m;return n
mat('steel',(.25,.34,.4),.75,.3);mat('ink',(.015,.036,.045),.4,.32);mat('bronze',(.67,.38,.1),.7,.27);mat('boat',(.74,.22,.055),.28,.29);mat('cream',(.91,.79,.56),.1,.47);mat('glass',(.015,.055,.07),.5,.13);mat('stone',(.27,.3,.25),0,.78);mat('grass',(.14,.23,.14),0,.92);mat('leaf',(.09,.19,.12),0,.85);mat('water',(.015,.24,.29),.35,.14);mat('flow',(.1,.78,.9),.2,.2)
for nm in ['steel','stone']:
 n=M[nm].node_tree;noise=n.nodes.new('ShaderNodeTexNoise');noise.inputs['Scale'].default_value=55 if nm=='steel'else 18;b=n.nodes.new('ShaderNodeBump');b.inputs['Strength'].default_value=.08;b.inputs['Distance'].default_value=.025;n.links.new(noise.outputs['Fac'],b.inputs['Height']);n.links.new(b.outputs['Normal'],n.nodes.get('Principled BSDF').inputs['Normal'])
mat('light',(1,.62,.22),0,.3);n=M['light'].node_tree.nodes.get('Principled BSDF');n.inputs['Emission Color'].default_value=(1,.4,.05,1);n.inputs['Emission Strength'].default_value=2
objs=[]
def finish(o,name,material,parent=None):
 o.name=name;o.data.materials.append(M[material]);o.parent=parent;return o

def box(name,loc,scale,material,parent=None,bev=.06):
 bpy.ops.mesh.primitive_cube_add(size=1,location=loc);o=bpy.context.object;o.dimensions=scale;bpy.ops.object.transform_apply(location=False,rotation=False,scale=True);finish(o,name,material,parent)
 if bev:q=o.modifiers.new('soft precise edges','BEVEL');q.width=bev;q.segments=3;o.modifiers.new('normals','WEIGHTED_NORMAL')
 return o

def rod(name,start,end,r,material,parent=None):
 v=Vector(end)-Vector(start);bpy.ops.mesh.primitive_cylinder_add(vertices=24,radius=r,depth=v.length,location=(Vector(start)+Vector(end))/2);o=bpy.context.object;o.rotation_euler=v.to_track_quat('Z','Y').to_euler();finish(o,name,material,parent)
 for f in o.data.polygons:f.use_smooth=True
 return o

def empty(name):o=bpy.data.objects.new(name,None);S.collection.objects.link(o);return o

def ring(name,loc,r,material,parent=None):
 bpy.ops.mesh.primitive_torus_add(major_radius=r,minor_radius=.15,major_segments=64,minor_segments=12,location=loc,rotation=(math.pi/2,0,0));return finish(bpy.context.object,name,material,parent)

def boat(name,parent):
 root=empty(name);root.parent=parent
 # Tapered ends form a real hull silhouette instead of a floating rectangle.
 vs=[(-.75,-2.7,.48),(.75,-2.7,.48),(.85,2.2,.48),(-.85,2.2,.48),(-.45,-3.1,-.12),(.45,-3.1,-.12),(.65,2.4,-.12),(-.65,2.4,-.12)]
 me=bpy.data.meshes.new('hull');me.from_pydata(vs,[],[(0,1,5,4),(1,2,6,5),(2,3,7,6),(3,0,4,7),(4,5,6,7),(0,3,2,1)]);o=bpy.data.objects.new('orange hull',me);S.collection.objects.link(o);finish(o,'orange hull','boat',root);b=o.modifiers.new('hull edge','BEVEL');b.width=.1;b.segments=3;o.modifiers.new('hull normal','WEIGHTED_NORMAL')
 box('cream cabin',(0,.1,.95),(1.38,3.5,1),'cream',root);box('roof',(0,.1,1.51),(1.58,3.7,.15),'ink',root)
 for y in [-1.15,-.2,.75,1.5]:
  for x in [-.701,.701]:box('dark window',(x,y,1.04),(.022,.54,.49),'glass',root,.02)
 box('front glass',(0,-1.663,1.04),(1.05,.025,.54),'glass',root,.02)
 for x in [-.65,.65]:rod('bow rail',(x,-2.7,.65),(x,-1.8,.65),.025,'bronze',root)
 return root

def tank(name,cut=False):
 root=empty(name);box('trough keel',(0,0,-.48),(3.4,8.6,.3),'steel',root)
 for x in [-1.61,1.61]:
  if not(cut and x<0):box('tank side',(x,0,-.03),(.18,8.6,.68),'steel',root)
  for y in [-3.8,-2,0,2,3.8]:rod('railing post',(x,y,.3),(x,y,1.15),.026,'cream',root)
  rod('safety rail',(x,-4,1.15),(x,4,1.15),.028,'cream',root)
 box('water surface',(0,0,-.02),(3.08,8.28,.12),'water',root,.015)
 gate=box('water gate',(0,-4.17,-.05),(3.1,.16,.8),'ink',root)
 for y in [-3.5,3.5]:
  ring('gondola bearing',(0,y,0),2,'steel',root);ring('brass bearing edge',(0,y-.17,0),1.84,'bronze',root)
 return root,gate

def terrain():
 box('terrain',(0,8,.8),(75,90,2),'grass',bev=.2)
 box('basin stone',(0,-5,-.12),(18,24,.75),'stone');box('lower canal',(0,-6,1.86),(15,23,.24),'water')
 for x in [-10,10]:
  for y in range(-10,35,6):
   rod('tree trunk',(x,y,0),(x,y,3),.14,'bronze');bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=2,radius=1.5,location=(x,y,3.5));finish(bpy.context.object,'tree crown','leaf')
 # Aqueduct at high level, aligned with the upper tank's rear gate.
 box('aqueduct deck',(0,15,13.5),(4.1,21,.55),'stone');box('upper water',(0,15,13.85),(3.1,21,.13),'water')
 for x in [-1.9,1.9]:box('aqueduct wall',(x,15,14),(.24,21,1.1),'stone')
 for y in [7,14,21]:
  for x in [-1.5,1.5]:rod('aqueduct columns',(x,y,0),(x,y,13.5),.42,'stone')
 box('motor room',(0,5,8),(4.6,1.7,3.5),'stone');box('motor glint',(-2.31,4.7,8),(.05,.7,.6),'light')
 for x in [-3.9,3.9]:rod('fixed support',(x,5,0),(0,5,8),.7,'stone')
 rod('central axle',(0,-4.2,8),(0,5.8,8),.7,'steel')
 # Tiny stationary visitors provide scale without adding a new story.
 for x,y in [(7,-2),(7,0),(-7,2)]:
  rod('visitor',(x,y,2.6),(x,y,3.1),.13,'cream');bpy.ops.mesh.primitive_uv_sphere_add(segments=12,ring_count=8,radius=.13,location=(x,y,3.34));finish(bpy.context.object,'head','cream')
terrain();tanks=[tank('lower'),tank('upper')];orange=boat('orange narrowboat',tanks[0][0]);arms=[]
for y in [-3.5,3.5]:
 arm=empty('rotating rigid arm');arm.location=(0,y,8);box('arm web',(0,0,0),(1,.50,12),'steel',arm);box('ink spine',(.42,-.29,0),(.08,.045,11),'ink',arm)
 for z in [-6,6]:
  ring('arm circular end',(0,0,z),2.23,'steel',arm)
  for xx in [-.7,.7]:rod('diagonal flange',(xx,0,0),(0,0,z),.18,'steel',arm)
 ring('axle trim',(0,-.35,0),.85,'bronze',arm);arms.append(arm)
# Separate close-up scene in same environment. Full object geometry remains off-camera.
close= a.shot=='displace'
flow=[]
if close:
 for o in list(S.objects):
  if o.type=='MESH':o.hide_render=True
 detail,detailgate=tank('detail',True);detail.location=(0,0,1);db=boat('same orange boat',detail)
 box('connecting canal',(0,-10,.98),(3.08,12,.14),'water');box('canal bank',(-2,-10,.3),(1,12,1.4),'stone');box('canal bank',(2,-10,.3),(1,12,1.4),'stone');detailgate.location.z=-1
 for j in range(16):
  bpy.ops.mesh.primitive_uv_sphere_add(segments=12,ring_count=8,radius=.085);o=finish(bpy.context.object,'displaced water indicator','flow');flow.append(o)
# Equal arrows explicitly connect weight to buoyancy, then disappear for entry.
force_arrows=[]
if close:
 for x,z0,z1,material in [(-1.15,-.7,1.3,'flow'),(1.15,2.8,.8,'bronze')]:
  force_arrows.append(rod('equal opposing force',(x,0,z0),(x,0,z1),.06,material,db))
  bpy.ops.mesh.primitive_cone_add(vertices=20,radius1=.19,radius2=0,depth=.35,location=(x,0,z1))
  cone=finish(bpy.context.object,'force arrowhead',material,db)
  if z1<z0:cone.rotation_euler.x=math.pi
  force_arrows.append(cone)
# lighting
for name,loc,power,col,size in [('warm key',(-10,-12,24),3800,(1,.73,.41),12),('cool reflection',(13,-2,20),3000,(.49,.73,1),12)]:
 d=bpy.data.lights.new(name,'AREA');d.energy=power;d.color=col;d.shape='DISK';d.size=size;o=bpy.data.objects.new(name,d);S.collection.objects.link(o);o.location=loc;o.rotation_euler=(Vector((0,0,7))-o.location).to_track_quat('-Z','Y').to_euler()
d=bpy.data.lights.new('late sun','SUN');d.energy=2.1;d.color=(1,.78,.5);d.angle=.08;o=bpy.data.objects.new('sun',d);S.collection.objects.link(o);o.rotation_euler=(.45,-.6,-.6)
d=bpy.data.cameras.new('camera');cam=bpy.data.objects.new('camera',d);S.collection.objects.link(cam);S.camera=cam;d.lens=46
TL=json.loads((C/'timeline.json').read_text()) if (C/'timeline.json').exists()else None
D=next((x['duration'] for x in TL['beats'] if x['id']==a.shot),10)if TL else 10
S.frame_start=1;S.frame_end=round(D*24)
def ease(x):x=max(0,min(1,x));return x*x*(3-2*x)
@persistent
def update(scene):
 u=(scene.frame_current-1)/max(1,S.frame_end-1);q=ease(u)
 theta=math.pi*q
 if a.shot=='ending':theta=math.pi
 if a.shot=='level':theta=.4+q*1.6
 for arm in arms:arm.rotation_euler.y=-theta
 for i,(root,gate)in enumerate(tanks):
  phi=theta+i*math.pi;root.location=(6*math.sin(phi),0,8-6*math.cos(phi));root.rotation_euler=(0,0,0)
 if a.shot=='ending':
  orange.location.y=12*ease((u-.20)/.8)
  # Back gate opens only after docking; front gate stays closed.
 if close:
  db.location.y=-6+6*ease((u-.48)/.40)
  for o in force_arrows:o.hide_render=u>.48
  for j,o in enumerate(flow):
   f=(u*2+j/len(flow))%1;o.location=(-1.12+.12*math.sin(j),-2-9*f,1.1);o.hide_render=not(.49<u<.89)
  cam.location=(-10+q,-15+q,11);target=Vector((0,-4+3*q,1));d.lens=42
 elif a.shot=='level':
  root=tanks[0][0];cam.location=root.location+Vector((-9,-12,6));target=root.location+Vector((0,-.5,.5));d.lens=48
 else:
  cam.location=(-22+2*q,-36+4*q,21-2*q);target=Vector((0,1.5,6.8));d.lens=38
 cam.rotation_euler=(target-cam.location).to_track_quat('-Z','Y').to_euler()
bpy.app.handlers.frame_change_pre.clear();bpy.app.handlers.frame_change_pre.append(update)
# Kinematic checks: fixed radius, opposite positions, globally level containers.
checks=[]
for f in [1,max(1,S.frame_end//2),S.frame_end]:
 S.frame_set(f);a0=tanks[0][0];b0=tanks[1][0];assert abs((a0.location-Vector((0,0,8))).length-6)<1e-5;assert (a0.location+b0.location-Vector((0,0,16))).length<1e-5;assert max(abs(x)for x in a0.rotation_euler)<1e-8;checks.append({'frame':f,'level':True,'radius':6})
(C/'qa'/f'{a.shot}-kinematics.json').write_text(json.dumps(checks))
if a.preview:
 for f in [1,max(1,S.frame_end//2)]:
  S.frame_set(f);S.render.image_settings.file_format='PNG';S.render.filepath=str(C/'qa'/f'{a.shot}-{f}.png');bpy.ops.render.render(write_still=True)
else:
 S.render.image_settings.file_format='FFMPEG';S.render.ffmpeg.format='MPEG4';S.render.ffmpeg.codec='H264';S.render.ffmpeg.constant_rate_factor='HIGH';S.render.ffmpeg.ffmpeg_preset='GOOD';S.render.filepath=str(C/'clips'/f'{a.shot}.mp4');S.frame_set(1);bpy.ops.render.render(animation=True)
print('DONE',a.shot,flush=True)
