"""Original 3D study, Blender 4.5.10. No external models/textures/media.
blender -b -t 6 --python-exit-code 1 --python scene.py -- --preview /Users/admin/Library/Mobile Documents/com~apple~CloudDocs/gpt 작업/commerce-automation-kit/20260930-modular-3d-test
blender -b -t 6 --python-exit-code 1 --python scene.py -- --render /Users/admin/Library/Mobile Documents/com~apple~CloudDocs/gpt 작업/commerce-automation-kit/20260930-modular-3d-test
Geometry is a reduced explanatory model, not College Road's engineering model.
"""
import bpy, math, sys, os
from mathutils import Vector

args = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
mode = args[0] if args else '--preview'
out = args[1] if len(args) > 1 else '/Users/admin/Library/Mobile Documents/com~apple~CloudDocs/gpt 작업/commerce-automation-kit/20260930-modular-3d-test'
os.makedirs(out, exist_ok=True)
bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)
sc = bpy.context.scene
sc.render.engine = 'CYCLES'
sc.cycles.samples = 16
sc.cycles.use_denoising = True
sc.cycles.max_bounces = 4
sc.render.use_persistent_data = True
sc.render.resolution_x = 1080
sc.render.resolution_y = 1920
sc.render.resolution_percentage = 100
sc.render.fps = 30
sc.frame_start, sc.frame_end = 1, 504
sc.render.image_settings.file_format = 'PNG'
sc.render.image_settings.color_mode = 'RGB'
sc.world.use_nodes = True
sc.world.node_tree.nodes['Background'].inputs['Color'].default_value = (.50,.46,.38,1)
sc.world.node_tree.nodes['Background'].inputs['Strength'].default_value = .55
sc.view_settings.view_transform = 'AgX'

# Metal when available; otherwise the same scene remains reproducible on CPU.
try:
    prefs = bpy.context.preferences.addons['cycles'].preferences
    prefs.compute_device_type = 'METAL'
    prefs.get_devices()
    gpu = [d for d in prefs.devices if d.type == 'METAL']
    for d in prefs.devices: d.use = d.type == 'METAL'
    if gpu: sc.cycles.device = 'GPU'
    print('CYCLES DEVICES', [(d.name, d.type, d.use) for d in prefs.devices], flush=True)
except Exception as exc:
    print('CPU fallback:', str(exc), flush=True)

def material(name, color, metal=0, rough=.4):
    m = bpy.data.materials.new(name)
    m.diffuse_color = (*color, 1)
    m.use_nodes = True
    p = m.node_tree.nodes.get('Principled BSDF')
    p.inputs['Base Color'].default_value = (*color, 1)
    p.inputs['Metallic'].default_value = metal
    p.inputs['Roughness'].default_value = rough
    return m

cream = material('Warm limestone', (.66, .63, .54), 0, .58)
edge = material('Pale concrete', (.82, .80, .71), 0, .55)
steel = material('Structural bronze', (.21, .12, .048), .7, .27)
glass = material('Deep teal glazing', (.043, .105, .10), .48, .16)
wood = material('Warm oak', (.32, .14, .049), 0, .5)
fabric = material('Sage fabric', (.19, .27, .20), 0, .82)
floor = material('Studio sand', (.48, .46, .39), 0, .75)
amber = material('Load highlight', (.9, .41, .04), .35, .25)
p = amber.node_tree.nodes.get('Principled BSDF')
p.inputs['Emission Color'].default_value = (1, .25, .015, 1)
p.inputs['Emission Strength'].default_value = 1.6

def box(name, loc, dims, mat, bevel=.025, parent=None):
    bpy.ops.mesh.primitive_cube_add(size=1, location=loc)
    o = bpy.context.object
    o.name = name
    o.dimensions = dims
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    if mat: o.data.materials.append(mat)
    if bevel:
        b = o.modifiers.new('Soft physical edges', 'BEVEL')
        b.width, b.segments = bevel, 2
        o.modifiers.new('Weighted normals', 'WEIGHTED_NORMAL')
    if parent: o.parent = parent
    return o

def empty(name, loc):
    o = bpy.data.objects.new(name, None)
    sc.collection.objects.link(o)
    o.location = loc
    return o

def move(o, frame, pos):
    o.location = pos
    o.keyframe_insert('location', frame=frame)

def module(name, origin, detailed=False):
    root = empty(name, origin)
    box(name+' floor', (0,0,.11), (5.8,4,.22), edge, parent=root)
    for x in (-2.75,2.75):
        for y in (-1.85,1.85):
            box('Steel post', (x,y,1.6), (.18,.18,3.1), steel, parent=root)
    for z in (.3,3.1):
        for y in (-1.85,1.85): box('Long steel beam', (0,y,z), (5.65,.18,.22), steel, parent=root)
        for x in (-2.75,2.75): box('Short steel beam', (x,0,z), (.18,3.85,.22), steel, parent=root)
    back = box('Back cladding', (0,1.95,1.65), (5.8,.14,2.7), cream, parent=root)
    side = box('Side cladding', (2.9,0,1.65), (.14,4,2.7), cream, parent=root)
    left = box('Side glazing', (-2.9,0,1.65), (.10,3.55,2.35), glass, parent=root)
    front = box('Front glazing', (0,-1.96,1.65), (5.4,.09,2.35), glass, parent=root)
    roof = box('Roof panel', (0,0,3.27), (5.8,4,.16), edge, parent=root)
    for x in (-2.75,0,2.75): box('Window mullion', (x,-2.02,1.65), (.08,.12,2.75), cream, parent=root)
    if detailed:
        box('Oak floor', (0,0,.245), (5.38,3.6,.04), wood, .015, root)
        box('Sofa seat', (-1,1,.65), (2.4,.8,.55), fabric,.12,root)
        box('Sofa back', (-1,1.35,1.12), (2.4,.2,.6), fabric,.09,root)
        box('Coffee table', (-1,-.05,.61), (1.6,.85,.1), wood,.06,root)
        for x in (-1.65,-.35): box('Table leg', (x,-.05,.43), (.1,.55,.3), steel,.02,root)
        box('Cabinet', (1.9,1,.85), (.65,1.1,1.1), cream,.04,root)
    return root, [front,side,left,back,roof]

