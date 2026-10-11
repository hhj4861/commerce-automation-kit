"""Original single-location crime drama. All geometry/actions authored; stream one PNG at a time."""
import bpy,math,sys,argparse,json,subprocess,hashlib,time,shutil
from pathlib import Path
from mathutils import Vector
P=argparse.ArgumentParser();P.add_argument('--cache',type=Path,required=True);P.add_argument('--shot',default='all');P.add_argument('--preview',action='store_true');P.add_argument('--engine',choices=['CYCLES','BLENDER_EEVEE_NEXT'],default='CYCLES');P.add_argument('--samples',type=int,default=24);P.add_argument('--percent',type=int,default=100);a=P.parse_args(sys.argv[sys.argv.index('--')+1:]);C=a.cache;(C/'clips').mkdir(exist_ok=True);(C/'qa').mkdir(exist_ok=True)
S=bpy.context.scene;bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
S.render.engine='CYCLES';S.cycles.samples=a.samples;S.cycles.use_denoising=True;S.cycles.adaptive_threshold=.10;S.cycles.max_bounces=4;S.render.use_persistent_data=True
prefs=bpy.context.preferences.addons['cycles'].preferences;prefs.compute_device_type='METAL';prefs.get_devices()
for d in prefs.devices:d.use=d.type=='METAL'
S.cycles.device='GPU';S.render.resolution_x=1080;S.render.resolution_y=1920;S.render.resolution_percentage=a.percent;S.render.fps=24;S.render.image_settings.file_format='PNG';S.render.image_settings.color_mode='RGB';S.render.image_settings.compression=15
S.view_settings.view_transform='AgX';S.view_settings.look='AgX - Medium High Contrast';S.view_settings.exposure=-.1
S.world.use_nodes=True;bg=S.world.node_tree.nodes['Background'];bg.inputs[0].default_value=(.08,.12,.19,1);bg.inputs[1].default_value=.12
M={}
def mat(n,c,rough=.45,metal=0,noise=0,emit=0):
 m=bpy.data.materials.new(n);m.use_nodes=True;q=m.node_tree.nodes.get('Principled BSDF');q.inputs['Base Color'].default_value=(*c,1);q.inputs['Roughness'].default_value=rough;q.inputs['Metallic'].default_value=metal
 if emit:q.inputs['Emission Color'].default_value=(*c,1);q.inputs['Emission Strength'].default_value=emit
 if noise:
  t=m.node_tree.nodes.new('ShaderNodeTexNoise');t.inputs['Scale'].default_value=noise;t.inputs['Detail'].default_value=3;b=m.node_tree.nodes.new('ShaderNodeBump');b.inputs['Strength'].default_value=.25;b.inputs['Distance'].default_value=.008;m.node_tree.links.new(t.outputs['Fac'],b.inputs['Height']);m.node_tree.links.new(b.outputs[0],q.inputs['Normal'])
 M[n]=m;return m
for v in [('wall',(.32,.34,.33),.92,0,90),('inside',(.23,.18,.13),.85,0,85),('door',(.042,.07,.075),.42,.2,100),('frame',(.075,.09,.087),.34,.5,40),('nickel',(.48,.52,.53),.25,.85,110),('brass',(.58,.31,.075),.28,.85,65),('tile',(.14,.17,.18),.46,0,60),('wood',(.19,.075,.028),.44,0,70),('black',(.012,.016,.018),.56,0,150),('coat',(.019,.025,.032),.92,0,160),('skin',(.47,.27,.17),.58,0,70),('paper',(.76,.71,.59),.8,0,30),('white',(.84,.83,.71),.6,0,0),('mint',(.10,.75,.58),.45,0,0,2),('light',(.9,.65,.35),.4,0,0,5)]:mat(*v)
# Long wood fibres, rather than flat coloured boxes.
for name in ['wood','door']:
 m=M[name];nt=m.node_tree;t=nt.nodes.new('ShaderNodeTexNoise');t.inputs['Scale'].default_value=3;coord=nt.nodes.new('ShaderNodeTexCoord');scale=nt.nodes.new('ShaderNodeVectorMath');scale.operation='MULTIPLY';scale.inputs[1].default_value=(25,25,2);nt.links.new(coord.outputs['Generated'],scale.inputs[0]);nt.links.new(scale.outputs[0],t.inputs[0]);b=nt.nodes.new('ShaderNodeBump');b.inputs['Strength'].default_value=.08;b.inputs['Distance'].default_value=.001;nt.links.new(t.outputs['Fac'],b.inputs['Height']);nt.links.new(b.outputs[0],nt.nodes.get('Principled BSDF').inputs['Normal'])
