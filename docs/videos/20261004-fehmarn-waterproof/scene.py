"""Original one-bore longitudinal teaching model; no surveyed geometry or CFD."""
import bpy,sys,math,json,argparse,random
from pathlib import Path
from mathutils import Vector
p=argparse.ArgumentParser();p.add_argument('--cache',type=Path,required=True);p.add_argument('--preview',action='store_true');p.add_argument('--shots');p.add_argument('--force',action='store_true');a=p.parse_args(sys.argv[sys.argv.index('--')+1:]);FPS=24
plan=json.loads((a.cache/'short-plan.json').read_text());folder=a.cache/'3d-short';folder.mkdir(exist_ok=True)
def ease(t):t=max(0,min(1,t));return t*t*(3-2*t)
def build(seg):
 bpy.app.handlers.frame_change_pre.clear();bpy.ops.wm.read_factory_settings(use_empty=True);s=bpy.context.scene;sid=seg['id'];D=seg['duration'];anim=[];mats={};rng=random.Random(24)
 s.render.engine='BLENDER_EEVEE_NEXT';s.eevee.taa_render_samples=24;s.render.resolution_x=1080;s.render.resolution_y=1920;s.render.resolution_percentage=66 if a.preview else 100;s.render.fps=FPS;s.view_settings.view_transform='AgX';s.view_settings.look='AgX - Medium High Contrast'
 s.world=bpy.data.worlds.new('Underwater environment');s.world.use_nodes=True;s.world.node_tree.nodes['Background'].inputs[0].default_value=(.035,.16,.19,1);s.world.node_tree.nodes['Background'].inputs[1].default_value=.5
 def mat(n,c,metal=0,rough=.5,noise=False,emit=0):
  m=bpy.data.materials.new(n);m.use_nodes=True;nt=m.node_tree;bs=nt.nodes.get('Principled BSDF');bs.inputs['Base Color'].default_value=(*c,1);bs.inputs['Metallic'].default_value=metal;bs.inputs['Roughness'].default_value=rough
  if emit:bs.inputs['Emission Color'].default_value=(*c,1);bs.inputs['Emission Strength'].default_value=emit
  if noise:
   no=nt.nodes.new('ShaderNodeTexNoise');no.inputs['Scale'].default_value=12;no.inputs['Detail'].default_value=3
   ramp=nt.nodes.new('ShaderNodeValToRGB');ramp.color_ramp.elements[0].color=(*[v*.55 for v in c],1);ramp.color_ramp.elements[1].color=(*c,1);nt.links.new(no.outputs['Fac'],ramp.inputs[0]);nt.links.new(ramp.outputs[0],bs.inputs['Base Color'])
   bu=nt.nodes.new('ShaderNodeBump');bu.inputs['Strength'].default_value=.18;bu.inputs['Distance'].default_value=.035;nt.links.new(no.outputs['Fac'],bu.inputs['Height']);nt.links.new(bu.outputs[0],bs.inputs['Normal'])
  mats[n]=m
 for q in [('concrete',(.72,.68,.56),0,.72,True),('steel',(.08,.19,.23),.75,.3),('rubber',(.055,.06,.045),0,.72),('seal',(.95,.38,.04),.05,.48),('water',(.015,.49,.66),.2,.17,False,.18),('sand',(.17,.24,.23),0,.98,True),('gravel',(.30,.34,.29),0,.92,True),('yellow',(.95,.68,.09),.15,.45),('light',(.5,.88,1),.2,.2,False,1.5),('road',(.09,.115,.13),0,.92)]:mat(*q)
 def box(n,loc,dim,ma,bev=.03,parent=None):
  bpy.ops.mesh.primitive_cube_add(size=1,location=loc);o=bpy.context.object;o.name=n;o.dimensions=dim;bpy.ops.object.transform_apply(location=False,rotation=False,scale=True);o.data.materials.append(mats[ma]);
  if bev:b=o.modifiers.new('Rounded edges','BEVEL');b.width=bev;b.segments=2;o.modifiers.new('Surface normals','WEIGHTED_NORMAL')
  if parent:o.parent=parent
  return o
 def rod(n,p,q,r,ma,parent=None):
  v,w=Vector(p),Vector(q);bpy.ops.mesh.primitive_cylinder_add(vertices=12,radius=r,depth=(w-v).length,location=(v+w)/2);o=bpy.context.object;o.name=n;o.rotation_euler=(w-v).to_track_quat('Z','Y').to_euler();o.data.materials.append(mats[ma]);
  if parent:o.parent=parent
  return o
 def empty(n):o=bpy.data.objects.new(n,None);s.collection.objects.link(o);return o
 def arrow(x,y,z,ma='light'):
  root=empty('Illustrative external pressure arrow');rod('shaft',(x,y,z),(x-.8,y,z),.055,ma,root)
  bpy.ops.mesh.primitive_cone_add(vertices=16,radius1=.17,radius2=0,depth=.35,location=(x-.95,y,z),rotation=(0,-math.pi/2,0));o=bpy.context.object;o.data.materials.append(mats[ma]);o.parent=root;return root
 box('Seabed',(0,0,-.8),(500,500,.6),'sand',0)
 box('Prepared gravel trench',(0,0,-.3),(22,6,.4),'gravel')
 for j in range(75):
  x=rng.uniform(-12,12);y=rng.choice([-1,1])*rng.uniform(3.2,5.2);o=box('Seabed stone',(x,y,-.2),(rng.uniform(.1,.45),rng.uniform(.1,.4),rng.uniform(.1,.3)),'gravel',.04);o.rotation_euler.z=rng.random()*3
 new=empty('New element');left=empty('Existing element')
 # Longitudinal cutaway: front wall and front half of roof removed only for explanation.
 for root,x in [(left,-3.2),(new,3.2)]:
  box('Concrete invert',(x,0,.12),(6,4.8,.38),'concrete',parent=root)
  box('Back wall',(x,2.22,1.8),(6,.36,3.1),'concrete',parent=root)
  box('Roof cutaway',(x,1.5,3.4),(6,1.85,.35),'concrete',parent=root)
  box('Front cut edge',(x,-2.22,.5),(6,.36,.4),'concrete',parent=root)
  for xx in [x-2.7,x-1.35,x,x+1.35,x+2.7]:
   box('Formwork joint',(xx,2.02,1.8),(.035,.022,2.75),'steel',.003,root)
   box('Interior light',(xx,1.99,2.9),(.5,.07,.07),'light',.01,root)
  for y in [-1.4,1.4]:
   rod('Lifting cable',(x,y,3.5),(x,y,9),.027,'steel',root)
   box('Lifting point',(x,y,3.45),(.3,.26,.18),'yellow',.03,root)
 walls=[]
 for x,root in [(-.78,left),(.78,new)]:
  wall=empty('Temporary bulkhead');wall.parent=root;wall.location.x=x;walls.append(wall)
  box('Watertight steel bulkhead',(0,0,1.85),(.14,4.1,2.9),'steel',.025,wall)
  for y in [-1.65,-.85,0,.85,1.65]:box('Bulkhead stiffener',(.1,y,1.85),(.13,.07,2.9),'yellow',.009,wall)
 # Rubber surrounds the whole exterior perimeter; orange is an explanatory highlight.
 gasket=[]
 for loc,dim in [((0,-2.1,1.8),(.48,.2,3.0)),((0,2.1,1.8),(.48,.2,3.0)),((0,0,.35),(.48,4.35,.2)),((0,0,3.25),(.48,4.35,.2))]:gasket.append(box('Gina perimeter seal',loc,dim,'seal',.07))
 water=box('Water ONLY between temporary bulkheads',(0,0,1.75),(1.36,3.98,2.7),'water',.015)
 hose=[(.08,-.8,.5),(.08,-.8,3.95),(1.5,-.8,4.35),(3,-.8,4.35)]
 for j in range(3):rod('Pump discharge hose',hose[j],hose[j+1],.065,'yellow')
 droplets=[]
 for k in range(7):
  o=box('Explanatory pumped water',hose[0],(.12,.12,.12),'light',.04);droplets.append(o)
  def move(t,o=o,k=k):
   phase=(t*.55+k/7)%1;v=phase*3;j=min(2,int(v));o.location=Vector(hose[j]).lerp(Vector(hose[j+1]),v-j);o.hide_render=sid!='drain' or t<1
  anim.append(move)
 arrows=[arrow(7.6,y,z) for y in [-1.2,1.2] for z in [1,2.5]]
 farwall=box('Closed far end of new element',(6.18,0,1.85),(.18,4.12,2.9),'steel',.02,new)
 for root in arrows:
  for o in root.children:o.hide_render=sid!='pressure'
 # End reveal is schematic after waterproofing, secondary seal and structural work.
 roadway=box('Connected interior path',(0,0,.36),(12,3.9,.08),'road',.01)
 stripes=[box('Lane marking',(x,0,.41),(.6,.04,.015),'yellow',.003) for x in range(-5,6)]
 for o in [roadway,*stripes]:o.hide_render=sid!='open'
 for o in bpy.data.objects:
  if o.name.startswith(('Lifting cable','Lifting point')):o.hide_render=sid not in ['question','lower']
  if o.name.startswith('Pump discharge hose'):o.hide_render=sid!='drain'
 if sid in ['question','lower','scale']:cam0=Vector((12,-19,13));target=Vector((0,0,1.5));lens=39
 elif sid in ['walls','chamber']:cam0=Vector((6,-13,8));target=Vector((0,0,1.6));lens=43
 elif sid=='drain':cam0=Vector((4.8,-10,6.7));target=Vector((0,0,1.9));lens=46
 elif sid=='pressure':cam0=Vector((15,-10,9));target=Vector((1.7,0,1.7));lens=43
 else:cam0=Vector((9,-16,10));target=Vector((0,0,1.5));lens=40
 for loc,power,size,color in [((-5,-6,12),3300,9,(.75,.9,1)),((5,5,9),4000,7,(.48,.85,1)),((-7,2,5),1800,5,(1,.8,.57))]:
  bpy.ops.object.light_add(type='AREA',location=loc);o=bpy.context.object;o.data.energy=power;o.data.size=size;o.data.color=color;o.rotation_euler=(target-o.location).to_track_quat('-Z','Y').to_euler()
 bpy.ops.object.camera_add(location=cam0);cam=bpy.context.object;s.camera=cam;cam.data.lens=lens
 def update(scene):
  t=(scene.frame_current-1)/FPS;u=t/max(D,.1)
  for f in anim:f(t)
  new.location=(0,0,0)
  if sid in ['lower','scale']:new.location.z=1.9*(1-ease(u/.8));new.location.x=.35*(1-ease(u/.8))
  if sid=='question':new.location.x=.8*(1-ease(u))
  if sid=='pressure':new.location.x=-.16*ease((u-.12)/.60)
  level=1
  if sid=='drain':level=1-.98*ease((u-.18)/.68)
  water.hide_render=sid in ['pressure','open','lower','question','scale'];water.scale.z=max(.015,level);water.location.z=.4+1.35*level
  for w in walls:
   w.location.z=4.5*ease((u-.12)/.35) if sid=='open' else 0
   w.hide_render=False
   for o in w.children:o.hide_render=sid=='open' and u>.55
  if sid=='open':farwall.hide_render=True
  for o in gasket:o.scale.x=1-.28*ease(u/.8) if sid=='pressure' else 1
  for j,root in enumerate(arrows):root.location.x=-.23*math.sin(t*3+j*.3)
  # A close diagnostic shot changes to a larger spatial view instead of rotating a part.
  cam.location=target+(cam0-target)*(1-.07*ease(u));cam.rotation_euler=(target-cam.location).to_track_quat('-Z','Y').to_euler()
 bpy.app.handlers.frame_change_pre.append(update);s.frame_start=1;s.frame_end=round(D*FPS);return s
for seg in plan['segments']:
 if a.shots and seg['id'] not in a.shots.split(','):continue
 out=folder/(seg['id']+'.mp4')
 if out.exists() and not a.force and not a.preview:continue
 s=build(seg)
 if a.preview:
  for f in [.15,.70]:s.frame_set(max(1,round(s.frame_end*f)));s.render.image_settings.file_format='PNG';s.render.filepath=str(folder/(seg['id']+f'-{int(f*100)}.png'));bpy.ops.render.render(write_still=True)
 else:
  s.render.image_settings.file_format='FFMPEG';s.render.ffmpeg.format='MPEG4';s.render.ffmpeg.codec='H264';s.render.ffmpeg.constant_rate_factor='HIGH';s.render.ffmpeg.ffmpeg_preset='GOOD';s.render.filepath=str(out);bpy.ops.render.render(animation=True)
 print('COMPLETE',seg['id'],seg['duration'],flush=True)
