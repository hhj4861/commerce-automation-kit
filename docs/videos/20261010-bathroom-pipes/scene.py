"""Original conceptual bathroom plumbing. Spatial explanation, not a construction drawing."""
import argparse,hashlib,json,math,sys,time
from pathlib import Path
import bpy
from mathutils import Vector
P=argparse.ArgumentParser();P.add_argument('--out',type=Path,required=True);P.add_argument('--timeline',type=Path);P.add_argument('--preview',action='store_true');P.add_argument('--shot',default='all');P.add_argument('--percent',type=int,default=100);P.add_argument('--samples',type=int,default=64)
a=P.parse_args(sys.argv[sys.argv.index('--')+1:]);a.out.mkdir(parents=True,exist_ok=True)
S=bpy.context.scene;bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
S.render.engine='CYCLES';S.cycles.samples=a.samples;S.cycles.use_denoising=True;S.cycles.max_bounces=6;S.render.use_persistent_data=True
pref=bpy.context.preferences.addons['cycles'].preferences;pref.compute_device_type='METAL';pref.get_devices()
for dev in pref.devices:dev.use=dev.type=='METAL'
S.cycles.device='GPU';S.render.resolution_x=1080;S.render.resolution_y=1920;S.render.resolution_percentage=a.percent;S.render.fps=24;S.view_settings.view_transform='AgX';S.view_settings.look='AgX - Medium High Contrast';S.view_settings.exposure=-.65
S.world.use_nodes=True;S.world.node_tree.nodes['Background'].inputs[0].default_value=(.63,.72,.8,1);S.world.node_tree.nodes['Background'].inputs[1].default_value=.28
M={}
def material(name,c,rough=.4,metal=0,texture=0):
 m=bpy.data.materials.new(name);m.use_nodes=True;q=m.node_tree.nodes.get('Principled BSDF');q.inputs['Base Color'].default_value=(*c,1);q.inputs['Roughness'].default_value=rough;q.inputs['Metallic'].default_value=metal
 if texture:
  n=m.node_tree.nodes.new('ShaderNodeTexNoise');n.inputs['Scale'].default_value=texture;n.inputs['Detail'].default_value=3;b=m.node_tree.nodes.new('ShaderNodeBump');b.inputs['Strength'].default_value=.18;b.inputs['Distance'].default_value=.007;m.node_tree.links.new(n.outputs['Fac'],b.inputs['Height']);m.node_tree.links.new(b.outputs[0],q.inputs['Normal'])
 M[name]=m;return m
for name,c,r,met,tx in [('porcelain',(.89,.91,.87),.18,0,0),('tile',(.49,.43,.34),.55,0,80),('floor',(.32,.32,.28),.6,0,80),('grout',(.15,.17,.16),.8,0,0),('concrete',(.28,.30,.30),.85,0,24),('oak',(.3,.14,.055),.43,0,25),('steel',(.3,.33,.35),.23,.8,0),('pipe',(.29,.35,.39),.29,.12,0),('dark',(.017,.028,.032),.7,0,0),('ceiling',(.74,.73,.68),.7,0,0),('water',(.014,.45,.62),.2,.25,0),('linen',(.31,.49,.45),.9,0,80),('amber',(.9,.39,.08),.33,.2,0),('mirror',(.65,.74,.78),.13,.94,0)]:material(name,c,r,met,tx)
q=M['water'].node_tree.nodes['Principled BSDF'];q.inputs['Emission Color'].default_value=(.0,.48,.75,1);q.inputs['Emission Strength'].default_value=.7
M['glass']=material('glass',(.55,.69,.70),.12);q=M['glass'].node_tree.nodes['Principled BSDF'];q.inputs['Transmission Weight'].default_value=.8;q.inputs['IOR'].default_value=1.45
G={}
def put(o,name,mat,group):
 o.name=name;o.data.materials.append(M[mat]);G.setdefault(group,[]).append(o);return o
def mesh(name,vs,fs,mat,group):
 d=bpy.data.meshes.new(name);d.from_pydata(vs,[],fs);d.update();o=bpy.data.objects.new(name,d);S.collection.objects.link(o);return put(o,name,mat,group)
