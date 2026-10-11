"""Original Sapporo hovering pitch explanatory reconstruction; not construction geometry."""
import argparse,hashlib,json,math,sys,time,subprocess,random
from pathlib import Path
import bpy
from mathutils import Vector
P=argparse.ArgumentParser();P.add_argument('--out',type=Path,required=True);P.add_argument('--timeline',type=Path);P.add_argument('--preview',action='store_true');P.add_argument('--shot',default='all');P.add_argument('--percent',type=int,default=100);P.add_argument('--samples',type=int,default=48)
a=P.parse_args(sys.argv[sys.argv.index('--')+1:]);a.out.mkdir(parents=True,exist_ok=True)
S=bpy.context.scene;bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
S.render.engine='CYCLES';S.cycles.samples=a.samples;S.cycles.use_denoising=True;S.cycles.max_bounces=4;S.render.use_persistent_data=True
pref=bpy.context.preferences.addons['cycles'].preferences;pref.compute_device_type='METAL';pref.get_devices()
for dev in pref.devices:dev.use=dev.type=='METAL'
S.cycles.device='GPU';S.render.resolution_x=1080;S.render.resolution_y=1920;S.render.resolution_percentage=a.percent;S.render.fps=24;S.view_settings.view_transform='AgX';S.view_settings.look='AgX - Medium High Contrast';S.view_settings.exposure=-.35
S.world.use_nodes=True;S.world.node_tree.nodes['Background'].inputs[0].default_value=(.52,.66,.82,1);S.world.node_tree.nodes['Background'].inputs[1].default_value=.5
M={};G={};random.seed(11)
def mat(n,c,r=.5,metal=0,noise=0):
 m=bpy.data.materials.new(n);m.use_nodes=True;q=m.node_tree.nodes.get('Principled BSDF');q.inputs['Base Color'].default_value=(*c,1);q.inputs['Roughness'].default_value=r;q.inputs['Metallic'].default_value=metal
 if noise:
  t=m.node_tree.nodes.new('ShaderNodeTexNoise');t.inputs['Scale'].default_value=noise;t.inputs['Detail'].default_value=3;b=m.node_tree.nodes.new('ShaderNodeBump');b.inputs['Strength'].default_value=.22;b.inputs['Distance'].default_value=.015;m.node_tree.links.new(t.outputs['Fac'],b.inputs['Height']);m.node_tree.links.new(b.outputs[0],q.inputs['Normal'])
 M[n]=m
for v in [('grass',(.09,.22,.025),.83,0,140),('stripe',(.13,.29,.037),.85,0,140),('soil',(.095,.051,.024),.92,0,60),('steel',(.11,.15,.18),.29,.7,0),('silver',(.48,.55,.6),.26,.7,15),('rubber',(.014,.019,.022),.65,0,30),('concrete',(.36,.38,.37),.8,0,25),('line',(.85,.87,.78),.65,0,0),('orange',(.91,.28,.035),.3,.35,0),('air',(.025,.51,.65),.3,.3,0),('glass',(.055,.16,.21),.2,.6,0),('earth',(.16,.2,.12),.9,0,30),('tree',(.055,.13,.035),.9,0,0),('seats',(.11,.18,.24),.65,0,0)]:mat(*v)
# Material microstructure and color variation; avoids a flat plastic grass slab.
for name,colors,scale in [('grass',[(.025,.075,.008,1),(.11,.24,.025,1)],180),('stripe',[(.05,.12,.012,1),(.16,.32,.04,1)],160),('soil',[(.035,.02,.01,1),(.22,.115,.045,1)],95),('concrete',[(.22,.24,.23,1),(.43,.44,.41,1)],7)]:
 m=M[name];t=m.node_tree.nodes.new('ShaderNodeTexNoise');t.inputs['Scale'].default_value=scale;t.inputs['Detail'].default_value=5;r=m.node_tree.nodes.new('ShaderNodeValToRGB');r.color_ramp.elements[0].color=colors[0];r.color_ramp.elements[1].color=colors[1];m.node_tree.links.new(t.outputs['Fac'],r.inputs[0]);m.node_tree.links.new(r.outputs[0],m.node_tree.nodes['Principled BSDF'].inputs['Base Color'])
q=M['air'].node_tree.nodes['Principled BSDF'];q.inputs['Emission Color'].default_value=(.025,.51,.65,1);q.inputs['Emission Strength'].default_value=.45

