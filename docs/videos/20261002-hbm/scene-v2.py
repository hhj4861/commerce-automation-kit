"""Causal HBM cutaways: data arrival drives compute, with fixed comparison cameras.
Conceptual geometry and timing, never a measured performance comparison.
"""
import bpy,sys,argparse,json,math
from pathlib import Path
from mathutils import Vector
from bpy_extras.object_utils import world_to_camera_view
sys.path.insert(0,str(Path(__file__).parent))
sys.dont_write_bytecode=True
from explain import flow_config,computing,lane_age
p=argparse.ArgumentParser();p.add_argument('--cache',type=Path,required=True);p.add_argument('--shot',default='hook,capacity,wide,stack,tsv,interposer,ending');p.add_argument('--short',action='store_true');p.add_argument('--preview',action='store_true');p.add_argument('--force',action='store_true');a=p.parse_args(sys.argv[sys.argv.index('--')+1:])
root=a.cache;outdir=root/'v2'/('3d-short'if a.short else'3d');outdir.mkdir(parents=True,exist_ok=True)
brief=json.loads((Path(__file__).parent/'brief.json').read_text());manifest=json.loads((root/('short-project.json'if a.short else'project.json')).read_text());FPS=24

def ease(x):x=max(0,min(1,x));return x*x*(3-2*x)
def daily_scene(seg):
 bpy.app.handlers.frame_change_pre.clear();bpy.ops.wm.read_factory_settings(use_empty=True);s=bpy.context.scene;s.render.engine='BLENDER_EEVEE_NEXT';s.eevee.taa_render_samples=16;s.render.resolution_x=1080;s.render.resolution_y=1920;s.render.resolution_percentage=100;s.render.fps=24;s.view_settings.view_transform='AgX'
 s.world=bpy.data.worlds.new('Room');s.world.use_nodes=True;s.world.node_tree.nodes['Background'].inputs[0].default_value=(.12,.16,.2,1);s.world.node_tree.nodes['Background'].inputs[1].default_value=.4
 def material(n,col,metal=0):
  m=bpy.data.materials.new(n);m.use_nodes=True;bs=m.node_tree.nodes.get('Principled BSDF');bs.inputs['Base Color'].default_value=(*col,1);bs.inputs['Metallic'].default_value=metal;bs.inputs['Roughness'].default_value=.3;return m
 steel=material('Titanium',(.24,.29,.35),.8);black=material('Display',(.019,.03,.048));white=material('Text',(.8,.87,.94));cyan=material('Accent',(.12,.7,.64));bg=material('Room finish',(.05,.066,.085),.3)
 def box(n,loc,dim,mat,r=.09):
  bpy.ops.mesh.primitive_cube_add(size=1,location=loc);o=bpy.context.object;o.name=n;o.dimensions=dim;bpy.ops.object.transform_apply(location=False,rotation=False,scale=True);o.data.materials.append(mat);b=o.modifiers.new('Rounded edges','BEVEL');b.width=r;b.segments=5;o.modifiers.new('Normals','WEIGHTED_NORMAL');return o
 box('Floor',(0,0,-1.7),(20,20,.2),bg)
 for side in(-1,1):
  for y in(2,5,8):
   box('Server cabinet',(side*4,y,2),(2,2,7),black)
   for z in range(10):box('Equipment tray',(side*4,y-1.04,-.5+z*.5),(1.8,.08,.32),steel,.025)
 box('Personal device',(0,0,1.5),(3.35,.22,5.7),steel,.18);box('Screen',(0,-.14,1.5),(3.10,.04,5.38),black,.14);box('Speaker',(0,-.18,3.99),(.46,.02,.036),steel,.015)
 font=bpy.data.fonts.load(str(root.parent/'20260930-yeosu-realistic/fonts/Pretendard-SemiBold.otf'));animated=[]
 def txt(text,z,size=.18,mat=white,start=0):
  curve=bpy.data.curves.new('UI text','FONT');curve.body=text;curve.font=font;curve.align_x='CENTER';curve.size=size;curve.extrude=0;o=bpy.data.objects.new('Illustrative answer',curve);s.collection.objects.link(o);o.location=(0,-.18,z);o.rotation_euler=(math.pi/2,0,0);curve.materials.append(mat);animated.append((o,start));return o
 txt('AI에게 질문',3.55,.24,cyan);txt('HBM은 왜 필요할까요?',2.9,.20);box('Question divider',(0,-.175,2.6),(2.55,.015,.018),steel,.005)
 txt('답변을 만들고 있어요',2.12,.17,white,1)
 txt('GPU가 계산할 데이터를',1.48,.19,white,3.3);txt('여러 통로로 전달하는',1.06,.19,white,4.8);txt('메모리입니다.',.64,.19,cyan,6.3)
 txt('데이터 공급이 빨라지면',-.13,.16,white,8);txt('대기 시간을 줄이는 데 도움이 됩니다.',-.47,.125,white,9)
 for loc,power,size in[((-4,-6,8),1400,6),((5,1,6),1800,5)]:
  bpy.ops.object.light_add(type='AREA',location=loc);o=bpy.context.object;o.data.energy=power;o.data.size=size;o.rotation_euler=(Vector((0,0,1.5))-o.location).to_track_quat('-Z','Y').to_euler()
 bpy.ops.object.camera_add(location=(.35,-10.8,3.1));cam=bpy.context.object;s.camera=cam;cam.rotation_euler=(Vector((0,0,1.7))-cam.location).to_track_quat('-Z','Y').to_euler();cam.data.lens=38
 def animate(scene):
  t=(scene.frame_current-1)/24
  for o,start in animated:o.hide_render=t<start
 bpy.app.handlers.frame_change_pre.append(animate);s.frame_start=1;s.frame_end=round(seg['duration']*24);return s,{}