def box(name,loc,size,mat,group,b=.012):
 x,y,z=[v/2 for v in size];o=mesh(name,[(-x,-y,-z),(x,-y,-z),(x,y,-z),(-x,y,-z),(-x,-y,z),(x,-y,z),(x,y,z),(-x,y,z)],[(0,3,2,1),(4,5,6,7),(0,1,5,4),(1,2,6,5),(2,3,7,6),(3,0,4,7)],mat,group);o.location=loc
 if b:mod=o.modifiers.new('rounded edges','BEVEL');mod.width=b;mod.segments=3;o.modifiers.new('weighted normals','WEIGHTED_NORMAL')
 return o
def tube(name,pts,r,mat,group):
 d=bpy.data.curves.new(name,'CURVE');d.dimensions='3D';d.bevel_depth=r;d.bevel_resolution=4;d.resolution_u=12;sp=d.splines.new('POLY');sp.points.add(len(pts)-1)
 for point,co in zip(sp.points,pts):point.co=(*co,1)
 o=bpy.data.objects.new(name,d);S.collection.objects.link(o);return put(o,name,mat,group)
def sphere(name,loc,scale,mat,group):
 bpy.ops.mesh.primitive_uv_sphere_add(segments=32,ring_count=16,location=loc);o=put(bpy.context.object,name,mat,group);o.scale=scale
 for face in o.data.polygons:face.use_smooth=True
 return o
def oval(name,loc,profile,mat,group):
 # Lathe-like elliptical shell, closed cross-section retains a real open bowl.
 N=64;vs=[]
 for rx,ry,z in profile:
  for j in range(N):ang=2*math.pi*j/N;vs.append((loc[0]+rx*math.cos(ang),loc[1]+ry*math.sin(ang),loc[2]+z))
 fs=[]
 for k in range(len(profile)-1):
  for j in range(N):v=k*N+j;w=k*N+(j+1)%N;fs.append((v,w,w+N,v+N))
 o=mesh(name,vs,fs,mat,group)
 for face in o.data.polygons:face.use_smooth=True
 return o
def ring(name,loc,rad,mat,group,axis='Z'):
 bpy.ops.mesh.primitive_torus_add(major_segments=48,minor_segments=10,major_radius=rad,minor_radius=.009,location=loc);o=put(bpy.context.object,name,mat,group)
 if axis=='X':o.rotation_euler[1]=math.pi/2
 return o
# Room: x horizontal, front open at y=-1.55. Same dimensions at both floors.
slabs=[]
for level,z in [('lower',0),('upper',3.15)]:
 slabs.append(box('structural floor '+level,(0,0,z-.12),(3.5,3.3,.22),'concrete',level))
 box('tile bed '+level,(0,0,z+.015),(3.4,3.2,.035),'grout',level)
 for ix in range(6):
  for iy in range(6):box('floor ceramic '+level,(-1.4+ix*.56,-1.33+iy*.535,z+.042),(.55,.525,.035),'floor',level,b=.004)
 box('rear wall '+level,(0,1.62,z+1.33),(3.5,.12,2.66),'grout',level)
 for ix in range(6):
  for iz in range(5):box('wall tile '+level,(-1.42+ix*.565,1.548,z+.26+iz*.525),(.557,.045,.517),'tile',level,b=.006)
 box('left room wall '+level,(-1.74,.25,z+1.33),(.12,2.75,2.66),'tile',level)
 # Vanity with side flutes and stone countertop.
 box('oak vanity '+level,(.66,1.04,z+.62),(1.12,.77,.57),'oak',level,b=.035)
 for i in range(20):box('fluted cabinet front',(.145+i*.054,.645,z+.62),(.025,.025,.5),'oak',level,b=.008)
 box('countertop',(.66,1.04,z+.935),(1.2,.84,.065),'porcelain',level,b=.022)
 oval('basin',(.66,1.0,z+.98),[(.27,.20,0),(.32,.245,.12),(.30,.225,.14),(.24,.17,.075),(.02,.02,.04)],'porcelain',level)
 tube('faucet',[(.66,1.31,z+.97),(.66,1.31,z+1.30),(.66,1.12,z+1.30)],.021,'steel',level)
 box('mirror rim',(.66,1.47,z+1.85),(1.12,.08,1.2),'steel',level,b=.08);box('mirror',(.66,1.42,z+1.85),(1.05,.015,1.12),'mirror',level,b=.07)
 tube('towel rail',[(-1.62,.95,z+1.35),(-1.62,.1,z+1.35)],.022,'steel',level);box('folded towel',(-1.60,.44,z+1.04),(.06,.48,.58),'linen',level,b=.025)
 box('soap dispenser',(.99,1.0,z+1.11),(.1,.1,.25),'dark',level,b=.025);tube('soap pump',[(.99,1.0,z+1.24),(.99,1.0,z+1.29),(.92,1.0,z+1.29)],.014,'steel',level)
 # WC bowl at x=-.63,y=.68, facing the front.
 group=level+'wc';cx,cy=-.64,.58
 oval('WC pedestal',(cx,cy,z),[(.15,.18,.06),(.16,.21,.25),(.24,.31,.38)],'porcelain',group)
 oval('WC bowl',(cx,cy,z),[(.16,.21,.23),(.27,.36,.36),(.28,.37,.47),(.26,.35,.50),(.22,.30,.49),(.19,.25,.36),(.085,.12,.29)],'porcelain',group)
 oval('seat',(cx,cy,z),[(.275,.365,.50),(.283,.373,.52),(.273,.363,.54),(.215,.29,.54),(.209,.284,.52),(.22,.30,.50)],'porcelain',group)
 sphere('water inside bowl',(cx,cy,z+.325),(.12,.17,.012),'water',group)
 box('cistern',(cx,1.03,z+.60),(.51,.25,.58),'porcelain',group,b=.055);box('cistern lid',(cx,1.03,z+.905),(.53,.27,.045),'porcelain',group,b=.025)
 box('flush button',(cx,1.04,z+.934),(.13,.05,.018),'steel',group,b=.009)
