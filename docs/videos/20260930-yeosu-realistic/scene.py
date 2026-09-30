"""Original full-scale lamella study. Conceptual deformation, not engineering simulation."""
import bpy, math, sys, argparse
from pathlib import Path
from mathutils import Vector
from bpy.app.handlers import persistent
p=argparse.ArgumentParser();p.add_argument('--cache',type=Path,required=True);p.add_argument('--preview',action='store_true');a=p.parse_args(sys.argv[sys.argv.index('--')+1:]);C=a.cache
bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
s=bpy.context.scene;s.render.engine='BLENDER_EEVEE_NEXT';s.render.resolution_x=1080;s.render.resolution_y=1920;s.render.resolution_percentage=100;s.render.fps=30;s.render.image_settings.color_mode='RGB';s.render.film_transparent=False
s.view_settings.view_transform='AgX';s.view_settings.look='AgX - Medium High Contrast'
s.world.use_nodes=True;s.world.node_tree.nodes['Background'].inputs[0].default_value=(.38,.43,.5,1);s.world.node_tree.nodes['Background'].inputs[1].default_value=.32
if hasattr(s,'eevee'):s.eevee.taa_render_samples=64
M={}
def material(name,color,rough,metal=0,texture=0):
 m=bpy.data.materials.new(name);m.use_nodes=True;n=m.node_tree.nodes;links=m.node_tree.links;b=n['Principled BSDF'];b.inputs['Base Color'].default_value=(*color,1);b.inputs['Roughness'].default_value=rough;b.inputs['Metallic'].default_value=metal
 if texture:
  tex=n.new('ShaderNodeTexNoise');tex.inputs['Scale'].default_value=90;tex.inputs['Detail'].default_value=3;bump=n.new('ShaderNodeBump');bump.inputs['Strength'].default_value=.17;bump.inputs['Distance'].default_value=texture;links.new(tex.outputs['Fac'],bump.inputs['Height']);links.new(bump.outputs['Normal'],b.inputs['Normal'])
 M[name]=m
material('GFRP',(.73,.72,.67),.34,0,.008);material('steel',(.42,.46,.49),.24,.85,.003);material('dark',(.035,.043,.047),.42,.7);material('glass',(.014,.027,.033),.16,.65);material('floor',(.25,.255,.24),.82,0,.02)
def box(name,loc,scale,mat,bevel=.01):
 bpy.ops.mesh.primitive_cube_add(size=1,location=loc);o=bpy.context.object;o.name=name;o.dimensions=scale;bpy.ops.object.transform_apply(location=False,rotation=False,scale=True);o.data.materials.append(M[mat]);b=o.modifiers.new('Manufactured edge','BEVEL');b.width=bevel;b.segments=3;o.modifiers.new('Normals','WEIGHTED_NORMAL');return o
def rod(name,a,b,r,mat):
 v,w=Vector(a),Vector(b);bpy.ops.mesh.primitive_cylinder_add(vertices=24,radius=r,depth=(w-v).length,location=(v+w)/2);o=bpy.context.object;o.name=name;o.rotation_euler=(w-v).to_track_quat('Z','Y').to_euler();o.data.materials.append(M[mat]);return o
panels=[]
for i in range(10):
 x=(i-4.5)*1.37
 mesh=bpy.data.meshes.new('Flexible composite surface');verts=[(x+w*1.32,0,.4+z/48*10) for z in range(49) for w in [0,1]];faces=[(2*z,2*z+1,2*z+3,2*z+2)for z in range(48)];mesh.from_pydata(verts,[],faces);mesh.update();o=bpy.data.objects.new('GFRP lamella '+str(i),mesh);s.collection.objects.link(o);o.data.materials.append(M['GFRP']);sol=o.modifiers.new('Composite panel thickness','SOLIDIFY');sol.thickness=.045;be=o.modifiers.new('Panel edge','BEVEL');be.width=.012;be.segments=3
 for f in mesh.polygons:f.use_smooth=True
 panels.append((o,x,i))
 box('Fixed vertical support',(x,.35,5.4),(.065,.10,10.7),'steel');box('Glazing behind moving facade',(x+.65,1.1,5.4),(1.31,.045,10.8),'glass')
 for z in (.4,10.4):
  box('Fixed bracket',(x,.22,z),(.22,.42,.12),'steel');rod('Actuator enclosure',(x,.5,z),(x+.56,.5,z),.06,'steel');rod('Actuator linkage',(x+.56,.5,z),(x+.9,.25,z),.028,'steel')
box('Top beam',(0,.52,10.65),(16,.40,.24),'dark');box('Bottom beam',(0,.52,.2),(16,.45,.25),'dark');box('Stone interior floor',(0,1,-.035),(100,100,.06),'floor')
# Joint lines give real scale without toy-like exaggerated bevels.
for x in range(-16,18,2):box('Stone joint',(x,-10,.004),(.009,24,.003),'dark',.001)
for y in range(-24,4,2):box('Stone joint',(0,y,.004),(35,.009,.003),'dark',.001)
bpy.ops.object.light_add(type='SUN',location=(0,-10,12));sun=bpy.context.object;sun.data.energy=2.5;sun.data.angle=.045;sun.rotation_euler=(math.radians(42),math.radians(-18),math.radians(-35));sun.data.color=(1,.88,.70)
bpy.ops.object.light_add(type='AREA',location=(-7,-8,7));light=bpy.context.object;light.data.energy=1200;light.data.shape='RECTANGLE';light.data.size=9;light.data.size_y=14;light.rotation_euler=(Vector((0,0,5))-light.location).to_track_quat('-Z','Y').to_euler()
bpy.ops.object.camera_add();cam=bpy.context.object;s.camera=cam;cam.data.type='PERSP';cam.data.lens=45;cam.data.clip_end=200
SHOT='material'
@persistent
def animate(scene):
 u=(scene.frame_current-1)/239
 for o,x,i in panels:
  opening=(.48+.34*math.sin(u*math.tau*.6-i*.38)) if SHOT=='motion' else (.15+.66*math.sin(u*math.pi/2))
  for k,v in enumerate(o.data.vertices):
   z=k//2/48;w=k%2;theta=opening*math.sin(math.pi*z)*1.22
   v.co=(x+w*1.32*math.cos(theta),-w*1.32*math.sin(theta),.4+z*10)
  o.data.update()
 if SHOT=='material':pos=Vector((2.3+u*.4,-10.5,6.3));target=Vector((.2,0,5.5));cam.data.lens=50
 else:pos=Vector((-8+u*1.4,-13,4.3));target=Vector((.2,0,5.1));cam.data.lens=36
 cam.location=pos;cam.rotation_euler=(target-pos).to_track_quat('-Z','Y').to_euler()
bpy.app.handlers.frame_change_pre.append(animate)
for shot in ['material','motion']:
 SHOT=shot;s.frame_start=1;s.frame_end=240
 if a.preview:
  s.frame_set(150);s.render.image_settings.file_format='PNG';s.render.filepath=str(C/(shot+'-preview.png'));bpy.ops.render.render(write_still=True)
 else:
  s.render.image_settings.file_format='FFMPEG';s.render.ffmpeg.format='MPEG4';s.render.ffmpeg.codec='H264';s.render.ffmpeg.constant_rate_factor='HIGH';s.render.ffmpeg.ffmpeg_preset='GOOD';s.render.filepath=str(C/(shot+'.mp4'));bpy.ops.render.render(animation=True)
print('RENDER_COMPLETE',flush=True)