def put(o,n,m,g):o.name=n;o.data.materials.append(M[m]);G.setdefault(g,[]).append(o);return o
def mesh(n,vs,fs,m,g):
 d=bpy.data.meshes.new(n);d.from_pydata(vs,[],fs);d.update();o=bpy.data.objects.new(n,d);S.collection.objects.link(o);return put(o,n,m,g)
def box(n,loc,size,m,g,b=.018):
 x,y,z=[q/2 for q in size];o=mesh(n,[(-x,-y,-z),(x,-y,-z),(x,y,-z),(-x,y,-z),(-x,-y,z),(x,-y,z),(x,y,z),(-x,y,z)],[(0,3,2,1),(4,5,6,7),(0,1,5,4),(1,2,6,5),(2,3,7,6),(3,0,4,7)],m,g);o.location=loc
 if b:q=o.modifiers.new('edge highlights','BEVEL');q.width=b;q.segments=2;o.modifiers.new('normals','WEIGHTED_NORMAL')
 return o
def tube(n,pts,r,m,g):
 d=bpy.data.curves.new(n,'CURVE');d.dimensions='3D';d.bevel_depth=r;d.bevel_resolution=3;sp=d.splines.new('POLY');sp.points.add(len(pts)-1)
 for p,v in zip(sp.points,pts):p.co=(*v,1)
 o=bpy.data.objects.new(n,d);S.collection.objects.link(o);return put(o,n,m,g)
def cyl(n,loc,r,depth,m,g,axis='Z'):
 bpy.ops.mesh.primitive_cylinder_add(vertices=32,radius=r,depth=depth,location=loc);o=put(bpy.context.object,n,m,g)
 if axis=='X':o.rotation_euler[1]=math.pi/2
 if axis=='Y':o.rotation_euler[0]=math.pi/2
 b=o.modifiers.new('machined edge','BEVEL');b.width=.015;b.segments=2;o.modifiers.new('normals','WEIGHTED_NORMAL');return o
# Exterior context in model scale1:10; no copied photographic assets.
box('land',(0,9,-.3),(110,110,.3),'earth','world')
box('concrete apron',(0,4,-.09),(22,43,.15),'concrete','world')
for x in range(-10,12,2):tube('paving joint',[(x,-15,-.009),(x,25,-.009)],.006,'rubber','world')
for y in range(-14,27,2):tube('paving joint',[(-11,y,-.009),(11,y,-.009)],.006,'rubber','world')
# Silver closed shell with open side wall, not a retracting roof.
N=96;R=20;vs=[]
for k in range(R+1):
 phi=k/R*math.pi/2
 for j in range(N):
  th=j/N*math.tau;vs.append((11*math.cos(phi)*math.cos(th),13+10*math.cos(phi)*math.sin(th),.15+5.3*math.sin(phi)))
fs=[]
for k in range(R):
 for j in range(N):
  ids=[k*N+j,k*N+(j+1)%N,(k+1)*N+(j+1)%N,(k+1)*N+j];c=sum((Vector(vs[i])for i in ids),Vector())/4
  if c.y<6 and abs(c.x)<5.8 and c.z<2.0:continue
  fs.append(ids)
o=mesh('fixed silver dome',vs,fs,'silver','stadium')
for p in o.data.polygons:p.use_smooth=True
for j in range(0,N,4):
 pts=[vs[k*N+j]for k in range(3,R)]
 tube('roof panel seam',pts,.009,'steel','stadium')
for k in [6,10,14]:tube('roof seam',[vs[k*N+j]for j in range(N)]+[vs[k*N]],.007,'steel','stadium')
# Visible stands and roof ribs inside the side portal.
for row in range(10):
 box('back seating tier',(0,18+row*.24,.3+row*.12),(14,.28,.15),'seats','stadium',.006)
for x in [-5.65,5.65]:box('portal pier',(x,5.1,1.15),(.25,.5,2.3),'steel','stadium')
tube('portal beam',[(-5.65,5.1,2.3),(0,4.1,2.8),(5.65,5.1,2.3)],.12,'steel','stadium')
# Small site trees and buildings provide scale, not empty model stage.
for i in range(58):
 x=random.choice([-1,1])*random.uniform(13,36);y=random.uniform(-12,38);h=random.uniform(.7,1.5);cyl('tree trunk',(x,y,h*.3),.06,h*.6,'soil','world')
 for dx,dy,dz in [(0,0,0),(.23,.12,-.2),(-.18,-.2,-.2)]:
  bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=2,radius=1,location=(x+dx,y+dy,h+dz));o=put(bpy.context.object,'tree crown','tree','world');o.scale=(.48,.44,h*.46)
  for f in o.data.polygons:f.use_smooth=True