# Ceiling has panels and true openable access hatch.
ceiling=[]
for x,y,w,h in [(-1.36,0,.68,3.2),(.71,0,2.06,3.2),(-.67,-.75,.70,1.7),(-.67,1.20,.70,.8)]:ceiling.append(box('lower ceiling panel',(x,y,2.54),(w,h,.055),'ceiling','ceiling'))
ceilingBase=[o.location.copy()for o in ceiling]
hatch=box('inspection hatch',(-.62,.42,2.49),(.66,.72,.035),'ceiling','hatch')
# Under-slab path is continuously downhill after the vertical outlet.
route=[(-.64,.58,3.45),(-.64,.58,2.85)]
for j in range(13):t=j/12*math.pi/2;route.append((-.64+.18*(1-math.cos(t)),.58,2.85-.18*math.sin(t)))
route +=[(x,.58,2.67-(x+.46)*.035)for x in [-.25,0,.25,.5,.75,1.0,1.25,1.40]]
pipe=tube('upstairs waste pipe',route,.073,'pipe','under')
# Visible half-shell in teaching closeups; consistent centerline, no floating water outside pipe.
cutpts=route
for j in range(len(cutpts)-1):
 p0,p1=Vector(cutpts[j]),Vector(cutpts[j+1]);axis=(p1-p0).normalized();u=axis.cross(Vector((0,-1,0))).normalized();v=axis.cross(u).normalized();verts=[]
 for q in [p0,p1]:
  for k in range(17):ang=math.pi*k/16;co=q+(u*math.cos(ang)+v*math.sin(ang))*.076;verts.append(tuple(co))
 ob=mesh('pipe section shell',verts,[(k,k+1,k+18,k+17)for k in range(16)],'pipe','openpipe')
 for f in ob.data.polygons:f.use_smooth=True
stack=tube('shared vertical waste stack',[(1.48,.58,-.3),(1.48,.58,6.25)],.105,'pipe','stack')
for z in [.3,1.65,2.60,3.5,5.1]:ring('stack socket',(1.48,.58,z),.109,'steel','stack')
for x in [-.15,.65,1.18]:
 z=2.67-(x+.46)*.035;ring('pipe coupling',(x,.58,z),.082,'steel','under','X');tube('pipe suspension',[(x,.58,3.025),(x,.58,z+.07)],.012,'steel','under')
# Wall drainage alternative with concealed cistern and rear outlet, all ABOVE upper slab.
for x,z,w,h in [(-1.36,4.43,.66,2.5),(1.60,4.43,.22,2.5),(-.63,5.25,.80,.86),(-.63,3.45,.80,.46)]:box('service wall edge',(x,1.22,z),(w,.55,h),'tile','service')
box('removable wall panel',(-.63,.928,4.14),(.95,.035,.95),'tile','servicepanel')
box('flush plate',(-.63,.899,4.30),(.29,.025,.17),'steel','servicepanel',b=.018)
altpath=[(-.64,.63,3.55),(-.64,1.09,3.55),(-.38,1.18,3.54),(.20,1.18,3.52),(.9,1.18,3.50),(1.48,1.18,3.48),(1.48,.58,3.47)]
altpipe=tube('same-floor rear drainage',altpath,.073,'pipe','alternative')
for j in range(len(altpath)-1):
 p0,p1=Vector(altpath[j]),Vector(altpath[j+1]);axis=(p1-p0).normalized();u=axis.cross(Vector((0,-1,.01))).normalized();v=axis.cross(u).normalized();vertices=[]
 for q in [p0,p1]:
  for k in range(17):ang=math.pi*k/16;vertices.append(tuple(q+(u*math.cos(ang)+v*math.sin(ang))*.076))
 ob=mesh('same floor cut pipe',vertices,[(k,k+1,k+18,k+17)for k in range(16)],'pipe','altopen')
 for f in ob.data.polygons:f.use_smooth=True
