"""Original Moses Bridge interpretive scene. No borrowed textures or engineering simulation."""
import argparse,hashlib,json,math,random,sys,time
from pathlib import Path
import bpy
from mathutils import Vector
P=argparse.ArgumentParser();P.add_argument('--out',type=Path,required=True);P.add_argument('--timeline',type=Path);P.add_argument('--preview',action='store_true');P.add_argument('--shot',default='all');P.add_argument('--percent',type=int,default=100);P.add_argument('--samples',type=int,default=64)
a=P.parse_args(sys.argv[sys.argv.index('--')+1:]);a.out.mkdir(parents=True,exist_ok=True);random.seed(1010)
S=bpy.context.scene;bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False);S.render.engine='CYCLES';S.cycles.samples=a.samples;S.cycles.use_denoising=True;S.cycles.max_bounces=5;S.render.use_persistent_data=True
pref=bpy.context.preferences.addons['cycles'].preferences;pref.compute_device_type='METAL';pref.get_devices()
for d in pref.devices:d.use=d.type=='METAL'
S.cycles.device='GPU';S.render.resolution_x=1080;S.render.resolution_y=1920;S.render.resolution_percentage=a.percent;S.render.fps=24;S.view_settings.view_transform='AgX';S.view_settings.look='AgX - Medium High Contrast';S.view_settings.exposure=-.1
W=S.world;W.use_nodes=True;n=W.node_tree.nodes;n.clear();bg=n.new('ShaderNodeBackground');bg.inputs[1].default_value=.18;sky=n.new('ShaderNodeTexSky');sky.sky_type='NISHITA';sky.sun_elevation=math.radians(28);sky.sun_rotation=math.radians(140);sky.sun_disc=False;o=n.new('ShaderNodeOutputWorld');W.node_tree.links.new(sky.outputs[0],bg.inputs[0]);W.node_tree.links.new(bg.outputs[0],o.inputs[0])
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

# Timber grain follows the vertical wall boards and individual floor planks.
for name in ['wood','trunk']:
 nt=M[name].node_tree;tex=next(n for n in nt.nodes if n.type=='TEX_NOISE');coord=nt.nodes.new('ShaderNodeTexCoord');mapping=nt.nodes.new('ShaderNodeVectorMath');mapping.operation='MULTIPLY';mapping.inputs[1].default_value=(2,2,.13);nt.links.new(coord.outputs['Generated'],mapping.inputs[0]);nt.links.new(mapping.outputs[0],tex.inputs['Vector'])
mat('membrane',(.023,.033,.035),.55,texture=(30,.007));mat('water cut',(.045,.20,.19),.22,trans=.2);mat('accent',(.93,.39,.055),.32,.3);mat('flow',(.1,.7,.78),.25,.3);mat('denim',(.025,.04,.075),.8);mat('shoe',(.065,.053,.042),.78)
def terrainZ(x,y):
 dy=abs(y)
 if dy<11.8:return -.8
 h=1.4+min(1,(dy-11.8)/9)* (4 if y>0 else 2.4)
 if abs(x)<.9 and dy<21.3:return max(-.7,(dy-11.8)/9.4*(5 if y>0 else 3)-.25)
 return h+.32*math.sin(x*.15+y*.12)+.18*math.sin(x*.32-y*.08)
xs=sorted(set([float(x) for x in range(-90,91,2)]+[-.88,.88]));vs=[];nx=len(xs);ny=81
for j in range(ny):
 y=-80+j*2
 for i in range(nx):
  x=xs[i];vs.append((x,y,terrainZ(x,y)))
land=mesh('earth fort and surrounding banks',vs,[(j*nx+i,j*nx+i+1,(j+1)*nx+i+1,(j+1)*nx+i)for j in range(ny-1)for i in range(nx-1)],'grass')
for f in land.data.polygons:f.use_smooth=True
# A moat around an EARTH fort: no invented stone castle or exposed diorama edges.
water=[]
for side in [-1,1]:
 x0,x1=(-90,-.85) if side<0 else (.85,90);verts=[];wx=155;wy=49
 for j in range(wy):
  y=-11.8+j*23.6/(wy-1)
  for i in range(wx):
   x=x0+i*(x1-x0)/(wx-1);verts.append((x,y,1.38+.008*math.sin(x*.7+y*.4)+.004*math.sin(x*.2-y*.8)))
 ob=mesh('continuous moat water',verts,[(j*wx+i,j*wx+i+1,(j+1)*wx+i+1,(j+1)*wx+i)for j in range(wy-1)for i in range(wx-1)],'water');water.append(ob)
 for f in ob.data.polygons:f.use_smooth=True