G={}
def reg(o,n,m,g='static'):
 o.name=n;o.data.materials.append(M[m]);G.setdefault(g,[]).append(o);return o
def box(n,loc,size,m,b=.01,g='static'):
 bpy.ops.mesh.primitive_cube_add(size=1,location=loc);o=reg(bpy.context.object,n,m,g);o.dimensions=size;bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
 if b:q=o.modifiers.new('soft machined edge','BEVEL');q.width=b;q.segments=3;o.modifiers.new('weighted normals','WEIGHTED_NORMAL')
 return o
def sphere(n,loc,scale,m,g='static'):
 bpy.ops.mesh.primitive_uv_sphere_add(segments=20,ring_count=12,radius=1,location=loc);o=reg(bpy.context.object,n,m,g);o.scale=scale
 for p in o.data.polygons:p.use_smooth=True
 return o
def rod(n,p1,p2,r,m,g='static'):
 mid=(Vector(p1)+Vector(p2))/2;v=Vector(p2)-Vector(p1);bpy.ops.mesh.primitive_cylinder_add(vertices=24,radius=r,depth=v.length,location=mid);o=reg(bpy.context.object,n,m,g);o.rotation_euler=v.to_track_quat('Z','Y').to_euler();q=o.modifiers.new('edge','BEVEL');q.width=r*.12;q.segments=2
 for p in o.data.polygons:p.use_smooth=True
 return o
def ring(n,loc,R,r,m,rot=(0,0,0),g='static'):
 bpy.ops.mesh.primitive_torus_add(major_radius=R,minor_radius=r,major_segments=24,minor_segments=8,location=loc,rotation=rot);return reg(bpy.context.object,n,m,g)
def empty(n,loc=(0,0,0)):
 o=bpy.data.objects.new(n,None);S.collection.objects.link(o);o.location=loc;return o
def parent(o,p):
 bpy.context.view_layer.update();world=o.matrix_world.copy();o.parent=p;o.matrix_world=world
font=bpy.data.fonts.load('/Users/admin/Downloads/vedio/drama/fonts/Pretendard-SemiBold.otf')
def text(n,s,loc,size,m,rot=(math.pi/2,0,0),g='static'):
 d=bpy.data.curves.new(n,'FONT');d.body=s;d.font=font;d.size=size;d.align_x='CENTER';d.align_y='CENTER';d.extrude=.00025;o=bpy.data.objects.new(n,d);S.collection.objects.link(o);o.location=loc;o.rotation_euler=rot;return reg(o,n,m,g)
def area(n,loc,target,power,col,size):
 d=bpy.data.lights.new(n,'AREA');d.energy=power;d.color=col;d.shape='DISK';d.size=size;o=bpy.data.objects.new(n,d);S.collection.objects.link(o);o.location=loc;o.rotation_euler=(Vector(target)-o.location).to_track_quat('-Z','Y').to_euler();return o
# A consistent real-size foyer and corridor; no empty model-display background.
for ix in range(-4,5):
 for iy in range(-8,13):box('stone floor joint', (ix*.55,iy*.55,-.04),(.546,.546,.075),'tile',.002)
for x in [-1.65,1.65]:
 box('interior plaster',(x,-2.2,1.5),(.18,4.4,3),'inside',.006);box('corridor wall',(x,3.5,1.5),(.18,7,3),'wall',.006)
 for y in [-2.2,3.5]:box('skirting',(x*.943,y,.10),(.036,4.4 if y<0 else 7,.15),'wood',.006)
for x in [-1.1,1.1]:box('door reveal',(x,0,1.5),(1.1,.2,3),'wall',.005)
box('lintel',(0,0,2.68),(1.12,.22,.62),'wall',.005)
for x in [-.565,.565]:box('door jamb',(x,0,1.14),(.10,.24,2.28),'frame',.01)
box('top frame',(0,0,2.28),(1.21,.25,.10),'frame',.01)
# Single hinge-linked door assembly.
door=empty('hinge',(-.52,0,0));panel=box('door',(0,0,1.135),(1.04,.10,2.23),'door',.016);parent(panel,door)
for x in [-.455,.455]:parent(box('panel seam',(x,-.057,1.14),(.006,.006,1.9),'black',.001),door)
for z in [.35,1.15,1.96]:rod('hinge pin',(-.535,-.065,z-.045),(-.535,-.065,z+.045),.016,'nickel')
for side in [-1,1]:
 y=side*.066
 for z in [1.06,1.40]:parent(rod('lock escutcheon',(.33,y,z),(.33,y+side*.012,z),.041,'nickel'),door)
 parent(box('lock slit',(.33,y+side*.014,1.40),(.006,.003,.022),'black',.001),door)
 if side==1:
  parent(text('apartment number','1103',(0,.059,1.93),.115,'brass',(math.pi/2,0,math.pi)),door)
