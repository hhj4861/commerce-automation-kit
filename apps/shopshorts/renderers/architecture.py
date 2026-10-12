"""Trusted data-only architectural concept renderer. Not fabrication geometry.
Quality extracted from Al Bahr study: Cycles, distinct materials, lighting separation,
beveled edges and rigid pivot motion. Never executes scene-provided code.
"""
import argparse, json, math, sys
from pathlib import Path
import bpy
from mathutils import Vector, Matrix
from bpy.app.handlers import persistent
parser=argparse.ArgumentParser();parser.add_argument('--input',required=True);parser.add_argument('--out',required=True)
args=parser.parse_args(sys.argv[sys.argv.index('--')+1:]);data=json.loads(Path(args.input).read_text())
scene=data['scene'];profile=data['render'];parts={p['layerId']:p for p in data['parts']}
bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
s=bpy.context.scene;s.render.engine='CYCLES';s.cycles.samples=profile['samples'];s.cycles.use_denoising=profile['denoise']
# Device changes performance, never sample count or visual policy.
s.cycles.device='CPU'
prefs=bpy.context.preferences.addons['cycles'].preferences
for backend in ['METAL','OPTIX','CUDA','HIP','ONEAPI']:
 try:
  prefs.compute_device_type=backend;prefs.get_devices();gpus=[d for d in prefs.devices if d.type==backend]
  if gpus:
   for d in prefs.devices:d.use=d.type==backend
   s.cycles.device='GPU';break
 except (TypeError,RuntimeError):pass
portrait=data['aspect']=='9:16';w,h=(1080,1920) if portrait else (1920,1080)
s.render.resolution_x=w;s.render.resolution_y=h;s.render.resolution_percentage=100;s.render.fps=profile['fps'];s.frame_start=1;s.frame_end=round(scene['duration']*profile['fps'])
s.view_settings.view_transform='AgX';s.view_settings.look='AgX - Medium High Contrast'
s.world.use_nodes=True;s.world.node_tree.nodes['Background'].inputs[0].default_value=(.055,.085,.12,1);s.world.node_tree.nodes['Background'].inputs[1].default_value=.32

def mat(name,kind,color):
 m=bpy.data.materials.new(name);m.use_nodes=True;n=m.node_tree.nodes.get('Principled BSDF');n.inputs['Base Color'].default_value=(*color,1)
 n.inputs['Roughness'].default_value={'glass':.085,'metal':.24,'fabric':.66,'concrete':.82}[kind]
 if kind=='glass':n.inputs['Transmission Weight'].default_value=.55;n.inputs['IOR'].default_value=1.45;n.inputs['Coat Weight'].default_value=.5
 if kind=='metal':n.inputs['Metallic'].default_value=.88
 if kind in ['fabric','concrete']:
  nt=m.node_tree;tex=nt.nodes.new('ShaderNodeTexNoise');tex.inputs['Scale'].default_value=210 if kind=='fabric' else 35
  bump=nt.nodes.new('ShaderNodeBump');bump.inputs['Strength'].default_value=.16;bump.inputs['Distance'].default_value=.009;nt.links.new(tex.outputs['Fac'],bump.inputs['Height']);nt.links.new(bump.outputs['Normal'],n.inputs['Normal'])
 if kind=='fabric':
  n.inputs['Sheen Weight'].default_value=.28
  for direction in ['X','Z']:
   wave=m.node_tree.nodes.new('ShaderNodeTexWave');wave.bands_direction=direction;wave.inputs['Scale'].default_value=170
   b=m.node_tree.nodes.new('ShaderNodeBump');b.inputs['Strength'].default_value=.06;b.inputs['Distance'].default_value=.002;m.node_tree.links.new(wave.outputs['Color'],b.inputs['Height']);m.node_tree.links.new(n.inputs['Normal'].links[0].from_socket,b.inputs['Normal']);m.node_tree.links.new(b.outputs['Normal'],n.inputs['Normal'])
 return m
ink=mat('dark backdrop','concrete',(.035,.065,.083));pinmat=mat('hinge metal','metal',(.48,.58,.65))
def mesh(name,vs,faces,m):
 me=bpy.data.meshes.new(name);me.from_pydata(vs,[],faces);me.update();o=bpy.data.objects.new(name,me);s.collection.objects.link(o);o.data.materials.append(m);return o
def bevel(o,width):
 mod=o.modifiers.new('edge highlights','BEVEL');mod.width=width;mod.segments=3;o.modifiers.new('weighted normals','WEIGHTED_NORMAL')
def box(name,loc,size,m):
 bpy.ops.mesh.primitive_cube_add(size=1,location=loc);o=bpy.context.object;o.name=name;o.dimensions=size;bpy.ops.object.transform_apply(location=False,rotation=False,scale=True);o.data.materials.append(m);bevel(o,min(size)*.08);return o
def curve(name,coords,m):
 c=bpy.data.curves.new(name,'CURVE');c.dimensions='3D';c.bevel_depth=.022;c.bevel_resolution=3;p=c.splines.new('POLY');p.points.add(len(coords)-1)
 for a,v in zip(p.points,coords):a.co=(*v,1)
 o=bpy.data.objects.new(name,c);s.collection.objects.link(o);o.data.materials.append(m);return o