# Low-cost instanced porous foliage; actual shading, no downloaded textures.
protos=[]
for k in range(5):
 v=[];faces=[]
 for _ in range(650):
  pos=Vector((random.uniform(-1,1),random.uniform(-1,1),random.uniform(-1,1)))
  if pos.length>1:continue
  ax=Vector((random.uniform(-1,1),random.uniform(-1,1),.2)).normalized()*.15;by=Vector((-ax.y,ax.x,.06));i=len(v);v.extend([pos-ax,pos+by,pos+ax,pos-by]);faces.extend([(i,i+1,i+2),(i,i+2,i+3)])
 d=bpy.data.meshes.new('leaf cluster');d.from_pydata(v,[],faces);d.materials.append(M['leaf'+str(k)]);protos.append(d)
for i in range(180):
 x=random.uniform(-65,65);y=random.choice([-1,1])*random.uniform(14,72)
 if abs(x)<3.0:continue
 z=terrainZ(x,y);h=random.uniform(4,9);rod('trunk',(x,y,z),(x+.3,y,z+h*.8),.13,'trunk',verts=7)
 for j in range(4):
  ob=bpy.data.objects.new('organic canopy',protos[(i+j)%5]);S.collection.objects.link(ob);ob.location=(x+random.uniform(-1,1),y+random.uniform(-1,1),z+h*.62+random.uniform(-.5,1));ob.scale=(h*.28,h*.28,h*.30)

nt=M['grass'].node_tree;tex=next(n for n in nt.nodes if n.type=='TEX_NOISE');tex.inputs['Scale'].default_value=1.7;coord=nt.nodes.new('ShaderNodeTexCoord');nt.links.new(coord.outputs['Object'],tex.inputs['Vector'])
texw=next(n for n in M['water'].node_tree.nodes if n.type=='TEX_NOISE');texw.noise_dimensions='4D'
# Fine ripples dominate instead of chunky surface stripes.
texw.inputs['Scale'].default_value=38
# Stones, bank grass tufts and reeds at the actual edge provide scale/detail.
for i in range(360):
 side=random.choice([-1,1]);x=random.uniform(-36,36);y=side*random.uniform(11.9,17)
 if abs(x)<1.3:continue
 z=terrainZ(x,y)
 if i%5==0:sphere('bank stone',(x,y,z+.04),(random.uniform(.06,.19),.10,.07),'stone')
 for j in range(4):
  dx=random.uniform(-.07,.07);dy=random.uniform(-.07,.07);h=random.uniform(.12,.42);line('bank grass',[(x+dx,y+dy,z),(x+dx+.04,y+dy,z+h*.7),(x+dx+.09,y+dy,z+h)],.009,'leaf'+str(i%5))

# Hand-crafted crossing. Floor is below moat water, not underwater.
bridge=root('full crossing');details=[]
for side in [-1,1]:
 box('exterior continuous waterproof liner',(side*.79,0,.48),(.12,23.7,2.0),'membrane',bridge)
 for j in range(110):
  y=-11.7+j*.215;box('vertical timber sheet pile',(side*.72,y,.72),(.17,.207,1.58),'wood',bridge,b=.012)
 box('broad timber coping',(side*.73,0,1.54),(.31,23.8,.13),'wood',bridge,b=.025)
for j in range(110):
 y=-11.7+j*.215;box('walking plank',(0,y,.03),(1.24,.207,.10),'wood',bridge,b=.008)
box('anchoring concrete slab',(0,0,-.70),(2.7,24,.65),'concrete',bridge,b=.04)
for side in [-1,1]:
 for j in range(30):
  y=side*(11.9+j*.31);z=(j+1)*(5 if side>0 else 3)/30
  box('wood-covered bank stair',(0,y,z-.10),(1.25,.32,.20),'wood',bridge,b=.012)
  for x in [-.73,.73]:
   box('stair side wall',(x,y,z+.40),(.19,.32,1.02),'wood',bridge,b=.009)
