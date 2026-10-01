"""Original glass-core package illustration; dimensions/deformation are conceptual."""
import bpy, math, sys, argparse
from pathlib import Path
from mathutils import Vector
p=argparse.ArgumentParser();p.add_argument('--cache',type=Path,required=True);p.add_argument('--shot',default='all');p.add_argument('--preview',action='store_true');p.add_argument('--force',action='store_true');p.add_argument('--frames',type=int,default=192);p.add_argument('--width',type=int,default=1280);a=p.parse_args(sys.argv[sys.argv.index('--')+1:])
a.cache.mkdir(parents=True,exist_ok=True)
SHOTS=['package','explode','traffic','expand','warp','thermal','compare','wiring','handling','factory','inspection','server','system','hero','vias']

def make(shot):
 bpy.app.handlers.frame_change_pre.clear()
 bpy.ops.wm.read_factory_settings(use_empty=True)
 s=bpy.context.scene;s.render.engine='BLENDER_EEVEE_NEXT';s.render.resolution_x=a.width;s.render.resolution_y=round(a.width*9/16);s.render.resolution_percentage=100;s.render.fps=24
 s.render.image_settings.file_format='PNG';s.render.image_settings.color_mode='RGB';s.view_settings.view_transform='AgX';s.view_settings.look='AgX - Medium High Contrast'
 s.world=bpy.data.worlds.new('Warm studio');s.world.use_nodes=True;s.world.node_tree.nodes['Background'].inputs[0].default_value=(.65,.66,.64,1);s.world.node_tree.nodes['Background'].inputs[1].default_value=.45
 if hasattr(s,'eevee'):s.eevee.taa_render_samples=24
 mats={}
 def mat(name,c,metal=0,rough=.3):
  m=bpy.data.materials.new(name);m.use_nodes=True;q=m.node_tree.nodes['Principled BSDF'];q.inputs['Base Color'].default_value=(*c,1);q.inputs['Metallic'].default_value=metal;q.inputs['Roughness'].default_value=rough;mats[name]=m;return m
 mat('floor',(.78,.755,.70),0,.85);mat('silicon',(.035,.046,.055),.75,.22);mat('copper',(.75,.32,.105),.78,.24);mat('glass',(.24,.61,.56),.28,.13);mat('organic',(.16,.23,.18),.2,.43);mat('light',(.93,.92,.88),.4,.3);mat('red',(.78,.12,.065),.25,.32);mat('signal',(1,.57,.06),.25,.22)
 mats['signal'].node_tree.nodes['Principled BSDF'].inputs['Emission Color'].default_value=(1,.23,.025,1);mats['signal'].node_tree.nodes['Principled BSDF'].inputs['Emission Strength'].default_value=.4
 glass_shader=mats['glass'].node_tree.nodes['Principled BSDF'];glass_shader.inputs['Transmission Weight'].default_value=.65;glass_shader.inputs['IOR'].default_value=1.48
 moving=[]
 def box(name,loc,size,material,bevel=.025):
  bpy.ops.mesh.primitive_cube_add(size=1,location=loc);o=bpy.context.object;o.name=name;o.dimensions=size;bpy.ops.object.transform_apply(location=False,rotation=False,scale=True);o.data.materials.append(mats[material]);b=o.modifiers.new('Precision edge','BEVEL');b.width=bevel;b.segments=3;o.modifiers.new('Weighted normals','WEIGHTED_NORMAL');return o
 def rod(name,start,end,r,material):
  v,w=Vector(start),Vector(end);bpy.ops.mesh.primitive_cylinder_add(vertices=16,radius=r,depth=(w-v).length,location=(v+w)/2);o=bpy.context.object;o.name=name;o.rotation_euler=(w-v).to_track_quat('Z','Y').to_euler();o.data.materials.append(mats[material]);return o
 def ball(loc,r=.055,material='signal'):
  bpy.ops.mesh.primitive_uv_sphere_add(segments=12,ring_count=8,radius=r,location=loc);o=bpy.context.object;o.data.materials.append(mats[material]);return o
 def package(x=0,y=0,scale=1,explode=False):
  board=box('Glass core package',(x,y,.36),(3.1,2.55,.22),'glass',.055)
  for side in (-1,1):
   for j in range(10):
    yy=y+(j-4.5)*.20
    rod('Copper trace',(x+side*.68,yy,.49),(x+side*1.40,yy,.49),.014,'copper')
  pieces=[]
  pieces.append(box('Compute die',(x,y,.70),(1.16,1.25,.22),'silicon',.018))
  for dx in (-1.05,1.05):
   for dy in (-.69,.69):
    for z in range(4):pieces.append(box('Memory die stack',(x+dx,y+dy,.56+z*.07),(.55,.68,.06),'silicon',.012))
  for i in range(8):
   for j in range(6):ball((x+(i-3.5)*.36,y+(j-2.5)*.37,.17),.05,'copper')
  if explode:
   for o in pieces:
    z=o.location.z;moving.append(lambda t,o=o,z=z:setattr(o.location,'z',z+.9*(.5-.5*math.cos(t*math.tau))))
  return board
 def warped(cx,material,amplitude):
  verts=[];faces=[];nx=32;ny=14
  for j in range(ny+1):
   for i in range(nx+1):verts.append((cx+(i/nx-.5)*2.75,(j/ny-.5)*2.1,.6))
  for j in range(ny):
   for i in range(nx):k=j*(nx+1)+i;faces.append((k,k+1,k+nx+2,k+nx+1))
  mesh=bpy.data.meshes.new('Core plane');mesh.from_pydata(verts,[],faces);mesh.update();o=bpy.data.objects.new('Exaggerated board deformation',mesh);s.collection.objects.link(o);o.data.materials.append(mats[material]);sol=o.modifiers.new('Core thickness','SOLIDIFY');sol.thickness=.12;be=o.modifiers.new('Rounded edge','BEVEL');be.width=.014;be.segments=2
  def bend(t):
   for v in mesh.vertices:v.co.z=.6+amplitude*(.55-.45*math.cos(t*math.tau))*((v.co.x-cx)/1.375)**2
   mesh.update()
  moving.append(bend)
  for i in range(9):
   xx=cx+(i-4)*.29
   rod('Reference contact',(xx,-.94,.15),(xx,-.94,.54),.026,'copper')
  return o
 if shot in ['package','explode','hero','system']:
  package(explode=shot=='explode')
  if shot=='system':
   for j in range(3):
    x=(j-1)*1.25;box('Infrastructure supply',(x,-2,.22),(.62,.55,.40),['copper','glass','silicon'][j]);rod('Supply route',(x,-1.75,.3),(x,-1.30,.3),.033,'copper')
 elif shot=='traffic':
  for x in (-2,2):box('Compute and memory',(x,0,.35),(1.05,1.65,.45),'silicon')
  for j in range(7):
   yy=(j-3)*.20;rod('Parallel data lane',(-1.4,yy,.3),(1.4,yy,.3),.02,'copper')
   for k in range(3):
    o=ball((0,yy,.36));moving.append(lambda t,o=o,k=k:setattr(o.location,'x',-1.4+2.8*((t*2+k/3)%1)))
 elif shot=='expand':
  board=box('Larger package',(0,0,.27),(3,2.7,.16),'glass');moving.append(lambda t:setattr(board,'scale',(.85+.4*t,.85+.4*t,1)))
  for i in range(3):
   for j in range(3):
    o=box('Chiplet',((i-1)*.88,(j-1)*.83,.47),(.64,.59,.2),'silicon');moving.append(lambda t,o=o,i=i,j=j:setattr(o,'location',((i-1)*(.75+.35*t),(j-1)*(.73+.30*t),.47)))
 elif shot in ['warp','compare']:
  if shot=='warp':warped(0,'organic',.5)
  else:warped(-1.7,'organic',.4);warped(1.7,'glass',.025)
 elif shot=='thermal':
  for j,material in enumerate(['silicon','glass','organic']):
   yy=(j-1)*.75;o=box('Different thermal expansion',(0,yy,.5),(2.8,.45,.16),material);moving.append(lambda t,o=o,j=j:setattr(o,'scale',(1+(.025,.065,.21)[j]*(.5-.5*math.cos(t*math.tau)),1,1)))
   rod('Start reference',(-1.6,yy,.25),(-1.6,yy,.9),.012,'red')
 elif shot in ['wiring','vias']:
  box('Cutaway glass core',(0,.38,.48),(3,1.4,.46),'glass',.04)
  for i in range(9):
   x=(i-4)*.30;rod('Metal-filled through-glass via',(x,-.32,.17),(x,-.32,.82),.045,'copper');rod('Redistribution line',(x,-.32,.82),(x,1.05,.82),.021,'copper')
   o=ball((x,-.32,.4),.06);moving.append(lambda t,o=o,i=i:setattr(o.location,'z',.18+.65*((t*2+i/9)%1)))
  box('Top chip',(0,.55,1.0),(1.2,.7,.2),'silicon')
 elif shot in ['handling','factory','inspection']:
  for j in range(3):
   yy=(j-1)*1.05;box('Precision carrier',(0,yy,.16),(3,.85,.20),'silicon');box('Glass panel',(0,yy,.29),(2.45,.65,.065),'glass')
  for x in (-1.7,1.7):box('Gantry rail',(x,0,1),( .10,3.8,1.8),'light')
  cross=box('Inspection gantry',(0,0,1.9),(3.65,.15,.16),'light');head=box('Inspection head',(0,0,1.55),(.42,.35,.5),'silicon');moving.append(lambda t:setattr(head.location,'x',1.3*math.sin(t*math.tau)));moving.append(lambda t:setattr(head.location,'y',.8*math.cos(t*math.tau)))
  rod('Inspection lens',(0,0,1.35),(0,0,1.25),.09,'copper')
 elif shot=='server':
  for i in range(5):
   x=(i-2)*.82;box('AI rack',(x,.3,1.4),(.72,.75,2.8),'silicon')
   for j in range(10):
    z=.2+j*.25;box('Server tray',(x,-.11,z),(.60,.08,.16),'light',.01)
    for k in range(3):ball((x-.2+k*.13,-.17,z),.025,'signal')
   rod('Cooling manifold',(x+.26,-.21,.1),(x+.26,-.21,2.7),.025,'copper')
 box('Continuous warm background',(0,0,-.18),(200,200,.18),'floor',.01)
 for loc,power,size,color in [((-3,-4,7),1250,5,(1,.90,.78)),((4,2,5),1450,4,(.86,1,1))]:
  bpy.ops.object.light_add(type='AREA',location=loc);o=bpy.context.object;o.data.energy=power;o.data.shape='DISK';o.data.size=size;o.data.color=color;o.rotation_euler=(Vector((0,0,.4))-o.location).to_track_quat('-Z','Y').to_euler()
 bpy.ops.object.camera_add();cam=bpy.context.object;s.camera=cam;cam.data.type='ORTHO';cam.data.ortho_scale=8.2 if shot=='server' else (7.8 if shot in ['handling','factory','inspection'] else (7.5 if shot=='compare' else (7.2 if shot=='explode' else 6.1)))
 def animate(t):
  for fn in moving:fn(t)
  angle=-math.pi/2+.25+.24*math.sin(t*math.tau);radius=8
  cam.location=(radius*math.cos(angle),radius*math.sin(angle),5.6);target=Vector((0,0,1.4 if shot=='server' else (1.1 if shot in ['handling','factory','inspection'] else (.9 if shot=='explode' else .55))));cam.rotation_euler=(target-cam.location).to_track_quat('-Z','Y').to_euler()
 def handler(scene):animate((scene.frame_current-1)/a.frames)
 bpy.app.handlers.frame_change_pre.append(handler)
 return s
for shot in SHOTS if a.shot=='all' else a.shot.split(','):
 out=a.cache/(shot+'.mp4')
 if out.exists() and not a.preview and not a.force:print('SKIP',shot,flush=True);continue
 s=make(shot);s.frame_start=1;s.frame_end=a.frames
 if a.preview:
  s.frame_set(a.frames//2);s.render.filepath=str(a.cache/(shot+'-preview.png'));bpy.ops.render.render(write_still=True)
 else:
  s.render.image_settings.file_format='FFMPEG';s.render.ffmpeg.format='MPEG4';s.render.ffmpeg.codec='H264';s.render.ffmpeg.constant_rate_factor='HIGH';s.render.ffmpeg.ffmpeg_preset='GOOD';s.render.filepath=str(out);bpy.ops.render.render(animation=True)
 print('COMPLETE',shot,flush=True)