parent(rod('outside lever',(.33,.10,1.06),(.13,.10,1.06),.013,'nickel'),door)
handle=empty('handle pivot',(.33,-.09,1.06));parent(handle,door)
lever=rod('inside lever',(.33,-.10,1.06),(.13,-.10,1.06),.013,'nickel');parent(lever,handle)
thumb=empty('thumb pivot',(.33,-.085,1.4));parent(thumb,door);parent(box('thumb turn',(.33,-.09,1.4),(.059,.019,.016),'nickel',.007),thumb)
# Chain is visible from the opening shot; spaced real links with sag then tension.
box('chain anchor frame',(.615,-.132,1.68),(.055,.02,.08),'nickel',.009);parent(box('chain slide',(.39,-.074,1.68),(.11,.016,.046),'nickel',.005),door)
chain=[]
for i in range(12):chain.append(ring('chain link',(.4+i*.019,-.115,1.67-.055*math.sin(i/11*math.pi)),.012,.003,'nickel',(math.pi/2,0,math.pi/2*(i%2))))
# Lived-in household scale cues.
box('console',(-1.04,-1.38,.91),(.81,.49,.055),'wood',.012)
for x in [-1.38,-.7]:
 for y in [-1.57,-1.2]:box('console leg',(x,y,.46),(.035,.035,.9),'black',.01)
box('rug',(.35,-2.7,.009),(1.65,1.9,.015),'coat',.006)
for x,y,ang in [(.68,-.56,.1),(.88,-.57,-.04)]:
 o=sphere('slipper',(x,y,.052),(.088,.155,.046),'black');o.rotation_euler[2]=ang
box('wall frame',(-1.544,-2.1,1.7),(.04,.70,.84),'brass',.007);box('art paper',(-1.514,-2.1,1.7),(.006,.64,.78),'paper',.003)
# A shaded practical lamp produces warm background light and shape.
rod('lamp stem',(-1.29,-1.35,.95),(-1.29,-1.35,1.31),.012,'brass');rod('lamp base',(-1.29,-1.35,.95),(-1.29,-1.35,.968),.10,'brass')
bpy.ops.mesh.primitive_cone_add(vertices=48,radius1=.18,radius2=.115,depth=.23,location=(-1.29,-1.35,1.37));reg(bpy.context.object,'linen lampshade','paper')
area('warm practical',(-1.25,-1.37,1.25),(0,-.4,1.0),12,(1,.65,.40),.32)
area('interior soft bounce',(.6,-3.3,2.3),(0,-.1,1.1),65,(.78,.88,1),2.1)
area('corridor cold overhead',(0,1.8,2.85),(0,0,1.1),90,(.47,.69,1),1.2)
area('corridor rear',(0,5,2.8),(0,1,1),190,(.65,.78,1),1.3)
for yy in [1.8,4.9]:box('ceiling strip',(0,yy,2.93),(.9,.10,.02),'light',.003)
# Phone and ID texture from deterministic production art, not someone else's photo.
def imageplane(n,path,loc,size,g):
 m=bpy.data.materials.new(n);m.use_nodes=True;nt=m.node_tree;p=nt.nodes.get('Principled BSDF');tex=nt.nodes.new('ShaderNodeTexImage');tex.image=bpy.data.images.load(str(path));nt.links.new(tex.outputs['Color'],p.inputs['Base Color']);nt.links.new(tex.outputs['Color'],p.inputs['Emission Color']);p.inputs['Emission Strength'].default_value=.33;p.inputs['Roughness'].default_value=.45;M[n]=m
 bpy.ops.mesh.primitive_plane_add(size=1,location=loc);o=reg(bpy.context.object,n,n,g);o.scale=(size[0],size[1],1);return o,tex
