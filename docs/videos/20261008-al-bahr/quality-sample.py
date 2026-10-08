"""Ten-second material/hinge/lighting study. Illustrative, not construction geometry.
Keeps the original movie and scene.py untouched. No paid media calls.
"""
import argparse, math, sys, json
from pathlib import Path
import bpy
from mathutils import Vector, Matrix
from bpy.app.handlers import persistent
P=argparse.ArgumentParser();P.add_argument('--cache',type=Path,required=True);P.add_argument('--preview',action='store_true');P.add_argument('--frames',default='');A=P.parse_args(sys.argv[sys.argv.index('--')+1:]);C=A.cache
(C/'qa').mkdir(parents=True,exist_ok=True)
bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
S=bpy.context.scene;S.render.engine='BLENDER_EEVEE_NEXT';S.eevee.taa_render_samples=64;S.eevee.use_raytracing=True
S.render.engine='CYCLES';S.cycles.samples=48;S.cycles.use_denoising=True
prefs=bpy.context.preferences.addons['cycles'].preferences;prefs.compute_device_type='METAL';prefs.get_devices()
for device in prefs.devices:device.use=device.type=='METAL'
S.cycles.device='GPU'
print('CYCLES DEVICES',[(d.name,d.type,d.use)for d in prefs.devices],flush=True)
S.render.resolution_x=1080;S.render.resolution_y=1920;S.render.resolution_percentage=100;S.render.fps=24;S.frame_start=1;S.frame_end=240
S.view_settings.view_transform='AgX';S.view_settings.look='AgX - Medium High Contrast'
S.world.use_nodes=True;S.world.node_tree.nodes['Background'].inputs[0].default_value=(.065,.095,.14,1);S.world.node_tree.nodes['Background'].inputs[1].default_value=.32
M={}
def material(name,color,metal=0,rough=.45):
 m=bpy.data.materials.new(name);m.use_nodes=True;n=m.node_tree.nodes.get('Principled BSDF');n.inputs['Base Color'].default_value=(*color,1);n.inputs['Metallic'].default_value=metal;n.inputs['Roughness'].default_value=rough;M[name]=m;return m,n
for name,color,metal,rough in [('ink',(.012,.025,.035),.45,.32),('bronze',(.36,.21,.09),.75,.26),('aluminium',(.48,.58,.65),.88,.24),('wall',(.12,.18,.21),.05,.82),('stone',(.23,.27,.26),.05,.72),('wood',(.31,.13,.042),0,.42),('screen',(.025,.055,.062),.25,.2),('paper',(.62,.53,.35),0,.85)]:material(name,color,metal,rough)
m,n=material('fabric',(.76,.53,.25),0,.66);n.inputs['Sheen Weight'].default_value=.28
nt=m.node_tree;tex=nt.nodes.new('ShaderNodeTexNoise');tex.inputs['Scale'].default_value=210;tex.inputs['Detail'].default_value=2
bump=nt.nodes.new('ShaderNodeBump');bump.inputs['Strength'].default_value=.16;bump.inputs['Distance'].default_value=.009;nt.links.new(tex.outputs['Fac'],bump.inputs['Height']);nt.links.new(bump.outputs['Normal'],n.inputs['Normal'])
# Fine crossing threads; they affect relief without turning the membrane into stone.
for direction in ['X','Z']:
 w=nt.nodes.new('ShaderNodeTexWave');w.bands_direction=direction;w.inputs['Scale'].default_value=170
 b=nt.nodes.new('ShaderNodeBump');b.inputs['Strength'].default_value=.06;b.inputs['Distance'].default_value=.002;nt.links.new(w.outputs['Color'],b.inputs['Height']);nt.links.new(n.inputs['Normal'].links[0].from_socket,b.inputs['Normal']);nt.links.new(b.outputs['Normal'],n.inputs['Normal'])
m,n=material('glass',(.16,.30,.35),.1,.085);n.inputs['Transmission Weight'].default_value=.55;n.inputs['IOR'].default_value=1.45;n.inputs['Coat Weight'].default_value=.5
m,n=material('warm light',(.88,.49,.17),0,.5);n.inputs['Emission Color'].default_value=(1,.62,.25,1);n.inputs['Emission Strength'].default_value=2
# Wood has long grain, visible at the correct scale.
nt=M['wood'].node_tree;n=nt.nodes.new('ShaderNodeTexNoise');n.inputs['Scale'].default_value=6
tex=nt.nodes.new('ShaderNodeTexCoord');mapping=nt.nodes.new('ShaderNodeVectorMath');mapping.operation='MULTIPLY';mapping.inputs[1].default_value=(2,35,3);nt.links.new(tex.outputs['Generated'],mapping.inputs[0]);nt.links.new(mapping.outputs[0],n.inputs['Vector'])
r=nt.nodes.new('ShaderNodeValToRGB');r.color_ramp.elements[0].color=(.085,.025,.008,1);r.color_ramp.elements[1].color=(.38,.19,.065,1);nt.links.new(n.outputs['Fac'],r.inputs[0]);nt.links.new(r.outputs[0],nt.nodes.get('Principled BSDF').inputs['Base Color'])
def box(name,loc,size,mat,bevel=.02):
 bpy.ops.mesh.primitive_cube_add(size=1,location=loc);o=bpy.context.object;o.name=name;o.dimensions=size;bpy.ops.object.transform_apply(location=False,rotation=False,scale=True);o.data.materials.append(M[mat])
 if bevel:q=o.modifiers.new('crafted edges','BEVEL');q.width=bevel;q.segments=3;o.modifiers.new('weighted normals','WEIGHTED_NORMAL')
 return o
