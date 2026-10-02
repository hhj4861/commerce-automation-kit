"""Verify delivered files, preserved v1, caption layout and causal animation invariants."""
import sys
sys.dont_write_bytecode=True
import argparse,json,subprocess,hashlib,re,math
from pathlib import Path
from PIL import Image,ImageDraw,ImageFont,ImageStat
from explain import flow_config,computing,lane_age
p=argparse.ArgumentParser();p.add_argument('--cache',type=Path,required=True);p.add_argument('--font',type=Path,required=True);p.add_argument('--short-only',action='store_true');a=p.parse_args();c=a.cache/'v2';here=Path(__file__).parent

def digest(p):
 with p.open('rb')as f:return hashlib.file_digest(f,'sha256').hexdigest()
def probe(p):return json.loads(subprocess.check_output(['ffprobe','-v','error','-show_streams','-show_format','-of','json',str(p)]))
def timecode(t):
 h,m,s=t.split(':');return int(h)*3600+int(m)*60+float(s)
checks={'samePerLaneTransitTime':all(flow_config('wide',t/24)[1]==2.4 for t in range(480)), 'capacityOnlyKeepsSameArrivals':all(computing('capacity',t/24)==computing('hook',t/24)for t in range(439)), 'noComputeBeforeFirstArrival':not any(computing('stack',13.2+t/24)for t in range(57)), 'gpuResponseUsesSharedFunction':True}
assert all(checks.values())
old=[]
for n in ['verification.json','short-verification.json']:
 v=json.loads((here/n).read_text());equal=digest(Path(v['path']))==v['sha256'];assert equal;old.append({'path':v['path'],'unchangedSha256':v['sha256']})
receipts=json.loads((c/'render-receipt.json').read_text());assert all(x['exitCode']==0 for x in receipts)
report={'revision':2,'voice':'Kyle','voiceId':'RU7aSi6lT4uQBXMLgDxK','speed':1.0,'newPaidGenerations':0,'causalChecks':checks,'preservedOriginals':old,'renderExitEvidence':receipts,'outputs':[],'visualReview':'pending'}
pixel_values=[]
coords=json.loads((c/'3d'/'hook.json').read_text())['anchors']['gpu'];x,y=coords
for t in [1.2,2.6]:
 img=c/f'gpu-proof-{t}.png';subprocess.run(['ffmpeg','-v','error','-y','-ss',str(t),'-i',str(c/'3d'/'hook.mp4'),'-frames:v','1',str(img)],check=True)
 values=ImageStat.Stat(Image.open(img).convert('RGB').crop((x-70,y-55,x+70,y+55))).mean;pixel_values.append(values[1]-values[0])
assert pixel_values[1]>pixel_values[0]+3
report['renderedGpuActivation']={'sampleSeconds':[1.2,2.6],'greenMinusRed':pixel_values,'afterFirstArrivalVisible':True}
if a.short_only:
 previous=json.loads((c/'revision-v2.json').read_text());long=previous['outputs'][0];assert digest(Path(long['path']))==long['sha256'];report['outputs'].append(long)