phone=empty('phone',(-.84,-1.4,.9355));pbody=box('phone metal case',(-.84,-1.4,.9425),(.078,.156,.010),'black',.009);parent(pbody,phone)
screen,screenTex=imageplane('phone screen',C/'art/phone-call.png',(-.84,-1.4,.9485),(.069,.142),'phone');parent(screen,phone)
parent(rod('earpiece',(-.848,-1.330,.9505),(-.832,-1.330,.9505),.001,'nickel'),phone)
cardFloor=empty('card on floor');cardBox=box('ID edge',(0,.15,.013),(.18,.12,.004),'white',.004,g='floorcard');cardP,_=imageplane('ID face floor',C/'art/id.png',(0,.15,.0155),(.174,.114),'floorcard');parent(cardBox,cardFloor);parent(cardP,cardFloor)
cardTable=empty('card on table');ct=box('ID table edge',(-1.02,-1.47,.943),(.18,.12,.003),'white',.003,g='tablecard');cp,_=imageplane('ID face table',C/'art/id.png',(-1.02,-1.47,.945),(.174,.114),'tablecard');parent(ct,cardTable);parent(cp,cardTable)
# Hand is stylised and gloved; no facial performance or unverified lip sync claim.
def hand(n,loc,material):
 root=empty(n,loc);palm=sphere(n+' palm',(loc[0],loc[1]+.026,loc[2]),(.039,.055,.025),material,n);parent(palm,root)
 for i in range(4):
  x=loc[0]-.027+i*.018;end=loc[1]-.058+(abs(i-1.4)*.01);o=rod(n+' finger',(x,loc[1]+.003,loc[2]),(x,end,loc[2]-.008),.010,material,n);parent(o,root);parent(sphere(n+' fingertip',(x,end,loc[2]-.008),(.010,.012,.010),material,n),root)
 parent(rod(n+' thumb',(loc[0]+.037,loc[1]+.026,loc[2]),(loc[0]+.052,loc[1]-.013,loc[2]-.017),.012,material,n),root)
 parent(rod(n+' sleeve',(loc[0],loc[1]+.063,loc[2]),(loc[0],loc[1]+.24,loc[2]+.025),.043,'coat',n),root);return root
outsideHand=hand('outside hand',(.34,.42,1.40),'black')
insideHand=hand('inside hand',(-.78,-1.43,1.01),'skin');insideHand.rotation_euler[2]=math.pi
# Partially framed torso is secondary to the key. Nothing resembling a police uniform.
body=sphere('coat torso',(.65,.80,1.12),(.22,.17,.47),'coat','person');rod('coat sleeve',(.46,.8,1.31),(.36,.65,1.39),.075,'coat','person')
for x in [.54,.78]:rod('trouser',(x,.78,.75),(x,.78,.15),.07,'coat','person');sphere('shoe',(x,.70,.09),(.083,.15,.072),'black','person')
# Distinct key and numbered tag, attached to animated root.
key=empty('working key',(.33,.31,1.4))
parent(box('key blade',(.33,.37,1.4),(.004,.12,.015),'brass',.001),key);parent(ring('key bow',(.33,.46,1.4),.026,.007,'brass',(0,math.pi/2,0)),key)
for j,z in enumerate([.006,.002,.008,.004]):parent(box('key tooth',(.33,.325+j*.017,1.389-z),(.004,.010,.010),'brass',.001),key)
parent(ring('keyring',(.33,.49,1.4),.026,.003,'nickel',(math.pi/2,0,0)),key)
tag=box('numbered key tag',(.33,.535,1.352),(.045,.004,.068),'paper',.005);parent(tag,key);parent(text('key tag number','1103',(.33,.538,1.352),.016,'black',(math.pi/2,0,math.pi)),key)
# Chair rig moves bodily into its final braced position.
chair=empty('barricade',(.02,-1.65,0));parts=[]
for x in [-.19,.19]:
 for y in [-.20,.20]:parts.append(rod('chair leg',(x,y-1.65,.02),(x*.8,y*.8-1.65,.49),.017,'wood'))
