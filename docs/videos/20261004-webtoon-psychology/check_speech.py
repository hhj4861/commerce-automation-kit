"""Independent ASR spot checks; forced subtitle alignment is not speech verification."""
import os,json,re,argparse
from pathlib import Path
from difflib import SequenceMatcher
p=argparse.ArgumentParser();p.add_argument('--cache',required=True,type=Path);a=p.parse_args();c=a.cache
os.environ['NUMBA_CACHE_DIR']=str(c/'tmp/numba');os.environ['TMPDIR']=str(c/'tmp')
import torch,whisper
torch.set_num_threads(3)
m=whisper.load_model('small',device='cpu',download_root='/Users/admin/Library/Mobile Documents/com~apple~CloudDocs/gpt 작업/commerce-automation-kit/20261001-glass-substrate/models')
s=json.loads((Path(__file__).parent/'story.json').read_text());selected={(1,2),(1,23),(1,24),(2,14),(2,16),(2,29),(3,16),(3,25),(3,29)};results=[]
for ep in s['episodes']:
 for i,b in enumerate(ep['beats']):
  if (ep['number'],i)not in selected:continue
  f=c/('voice-'+b['speaker'])/f"beat-{b['voiceIndex']:02d}.mp3"
  r=m.transcribe(str(f),language='ko',fp16=False,temperature=0,condition_on_previous_text=False,verbose=False)
  norm=lambda x:re.sub(r'[^가-힣a-zA-Z0-9]','',x)
  similarity=SequenceMatcher(None,norm(b['text']),norm(r['text'])).ratio()
  result=dict(id=b['id'],speaker=b['speaker'],expected=b['text'],heard=r['text'],similarity=similarity);results.append(result)
  (c/'speech-check.json').write_text(json.dumps(results,ensure_ascii=False,indent=2));print(json.dumps(result,ensure_ascii=False),flush=True)
