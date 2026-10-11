"""Outcome check: load-bearing wheels must stay on the ground as the tray rises."""
import ast,json,sys,hashlib
from pathlib import Path
root=Path(__file__).parent
wrapper=ast.parse((root/'air-contact.py').read_text())
values={n.targets[0].id:ast.literal_eval(n.value)for n in wrapper.body if isinstance(n,ast.Assign)and isinstance(n.targets[0],ast.Name)and n.targets[0].id in ['old','new']}
code=(root/'scene.py').read_text().replace(values['old'],values['new']).split("shots=['sunlight'")[0]
ns={'__file__':str(root/'air-contact.py')};exec(compile(code,str(root/'scene.py'),'exec'),ns)
bpy=ns['bpy'];Vector=ns['Vector'];checks=[]
for t in [0,.25,.5,1]:
 ns['pose']('air',t);bpy.context.view_layer.update();tires=ns['macroW'];gaps=[min((o.matrix_world@Vector(v)).z for v in o.bound_box)+.005 for o in tires]
 assert all(-.001<=g<=.006 for g in gaps),(t,gaps)
 tray=next(o for o in ns['G']['macrotray']if o.name=='tray underside');checks.append({'phase':t,'wheelGroundGapsMeters':gaps,'trayHeightMeters':tray.location.z})
assert checks[-1]['trayHeightMeters']>checks[0]['trayHeightMeters']+.05
r={'result':'pass','sourceHash':hashlib.sha256((root/'air-contact.py').read_bytes()).hexdigest(),'baseSourceHash':hashlib.sha256((root/'scene.py').read_bytes()).hexdigest(),'requirement':'All four macro wheels remain grounded while tray rises; schematic clearance is not a manufacturing dimension.','checks':checks};(ns['a'].out/'contact-check.json').write_text(json.dumps(r,indent=2));print(json.dumps(r))