box('Endless warm studio', (50,0,-.35), (10000,10000,.4), floor, .1)
box('Tower plinth', (0,0,-.03), (17,13,.6), edge,.18)
box('Core', (0,2.1,15), (1.5,2.2,30), cream,.05)
for n in range(9):
    for x in (-3.05,3.05):
        root,_ = module('Tower module %d %s'%(n,x), (x,-1,n*3.35+.35))
        if n >= 7:
            landing = 22+(n-7)*48+(0 if x<0 else 24)
            move(root,1,(x,-1,n*3.35+10.35))
            move(root,landing,(x,-1,n*3.35+10.35))
            move(root,landing+32,(x,-1,n*3.35+.35))
# A small landscaped podium gives scale without imitating a real site.
for x,y in [(-6,-5),(6,-5),(-6,4),(6,4)]:
    box('Planter',(x,y,.6),(1.4,1.4,.65),cream,.1)
    box('Tree trunk',(x,y,1.4),(.12,.12,1.4),wood,.02)
    bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=2,radius=.85,location=(x,y,2.4))
    bpy.context.object.data.materials.append(fabric)

# Separate physical set for the cutaway. A real camera cut preserves proportions.
detail,panels = module('Hero cutaway', (100,0,1), True)
box('Cutaway pedestal',(100,0,.45),(8,6,.7),edge,.12)
for i,o in enumerate(panels):
    start = o.location.copy()
    move(o,204,start)
    direction = [(0,-5,0),(4,0,0),(-4,0,0),(0,5,0),(0,0,4)][i]
    move(o,238+i*4,start)
    move(o,298+i*4,start+Vector(direction))
# Travelling pulses identify the schematic beam/column force path.
for x in (-2.75,2.75):
    for y in (-1.85,1.85):
        pulse=box('Load pulse',(100+x,y,4),(.23,.23,.35),amber,.035)
        pulse.hide_render=True; pulse.keyframe_insert('hide_render',frame=1)
        pulse.hide_render=False; pulse.keyframe_insert('hide_render',frame=367)
        for f,z in [(367,4),(408,1.4),(409,4),(450,1.4),(451,4),(504,1.4)]:move(pulse,f,(100+x,y,z))

def light(name, loc, energy, size, target):
    bpy.ops.object.light_add(type='AREA', location=loc)
    o=bpy.context.object; o.name=name; o.data.energy=energy; o.data.shape='DISK'; o.data.size=size
    o.rotation_euler=(Vector(target)-o.location).to_track_quat('-Z','Y').to_euler()
light('Tower key',(9,-20,45),18000,18,(0,0,12))
light('Tower rim',(-18,12,28),13000,14,(0,0,15))
light('Detail key',(105,-7,13),2200,8,(100,0,2))
light('Detail rim',(94,6,9),1900,6,(100,0,2))
light('Detail fill',(103,5,6),700,5,(100,0,2))

bpy.ops.object.camera_add()
cam=bpy.context.object; sc.camera=cam
cam.data.lens=48
def camera(frame, loc, target):
    cam.location=loc
    cam.rotation_euler=(Vector(target)-cam.location).to_track_quat('-Z','Y').to_euler()
    cam.keyframe_insert('location',frame=frame); cam.keyframe_insert('rotation_euler',frame=frame)
camera(1,(48,-72,43),(0,0,20))
camera(203,(34,-56,34),(0,0,17))
camera(204,(112,-18,11),(100,0,4.8))
camera(340,(110,-17,10),(100,0,4.8))
camera(504,(109,-16,9),(100,0,4.8))
for curve in cam.animation_data.action.fcurves:
    for k in curve.keyframe_points:
        k.interpolation='LINEAR'
        if int(k.co.x)==203:k.interpolation='CONSTANT'

if mode=='--preview':
    sc.render.resolution_percentage=50
    sc.cycles.samples=12
    for f in (80,225,335,450):
        sc.frame_set(f); sc.render.filepath=os.path.join(out,'preview-%04d.png'%f)
        bpy.ops.render.render(write_still=True)
elif mode=='--render':
    os.makedirs(os.path.join(out,'frames'),exist_ok=True)
    # Resume only this exact recipe's existing frame cache; use a fresh cache
    # when camera/geometry/settings change.
    for f in range(1,sc.frame_end+1):
        path=os.path.join(out,'frames','frame-%04d.png'%f)
        if os.path.exists(path): continue
        sc.frame_set(f); sc.render.filepath=path
        bpy.ops.render.render(write_still=True)
        if f%30==0:print('RENDER PROGRESS',f,'/',sc.frame_end,flush=True)
else:raise ValueError('Use --preview or --render')
print('3D RENDER COMPLETE',mode,flush=True)
