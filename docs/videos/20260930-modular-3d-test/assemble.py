"""Assemble the original Blender frames with existing approved speech/captions.
python3 assemble.py /Users/admin/Library/Mobile Documents/com~apple~CloudDocs/gpt 작업/commerce-automation-kit/20260930-modular-3d-test
No generation API calls, credentials or third-party media.
"""
import hashlib, json, pathlib, subprocess, sys
OUT = pathlib.Path(__file__).resolve().parent
SOURCE = OUT.parent / '20260930-modular-height'
CACHE = pathlib.Path(sys.argv[1] if len(sys.argv)>1 else '/Users/admin/Library/Mobile Documents/com~apple~CloudDocs/gpt 작업/commerce-automation-kit/20260930-modular-3d-test')
project = json.loads((SOURCE/'project.json').read_text())
cards = json.loads((SOURCE/'captions-v2.json').read_text())['captions']
original = SOURCE/'modular-height-captions-v2.mp4'
def run(args):
    p = subprocess.run(args, capture_output=True, text=True)
    if p.returncode: raise RuntimeError(p.stderr[-4000:])
    return p.stdout
def ass_time(f):
    cs=round(f/30*100)
    return f'{cs//360000}:{cs//6000%60:02}:{cs//100%60:02}.{cs%100:02}'
selected = ['s1', 's4']
old_cursor = new_cursor = 0
cuts=[]; captions=[]
for scene in project['scenes']:
    if scene['id'] in selected:
        cuts.append((old_cursor, scene['frames']))
        for c in cards:
            if c['sceneId']==scene['id']:
                c=dict(c)
                c['startFrame'] += new_cursor-old_cursor
                c['endFrame'] += new_cursor-old_cursor
                captions.append(c)
        new_cursor += scene['frames']
    old_cursor += scene['frames']
assert new_cursor==504
preview = '--preview' in sys.argv[2:]
if not preview:
    for f in range(1,new_cursor+1):
        assert (CACHE/'frames'/f'frame-{f:04}.png').is_file(), f'Missing frame {f}'
oldass=(SOURCE/'captions-modern.ass').read_text()
ass=oldass.split('[Events]')[0]+'[Events]\nFormat: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\n'
for c in captions:
    text=c['text'].replace('\n',r'\N')
    if c['accent']:
        text=text.replace(c['accent'],r'{\c&H68AAD2&}'+c['accent']+r'{\c&HF5F9FA&}')
    style=r'{\an5\pos(540,960)\bord3\shad2\3c&H101A18&\3a&H10&\fs'+str(c['fontSize'])+r'\fad(60,70)}'
    ass+=f"Dialogue: 1,{ass_time(c['startFrame'])},{ass_time(c['endFrame'])},Main,,0,0,0,,{style}{text}\n"
ass+='Dialogue: 2,0:00:00.00,0:00:16.80,Disclosure,,0,0,0,,3D 개념 모형 · 실제 건물·층수 비례 아님\n'
(OUT/'captions.ass').write_text(ass)
if preview:
    f = 80
    run(['ffmpeg','-y','-v','error','-i',str(CACHE/'frames'/f'frame-{f:04}.png'),'-vf',f"setpts=PTS+{(f-1)/30}/TB,ass=filename='{OUT/'captions.ass'}'",'-frames:v','1',str(CACHE/'caption-preview.jpg')])
    print('Caption preview:',CACHE/'caption-preview.jpg')
    raise SystemExit(0)
audio=';'.join(f'[1:a]atrim=start={start/30}:end={(start+length)/30},asetpts=PTS-STARTPTS[a{i}]' for i,(start,length) in enumerate(cuts))
audio+=';[a0][a1]concat=n=2:v=0:a=1[a]'
video=f"[0:v]ass=filename='{OUT/'captions.ass'}'[v]"
target=OUT/'modular-3d-test.mp4'
run(['ffmpeg','-y','-v','warning','-framerate','30','-i',str(CACHE/'frames/frame-%04d.png'),'-i',str(original),'-filter_complex',audio+';'+video,'-map','[v]','-map','[a]','-c:v','libx264','-preset','fast','-crf','18','-pix_fmt','yuv420p','-c:a','aac','-b:a','192k','-t','16.8','-movflags','+faststart',str(target)])
probe=json.loads(run(['ffprobe','-v','error','-show_streams','-show_format','-of','json',str(target)]))
v=next(s for s in probe['streams'] if s['codec_type']=='video')
a=next(s for s in probe['streams'] if s['codec_type']=='audio')
assert (v['width'],v['height'],v['nb_frames'],v['r_frame_rate'])==(1080,1920,'504','30/1')
assert abs(float(probe['format']['duration'])-16.8)<.05
run(['ffmpeg','-v','error','-xerror','-i',str(target),'-f','null','-'])
run(['ffmpeg','-y','-v','error','-i',str(target),'-vf','select=eq(n\\,80)+eq(n\\,225)+eq(n\\,335)+eq(n\\,450),scale=270:480,tile=4x1','-frames:v','1',str(OUT/'preview.jpg')])
verification={'renderer':'Blender 4.5.10 / Cycles','geometry':'original code-generated 3D','durationSeconds':16.8,'width':v['width'],'height':v['height'],'fps':v['r_frame_rate'],'frames':int(v['nb_frames']),'audioCodec':a['codec_name'],'audioSource':str(original.relative_to(OUT.parent.parent)),'sourceFrameRanges':cuts,'voiceId':'n2fbxG88jqAoaVPUy3IG','narrationSpeed':1.15,'captions':len(captions),'fullDecode':'passed','newPaidGenerationCalls':0,'sha256':hashlib.sha256(target.read_bytes()).hexdigest(),'limits':['Conceptual reduced model, not structural calculation or actual College Road geometry','Narration excerpt from the approved modular video','Not published or deployed to Studio']}
(OUT/'verification.json').write_text(json.dumps(verification,ensure_ascii=False,indent=2)+'\n')
print(json.dumps(verification,ensure_ascii=False,indent=2))