def make(seg):
 if seg['id']=='daily'and a.short:return daily_scene(seg)
 bpy.app.handlers.frame_change_pre.clear();bpy.ops.wm.read_factory_settings(use_empty=True)
 name=seg['id'];s=bpy.context.scene;W,H=(1080,1920)if a.short else(1920,1080);s.render.engine='BLENDER_EEVEE_NEXT';s.eevee.taa_render_samples=16;s.render.resolution_x=W;s.render.resolution_y=H;s.render.resolution_percentage=100;s.render.fps=FPS;s.view_settings.view_transform='AgX';s.view_settings.look='AgX - Medium High Contrast';s.world=bpy.data.worlds.new('Ambient');s.world.use_nodes=True;s.world.node_tree.nodes['Background'].inputs[0].default_value=(.12,.16,.21,1);s.world.node_tree.nodes['Background'].inputs[1].default_value=.35
 mats={};anim=[];anchors={}
 def mat(n,c,metal=.6,rough=.26,emit=0):
  m=bpy.data.materials.new(n);m.use_nodes=True;bs=m.node_tree.nodes.get('Principled BSDF');bs.inputs['Base Color'].default_value=(*c,1);bs.inputs['Metallic'].default_value=metal;bs.inputs['Roughness'].default_value=rough
  if emit:bs.inputs['Emission Color'].default_value=(*c,1);bs.inputs['Emission Strength'].default_value=emit
  mats[n]=m
 for n,c,metal,rough,em in [('pcb',(.02,.10,.078),.3,.36,0),('graphite',(.055,.078,.105),.75,.2,0),('edge',(.28,.36,.44),.85,.23,0),('gold',(.7,.38,.09),.85,.25,0),('copper',(.65,.25,.08),.75,.22,0),('off',(.09,.12,.14),.65,.3,0),('on',(.06,.7,.62),.5,.24,1.1),('data',(.03,.62,.9),.5,.22,1.2),('amber',(1,.38,.035),.4,.24,1.1),('floor',(.023,.032,.045),.3,.45,0)]:mat(n,c,metal,rough,em)
 def box(n,loc,dim,ma,bev=.04):
  bpy.ops.mesh.primitive_cube_add(size=1,location=loc);o=bpy.context.object;o.name=n;o.dimensions=dim;bpy.ops.object.transform_apply(location=False,rotation=False,scale=True);o.data.materials.append(mats[ma])
  if bev:m=o.modifiers.new('Machined edges','BEVEL');m.width=bev;m.segments=3;o.modifiers.new('Normals','WEIGHTED_NORMAL')
  return o
 def rod(n,p,q,r,ma):
  v,w=Vector(p),Vector(q);bpy.ops.mesh.primitive_cylinder_add(vertices=16,radius=r,depth=(w-v).length,location=(v+w)/2);o=bpy.context.object;o.name=n;o.rotation_euler=(w-v).to_track_quat('Z','Y').to_euler();o.data.materials.append(mats[ma]);return o
 def visibility(o,fn):anim.append(lambda t,o=o,fn=fn:setattr(o,'hide_render',not fn(t)))
 box('Stage',(0,0,-.7),(35,30,.4),'floor');box('Accelerator board',(0,0,-.26),(11.7,7.8,.22),'pcb');box('Interposer cutaway',(0,0,-.06),(9,4.5,.18),'graphite')
 # Small passive components and fasteners establish physical scale without visual clutter.
 for side in(-1,1):
  for j in range(14):
   y=-3.3+j*.5;box('Power module',(side*5.2,y,.01),(.44,.27,.22),'graphite',.02);box('Metal cap',(side*5.2,y,.13),(.35,.21,.025),'edge',.006)
  for j in range(22):box('PCB trace',(side*4.48,-3.35+j*.31,-.137),(.68,.017,.01),'gold',.002)
  for y in(-3.5,3.5):rod('Screw',(side*5.4,y,-.14),(side*5.4,y,.02),.11,'edge')
 gx=2.3;mx=-2.9
 gpu=box('Compute GPU',(gx,0,.23),(2.65,2.9,.35),'graphite');box('Compute rim',(gx,0,.42),(2.70,2.95,.04),'edge',.02)
 cores=[]
 for x in range(5):
  for y in range(6):cores.append(box('Execution tile',(gx-.98+x*.49,-1.18+y*.47,.46),(.39,.36,.025),'off',.025))
 # Packet motion and GPU illumination share this same deterministic event schedule.
 def config(t):return flow_config(name,t)
 def active(t):return computing(name,t)
 for k,o in enumerate(cores):
  def core(t,o=o,k=k):o.data.materials[0]=mats['on'if active(t)else'off']
  anim.append(core)
 anchors['gpu']=(gx,0,.46);anchors['memory']=(mx,0,1.3);anchors['link']=(-.2,0,.06)
 layer_count=8 if name in('stack','tsv','interposer','ending')else 4
 for j in range(layer_count):
  z=.24+j*.15;layer=box('DRAM layer',(mx,0,z),(1.85,2.3,.105),'graphite',.022)
  box('Layer edge detail',(mx,-1.16,z),(1.88,.025,.055),'edge',.008).parent=layer
  child=layer.children[0];child.location=(0,-1.16,0)
  for k in range(10):
   pin=box('Bond contact',(0,0,0),(.07,.028,.032),'gold',.004);pin.parent=layer;pin.location=(-.8+k*.178,-1.18,0)
  if name=='stack':
   def stack(t,o=layer,j=j,z=z):
    f=ease((t-3)/3.8);o.location=(mx-(1-f)*j*.40,(1-f)*j*.37,.24+j*.15*f)
   anim.append(stack)
  if name=='tsv':
   layer.scale.y=.56;layer.location.y=.55
   def explode(t,o=layer,j=j):o.location.z=.24+j*(.15+.21*ease((t-.4)/2.5))
   anim.append(explode)
  if name=='capacity':
   visibility(layer,lambda t,j=j:j<2 or t>=9.25)
   for child in layer.children:visibility(child,lambda t,j=j:j<2 or t>=9.25)
 # Visible physical channels + trace-bound packets (not decorative floating dots).
 for j in range(6):
  y=-.92+j*.368
  wire=box('Parallel copper lane',(-.1,y,.065),(3.72,.042,.026),'copper',.01)
  visibility(wire,lambda t,j=j:j<config(t)[0])
  for k in range(2):
   packet=box('Data block',(-1.92,y,.14),(.20,.12,.10),'data',.025)
   def flow(t,o=packet,j=j,k=k,y=y):
    lanes,period=config(t);age=lane_age(name,t,j);phase=(age/period)%1;o.hide_render=j>=lanes or k==1 or age<0;o.location=(-1.9+phase*2.9,y,.14)
   anim.append(flow)
 if name in('tsv','interposer'):
  high=2.81 if name=='tsv'else 1.5
  for dx in(-.55,0,.55):
   r=rod('TSV copper', (mx+dx,-.06,.06),(mx+dx,-.06,high),.055,'copper');visibility(r,lambda t:t>=4.4 if name=='tsv'else t>=1.0)
   data=box('TSV data',(mx+dx,-.06,high),(.14,.14,.18),'data',.025)
   def vertical(t,o=data,dx=dx):o.hide_render=t<(4.4 if name=='tsv'else 1);o.location=(mx+dx,-.06,high-(t%1.7)/1.7*(high-.08))
   anim.append(vertical)
  anchors['vertical']=(mx,0,high)
 if name=='tsv':anchors['memory']=(mx,.55,3.4)
 if name=='interposer':
  # Lift board components modestly to reveal horizontal wiring beneath them.
  anchors['link']=(-.3,0,.08)
 for loc,power,size,col in [((-3,-5,10),2400,7,(1,.87,.73)),((6,3,9),2700,6,(.76,.9,1)),((-5,5,5),1500,4,(1,.68,.4))]:
  bpy.ops.object.light_add(type='AREA',location=loc);l=bpy.context.object;l.data.energy=power;l.data.size=size;l.data.color=col;l.rotation_euler=(Vector((0,0,.2))-l.location).to_track_quat('-Z','Y').to_euler()
 bpy.ops.object.camera_add();cam=bpy.context.object;s.camera=cam
 # Same viewpoint throughout a comparison. Portrait gets its own native camera.
 cam.location=(11,-6,17)if a.short else(8,-12,14);target=Vector((0,0,.35));cam.rotation_euler=(target-cam.location).to_track_quat('-Z','Y').to_euler();cam.data.type='ORTHO';cam.data.ortho_scale=17.7 if a.short else 14.6;cam.data.lens=45
 if a.short:cam.location=(13,-3.2,15);cam.rotation_euler=(target-cam.location).to_track_quat('-Z','Y').to_euler()
 bpy.context.view_layer.update()
 coords={k:[round(world_to_camera_view(s,cam,Vector(v)).x*W),round((1-world_to_camera_view(s,cam,Vector(v)).y)*H)]for k,v in anchors.items()}
 def update(scene):
  t=(scene.frame_current-1)/FPS+seg.get('sourceStart',0)
  for fn in anim:fn(t)
 bpy.app.handlers.frame_change_pre.append(update);s.frame_start=1;s.frame_end=round(seg['duration']*FPS)
 return s,coords
