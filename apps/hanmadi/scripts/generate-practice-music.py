"""Bounded one-time original song generation; no automatic paid retries.

Use a catalog exported from original-music.ts, an artifact directory and one
language. Key comes from stdin, or stays on the existing shared-ai VM when the
explicit --shared-ai option is used. No VM files/services are changed.
"""
import argparse
import base64
import email.policy
import email.parser
import hashlib
import json
from pathlib import Path
import shlex
import subprocess
import sys
import urllib.request
import urllib.error


def compose(song, key):
    language = {'en':'English','ja':'Japanese','th':'Thai','es':'Spanish'}[song['language']]
    # Official v2 schema uses chunks (the reference response's sections are v1).
    # https://elevenlabs.io/docs/eleven-api/guides/how-to/music/composition-plans
    plan = {'chunks': [{'text':'[Verse '+str(i+1)+']\n'+line['text'], 'duration_ms':8000,
        'positive_styles':['gentle acoustic pop','82 BPM','simple memorable melody',
            'clear solo native '+language+' singing','very clear diction',
            'soft acoustic guitar and piano','sing only the supplied line once'],
        'negative_styles':['extra lyrics','vocal ad libs','heavy effects','long instrumental intro'],
        'context_adherence':'high'} for i,line in enumerate(song['lines'])]}
    if song.get('_singleVerse'):
        plan['chunks'] = [{**plan['chunks'][0], 'text':'[Verse]\n'+'\n'.join(line['text'] for line in song['lines']), 'duration_ms':32000}]
    body = {'composition_plan':plan,'model_id':'music_v2','with_timestamps':True,'store_for_inpainting':False}
    req=urllib.request.Request('https://api.elevenlabs.io/v1/music/detailed?output_format=mp3_44100_128',
        data=json.dumps(body,ensure_ascii=False).encode(),headers={'xi-api-key':key,'Content-Type':'application/json'})
    try:
        with urllib.request.urlopen(req,timeout=180) as response:
            raw=response.read(); content_type=response.headers.get('Content-Type','')
    except urllib.error.HTTPError as error:
        try: detail=json.loads(error.read()).get('detail',{})
        except Exception: detail={}
        raise RuntimeError('Provider HTTP '+str(error.code)+' '+str(detail.get('status') if isinstance(detail,dict) else 'error')) from None
    message=email.parser.BytesParser(policy=email.policy.default).parsebytes(
        ('Content-Type: '+content_type+'\r\nMIME-Version: 1.0\r\n\r\n').encode()+raw)
    metadata={}; audio=None
    for part in message.iter_parts():
        payload=part.get_payload(decode=True)
        if part.get_content_type()=='application/json': metadata=json.loads(payload)
        elif part.get_content_type().startswith('audio/') or part.get_content_type()=='application/octet-stream': audio=payload
    if not audio or len(audio)<10000: raise RuntimeError('No usable audio; do not automatically retry')
    return audio,metadata


def remote_compose(song):
    code=base64.b64encode(Path(__file__).read_bytes()).decode()
    data=base64.b64encode(json.dumps(song,ensure_ascii=False).encode()).decode()
    remote='''import base64,json,shlex
scope={"__name__":"music_library"}
exec(base64.b64decode(CODE),scope)
key=None
for line in open("/opt/shared-ai/repo/services/ai-gateway/.env"):
 if line.startswith("ELEVENLABS_API_KEY="): key=shlex.split(line.split("=",1)[1].strip())[0]
if not key: raise SystemExit("Provider key missing")
audio,metadata=scope["compose"](json.loads(base64.b64decode(DATA)),key)
print(json.dumps({"audio":base64.b64encode(audio).decode(),"metadata":metadata}))
'''.replace('CODE',repr(code)).replace('DATA',repr(data))
    result=subprocess.run(['gcloud','compute','ssh','shared-ai','--project=replay-live-508202',
        '--zone=us-central1-a','--account=guswhd1085@gmail.com','--tunnel-through-iap','--quiet',
        '--command','sudo python3 -c '+shlex.quote(remote)],capture_output=True,text=True,timeout=240)
    if result.returncode:
        # No raw stdout: successful output contains the audio, not credentials.
        raise RuntimeError('Remote generation failed: '+result.stderr[-700:])
    data=json.loads(result.stdout)
    return base64.b64decode(data['audio']),data['metadata']


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--catalog',required=True)
    parser.add_argument('--out',required=True)
    parser.add_argument('--language',choices=['en','ja','th','es'],required=True)
    parser.add_argument('--confirm-paid',action='store_true')
    parser.add_argument('--shared-ai',action='store_true')
    parser.add_argument('--single-verse',action='store_true')
    args=parser.parse_args()
    if not args.confirm_paid: parser.error('Consumes provider credits; pass --confirm-paid after authorization')
    song=next(s for s in json.loads(Path(args.catalog).read_text()) if s['language']==args.language)
    if args.single_verse: song['_singleVerse']=True
    out=Path(args.out); out.mkdir(parents=True,exist_ok=True)
    target=out/(song['id']+'.mp3')
    if target.exists(): raise SystemExit('Output exists; no provider call made')
    if args.shared_ai: audio,metadata=remote_compose(song)
    else:
        key=sys.stdin.read().strip()
        if not key: raise SystemExit('Missing provider key on stdin')
        audio,metadata=compose(song,key)
    target.write_bytes(audio)
    metadata['provenance']={'provider':'ElevenLabs official Music API','model':'music_v2','originalLyrics':True,
        'revision':song['revision'],'sha256':hashlib.sha256(audio).hexdigest(),'requestedSeconds':32}
    (out/(song['id']+'.json')).write_text(json.dumps(metadata,ensure_ascii=False,indent=2))
    print(json.dumps({'language':args.language,'bytes':len(audio),'metadataKeys':list(metadata)}))

if __name__=='__main__': main()
