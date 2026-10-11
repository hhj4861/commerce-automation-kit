"""Air shot correction: wheel assemblies stay grounded while the upper tray rises.
The original source stays immutable so unchanged shots retain verifiable provenance.
"""
from pathlib import Path
import hashlib
source=Path(__file__).with_name('scene.py').read_text()
assert hashlib.sha256(source.encode()).hexdigest()=='3ddd1aeb79f4fb83b5f345a94970570cc9e84e42e257f0ab5632188c3dd587e0'
old="for o,p in macrobase.items():o.location=p+Vector((.5*u if shot=='wheels'else 0,0,.055*min(1,u*2)if shot=='air'else 0))"
new="for o,p in macrobase.items():o.location=p+Vector((.5*u if shot=='wheels'else 0,0,.055*min(1,u*2)if shot=='air' and not o.name.startswith(('drive tire','wheel rim','wheel cap','wheel yoke','hub bolt','tire tread','hub rotation mark')) else 0))"
assert source.count(old)==1
exec(compile(source.replace(old,new),str(Path(__file__).with_name('scene.py')),'exec'))
