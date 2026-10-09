"""Fixed-speech displacement sample using the shared architecture style.
Illustrative open section, not the actual wheel dimensions or CFD.
Run inside Blender. Outputs only to the explicit cache directory.
"""
import argparse, json, math, sys
from pathlib import Path
import bpy
from mathutils import Vector
from bpy.app.handlers import persistent
HERE = Path(__file__).resolve().parent
sys.dont_write_bytecode = True
sys.path.insert(0, str(HERE.parents[2] / 'apps/shopshorts/renderers'))
from architecture_style import material, environment, bevel, lighting, camera_pose, smoothstep, evidence
p=argparse.ArgumentParser();p.add_argument('--cache',type=Path,required=True);p.add_argument('--preview',action='store_true');p.add_argument('--shot',default='all');a=p.parse_args(sys.argv[sys.argv.index('--')+1:])
C=a.cache
for d in ['qa','clips','logs']:(C/d).mkdir(parents=True,exist_ok=True)
bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
s=bpy.context.scene;s.render.engine='BLENDER_EEVEE_NEXT';s.render.resolution_x=1080;s.render.resolution_y=1920;s.render.resolution_percentage=100;s.render.fps=24
s.eevee.taa_render_samples=64;s.eevee.use_raytracing=False;environment(s)
M={}
for name,kind,color in [('steel','metal',(.32,.43,.50)),('edge','metal',(.58,.65,.68)),('brass','metal',(.68,.38,.115)),('concrete','concrete',(.24,.32,.36)),('mortar','concrete',(.09,.14,.17)),('wood','wood',(.46,.21,.07)),('cream','paint',(.85,.7,.46)),('orange','paint',(.65,.15,.035)),('black','paint',(.012,.025,.034)),('window','metal',(.055,.15,.19)),('water','water',(.025,.29,.33))]:M[name]=material(name,kind,color)
M['flow']=material('water direction','paint',(.06,.7,.88),emission=.6);M['force']=material('weight direction','paint',(.98,.56,.12),emission=.3)
def root(name,parent=None):
 o=bpy.data.objects.new(name,None);s.collection.objects.link(o);o.parent=parent;return o
def finish(o,name,m,parent=None):
 o.name=name;o.data.materials.append(M[m]);o.parent=parent;return o
def box(name,loc,size,m,parent=None,r=.025):
 bpy.ops.mesh.primitive_cube_add(size=1,location=loc);o=bpy.context.object;o.dimensions=size;bpy.ops.object.transform_apply(location=False,rotation=False,scale=True);finish(o,name,m,parent);bevel(o,r);return o
def mesh(name,vs,faces,m,parent=None,r=.02):
 me=bpy.data.meshes.new(name);me.from_pydata(vs,[],faces);me.update();o=bpy.data.objects.new(name,me);s.collection.objects.link(o);finish(o,name,m,parent);bevel(o,r);return o
def line(name,points,r,m,parent=None):
 d=bpy.data.curves.new(name,'CURVE');d.dimensions='3D';d.bevel_depth=r;d.bevel_resolution=3;sp=d.splines.new('POLY');sp.points.add(len(points)-1)
 for x,co in zip(sp.points,points):x.co=(*co,1)
 o=bpy.data.objects.new(name,d);s.collection.objects.link(o);return finish(o,name,m,parent)
def cylinder(name,loc,r,depth,m,parent=None,rotation=(0,0,0)):
 bpy.ops.mesh.primitive_cylinder_add(vertices=32,radius=r,depth=depth,location=loc,rotation=rotation);o=finish(bpy.context.object,name,m,parent);bevel(o,.012)
 for f in o.data.polygons:f.use_smooth=True
 return o