if a.short:
 full=json.loads((root/'project.json').read_text())
 manifest['segments'] += [s for s in full['segments'] if s['id']=='wide']
for seg in manifest['segments']:
 if seg['id']not in a.shot.split(','):continue
 out=outdir/(seg['id']+'.mp4')
 if out.exists()and not(a.preview or a.force):print('EXISTS',out,flush=True);continue
 s,coords=make(seg);(outdir/(seg['id']+'.json')).write_text(json.dumps({'anchors':coords,'segment':seg,'conceptualTiming':True},ensure_ascii=False,indent=2))
 if a.preview:
  for sec in ([7,11]if seg['id']=='hook'else[2,7,14]):
   s.frame_set(min(s.frame_end,max(1,round(sec*FPS))));s.render.image_settings.file_format='PNG';s.render.filepath=str(outdir/(seg['id']+f'-{sec}.png'));bpy.ops.render.render(write_still=True)
 else:
  s.render.image_settings.file_format='FFMPEG';s.render.ffmpeg.format='MPEG4';s.render.ffmpeg.codec='H264';s.render.ffmpeg.constant_rate_factor='HIGH';s.render.ffmpeg.ffmpeg_preset='GOOD';s.render.filepath=str(out);bpy.ops.render.render(animation=True)
 print('COMPLETE',seg['id'],'short'if a.short else'long',flush=True)