for i in range(18):
 x=-25+i*3;y=37+random.uniform(0,8);h=random.uniform(1,4);box('city block',(x,y,h/2),(1.7,2,h),'concrete','world')
 for z in range(1,int(h*5)):
  box('window band',(x,y-1.006,z*.2),(1.5,.012,.10),'glass','world',0)
# Grass tray and34 schematic perimeter wheels, all translating as one object assembly.
box('pitch frame',(0,0,.24),(8.5,12,.35),'steel','pitch');box('root soil',(0,0,.43),(8.35,11.85,.15),'soil','pitch');box('grass mat',(0,0,.52),(8.35,11.85,.045),'grass','pitch')
for j in range(12):box('mowing stripe',(0,-5.45+j*.99,.547),(8.3,.48,.007),'stripe','pitch',0)
def pline(points):tube('field marking',[(x,y,.558)for x,y in points],.012,'line','pitch')
pline([(-3.4,-5.25),(3.4,-5.25),(3.4,5.25),(-3.4,5.25),(-3.4,-5.25)]);pline([(-3.4,0),(3.4,0)]);pline([(math.cos(t)*.915,math.sin(t)*.915)for t in [j/80*math.tau for j in range(81)]])
for sy in [-1,1]:
 pline([(-2.016,sy*5.25),(-2.016,sy*3.6),(2.016,sy*3.6),(2.016,sy*5.25)]);pline([(-.915,sy*5.25),(-.915,sy*4.7),(.915,sy*4.7),(.915,sy*5.25)])
 tube('goal',[(-.366,sy*5.25,.56),(-.366,sy*5.25,.804),(.366,sy*5.25,.804),(.366,sy*5.25,.56)],.012,'line','pitch')
for side in [-1,1]:
 for j in range(17):
  x=side*4.28;y=-5.6+j*.7;cyl('stage wheel',(x,y,.115),.115,.13,'rubber','pitch','X');cyl('hub',(x+side*.075,y,.115),.047,.018,'orange','pitch','X');box('bogie',(x,y,.27),(.23,.33,.14),'steel','pitch')
base={o:o.location.copy()for o in G['pitch']}
# Engineering macro: isolated part of SAME tray, cut face removed; annotated as concept.
box('macro ground',(0,0,-.13),(30,25,.25),'concrete','macro')
for x in range(-12,13,2):tube('ground joint',[(x,-10,.003),(x,10,.003)],.007,'rubber','macro')
box('tray underside',(0,0,1.13),(4.7,3.15,.18),'steel','macrotray');box('soil section',(0,0,1.39),(4.6,3.05,.35),'soil','macrotray');box('turf section',(0,0,1.58),(4.62,3.07,.07),'grass','macrotray')
for x in [-2.25,-1.25,-.25,.75,1.75,2.25]:box('steel crossmember',(x,0,1.0),(.1,3.15,.25),'steel','macrotray')
box('rear flexible seal',(0,1.48,.66),(4.6,.07,.72),'rubber','macrotray');box('side seal',(-2.3,0,.66),(.07,2.9,.72),'rubber','macrotray')
for j in range(21):box('seal pleat',(-2.342,-1.42+j*.14,.67),(.035,.025,.65),'steel','macrotray',.004)
# Individual grass blades and roots at the macro cut face; one mesh, no object overhead.
vs=[];fs=[]
for i in range(16000):
 x=random.uniform(-2.29,2.29);y=random.uniform(-1.51,1.51);z=1.622;h=random.uniform(.02,.065);w=random.uniform(.002,.006);idx=len(vs);vs.extend([(x-w,y,z),(x+w,y,z),(x+random.uniform(-.02,.02),y+.008,z+h)]);fs.append((idx,idx+1,idx+2))