# Open-sided section through an uninterrupted canal and tank at the same level.
box('section foundation',(0,-3.5,.03),(5.5,17.8,.42),'mortar',r=.06)
box('canal bed',(0,-3.5,.38),(4.0,17.4,.40),'concrete',r=.035)
water=box('constant water level',(0,-3.5,.98),(3.9,17.25,.25),'water',r=.012)
for x in [-2.35,2.35]:
 for j in range(12):
  y=-11.5+j*1.43
  # Near wall is sectioned down; rear wall retains full thickness.
  top=.5 if x<0 else 1.45
  box('cut stone bank',(x,y,(top+.14)/2),(.62,1.4,top-.14),'concrete',r=.025)
  box('coping slab',(x,y,top),(.7,1.42,.13),'edge' if y>-3.5 else 'concrete',r=.025)
# The tank begins at the open gate threshold. Structural ribs and bolts clarify construction.
for y in [-3.5,-1.5,.5,2.5,4.5]:
 for x in [-2.04,2.04]:
  box('tank frame rib',(x,y,.7),(.14,.18,1.22),'steel',r=.02)
  for z in [.3,.75,1.2]:cylinder('frame bolt',(x-.08,y-.11,z),.046,.04,'edge',rotation=(math.pi/2,0,0))
box('open gate sill',(0,-3.56,.58),(4.1,.22,.15),'steel',r=.02)
for x in [-2.08,2.08]:
 box('gate jamb',(x,-3.56,1.36),(.2,.25,1.8),'steel')
 cylinder('gate guide pin',(x,-3.75,1.7),.09,.14,'brass',rotation=(math.pi/2,0,0))
 for y in [-3.5,-.8,2,4.5]:cylinder('rail upright',(x,y,1.69),.033,.7,'edge')
 line('handrail',[(x,-3.5,2.05),(x,4.5,2.05)],.04,'edge')
# Mooring hardware and dock joints are spatial detail, not a new explanation.
for y in [-8,-4,1,4]:
 cylinder('bollard',(2.4,y,1.73),.1,.4,'steel')
 line('bollard crossbar',[(2.18,y,1.87),(2.62,y,1.87)],.07,'steel')
BOAT=root('same orange narrowboat')
# Six-sided hull profile with pointed bow and rounded/chamfered cabin.
outline=[(-.73,-2.5),(0,-3.05),(.73,-2.5),(.84,2.3),(0,2.58),(-.84,2.3)]
vs=[(x,y,z)for z in [-.36,.49]for x,y in outline]
faces=[tuple(range(5,-1,-1)),tuple(range(6,12))]+[(i,(i+1)%6,(i+1)%6+6,i+6)for i in range(6)]
mesh('painted hull',vs,faces,'orange',BOAT,r=.07)
line('hull rubbing strip',[(x,y,.39)for x,y in outline+[outline[0]]],.06,'black',BOAT)
box('timber cabin',(0,.12,.94),(1.35,3.75,.94),'cream',BOAT,r=.08)
for side in [-1,1]:
 for y in [-1.25,-.4,.45,1.30]:
  box('window trim',(side*.688,y,1.04),(.045,.69,.53),'wood',BOAT,r=.02)
  box('window glass',(side*.717,y,1.06),(.015,.58,.43),'window',BOAT,r=.008)
  box('window mullion',(side*.728,y,1.06),(.02,.023,.43),'brass',BOAT,r=.004)
 for y in [-1.65+i*.19 for i in range(19)]:box('cabin seam',(side*.681,y,.72),(.012,.012,.2),'wood',BOAT,r=.003)
# Gentle arched roof instead of a single sharp box.
roof=[]
for y in [-1.82,2.07]:
 for j in range(13):
  x=-.78+j*.13;roof.append((x,y,1.45+.10*(1-(x/.78)**2)))
mesh('arched roof',roof,[(j,j+1,j+14,j+13)for j in range(12)],'black',BOAT,r=.018)
for y in [-1.15,.1,1.35]:cylinder('roof ventilator',(0,y,1.6),.13,.09,'brass',BOAT)
for x in [-.58,.58]:
 line('bow handrail',[(x,-2.6,.55),(x,-2.6,.9),(x,-1.85,.9)],.032,'brass',BOAT)
