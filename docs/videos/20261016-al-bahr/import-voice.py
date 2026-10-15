"""Import the reviewed ElevenLabs website export; no credentials or paid calls."""
import argparse, json, math, hashlib, importlib.util, subprocess
from pathlib import Path
p=argparse.ArgumentParser()
for k in ['audio','input','out','aligner','cache']:p.add_argument('--'+k,required=True)
a=p.parse_args();root=Path(a.out);request=json.loads(Path(a.input).read_text())
source=Path(a.audio);source_hash=hashlib.sha256(source.read_bytes()).hexdigest()
full=root/'website-narration-1.1.mp3'
subprocess.run(['ffmpeg','-v','error','-y','-i',str(source),'-af','atempo=1.1','-c:a','libmp3lame','-b:a','192k',str(full)],check=True)
probe=lambda f:float(subprocess.check_output(['ffprobe','-v','error','-show_entries','format=duration','-of','default=nw=1:nk=1',str(f)]))
duration=probe(full)
import whisper,torch
torch.set_num_threads(4)
cache=root/'website-transcript.json'
if cache.exists():
 saved=json.loads(cache.read_text());assert saved['sourceHash']==source_hash,'Imported audio changed; reconcile transcript before replacing';transcript=saved['transcript']
else:
 model=whisper.load_model('small',download_root=a.cache);transcript=model.transcribe(str(full),language='ko',fp16=False,verbose=False,word_timestamps=True)
 cache.write_text(json.dumps({'sourceHash':source_hash,'transcript':transcript},ensure_ascii=False))
spec=importlib.util.spec_from_file_location('shared_aligner',a.aligner);module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
all_text=' '.join(s['narration'] for s in request['scenes']);all_phrases=[p for s in request['scenes'] for p in s['phrases']]
aligned=module.align({'text':all_text,'phrases':all_phrases,'duration':duration},transcript['segments'])
(root/'website-full-alignment.json').write_text(json.dumps(aligned,ensure_ascii=False,indent=2))
ends=[];n=0
for s in request['scenes']:
 n+=len(s['phrases']);ends.append(n)
bounds=[0]+[(aligned['phrases'][n-1]['end']+aligned['phrases'][n]['start'])/2 for n in ends[:-1]]+[duration]
timeline={'sourceHash':request['sourceHash'],'voice':request['voiceId'],'speed':1.1,'voiceSource':'ElevenLabs official website export','sourceAudioHash':source_hash,'beats':[]}
for i,s in enumerate(request['scenes']):
 start,end=bounds[i:i+2];audio=root/(s['id']+'.mp3')
 subprocess.run(['ffmpeg','-v','error','-y','-ss',str(start),'-t',str(end-start),'-i',str(full),'-c:a','libmp3lame','-b:a','192k',str(audio)],check=True)
 actual=probe(audio);segments=[]
 for segment in transcript['segments']:
  words=[]
  for w in segment.get('words',[]):
   if start<=(w['start']+w['end'])/2<end:words.append({**w,'start':max(0,w['start']-start),'end':min(actual,w['end']-start)})
  if words:segments.append({'words':words})
 part=module.align({'text':s['narration'],'phrases':s['phrases'],'duration':actual},segments)
 assert part['coverage']>=.8
 seconds=math.ceil((actual+(1.5 if i==len(request['scenes'])-1 else .16))*24)/24
 timeline['beats'].append({'id':s['id'],'duration':seconds,'audioDuration':actual,'narration':s['narration'],'alignment':part})
 (root/(s['id']+'-import-receipt.json')).write_text(json.dumps({'sourceAudioHash':source_hash,'source':'official website export','voice':request['voiceId'],'sourceStart':start,'sourceEnd':end,'measuredCoverage':part['coverage']}))
 (root/'timeline.json').write_text(json.dumps(timeline,ensure_ascii=False,indent=2));print(json.dumps({'imported':s['id'],'duration':seconds,'coverage':part['coverage']}),flush=True)