mesh('natural turf blades',vs,fs,'grass','macrotray')
tube('white field line across turf',[(-2.25,.5,1.65),(2.25,.5,1.65)],.035,'line','macrotray')
# Rib plates and service bolts visibly connect the tray to bogies.
for x in [-2.15,-1.15,-.15,.85,1.85]:
 box('lower beam flange',(x,-1.58,1.03),(.18,.09,.035),'silver','macrotray')
 for z in [.97,1.09]:cyl('chassis bolt',(x,-1.635,z),.022,.03,'silver','macrotray','Y')
# Air blower, duct and manifold: fixed relative to moving tray.
box('fan motor',(3.05,.7,.48),(.6,.6,.55),'orange','macrotray');cyl('centrifugal blower',(2.7,.1,.55),.37,.48,'steel','macrotray','Y');tube('air supply duct',[(2.7,-.15,.55),(2.7,-.7,.55),(2.0,-.7,.55)],.14,'silver','macrotray')
for i in range(8):box('motor cooling fin',(2.79+i*.07,.7,.48),(.018,.67,.59),'steel','macrotray',.003)
macroW=[];markers=[]
for x in [-1.6,1.6]:
 for y in [-1.65,1.2]:
  o=cyl('drive tire',(x,y,.34),.34,.24,'rubber','macrotray','Y');macroW.append(o);cyl('wheel rim',(x,y-.145,.34),.2,.055,'silver','macrotray','Y');cyl('wheel cap',(x,y-.185,.34),.082,.07,'orange','macrotray','Y');box('wheel yoke',(x,y,.73),(.62,.4,.19),'steel','macrotray')
  for j in range(12):
   th=j/12*math.tau;o=box('tire tread',(x+.335*math.cos(th),y-.01,.34+.335*math.sin(th)),(.038,.26,.028),'rubber','macrotray',.005);o.rotation_euler[1]=-th;markers.append((o,Vector((x,y,.34))))
  o=box('hub rotation mark',(x+.15,y-.20,.34),(.07,.012,.036),'orange','macrotray',.003);markers.append((o,Vector((x,y,.34))))
  for j in range(6):
   th=j/6*math.tau;cyl('hub bolt',(x+.14*math.cos(th),y-.18,.34+.14*math.sin(th)),.019,.03,'steel','macrotray','Y')
# Animated conceptual air arrows, only shown during pressure explanation.
arrows=[]
for x in [-1.75,-.9,0,.9,1.75]:
 for y in [-.95,.0,.9]:
  o=tube('air pressure shaft',[(x,y,.34),(x,y,.88)],.027,'air','arrows');arrows.append(o)
  bpy.ops.mesh.primitive_cone_add(vertices=16,radius1=.085,radius2=0,depth=.16,location=(x,y,.87));arrows.append(put(bpy.context.object,'air pressure head','air','arrows'))
markerbase={o:o.location.copy()for o,c in markers};macrobase={o:o.location.copy()for o in G['macrotray']};arrowbase={o:o.location.copy()for o in arrows}
particles=[]
for j in range(8):
 bpy.ops.mesh.primitive_uv_sphere_add(segments=12,ring_count=6,radius=.055,location=(0,0,0));particles.append(put(bpy.context.object,'injected air indicator','air','arrows'))
# Sun and broad soft fill keep real materials and grounded shadows.
bpy.ops.object.light_add(type='SUN',location=(-12,-15,20));sun=bpy.context.object;sun.data.energy=3;sun.data.angle=.09;sun.rotation_euler=(math.radians(30),math.radians(-25),math.radians(-40))
bpy.ops.object.light_add(type='AREA',location=(0,-8,14));light=bpy.context.object;light.data.energy=1900;light.data.shape='DISK';light.data.size=10
bpy.ops.object.camera_add();cam=bpy.context.object;S.camera=cam;cam.data.lens=42;cam.data.clip_end=250