box('concealed cistern',(-.64,1.25,4.10),(.53,.19,.69),'dark','alternative',b=.045)
# Visible moving flow beads are explanatory markers, not sewage simulation.
beads=[sphere('flow marker',(0,0,0),(.052,.052,.052),'water','markers')for i in range(18)]
rings=[ring('illustrative vibration',(0,0,0),.16,'amber','sound','X')for i in range(4)]
# Architectural surround and daylight; not a floating toy on an empty backdrop.
box('building rear mass',(0,1.95,2.9),(12,.55,6.9),'concrete','context')
for x in [-4.3,4.3]:
 box('adjacent apartment wall',(x,.3,3),(3.6,3.3,6.5),'ceiling','context')
 for z in [.8,3.95]:
  box('neighbor window dark recess',(x,-1.38,z+1),(1.9,.08,1.65),'dark','context');box('neighbor glass',(x,-1.44,z+1),(1.82,.015,1.57),'glass','context');box('window mullion',(x,-1.47,z+1),(.045,.04,1.6),'steel','context')
box('continuous ground',(0,0,-.35),(200,200,.25),'floor','context',b=0)
def area(name,loc,power,color,size,target):
 d=bpy.data.lights.new(name,'AREA');d.energy=power;d.color=color;d.shape='DISK';d.size=size;o=bpy.data.objects.new(name,d);S.collection.objects.link(o);o.location=loc;o.rotation_euler=(Vector(target)-o.location).to_track_quat('-Z','Y').to_euler()
area('daylight',(0,-4.5,7),1200,(.78,.87,1),6,(0,.5,3));area('warm side',(-3,-.5,5),650,(1,.76,.51),4,(0,.8,3))
for z in [1.8,4.95]:area('bathroom soft fixture',(.5,.2,z),65,(1,.87,.68),1.5,(0,.9,z-.5))
camd=bpy.data.cameras.new('architectural camera');cam=bpy.data.objects.new('camera',camd);S.collection.objects.link(cam);S.camera=cam;camd.clip_start=.03;camd.clip_end=300
focus=bpy.data.objects.new('focus',None);S.collection.objects.link(focus);camd.dof.use_dof=True;camd.dof.focus_object=focus;camd.dof.aperture_fstop=7

def visible(group,on):
 for o in G.get(group,[]):o.hide_render=not on

def camera(loc,target,lens):cam.location=loc;cam.rotation_euler=(Vector(target)-cam.location).to_track_quat('-Z','Y').to_euler();camd.lens=lens;focus.location=target

def point_path(points,u):
 lengths=[(Vector(b)-Vector(a)).length for a,b in zip(points,points[1:])];pos=u*sum(lengths)
 for i,length in enumerate(lengths):
  if pos<=length:return Vector(points[i]).lerp(Vector(points[i+1]),pos/length)
  pos-=length
 return Vector(points[-1])