def rod(name,a,b,r,mat='aluminium'):
 v=Vector(b)-Vector(a);bpy.ops.mesh.primitive_cylinder_add(vertices=16,radius=r,depth=v.length,location=(Vector(a)+Vector(b))/2);o=bpy.context.object;o.name=name;o.rotation_euler=v.to_track_quat('Z','Y').to_euler();o.data.materials.append(M[mat]);
 for p in o.data.polygons:p.use_smooth=True
 return o
def setrod(o,a,b):
 v=Vector(b)-Vector(a);o.location=(Vector(a)+Vector(b))/2;o.rotation_euler=v.to_track_quat('Z','Y').to_euler();o.scale.z=v.length/o['baseLength']
def dynamic_rod(name,a,b,r,mat):
 o=rod(name,a,b,r,mat);o['baseLength']=(Vector(b)-Vector(a)).length;return o
def mesh(name,vertices,faces,mat):
 me=bpy.data.meshes.new(name);me.from_pydata(vertices,[],faces);me.update();o=bpy.data.objects.new(name,me);S.collection.objects.link(o);o.data.materials.append(M[mat]);return o
def ease(x):x=max(0,min(1,x));return x*x*(3-2*x)
# Continuous curtain wall. Fine mullions, inset glazing and interior depth.
for x in [-4.5,-1.5,1.5,4.5]:
 box('vertical mullion',(x,.48,4),( .075,.18,8),'ink');box('gold mullion lip',(x-.027,.375,4),(.012,.015,8),'bronze',.005)
for z in [0,2.65,5.3,7.95]:box('floor transom',(0,.5,z),(9,.18,.12),'ink');box('edge light',(0,.39,z-.045),(9,.022,.016),'bronze',.005)
for x in [-3,0,3]:
 for z in [1.325,3.975,6.625]:box('double glazing',(x,.55,z),(2.91,.045,2.50),'glass',.008)
box('interior wall',(0,4.9,3.9),(10,.20,8),'wall');box('interior floor',(0,2.7,2.60),(10,4.5,.11),'wood')
for x in [-3.8,-2,-.2,1.6,3.4]:box('oak wall slat',(x,4.73,4.05),(.055,.11,2.65),'wood',.012)
for x in [-3,0,3]:
 box('desk',(x,2.4,3.45),(1.9,1,.08),'wood',.035)
 for dx in [-.8,.8]:rod('tapered desk legs',(x+dx,2.4,2.7),(x+dx*.9,2.4,3.42),.035,'ink')
 box('monitor',(x,2.6,3.88),(.7,.07,.43),'screen');rod('monitor stand',(x,2.6,3.49),(x,2.6,3.68),.026,'aluminium')
 box('keyboard',(x,2.16,3.51),(.56,.2,.026),'ink',.01)
 box('notebook',(x+.58,2.18,3.51),(.25,.35,.025),'paper',.005)
box('ceiling cove',(0,4.7,5.1),(8,.1,.035),'warm light',.005)
# Three spatial layers and restrained graphic seams instead of heavy toon outlines.
modules=[]
for x,z in [(-3.15,3.9),(0,3.9),(3.15,3.9),(-1.575,6.55),(1.575,6.55),(-1.575,1.25),(1.575,1.25)]:
 center=Vector((x,-.5,z));rod('fixed bracket',center+Vector((0,.98,0)),center,.07,'aluminium')
 rod('actuator housing',center+Vector((0,.55,0)),center+Vector((0,.1,0)),.105,'ink')
 slide=dynamic_rod('actuator piston',center+Vector((0,.1,0)),center+Vector((0,-.6,0)),.043,'aluminium')
 hub=box('central hinge block',center,(.20,.13,.20),'bronze',.035)
 petals=[]
 for i in range(6):
  theta=i*math.tau/6+math.pi/6
  radial=Vector((math.cos(theta),0,math.sin(theta)));tangent=Vector((-math.sin(theta),0,math.cos(theta)))
  # Rigid triangular leaf rotates around a real hinge axis. No object scaling.
  hinge=center+radial*.13
  coords=[(0,0,0),(1.24,0,-.77),(1.24,0,.77),(1.24,0,0)]
  leaf=mesh('hinged textile leaf',[tuple(hinge)]*4,[(0,1,3),(0,3,2)],'fabric');q=leaf.modifiers.new('membrane thickness','SOLIDIFY');q.thickness=.008
  edges=[dynamic_rod('stitched ink edge',hinge,hinge+Vector((1,0,0)),.007,'ink')for _ in range(5)]
  spar=dynamic_rod('structural rib',hinge,hinge+radial, .020,'bronze')
  brace=dynamic_rod('hinged support arm',center,hinge+radial,.020,'aluminium')
  hingePin=rod('hinge pin',hinge-tangent*.075,hinge+tangent*.075,.028,'aluminium')
  petals.append((leaf,hinge,radial,tangent,coords,edges,spar,brace))
 modules.append((center,hub,slide,petals,x))