def lerp(a,b,t):return Vector(a).lerp(Vector(b),t)
def pose(shot,u):
 macro=shot in ['load','air','wheels']
 for g,objects in G.items():
  show=(g in ['macro','macrotray']or(g=='arrows'and shot=='air'))if macro else g in ['world','stadium','pitch']
  for o in objects:o.hide_render=not show
 for o,p in base.items():o.location=p+Vector((0,0 if shot=='sunlight'else 9*u,0))
 for o,p in macrobase.items():o.location=p+Vector((.5*u if shot=='wheels'else 0,0,.055*min(1,u*2)if shot=='air'else 0))
 for o,p in arrowbase.items():o.location=p+Vector((0,0,.07*math.sin(u*math.tau*3)));o.scale=(1,1,max(.02,min(1,u*3)))
 for o,c in markers:
  if shot=='wheels':
   r=markerbase[o]-c;ang=-u*2;o.location=c+Vector((r.x*math.cos(ang)+r.z*math.sin(ang),r.y,-r.x*math.sin(ang)+r.z*math.cos(ang)))+Vector((.5*u,0,0))
 for j,o in enumerate(particles):
  phase=(u*4+j/8)%1;o.location=(2.75-4.5*phase,-.7,.51+.08*math.sin(phase*math.pi));o.scale=(1.8,1,1)
 for o in macroW:o.rotation_euler[1]=0;o.rotation_euler[0]=math.pi/2;o.rotation_euler.rotate_axis('Z',-u*2 if shot=='wheels'else 0)
 if shot=='sunlight':p=lerp((-13,-17,15),(-10,-13,12),u);target=lerp((0,3,0),(0,1.8,.2),u);cam.data.lens=43
 elif shot=='load':p=lerp((-5.5,-7,4.4),(-4.4,-6,3.1),u);target=Vector((0,0,.9));cam.data.lens=48
 elif shot=='air':p=lerp((7.5,-11.5,4.8),(6.8,-11,4.1),u);target=Vector((.4,0,.85));cam.data.lens=40
 elif shot=='wheels':p=lerp((-.4,-4.5,1.65),(.3,-4.1,1.5),u);target=Vector((1.4+.5*u,-1.4,.65));cam.data.lens=48
 else:p=lerp((-14,-18,17),(-12,-12,15),u);target=lerp((0,4,1),(0,8,1),u);cam.data.lens=42
 cam.location=p;cam.rotation_euler=(target-p).to_track_quat('-Z','Y').to_euler();light.location=(0,-5,12)if macro else(-2,-4,15)
shots=['sunlight','load','air','wheels','ending'];started=time.time()
if a.preview:
 for sh in shots if a.shot=='all'else[a.shot]:
  pose(sh,.5);S.render.image_settings.file_format='PNG';S.render.filepath=str(a.out/(sh+'.png'));bpy.ops.render.render(write_still=True)
 print('PREVIEWS_COMPLETE',time.time()-started);raise SystemExit()
TL=json.loads(a.timeline.read_text());manifest={'sourceHash':hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),'percentage':a.percent,'samples':a.samples,'engine':'Cycles Metal GPU','shots':[]};mp=a.out/'render-manifest.json'
if mp.exists():
 old=json.loads(mp.read_text())
 if old['sourceHash']==manifest['sourceHash']:manifest=old
for beat in TL['beats'][1:]:
 sh=beat['id']
 if a.shot!='all'and a.shot!=sh:continue
 n=round(beat['duration']*24);out=a.out/(sh+'.mp4')
 if any(x['shot']==sh and x['frames']==n for x in manifest['shots'])and out.exists():continue
 # One temporary PNG at a time, encoded immediately, no frame cache growth.
 temp=a.out/(sh+'-current.png');S.render.image_settings.file_format='PNG';S.render.filepath=str(temp)
 log=(a.out/(sh+'-encode.log')).open('wb');proc=subprocess.Popen(['ffmpeg','-v','error','-y','-f','image2pipe','-framerate','24','-vcodec','png','-i','pipe:0','-an','-c:v','libx264','-crf','17','-preset','fast','-pix_fmt','yuv420p','-movflags','+faststart',str(out)],stdin=subprocess.PIPE,stderr=log)
 try:
  for f in range(n):
   pose(sh,f/max(1,n-1));bpy.ops.render.render(write_still=True);proc.stdin.write(temp.read_bytes())
   if f%24==0:print('PROGRESS',sh,f,n,round(time.time()-started,1),flush=True)
  proc.stdin.close();assert proc.wait()==0
 finally:
  if proc.poll()is None:proc.kill();proc.wait()
  log.close()
 temp.unlink();manifest['shots']=[x for x in manifest['shots']if x['shot']!=sh];manifest['shots'].append({'shot':sh,'frames':n,'sha256':hashlib.sha256(out.read_bytes()).hexdigest()});mp.write_text(json.dumps(manifest,indent=2));print('SHOT_COMPLETE',sh,flush=True)
print('RENDER_COMPLETE',time.time()-started,flush=True)