for j in range(7):box('deck plank',(-.5+j*.17,2.2,.51),(.155,.47,.045),'wood',BOAT,r=.009)
# Equal opposing forces next to the same floating hull, removed once entry begins.
arrows=[]
for yy,direction,m in [(-.8,1,'flow'),(.9,-1,'force')]:
 x=-1.3
 rr=root('equal force');rr.parent=BOAT
 lo=.25 if direction>0 else 1.65;hi=1.65 if direction>0 else .25
 arrows.append(rr)
 line('force shaft',[(x,yy,lo),(x,yy,hi)],.042,m,rr)
 line('force head',[(x-.17,yy,hi-direction*.25),(x,yy,hi),(x+.17,yy,hi-direction*.25)],.042,m,rr)
flows=[]
for x in [-1.55,-1.2,1.2,1.55]:
 for j in range(3):
  rr=root('outward water marker');flows.append((rr,x,j))
  line('water arrow',[(0,.32,0),(0,-.32,0),(-.11,-.17,0),(0,-.32,0),(.11,-.17,0)],.026,'flow',rr)
lighting(s,target=(0,-3,1),scale=1.3)
bpy.ops.object.camera_add();cam=bpy.context.object;s.camera=cam
# Exact frame counts of the existing 15.208333s narration segment.
shots=[dict(id='buoyancy',start=0,frames=175),dict(id='entry',start=175,frames=110),dict(id='outflow',start=285,frames=80)]
SHOT=shots[0]
def position_at(t):return -6.9+7.5*smoothstep((t-7.25)/7.6)
@persistent
def update(_):
 t=(SHOT['start']+s.frame_current-1)/24;u=(s.frame_current-1)/max(1,SHOT['frames']-1)
 BOAT.location=(0,position_at(t),1.10)
 for rr in arrows:
  for ob in rr.children:ob.hide_render=t>=7.25
 for rr,x,j in flows:
  rr.location=(x,-3.7-4*((max(0,t-7.25)*.38+j/3)%1),1.13)
  for ob in rr.children:ob.hide_render=not(7.25<t<14.85)
 if SHOT['id']=='buoyancy':camera_pose(cam,(-10+u*.4,-15+u*.3,10),(0,-6.6,1.3),39)
 elif SHOT['id']=='entry':camera_pose(cam,(-13+u*.6,-16+u*.5,13),(0,-3.1,1.0),40)
 else:camera_pose(cam,(-7.8+u*.5,-10.5+u*.4,7.3),(0,-2.7,1.0),46)
bpy.app.handlers.frame_change_pre.clear();bpy.app.handlers.frame_change_pre.append(update)
checks={'fixedWaterZ':water.location.z,'boatDirection':'positive y into tank','flowDirection':'negative y to canal','boatAtStart':position_at(0),'boatAtEnd':position_at(15.2),'sameBoat':BOAT.name}
assert checks['boatAtEnd']>checks['boatAtStart'] and abs(water.location.z-.98)<1e-6
(C/'qa/kinematics.json').write_text(json.dumps(checks,indent=2))
(C/'manifest.json').write_text(json.dumps({**evidence(),'engine':s.render.engine,'samples':64,'shots':shots,'frames':365,'fps':24,'width':1080,'height':1920,'representation':'illustrative cutaway, not dimensioned replica or CFD'},indent=2))
for shot in shots:
 if a.shot!='all' and a.shot!=shot['id']:continue
 SHOT=shot;s.frame_start=1;s.frame_end=shot['frames']
 if a.preview:
  s.frame_set(round(shot['frames']*.5));update(s);s.render.image_settings.file_format='PNG';s.render.filepath=str(C/'qa'/(shot['id']+'.png'));bpy.ops.render.render(write_still=True)
 else:
  s.frame_set(1);update(s);s.render.image_settings.file_format='FFMPEG';s.render.ffmpeg.format='MPEG4';s.render.ffmpeg.codec='H264';s.render.ffmpeg.constant_rate_factor='HIGH';s.render.ffmpeg.ffmpeg_preset='GOOD';s.render.filepath=str(C/'clips'/(shot['id']+'.mp4'));bpy.ops.render.render(animation=True)
 print('SHOT_COMPLETE',shot['id'],flush=True)
