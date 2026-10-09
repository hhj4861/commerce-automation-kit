"""Run in Blender, exercises actual material graphs and spatial helpers."""
import sys
from pathlib import Path
sys.dont_write_bytecode = True
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'renderers'))
import bpy
from mathutils import Vector
from architecture_style import material,environment,lighting,camera_pose,evidence,STYLE
bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
environment(bpy.context.scene)
for kind in STYLE['materials']:
 m=material('test '+kind,kind,(.3,.4,.5));shader=m.node_tree.nodes.get('Principled BSDF')
 if kind not in ['glass']:
  assert shader.inputs['Normal'].is_linked,(kind,'no material normal detail')
  assert shader.inputs['Base Color'].is_linked,(kind,'no surface tone variation')
 if kind=='glass':assert shader.inputs['Transmission Weight'].default_value>.5
 if kind=='fabric':assert len([n for n in m.node_tree.nodes if n.type=='TEX_WAVE'])==2
try:material('invalid','arbitrary script',(.3,.4,.5));raise AssertionError('invalid kind accepted')
except ValueError:pass
lighting(bpy.context.scene,target=(1,2,3),scale=2)
lights=[o for o in bpy.context.scene.objects if o.type=='LIGHT'];assert len(lights)==3
for o,cfg in zip(lights,STYLE['lights']):assert (o.location-(Vector((1,2,3))+Vector(cfg['position'])*2)).length<1e-5
bpy.ops.object.camera_add();camera=bpy.context.object;camera_pose(camera,(4,-7,5),(1,0,1),48)
forward=camera.rotation_euler.to_matrix()@Vector((0,0,-1));assert forward.dot((Vector((1,0,1))-camera.location).normalized())>.999
assert STYLE['caption']['firstLineY']==1525
assert len(evidence()['styleDigest'])==64
print('ARCHITECTURE_STYLE_CHECKS_PASS')
