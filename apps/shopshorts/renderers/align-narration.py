"""Local speech alignment. Never alters the reviewed script or calls a paid API."""
import argparse, json, re, difflib
from pathlib import Path

def align(request, segments):
    norm=lambda s: re.sub(r'[^가-힣A-Za-z0-9]', '', s)
    src=norm(request['text']); chars=[]; times=[]
    for seg in segments:
        for word in seg.get('words', []):
            letters=norm(word['word']); n=max(1,len(letters))
            for i,c in enumerate(letters):
                chars.append(c); times.append((word['start']+(word['end']-word['start'])*i/n,word['start']+(word['end']-word['start'])*(i+1)/n))
    mapping={}
    for block in difflib.SequenceMatcher(None,src,''.join(chars),autojunk=False).get_matching_blocks():
        for i in range(block.size):mapping[block.a+i]=block.b+i
    coverage=len(mapping)/max(1,len(src))
    if coverage<.8:raise ValueError('Speech does not match reviewed narration')
    offset=0; result=[]
    for phrase in request['phrases']:
        text=norm(phrase); indices=[mapping[i] for i in range(offset,offset+len(text)) if i in mapping]
        if len(indices)/max(1,len(text))<.65:raise ValueError('Caption phrase has insufficient speech evidence')
        start=max(0,times[min(indices)][0]-.035); end=min(request['duration'],times[max(indices)][1]+.06)
        if result:result[-1]['end']=min(result[-1]['end'],start)
        result.append({'text':phrase,'start':start,'end':end}); offset+=len(text)
    if offset!=len(src) or any(p['end']<=p['start'] for p in result):raise ValueError('Incomplete caption alignment')
    return {'version':'whisper-words-v1','text':request['text'],'coverage':coverage,'phrases':result}

if __name__=='__main__':
    p=argparse.ArgumentParser()
    for arg in ['audio','input','output','cache']:p.add_argument('--'+arg,required=True)
    p.add_argument('--model',default='small'); a=p.parse_args()
    import whisper,torch
    torch.set_num_threads(4)
    model=whisper.load_model(a.model,download_root=a.cache)
    transcript=model.transcribe(a.audio,language='ko',fp16=False,verbose=False,word_timestamps=True)
    result=align(json.loads(Path(a.input).read_text()),transcript['segments'])
    Path(a.output).write_text(json.dumps(result,ensure_ascii=False))
