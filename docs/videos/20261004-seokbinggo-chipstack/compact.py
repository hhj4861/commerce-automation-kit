"""Re-edit complete sentences from this batch; no new voice or paid video calls."""
import argparse,json,subprocess,hashlib
from pathlib import Path
p=argparse.ArgumentParser();p.add_argument('--cache',type=Path,required=True);p.add_argument('--variant',choices=['short','ice'],required=True);p.add_argument('--font-dir',type=Path,required=True);a=p.parse_args();c=a.cache
source=json.loads((c/(a.variant+'-plan.json')).read_text())
# Seconds are exact-source forced-aligned sentence ends, never arbitrary mid-sentence cuts.
selection=[('hook',7.18),('stack',8.34),('contacts',7.74),('heat',None),('ending',None)] if a.variant=='short' else [('icehook',None),('insulation',8.54),('drain',5.06),('vent',None),('iceending',None)]
question='칩도 쌓으면 더 빨라질까?' if a.variant=='short' else '얼음 창고에 왜 구멍을 냈을까?'
folder=c/('compact-'+a.variant);folder.mkdir(exist_ok=True)
ass=folder/'hook.ass';ass.write_text(f"""[Script Info]
ScriptType: v4.00+
PlayResX: 1080
PlayResY: 1920
[V4+ Styles]
Format: Name,Fontname,Fontsize,PrimaryColour,SecondaryColour,OutlineColour,BackColour,Bold,Italic,Underline,StrikeOut,ScaleX,ScaleY,Spacing,Angle,BorderStyle,Outline,Shadow,Alignment,MarginL,MarginR,MarginV,Encoding
Style: Hook,Pretendard SemiBold,60,&H00FFFFFF,&H00FFFFFF,&H001B1712,&H801B1712,0,0,0,0,100,100,0,0,3,12,0,8,60,60,270,1
[Events]
Format: Layer,Start,End,Style,Name,MarginL,MarginR,MarginV,Effect,Text
Dialogue: 1,0:00:00.00,0:00:03.00,Hook,,0,0,0,,{question}
""")
inputs=[];filters=[];segments=[];cursor=0
source_cues=json.loads((c/(a.variant+'-captions.json')).read_text());kept_cues=[]
for n,(sid,until) in enumerate(selection):
 index=next(i for i,s in enumerate(source['segments'])if s['id']==sid);seg=source['segments'][index]
 speech_end=seg['duration'] if until is None else until/source['speed']
 duration=seg['duration'] if until is None else min(seg['duration'],round((speech_end+.10)*24)/24)
 scene_cues=[q for q in source_cues if q['scene']==sid]
 kept=[q for q in scene_cues if q['end']-seg['start']<=speech_end+.08]
 assert kept
 discarded=[q for q in scene_cues if q not in kept]
 video_end=speech_end if not discarded else min(speech_end,discarded[0]['start']-seg['start']-1/24)
 for q in kept:kept_cues.append({**q,'start':cursor+q['start']-seg['start'],'end':cursor+min(duration,q['end']-seg['start'])})
 kept_cues[-1]['end']=cursor+duration
 path=c/('edit-'+a.variant)/f'{index:02}.mp4';assert path.exists()
 inputs+=['-i',str(path)]
 vf=f'[{n}:v]trim=duration={video_end},setpts=PTS-STARTPTS,tpad=stop_mode=clone:stop_duration=1,trim=duration={duration}'
 if n==0:vf+=f",subtitles=filename='{ass}':fontsdir='{a.font_dir}'"
 filters += [vf+f'[v{n}]',f'[{n}:a]atrim=duration={speech_end},asetpts=PTS-STARTPTS,apad,atrim=duration={duration}[a{n}]']
 segments.append({'id':sid,'sourceIndex':index,'sourceStart':seg['start'],'start':cursor,'duration':duration,'speechEnd':speech_end,'videoEnd':video_end});cursor+=duration
assert 30<=cursor<=50,cursor
filters.append(''.join(f'[v{n}][a{n}]'for n in range(len(selection)))+f'concat=n={len(selection)}:v=1:a=1[v][a]')
name='chip-stacking-episode-4-short.mp4' if a.variant=='short' else 'gyeongju-seokbinggo-short.mp4'
out=Path('/Users/admin/Downloads/vedio')/name
subprocess.run(['ffmpeg','-v','error','-y',*inputs,'-filter_complex',';'.join(filters),'-map','[v]','-map','[a]','-c:v','libx264','-preset','veryfast','-crf','19','-r','24','-pix_fmt','yuv420p','-video_track_timescale','24000','-c:a','aac','-b:a','192k','-movflags','+faststart',str(out)],check=True)
subprocess.run(['ffmpeg','-v','error','-i',str(out),'-f','null','-'],check=True)
meta=json.loads(subprocess.check_output(['ffprobe','-v','error','-show_streams','-of','json',str(out)]));v=next(s for s in meta['streams']if s['codec_type']=='video');audio=next(s for s in meta['streams']if s['codec_type']=='audio');assert abs(float(v['duration'])-float(audio['duration']))<.1
log=subprocess.run(['ffmpeg','-hide_banner','-i',str(out),'-af','silencedetect=noise=-40dB:d=1.3,volumedetect','-vf','blackdetect=d=0.3:pix_th=.05','-f','null','-'],capture_output=True,text=True,check=True).stderr
(folder/'verify.log').write_text(log)
import re
report={'file':str(out),'duration':float(v['duration']),'audioDuration':float(audio['duration']),'resolution':[v['width'],v['height']],'fps':v['avg_frame_rate'],'speed':source['speed'],'voice':source['voice'],'segments':segments,'openingQuestion':question,'newPaidCalls':0,'captionReview':{'cues':len(kept_cues),'completeAtCuts':True,'lastCaption':kept_cues[-1]},'fullDecode':True,'silencesOver1_3sec':re.findall(r'silence_duration: ([\d.]+)',log),'blackSegments':re.findall(r'black_start:[^\n]+',log),'maxVolume':re.findall(r'max_volume: ([^\n]+)',log),'sha256':hashlib.file_digest(out.open('rb'),'sha256').hexdigest(),'visualReview':'pending'}
(c/(a.variant+'-compact-captions.json')).write_text(json.dumps(kept_cues,ensure_ascii=False,indent=2))
(c/(a.variant+'-compact-verification.json')).write_text(json.dumps(report,ensure_ascii=False,indent=2));print(json.dumps(report,ensure_ascii=False),flush=True)