parts.append(box('chair seat',(0,-1.65,.5),(.46,.46,.042),'wood',.014))
for x in [-.2,.2]:parts.append(rod('chair back post',(x,-1.44,.49),(x,-1.44,1.06),.016,'wood'))
for z in [.80,.90,1.02]:parts.append(box('chair back rail',(0,-1.44,z),(.42,.025,.05),'wood',.012))
for o in parts:parent(o,chair)
bpy.ops.object.camera_add();cam=bpy.context.object;S.camera=cam;cam.data.lens=43;cam.data.sensor_width=36;cam.data.clip_start=.02;cam.data.dof.use_dof=True;cam.data.dof.aperture_fstop=5.6
focus=empty('focus');cam.data.dof.focus_object=focus
orig={o.name:(o.location.copy(),o.rotation_euler.copy())for o in [door,handle,thumb,cardFloor,chair,key,outsideHand,insideHand]}
def visible(group,v):
 for o in G.get(group,[]):o.hide_render=not v
def smooth(v):v=max(0,min(1,v));return v*v*(3-2*v)
def mix(a,b,t):return Vector(a).lerp(Vector(b),smooth(t))
def camera(loc,target,lens=43):cam.location=loc;focus.location=target;cam.rotation_euler=(Vector(target)-cam.location).to_track_quat('-Z','Y').to_euler();cam.data.lens=lens
images={n:bpy.data.images.load(str(C/f'art/phone-{n}.png'))for n in ['call','record','sent']}
def state(shot,t):
 for o in [door,handle,thumb,cardFloor,chair,key,outsideHand,insideHand]:o.location,o.rotation_euler=orig[o.name][0].copy(),orig[o.name][1].copy()
 for g in ['floorcard','tablecard','person','outside hand','inside hand']:visible(g,False)
 for o in key.children:o.hide_render=True
 chair.hide_render=False
 for o in chair.children:o.hide_render=shot not in ['brace','key','turn']
 for i,o in enumerate(chain):o.location=(.4+i*.019,-.115,1.67-.055*math.sin(i/11*math.pi))
 screenTex.image=images['call'];u=t
 if shot=='knock':
  if t<2.1:camera(mix((.35,2.3,1.8),(.22,1.8,1.6),t/2.1),(0,0,1.61),40)
  else:camera(mix((.75,-2.5,1.5),(.52,-1.6,1.38),(t-2.1)/3.9),(.21,0,1.32),39)
  bumps=sum(math.exp(-((t-v)/.09)**2)for v in [.16,.46,.81]);door.location.y=-.002*bumps;handle.rotation_euler.y=-.28*math.exp(-((t-4.8)/.5)**2)
 elif shot=='identity':
  visible('floorcard',True);cardFloor.location.y=-.55*smooth((t-3)/2)
  if t<4.7:camera(mix((.5,-1.7,1.38),(.18,-.85,.70),t/4.7),(.1,-.02,.83-.45*smooth(t/4.7)),42)
  else:camera(mix((.10,-.88,.57),(.06,-.63,.43),(t-4.7)/7.3),(0,-.38,.014),46)
 elif shot=='verify':
  visible('tablecard',True);visible('inside hand',True);insideHand.location.y-=.16*smooth(t/2);camera(mix((-.61,-1.98,1.35),(-.80,-1.91,1.20),t/10),(-.94,-1.42,.95),50)
 elif shot=='pressure':
  visible('tablecard',True);camera(mix((-.8,-1.95,1.43),(.1,-2.25,1.5),t/9),(.18,0,1.17),39);handle.rotation_euler.y=-.38*math.exp(-((t-1.1)/.8)**2)
 elif shot=='missing':
  visible('tablecard',True)
  if t<8:camera(mix((-.68,-1.90,1.31),(-.88,-1.76,1.12),t/8),(-1.02,-1.47,.945),59)
  else:camera(mix((.1,-1.1,1.65),(.45,-1.75,1.6),(t-8)/6),(.44,-.08,1.68),57)
 elif shot=='brace':
  visible('tablecard',True);chair.location.y+=1.22*smooth((t-.8)/3);visible('inside hand',t<4.2);insideHand.location=(.13,-1.53+1.22*smooth((t-.8)/3),1.06);screenTex.image=images['record' if t<6 else 'sent']
  if t<6:camera(mix((.9,-2.3,1.5),(.8,-1.45,1.25),t/6),(.13,-.4,.8),36)
  else:camera((-.63,-1.88,1.27),(-.84,-1.4,.97),55)
 elif shot=='key':
  visible('person',True);visible('outside hand',True);chair.location.y+=1.22
  for o in key.children:o.hide_render=False
  key.location.y-=.27*smooth((t-5)/4);outsideHand.location.y-=.17*smooth((t-5)/4);key.rotation_euler.y=1.4*smooth((t-8.3)/1.7);jiggle=.006*math.sin(t*8)*(1-smooth(t/4));key.location.z+=jiggle;outsideHand.location.z+=jiggle
  camera(mix((-.08,1.32,1.62),(.03,1.04,1.48),t/10),(.33,.34-.16*smooth(t/10),1.365),52)
 elif shot=='turn':
  chair.location.y+=1.22;thumb.rotation_euler.y=1.4*smooth(t/1.6);handle.rotation_euler.y=-.27*smooth((t-1.6)/1.3);door.rotation_euler.z=-.015*smooth((t-2.5)/1.3)
  for i,o in enumerate(chain):o.location=(.4+i*.019,-.115-.006*(1-i/11)*smooth((t-2.5)/1.3),1.67-(.055-.045*smooth((t-2.5)/1.3))*math.sin(i/11*math.pi))
  camera(mix((.7,-1.28,1.49),(.62,-.96,1.54),t/7),(.4,-.09,1.53),62)
 else:raise ValueError(shot)
 bpy.context.view_layer.update()
