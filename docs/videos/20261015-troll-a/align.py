"""Keep measured speech timestamps; canonicalize only equivalent numeral/identifier spellings."""
import argparse,importlib.util,json
from pathlib import Path
p=argparse.ArgumentParser()
for name in ['aligner','audio','input','output','cache']:p.add_argument('--'+name,required=True)
p.add_argument('--model',default='small');a=p.parse_args()
import whisper,torch
torch.set_num_threads(4)
cache=Path(a.audio).with_suffix('.transcript.json')
if cache.exists():transcript=json.loads(cache.read_text())
else:
 transcript=whisper.load_model(a.model,download_root=a.cache).transcribe(a.audio,language='ko',fp16=False,verbose=None,word_timestamps=True)
 cache.write_text(json.dumps(transcript,ensure_ascii=False))
segments=json.loads(json.dumps(transcript['segments']));changes=[]
for segment in segments:
 for word in segment.get('words',[]):
  before=word['word'];after=before.replace('472m','사백칠십이미터').replace('472미터','사백칠십이미터').replace('472 미터','사백칠십이 미터').replace('트롤A','트롤에이').replace('트롤 A','트롤 에이')
  if before!=after:changes.append({'from':before,'to':after,'start':word['start'],'end':word['end']});word['word']=after
spec=importlib.util.spec_from_file_location('shared_speech_alignment',a.aligner);shared=importlib.util.module_from_spec(spec);spec.loader.exec_module(shared)
result=shared.align(json.loads(Path(a.input).read_text()),segments)
result['canonicalization']={'version':'troll-a-spoken-equivalence-v1','changes':changes,'rawTranscript':transcript['text']}
Path(a.output).write_text(json.dumps(result,ensure_ascii=False))
