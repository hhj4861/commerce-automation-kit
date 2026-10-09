"""Shared architectural art direction; no scene-supplied Python is evaluated.
Style comes from the reviewed Elbphilharmonie film. Geometry stays in each subject.
"""
import hashlib
import json
from pathlib import Path
import bpy
from mathutils import Vector

CONFIG_PATH = Path(__file__).with_suffix('.json')
STYLE = json.loads(CONFIG_PATH.read_text())

def signature():
    return hashlib.sha256(CONFIG_PATH.read_bytes() + Path(__file__).read_bytes()).hexdigest()

def environment(scene):
    scene.view_settings.view_transform = 'AgX'
    scene.view_settings.look = 'AgX - Medium High Contrast'
    scene.world.use_nodes = True
    bg = scene.world.node_tree.nodes['Background']
    bg.inputs[0].default_value = (*STYLE['world']['color'], 1)
    bg.inputs[1].default_value = STYLE['world']['strength']

def material(name, kind, color, *, emission=0):
    if kind not in STYLE['materials']:
        raise ValueError('Unknown architectural material: ' + kind)
    cfg = STYLE['materials'][kind]
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    shader = nt.nodes.get('Principled BSDF')
    shader.inputs['Base Color'].default_value = (*color, 1)
    shader.inputs['Roughness'].default_value = cfg['roughness']
    shader.inputs['Metallic'].default_value = cfg['metallic']
    if kind == 'glass':
        shader.inputs['Transmission Weight'].default_value = cfg['transmission']
        shader.inputs['IOR'].default_value = cfg['ior']
        shader.inputs['Coat Weight'].default_value = .5
    if 'noiseScale' in cfg:
        tex = nt.nodes.new('ShaderNodeTexNoise')
        tex.inputs['Scale'].default_value = cfg['noiseScale']
        tex.inputs['Detail'].default_value = 2
        ramp = nt.nodes.new('ShaderNodeValToRGB')
        low, high = ramp.color_ramp.elements
        low.position = .12
        low.color = tuple(v * (.9 if kind == 'water' else .64) for v in color) + (1,)
        high.position = .9
        high.color = tuple(min(v * 1.15, 1) for v in color) + (1,)
        nt.links.new(tex.outputs['Fac'], ramp.inputs[0])
        nt.links.new(ramp.outputs[0], shader.inputs['Base Color'])
        bump = nt.nodes.new('ShaderNodeBump')
        bump.inputs['Strength'].default_value = .17
        bump.inputs['Distance'].default_value = cfg['bumpDistance']
        nt.links.new(tex.outputs['Fac'], bump.inputs['Height'])
        nt.links.new(bump.outputs['Normal'], shader.inputs['Normal'])
    if kind == 'fabric':
        shader.inputs['Sheen Weight'].default_value = .28
        for direction in ['X', 'Z']:
            wave = nt.nodes.new('ShaderNodeTexWave')
            wave.bands_direction = direction
            wave.inputs['Scale'].default_value = 170
            previous = shader.inputs['Normal'].links[0].from_socket
            weave = nt.nodes.new('ShaderNodeBump')
            weave.inputs['Strength'].default_value = .06
            weave.inputs['Distance'].default_value = .002
            nt.links.new(wave.outputs['Color'], weave.inputs['Height'])
            nt.links.new(previous, weave.inputs['Normal'])
            nt.links.new(weave.outputs['Normal'], shader.inputs['Normal'])
    if emission:
        shader.inputs['Emission Color'].default_value = (*color, 1)
        shader.inputs['Emission Strength'].default_value = emission
    return m

def bevel(obj, width=.035):
    if width <= 0:
        return
    mod = obj.modifiers.new('Crafted edge', 'BEVEL')
    mod.width = width
    mod.segments = 3
    obj.modifiers.new('Weighted normals', 'WEIGHTED_NORMAL')

def lighting(scene, *, target=(0, 0, 0), scale=1):
    if scale <= 0:
        raise ValueError('Light scale must be positive')
    for item in STYLE['lights']:
        d = bpy.data.lights.new(item['name'], 'AREA')
        d.energy = item['power'] * scale ** 2
        d.color = item['color']
        d.shape = 'DISK'
        d.size = item['size'] * scale
        obj = bpy.data.objects.new(item['name'], d)
        scene.collection.objects.link(obj)
        obj.location = Vector(target) + Vector(item['position']) * scale
        obj.rotation_euler = (Vector(target) - obj.location).to_track_quat('-Z', 'Y').to_euler()

def camera_pose(camera, position, target, lens=48):
    camera.location = position
    camera.rotation_euler = (Vector(target) - camera.location).to_track_quat('-Z', 'Y').to_euler()
    camera.data.lens = lens
    camera.data.dof.use_dof = False  # explanation parts stay readable

def smoothstep(t):
    t = max(0, min(1, t))
    return t * t * (3 - 2 * t)

def evidence():
    return {'styleId': STYLE['id'], 'styleDigest': signature(), 'reference': STYLE['reference']}