if a.engine=='BLENDER_EEVEE_NEXT':
 S.render.engine=a.engine;S.eevee.taa_render_samples=a.samples;S.eevee.use_raytracing=True
 S.use_nodes=True;nt=S.node_tree;nt.nodes.clear();layers=nt.nodes.new('CompositorNodeRLayers');dn=nt.nodes.new('CompositorNodeDenoise');out=nt.nodes.new('CompositorNodeComposite');nt.links.new(layers.outputs['Image'],dn.inputs['Image']);nt.links.new(dn.outputs['Image'],out.inputs['Image'])
TL=json.loads((C/'timeline.json').read_text());shots=[x for x in TL['shots']if a.shot in ['all',x['id']]];assert shots
manifest=C/'clips/render-manifest.json';records=json.loads(manifest.read_text())if manifest.exists()else{}
sourceHash=hashlib.sha256(Path(__file__).read_bytes()).hexdigest()
for shot in shots:
 ident=shot['id'];frames=shot['frames'];dur=frames/24
 if a.preview:
  for t in [dur*.22,dur*.78]:
   state(ident,t);S.render.filepath=str(C/f'qa/{ident}-{int(t*100):04}.png');bpy.ops.render.render(write_still=True)
  continue
 out=C/f'clips/{ident}.mp4'
 if ident in records and records[ident].get('sourceHash')==sourceHash and records[ident].get('engine')==a.engine and records[ident].get('percentage')==a.percent and records[ident].get('samples')==a.samples and records[ident].get('frames')==frames and out.exists():print('CACHED',ident,flush=True);continue
 if shutil.disk_usage(C).free<250*1024**2:raise RuntimeError('Less than250MB free: preserving checkpoints, stop')
 # Encode animation directly in Blender; avoid repeated iCloud PNG writes.
 S.render.image_settings.file_format='FFMPEG';S.render.ffmpeg.format='MPEG4';S.render.ffmpeg.codec='H264';S.render.ffmpeg.constant_rate_factor='HIGH';S.render.ffmpeg.ffmpeg_preset='GOOD';S.render.filepath=str(out);S.render.use_file_extension=True;S.frame_start=0;S.frame_end=frames-1
 start=time.time()
 def update_frame(scene,*unused):
  f=scene.frame_current;state(ident,f/24)
  if f%48==0:print('PROGRESS',ident,f,frames,round(time.time()-start,1),flush=True)
 bpy.app.handlers.frame_change_pre.append(update_frame)
 try:
  S.frame_set(0);bpy.ops.render.render(animation=True)
 finally:bpy.app.handlers.frame_change_pre.remove(update_frame)

 q=json.loads(subprocess.check_output(['/opt/homebrew/bin/ffprobe','-v','error','-show_streams','-of','json',str(out)]))['streams'][0];assert int(q['nb_frames'])==frames
 records[ident]={'sourceHash':sourceHash,'frames':frames,'duration':dur,'samples':a.samples,'percentage':a.percent,'device':'METAL GPU','engine':a.engine,'sha256':hashlib.sha256(out.read_bytes()).hexdigest(),'elapsed':round(time.time()-start,2)};manifest.write_text(json.dumps(records,indent=2));print('SHOT_DONE',ident,records[ident]['elapsed'],flush=True)
print('RENDER_COMPLETE',flush=True)