def state(shot,t,d):
 u=min(1,t/max(.001,d));ease=u*u*(3-2*u)
 for k in G:visible(k,True)
 for k in ['openpipe','altopen','markers','sound','service','servicepanel','alternative']:visible(k,False)
 for i,o in enumerate(ceiling):o.location=ceilingBase[i].copy()
 hatch.location=(-.62,.42,2.49)
 visible('ceiling',shot in ['hook','cost','ending']);visible('hatch',shot in ['hook','cost','ending'])
 for ring0 in rings:ring0.scale=(1,1,1)
 if shot=='hook':
  visible('upper',False);visible('upperwc',False);visible('context',False);visible('under',False);visible('stack',False);camera((.1,-2.65,1.5),(-.15,1,1.58+ease*.13),23);hatch.location.y=.42-ease*.12
 elif shot in ['reveal','ending']:
  camera((4.3-.4*ease,-8.0,3.20+.10*ease),(0,.3,3.05),41)
  if shot=='reveal':
   visible('ceiling',True)
   for o,base in zip(ceiling,ceilingBase):o.location.x=base.x-7*min(1,u*3)
   visible('ceiling',u<.33)
  visible('markers',True);pipe.hide_render=True;visible('openpipe',True)
 elif shot=='gravity':
  visible('upper',True);visible('upperwc',True);visible('under',False);visible('openpipe',True);visible('markers',True);camera((.65-.15*ease,-4.6,2.48),(.38,.58,2.68),45)
 elif shot=='space':
  visible('upperwc',False);visible('ceiling',True);camera((1.8,-4.1,2.25),(.0,.58,2.75),48)
  for o,base in zip(ceiling,ceilingBase):o.location.x=base.x-7*min(1,u*3)
  visible('ceiling',u<.33)
 elif shot=='cost':
  visible('upper',False);visible('upperwc',False);visible('context',False);visible('sound',True);camera((2.65,-4.5,2.7),(-.1,.65,1.95),43);hatch.location.y=.42-1.1*ease
  for o,base in zip(ceiling,ceilingBase):o.location.x=base.x-7*max(0,(u-.45)/.55)
  visible('ceiling',u<.8)
 elif shot in ['alternative','tradeoff']:
  visible('lower',False);visible('lowerwc',False);visible('context',False);visible('under',False);visible('service',True);visible('servicepanel',True);visible('alternative',True);visible('markers',True)
  for o in G['upperwc']:
   if any(word in o.name for word in ['cistern','pedestal','flush button']):o.hide_render=True
  panelShift=min(1,u*3)*.95
  for o in G['servicepanel']:o.location.x=-.63-panelShift
  # Reveal only the wall edges; opaque service block must not hide the actual pipe route.
  visible('service',True);altpipe.hide_render=True;visible('altopen',True)
  for ob in G['upper']:
   if any(w in ob.name for w in ['vanity','cabinet','countertop','basin','faucet','mirror','soap']):ob.hide_render=True
  camera((2.0-.6*ease,-4.4,4.8),(-.25,.95,4.12),36 if shot=='alternative' else 43)
 for j,o in enumerate(beads):
  path=altpath+[(1.48,.58,3.0)]if shot in ['alternative','tradeoff']else route+[(1.48,.58,2.59),(1.48,.58,1.3)];o.location=point_path(path,(t*.34+j/len(beads))%1)
 for j,o in enumerate(rings):
  v=(t*.65+j*.25)%1;o.location=(-.15,.58,2.68);o.scale=(1+v*3,1+v*3,1+v*3);o.hide_render=shot!='cost' or v>.85
 # Keep everything above the floor in alternate route; no downward pipe passes through slab.

shots=['hook','reveal','gravity','space','cost','alternative','tradeoff','ending']
if a.preview:
 for shot in shots if a.shot=='all' else [a.shot]:
  state(shot,3,7);S.render.image_settings.file_format='PNG';S.render.filepath=str(a.out/(shot+'.png'));bpy.ops.render.render(write_still=True)
else:
 timeline=json.loads(a.timeline.read_text());results=[]
 for beat in timeline['beats']:
  shot=beat['id']
  if shot=='hook' or a.shot not in ['all',shot]:continue
  duration=beat['duration'];S.frame_start=1;S.frame_end=round(duration*24)
  bpy.app.handlers.frame_change_pre.clear()
  def update(scene,dep=None,shot=shot,duration=duration):state(shot,(scene.frame_current-1)/24,duration)
  bpy.app.handlers.frame_change_pre.append(update);S.frame_set(1)
  S.render.image_settings.file_format='FFMPEG';S.render.ffmpeg.format='MPEG4';S.render.ffmpeg.codec='H264';S.render.ffmpeg.constant_rate_factor='HIGH';S.render.ffmpeg.ffmpeg_preset='GOOD';S.render.filepath=str(a.out/(shot+'.mp4'));bpy.ops.render.render(animation=True)
  results.append(dict(shot=shot,frames=S.frame_end,sha256=hashlib.sha256((a.out/(shot+'.mp4')).read_bytes()).hexdigest()))
  (a.out/'render-manifest.json').write_text(json.dumps(dict(sourceHash=hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),samples=a.samples,percentage=a.percent,resolution=[1080,1920],shots=results),indent=2));print('SHOT COMPLETE',shot,flush=True)