# Interpretable cutaway of the SAME trough: six metre segment at the same site.
cut=root('explanation cross section');parts={}
parts['slab']=box('foundation resisting uplift',(0,0,-.70),(2.7,6,.65),'concrete',cut,b=.045)
parts['lining']=[]
for side in [-1,1]:
 ob=box('exposed EPDM membrane',(side*.80,0,.50),(.10,6,1.98),'membrane',cut);parts['lining'].append(ob)
 for j in range(28):box('cutaway sheet piles',(side*.70,-2.9+j*.215,.72),(.17,.207,1.58),'wood',cut,b=.008)
 box('cutaway coping',(side*.72,0,1.54),(.30,6,.13),'wood',cut)
for j in range(28):box('cutaway deck',(0,-2.9+j*.215,.03),(1.24,.207,.1),'wood',cut,b=.009)
box('drain channel below deck',(0,0,-.19),(.45,6,.22),'dark',cut)
anchors=[]
for x in [-.77,.77]:
 for y in [-2.95,0,2.2]:
  anchors.append(rod('illustrative anchorage',(x,y,-.58),(x,y,.05),.038,'accent',cut));box('anchor plate',(x,y,-.50),(.25,.22,.04),'steel edge',cut)
# A cross-section water block stays outside the walls; not a water simulation.
for side in [-1,1]:box('section water outside walkway',(side*1.55,0,1.37),(1.35,6,.035),'water',cut,b=0)
cut.scale.y=.58
flow=[]
for x in [-.52,.52]:
 ar=root('uplift marker');ar.parent=cut
 rod('force stem',(x,-3.15,-.92),(x,-3.15,-.4),.025,'flow',ar)
 for dx in [-.10,.10]:rod('force tip',(x,-3.15,-.4),(x+dx,-3.15,-.57),.025,'flow',ar)
 flow.append(ar)
# Sump and schematic discharge: shown only in rain/drain shot.
pump=box('pump schematic',(0,-2.75,-.21),(.31,.4,.31),'orange',cut)
line('drain discharge route',[(0,-2.75,-.18),(1.1,-2.75,-.18),(1.1,-2.75,1.75),(2.0,-2.75,1.75)],.04,'steel edge',cut)
drops=[]
for i in range(65):drops.append(sphere('rain droplet',(0,0,0),(.018,.018,.048),'flow',cut))
stream=[]
for i in range(24):stream.append(sphere('drain flow tracer',(0,0,0),(.036,.036,.036),'flow',cut))
# Scale cue: one clothed adult, not a face closeup.
person=root('orange coat visitor');sphere('head',(0,0,1.60),(.115,.105,.15),'skin',person);sphere('hair',(0,-.02,1.70),(.119,.101,.07),'dark',person);sphere('coat torso',(0,0,1.18),(.22,.13,.31),'orange',person);box('coat zip',(0,-.132,1.20),(.012,.01,.44),'dark',person,b=0)
limbs=[]
for side in [-1,1]:
 hip=(side*.105,0,.95);knee=(side*.12,0,.53);foot=(side*.12,-.02,.16)
 upper=rod('trouser thigh',hip,knee,.079,'denim',person);lower=rod('trouser shin',knee,foot,.059,'denim',person);shoe=sphere('shoe',(side*.12,-.06,.095),(.08,.155,.07),'shoe',person);limbs.append((upper,lower,shoe,side))
 rod('coat sleeve',(side*.20,0,1.39),(side*.26,.03,.96),.068,'orange',person);sphere('hand',(side*.26,.03,.91),(.045,.043,.065),'skin',person)
# Lighting preserves warm timber vs cool water; real shadows and depth.
bpy.ops.object.light_add(type='SUN',location=(0,-15,18));sun=bpy.context.object;sun.data.energy=2.0;sun.data.angle=.12;sun.rotation_euler=(math.radians(24),math.radians(-25),math.radians(-30))
bpy.ops.object.camera_add();cam=bpy.context.object;S.camera=cam;cam.data.clip_end=350;cam.data.lens=36

def hide(r,flag):
 for ob in [r]+list(r.children_recursive):ob.hide_render=flag

def look(loc,target,lens):cam.location=loc;cam.rotation_euler=(Vector(target)-cam.location).to_track_quat('-Z','Y').to_euler();cam.data.lens=lens