# A soft studio sky reflection plus a warm lateral sun. No flat orange heat slab.
def area(name,loc,target,power,color,size,size_y=None):
 d=bpy.data.lights.new(name,'AREA');d.energy=power;d.color=color;d.shape='RECTANGLE';d.size=size;d.size_y=size_y or size;o=bpy.data.objects.new(name,d);S.collection.objects.link(o);o.location=loc;o.rotation_euler=(Vector(target)-o.location).to_track_quat('-Z','Y').to_euler();return o
area('warm grazing key',(-4,-6,8),(0,0,4),1800,(1,.69,.35),5,7)
area('cool sky reflection',(6,-3,7),(0,0,4),1000,(.53,.75,1),4,8)
area('warm interior',(0,4,5),(0,1,3.3),500,(1,.67,.35),7,1)
d=bpy.data.lights.new('sun','SUN');d.energy=1.7;d.angle=.08;d.color=(1,.76,.45);sun=bpy.data.objects.new('sun',d);S.collection.objects.link(sun);sun.rotation_euler=(math.radians(48),math.radians(-20),math.radians(-30))
d=bpy.data.cameras.new('camera');cam=bpy.data.objects.new('camera',d);S.collection.objects.link(cam);S.camera=cam;d.lens=48;d.clip_end=200
focus=bpy.data.objects.new('focus',None);S.collection.objects.link(focus);focus.location=(0,-.5,3.9);d.dof.use_dof=True;d.dof.focus_object=focus;d.dof.aperture_fstop=7.1
@persistent
def update(scene):
 t=(scene.frame_current-1)/24;u=t/10
 for center,hub,slide,petals,x in modules:
  opening=ease((t-1.4-abs(x)*.10)/4.7);angle=math.radians(63-58*opening)
  hub.location=center+Vector((0,-.55*(1-opening),0));setrod(slide,center+Vector((0,.1,0)),hub.location)
  for i,(leaf,hinge,radial,tangent,coords,edges,spar,brace)in enumerate(petals):
   # Tangential hinge axis; leaf dimensions and its three edge lengths stay fixed.
   forward=radial*math.cos(angle)+Vector((0,-math.sin(angle),0))
   pleat=math.radians(74*(1-opening)+7*opening)
   foldNormal=radial*math.sin(angle)+Vector((0,math.cos(angle),0))
   vs=[hinge+forward*a+foldNormal*(abs(c)*math.sin(pleat))+tangent*(c*math.cos(pleat))for a,b,c in coords]
   for v,co in zip(leaf.data.vertices,vs):v.co=co
   leaf.data.update()
   for edge,(a,b)in zip(edges,[(0,1),(1,3),(3,2),(2,0),(0,3)]):setrod(edge,vs[a],vs[b])
   tip=vs[3];setrod(spar,hinge,tip);setrod(brace,hub.location,hinge+forward*.75)
 cam.location=(3.15-1.05*ease(u),-9.6+.65*ease(u),4.7-.25*ease(u));target=Vector((0,-.15,3.85));cam.rotation_euler=(target-cam.location).to_track_quat('-Z','Y').to_euler()
bpy.app.handlers.frame_change_pre.clear();bpy.app.handlers.frame_change_pre.append(update)
# Geometry invariants: no stretch during folding, endpoints and mechanism remain finite.
checks=[]
for f in [1,72,144,240]:
 S.frame_set(f)
 leaf=modules[1][3][0][0];v=[a.co.copy()for a in leaf.data.vertices];checks.append([round((v[a]-v[b]).length,6)for a,b in [(0,1),(1,3),(3,0),(0,2),(2,3)]])
assert all(max(abs(x-y)for x,y in zip(checks[0],row))<1e-5 for row in checks)
(C/'geometry-check.json').write_text(json.dumps({'rigidHalfPanelEdgeLengths':checks,'frames':[1,72,144,240],'status':'pass'},indent=2))
if A.preview:
 for f in ([int(x)for x in A.frames.split(',')]if A.frames else[1,96,180,240]):
  S.frame_set(f);S.render.image_settings.file_format='PNG';S.render.filepath=str(C/'qa'/f'improved-{f}.png');bpy.ops.render.render(write_still=True)
else:
 target=C/'improved-raw.mp4'
 if target.exists():raise RuntimeError('Preserve previous render; use a new cache directory')
 S.render.image_settings.file_format='FFMPEG';S.render.ffmpeg.format='MPEG4';S.render.ffmpeg.codec='H264';S.render.ffmpeg.constant_rate_factor='HIGH';S.render.ffmpeg.ffmpeg_preset='GOOD';S.render.filepath=str(target);S.frame_set(1);bpy.ops.render.render(animation=True)
print('QUALITY SAMPLE DONE',flush=True)
