"""Align the exact approved narration to generated speech, without rewriting captions."""
import os,sys,json,argparse
from pathlib import Path
p=argparse.ArgumentParser();p.add_argument('--cache',type=Path,required=True);a=p.parse_args();c=a.cache
os.environ['NUMBA_CACHE_DIR']=str(c/'numba-cache')
import torch,whisper
from whisper.timing import find_alignment
from whisper.tokenizer import get_tokenizer
brief=json.loads((Path(__file__).parent/'brief.json').read_text());torch.set_num_threads(4)
m=whisper.load_model('base',device='cpu',download_root=str(c/'models'));tok=get_tokenizer(m.is_multilingual,language='ko',task='transcribe')
result=[]
for i,scene in enumerate(brief['scenes']):
 f=c/'remote-narration'/f'beat-{i:02d}.mp3';meta=json.loads(Path(str(f)+'.json').read_text())
 assert meta['text']==scene['narration'] and meta['voiceId']==brief['voice']
 audio=whisper.load_audio(str(f));duration=len(audio)/16000
 if duration>30:raise RuntimeError('Alignment input exceeds model window; split on a speech pause before aligning')
 mel=whisper.log_mel_spectrogram(whisper.pad_or_trim(audio),n_mels=m.dims.n_mels)
 words=find_alignment(m,tok,tok.encode(scene['narration']),mel,len(audio)//160)
 result.append({'id':scene['id'],'duration':duration,'words':[{'text':w.word,'start':float(w.start),'end':float(w.end),'probability':float(w.probability)}for w in words]})
 (c/'alignment.json').write_text(json.dumps(result,ensure_ascii=False,indent=2));print('ALIGNED',scene['id'],round(duration,2),flush=True)