def state(shot,t,d):
 texw.inputs['W'].default_value=t*.13
 u=max(0,min(1,t/d));is_cut=shot in ['liner','anchor','drain'];hide(bridge,is_cut);hide(cut,not is_cut);hide(person,shot!='place')
 for w in water:w.hide_render=is_cut
 # On cutaway frames, hide surrounding bank mesh only if under section. Terrain remains background.
 for ob in drops+stream:ob.hide_render=shot!='drain'
 for ar in flow:hide(ar,shot!='anchor')
 for i,ob in enumerate(parts['lining']):ob.location.x=(-1 if i==0 else 1)*(.80+(.5*math.sin(math.pi*u)**2 if shot=='liner' else 0))
 for i,ob in enumerate(drops):ob.location=(math.sin(i*8)*.5,math.sin(i*3)*2.4,.10+(1-((t*.7+i*.137)%1))*2.8)
 for i,ob in enumerate(stream):
  q=(t*.23+i/24)%1
  if q<.4:ob.location=(0,2.6-q/.4*5.3,-.17)
  elif q<.7:ob.location=((q-.4)/.3*1.1,-2.75,-.17)
  elif q<.85:ob.location=(1.1,-2.75,-.17+(q-.7)/.15*1.92)
  else:ob.location=(1.1+(q-.85)/.15*.9,-2.75,1.75)
  ob.hide_render=shot!='drain' or t<d*.28
 for ar in flow:ar.location.z=.12*math.sin(t*3)
 person.location=(0,-3+u*6,0)
 for upper,lower,shoe,side in limbs:
  phase=math.sin(t*4)*side;upper.rotation_euler.x=phase*.22;lower.rotation_euler.x=-phase*.20;shoe.location.y=-.06+phase*.13
 if shot=='hook':look((0,-8+u*2,1.96),(0,5,1.35),25)
 elif shot=='place':look((19-u*2,-26+u*3,21-u*1),(0,1,.8),31)
 elif shot=='liner':look((3.2-u*.4,-7.2+u*.2,3.6),(0,0,.4),42)
 elif shot=='anchor':look((2.7,-7+u*.2,2.45),(0,0,.2),42)
 elif shot=='drain':look((2.9,-7.2,3.4),(0,.25,.28),42)
 else:
  person.location.y=3+u*7;look((.10,-3+u*6,1.95),(0,11,1.2),25)
 # Float32-safe constraints: dry deck stays below water, water stays outside side walls.
 assert abs(parts['slab'].location.z+.70)<1e-4
 assert 0.08<1.38<1.54
 bpy.context.view_layer.update()

shots=['hook','place','liner','anchor','drain','ending']
if a.shot!='all':shots=[a.shot]
if a.preview:
 S.render.image_settings.file_format='PNG'
 for shot in shots:
  for f in [.15,.65]:
   state(shot,6*f,6);S.render.filepath=str(a.out/f'{shot}-{int(f*100)}.png');bpy.ops.render.render(write_still=True)
 print('PREVIEW_COMPLETE',flush=True)
else:
 assert a.timeline,'timeline required for full render';tl=json.loads(a.timeline.read_text());results=[]
 for beat in tl['beats']:
  shot=beat['id']
  if shot=='hook' or shot not in shots:continue
  duration=beat['duration'];frames=round(duration*24);S.frame_start=1;S.frame_end=frames
  def update(scene,*unused):state(shot,(scene.frame_current-1)/24,duration)
  bpy.app.handlers.frame_change_pre.clear();bpy.app.handlers.frame_change_pre.append(update)
  S.render.image_settings.file_format='FFMPEG';S.render.ffmpeg.format='MPEG4';S.render.ffmpeg.codec='H264';S.render.ffmpeg.constant_rate_factor='HIGH';S.render.ffmpeg.ffmpeg_preset='GOOD';S.render.filepath=str(a.out/(shot+'.mp4'));S.frame_set(1);start=time.monotonic();bpy.ops.render.render(animation=True)
  results.append(dict(shot=shot,frames=frames,seconds=time.monotonic()-start,sha256=hashlib.sha256((a.out/(shot+'.mp4')).read_bytes()).hexdigest()));(a.out/'render-manifest.json').write_text(json.dumps(dict(shots=results,sourceHash=hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),samples=a.samples,resolution=[1080,1920],percentage=a.percent,limitations=['original interpretive geometry, not measured survey','force markers and water are explanatory, not CFD']),indent=2));print('SHOT_COMPLETE',shot,frames,flush=True)
 print('RENDER_COMPLETE',flush=True)
