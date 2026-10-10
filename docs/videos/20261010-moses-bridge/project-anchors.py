"""Project the existing front anchors for a non-text editorial highlight. No mesh changes."""
import bpy,json,sys,argparse,hashlib
from pathlib import Path
from mathutils import Vector
from bpy_extras.object_utils import world_to_camera_view
p=argparse.ArgumentParser();p.add_argument('--cache',type=Path,required=True);a=p.parse_args(sys.argv[sys.argv.index('--')+1:]);c=a.cache
s=bpy.context.scene;s.render.resolution_x=1080;s.render.resolution_y=1920;s.render.resolution_percentage=100
bpy.ops.object.camera_add();cam=bpy.context.object;s.camera=cam;cam.data.lens=42
b=next(x for x in json.loads((c/'timeline.json').read_text())['beats']if x['id']=='anchor');frames=round(b['duration']*24);out=[]
for f in range(frames):
 u=f/frames;cam.location=(2.7,-7+u*.2,2.45);cam.rotation_euler=(Vector((0,0,.2))-cam.location).to_track_quat('-Z','Y').to_euler();bpy.context.view_layer.update();lines=[]
 for x in [-.77,.77]:
  line=[]
  for z in [-.34,-.06]:
   q=world_to_camera_view(s,cam,Vector((x,-2.95*.58,z)));assert 0<q.x<1 and 0<q.y<1;line.append([round(q.x*1080,2),round((1-q.y)*1920,2)])
  lines.append(line)
 out.append(lines)
(c/'anchor-projection.json').write_text(json.dumps(dict(sourceHash=hashlib.sha256((Path(__file__).parent/'scene.py').read_bytes()).hexdigest(),camera='same as scene.py anchor; fixed rod coordinates in scaled cutaway',frames=out),indent=2));print('PROJECTED',len(out),'frames')