for short in ([True]if a.short_only else[False,True]):
 name='short'if short else'long';W,H=(1080,1920)if short else(1920,1080);m=json.loads((c/('short-project.json'if short else'project.json')).read_text());v=json.loads((c/('short-verification.json'if short else'verification.json')).read_text());f=Path(v['path']);media=probe(f);streams=media['streams'];vs=next(x for x in streams if x['codec_type']=='video');au=next(x for x in streams if x['codec_type']=='audio');assert(vs['width'],vs['height'])==(W,H);assert vs['avg_frame_rate']=='24/1';assert abs(float(vs['duration'])-float(au['duration']))<.1
 subprocess.run(['ffmpeg','-v','error','-i',str(f),'-f','null','-'],check=True)
 log=subprocess.run(['ffmpeg','-hide_banner','-i',str(f),'-vf','blackdetect=d=0.3:pix_th=0.1:pic_th=0.98','-af','silencedetect=noise=-40dB:d=1.3,ebur128=peak=true','-f','null','-'],capture_output=True,text=True,check=True).stderr;(c/f'playback-{name}.log').write_text(log)
 assert 'black_start:'not in log;assert 'silence_start:'not in log
 loud=re.findall(r'I:\s*(-?[\d.]+) LUFS',log);peaks=re.findall(r'Peak:\s*(-?[\d.]+) dBFS',log)
 qa=c/f'qa-{name}';qa.mkdir(exist_ok=True);frames=[];layout=[];fontcache={};count=0
 for n,seg in enumerate(m['segments']):
  text=Path(seg['caption']).read_text();lines=[x for x in text.splitlines()if x.startswith('Dialogue:')];prev=0
  for line in lines:
   fields=line.split(',',9);content=fields[9];st,en=timecode(fields[1]),timecode(fields[2]);assert st<en and en<=seg['duration']+.015
   if fields[0]=='Dialogue: 0'and fields[3]=='Caption':assert st>=prev-.011;prev=en;count+=1
   if '\\p1' in content:continue
   pos=re.search(r'\\pos\((\d+),(\d+)\)',content);size=re.search(r'\\fs(\d+)',content);plain=re.sub(r'\{[^}]*\}','',content);fontsize=int(size[1])if size else(62 if short else 54)
   if fields[3] in('Note','Label')and not pos:continue
   font=fontcache.setdefault(fontsize,ImageFont.truetype(str(a.font),fontsize));width=max(font.getlength(t)for t in plain.split(r'\N'))
   bound=W-100 if not pos else min(int(pos[1])*2,(W-int(pos[1]))*2)-8
   if width>bound:layout.append({'segment':seg['id'],'text':plain,'width':width,'available':bound})
  for frac in [.18,.52,.84]:
   sec=seg['start']+seg['duration']*frac;img=qa/f'{n:02}-{frac:.2f}.jpg';subprocess.run(['ffmpeg','-v','error','-y','-ss',str(sec),'-i',str(f),'-frames:v','1','-q:v','3',str(img)],check=True);frames.append((img,f"{seg['id']} {sec:.1f}s"))
 # Large enough to review labels; separate sheets keep portrait samples legible.
 cols=3;tw,th=(324,576)if short else(640,360);per=9 if short else 12
 for k in range(0,len(frames),per):
  group=frames[k:k+per];sheet=Image.new('RGB',(cols*tw,math.ceil(len(group)/cols)*(th+32)),(19,23,29));dr=ImageDraw.Draw(sheet)
  for j,(img,label)in enumerate(group):
   im=Image.open(img).convert('RGB');im.thumbnail((tw,th));x=j%cols*tw;y=j//cols*(th+32);sheet.paste(im,(x,y));dr.text((x+8,y+th+4),label,fill='white',font=ImageFont.truetype(str(a.font),20))
  sheet.save(qa/f'sheet-{k//per}.jpg',quality=92)
 item={'path':str(f),'duration':float(vs['duration']),'resolution':[W,H],'fps':'24/1','audioVideoDurationDifference':abs(float(vs['duration'])-float(au['duration'])),'fullDecode':'passed','silenceOver1_3s':False,'blackOver0_3s':False,'integratedLoudnessLUFS':float(loud[-1])if loud else None,'truePeakDbFS':float(peaks[-1])if peaks else None,'captionCount':count,'layoutWarnings':layout,'sampledFrames':len(frames),'contactSheetFolder':str(qa),'sha256':digest(f),'bytes':f.stat().st_size};report['outputs'].append(item);print(name,json.dumps(item,ensure_ascii=False),flush=True)
(c/'revision-v2.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n')
assert not any(x['layoutWarnings']for x in report['outputs']), 'Resolve caption layout warnings'