# Normalized data is laid out in a stable x/z explanation field; y is physical depth.
fw,fh=(8,9) if portrait else (14,6)
def pos(point):return Vector(((point[0]-50)/100*fw,0,(50-point[1])/100*fh))
objects=[];depth=scene.get('hybrid',{}).get('depth',8)/100*min(fw,fh)
for layer in scene['webtoon']['layers']:
 part=parts[layer['id']];color=tuple(int(layer['color'][i:i+2],16)/255 for i in (1,3,5));m=mat(layer['id'],part['material'],color)
 sw,sh=layer['size'][0]/100*fw,layer['size'][1]/100*fh
 if layer['shape']=='rect':o=box(layer['id'],(0,0,0),(sw,depth,sh),m)
 elif layer['shape']=='ellipse':
  bpy.ops.mesh.primitive_uv_sphere_add(segments=32,ring_count=16);o=bpy.context.object;o.name=layer['id'];o.scale=(sw/2,depth/2,sh/2);bpy.ops.object.transform_apply(location=False,rotation=False,scale=True);o.data.materials.append(m)
  for face in o.data.polygons:face.use_smooth=True
 else:
  points=[((a/100-.5)*sw,-depth/2,(.5-b/100)*sh) for a,b in layer['points']]
  if layer['shape']=='path':o=curve(layer['id'],points,m)
  else:
   o=mesh(layer['id'],points,[tuple(range(len(points)))],m);solid=o.modifiers.new('panel thickness','SOLIDIFY');solid.thickness=min(depth,.08);bevel(o,.018)
 root=bpy.data.objects.new(layer['id']+'-pivot',None);s.collection.objects.link(root);o.parent=root
 hinge=part.get('hinge');pivot=Vector(((hinge['pivot'][0]/100-.5)*sw,0,(.5-hinge['pivot'][1]/100)*sh)) if hinge else Vector((0,0,0))
 o.location=-pivot
 if hinge:
  axis={'x':Vector((1,0,0)),'y':Vector((0,1,0)),'z':Vector((0,0,1))}[hinge['axis']]
  bpy.ops.mesh.primitive_cylinder_add(vertices=24,radius=.045,depth=.22);pin=bpy.context.object;pin.data.materials.append(pinmat);pin.parent=root;pin.rotation_euler=axis.to_track_quat('Z','Y').to_euler()
 particles=[]
 if layer['motion']=='flow':
  for i in range(4):
   bpy.ops.mesh.primitive_uv_sphere_add(segments=12,ring_count=8,radius=.065);ball=bpy.context.object;ball.data.materials.append(pinmat);ball.parent=root;particles.append(ball)
 objects.append((layer,part,root,o,pivot,particles,sw,sh))
box('architectural backdrop',(0,2.8,0),(fw*3,.15,fh*3),ink)
def area(name,loc,power,color,size):
 d=bpy.data.lights.new(name,'AREA');d.energy=power;d.color=color;d.shape='DISK';d.size=size;o=bpy.data.objects.new(name,d);s.collection.objects.link(o);o.location=loc;o.rotation_euler=(-o.location).to_track_quat('-Z','Y').to_euler()
area('warm grazing key',(-5,-7,8),1900,(1,.72,.42),6);area('cool sky fill',(6,-4,4),1000,(.53,.75,1),5);area('rim',(-3,1,4),850,(1,.68,.36),4)
bpy.ops.object.camera_add();cam=bpy.context.object;s.camera=cam;cam.data.type='ORTHO';cam.data.ortho_scale=18 if portrait else 20;cam.data.lens=55
cam.data.dof.use_dof=False # Keep all explanatory components readable.
def ease(v):v=max(0,min(1,v));return v*v*(3-2*v)
@persistent
def update(_):
 t=(s.frame_current-1)/max(1,s.frame_end-1)
 for layer,part,root,o,pivot,balls,sw,sh in objects:
  p=ease((t-layer['start'])/(layer['end']-layer['start']));a=pos(layer['from']);b=pos(layer['to']);root.location=(a.lerp(b,p) if layer['motion']=='move' else a)+pivot+Vector((0,part.get('offset',0)/100*min(fw,fh),0))
  # Reveal is a visibility event, never a deformation of rigid hardware.
  hidden=layer['motion']=='reveal' and t<layer['start']
  for child in root.children:child.hide_render=hidden
  if part.get('hinge'):
   h=part['hinge'];root.rotation_euler['xyz'.index(h['axis'])]=math.radians(h['from']+(h['to']-h['from'])*p)
  if balls:
   points=layer.get('points',[[0,50],[100,50]])
   for i,ball in enumerate(balls):
    q=(1 if t>=layer['end'] else (max(0,(t-layer['start'])/(layer['end']-layer['start']))+i/4)%1)*(len(points)-1);idx=min(len(points)-2,int(q));u=q-idx
    x=points[idx][0]*(1-u)+points[idx+1][0]*u;z=points[idx][1]*(1-u)+points[idx+1][1]*u;ball.location=Vector(((x/100-.5)*sw,-depth/2-.08,(.5-z/100)*sh))-pivot
 camera=scene.get('camera','push-in');cam.location=(1.3+(.5*(t-.5) if camera=='pan-right' else -.5*(t-.5) if camera=='pan-left' else 0),-20,2)
 cam.rotation_euler=(-cam.location).to_track_quat('-Z','Y').to_euler();base=18 if portrait else 20;cam.data.ortho_scale=base*(1-.045*ease(t) if camera=='push-in' else 1+.045*ease(t) if camera=='pull-out' else 1)
bpy.app.handlers.frame_change_pre.append(update);s.render.image_settings.file_format='FFMPEG';s.render.ffmpeg.format='MPEG4';s.render.ffmpeg.codec='H264';s.render.ffmpeg.constant_rate_factor='HIGH';s.render.filepath=args.out
s.frame_set(1);update(s);bpy.ops.render.render(animation=True)
Path(args.out+'.json').write_text(json.dumps({'engine':s.render.engine,'samples':s.cycles.samples,'denoise':s.cycles.use_denoising,'device':s.cycles.device,'width':w,'height':h,'fps':s.render.fps,'frames':s.frame_end,'parts':len(objects),'representation':'conceptual, not fabrication geometry'}))
