"""Time-aligned causal annotations. Animation timings are explanatory, not benchmarks."""
import math,json
from pathlib import Path

def flow_config(name,t):
 if name in('hook','capacity'):return 1,2.4
 if name=='wide':return (1,2.4)if t<5.8 else(6,2.4)
 if name=='stack':return (0,2.4)if t<13.2 else(6,2.4)
 if name=='tsv':return (0,2.4)if t<4.4 else(4,2.4)
 if name=='interposer':return (0,2.4)if t<6.2 else(6,2.4)
 return 6,2.4

def lane_age(name,t,j):
 lanes,period=flow_config(name,t)
 origin={'wide':5.8,'stack':13.2,'tsv':4.4,'interposer':6.2}.get(name,0)
 if name=='wide'and t<origin:origin=0
 return t-origin-j*period/max(1,lanes)

def computing(name,t):
 lanes,period=flow_config(name,t)
 return any(lane_age(name,t,j)>=period and lane_age(name,t,j)%period<.48 for j in range(lanes))

def annotations(name,offset,duration,short,cache):
 W,H=(1080,1920)if short else(1920,1080);fs=43 if short else 36;out=[]
 def stamp(t):
  n=round(t*100);return f'{n//360000}:{n//6000%60:02}:{n//100%60:02}.{n%100:02}'
 def event(lo,hi,tags,txt,layer=2):
  lo=max(0,lo-offset);hi=min(duration,hi-offset)
  if hi>lo:out.append(f'Dialogue: {layer},{stamp(lo)},{stamp(hi)},Caption,,0,0,0,,{{{tags}}}{txt}\n')
 def label(lo,hi,text,x,y,size=fs,color='FFFFFF',align=5):
  event(lo,hi,fr'\an{align}\pos({round(x)},{round(y)})\fs{size}\1c&H{color}&\bord2.2\shad1\fad(100,100)',text)
 def leader(lo,hi,p,q,color='DDDDDD'):
  event(lo,hi,fr'\an7\pos(0,0)\p1\bord0\shad0\1c&H{color}&',f'm {int(p[0])} {int(p[1])} l {int(q[0])} {int(q[1])} {int(q[0]+2)} {int(q[1]+2)} {int(p[0]+2)} {int(p[1]+2)}',1)
 end=offset+duration;start=6 if name=='hook'else 0
 questions={'hook':'계산할 준비는 끝났는데… 왜 기다릴까?','kitchen':'요리사만 더 뽑으면 빨라질까?','weights':'AI가 대답할 때 무엇을 읽을까?','decode':'다음 말을 만드는 데도 기다림이 생긴다','capacity':'더 많이 담으면, 더 빨리 보낼까?','wide':'더 빠르게 보내기 vs 한꺼번에 보내기','stack':'높이 쌓는 것만으로 빨라질까?','tsv':'쌓기만 하면 층끼리 연결될까?','interposer':'메모리의 데이터는 GPU까지 어떻게 갈까?','numbers':'141 GB와 4.8 TB/s는 무엇이 다를까?','daily':'내가 쓰는 AI에는 무엇이 달라질까?','context':'대화가 길어지면 무엇이 늘어날까?','cost':'좋은데 왜 모든 PC에 넣지 않을까?','heat':'촘촘해진 칩, 열은 어디로 나갈까?','makers':'빠른 메모리 하나만 만들면 끝일까?','limits':'통로를 넓혔는데도 느리다면?','ending':'생각하는 칩과, 데이터를 공급하는 칩'}
 q=questions[name]
 if short and len(q)>22:
  k=q.rfind(' ',0,len(q)//2+4);q=q[:k]+r'\N'+q[k+1:]
 label(start,min(end,start+4.8),q,W/2,280 if short else 100,48 if short else 48)
 native=cache/'v2'/('3d-short'if short else'3d')/(name+'.json')
 if native.exists() and name!='daily':
  pts=json.loads(native.read_text())['anchors'];mx,my=pts['memory'];gx,gy=pts['gpu'];lx,ly=pts['link']
  ml=(mx-40,my-145)if not short else(mx,my-160)
  gl=(gx+95,gy+160)if not short else(gx,gy+210)
  memory='메모리 · 데이터 저장'if name in('hook','capacity','wide')else'HBM · 데이터 저장'
  if name=='tsv':
   memory='DRAM'+r'\N'+'실리콘 층'if short else'DRAM · 실리콘 층'
   ml=(800,550)if short else(420,410)
  label(start,end,memory,*ml,color='FFE7A0');leader(start,end,(ml[0],ml[1]+30),(mx,my-10),'FFE7A0')
  label(start,end,'GPU · 계산',*gl,color='BCEBD2');leader(start,end,(gx,gy+60),(gl[0],gl[1]-30),'BCEBD2')
  if name in('hook','capacity','wide','ending'):
   # One status per causal state, synchronized to the same function as GPU tiles.
   previous=None;begin=start
   for f in range(math.ceil(start*24),math.ceil(end*24)+1):
    t=min(end,f/24);state=computing(name,t)
    if previous is None:previous=state;begin=t
    if state!=previous or t==end:
     label(begin,t,'데이터 도착 → 계산 중'if previous else'데이터 기다리는 중',gl[0],gl[1]+48,30 if not short else 36,'BCEBD2'if previous else'7ABDFF');begin=t;previous=state
  if name=='capacity':
   label(3,9.25,'용량 = 저장할 수 있는 양',W/2,245 if not short else 390,fs)
   label(9.25,end,'저장 공간 증가 / 연결 통로는 그대로',W/2,245 if not short else 390,fs,color='7ABDFF')
  if name=='wide':
   label(0,5.8,'한 통로로 전달',W/2,245 if not short else 390,fs,color='7ABDFF')
   label(5.8,end,'여러 통로로 동시에 전달',W/2,245 if not short else 390,fs,color='BCEBD2')
  if name=='stack':
   label(3,7,'얇은 DRAM 칩을 쌓는다',W/2,245 if not short else 390,fs)
   label(7,13.2,'계산칩 가까이에 배치',W/2,245 if not short else 390,fs)
   label(13.2,end,'여러 연결로 함께 주고받는다',W/2,245 if not short else 390,fs,color='BCEBD2')
  if name=='tsv':
   label(0,4.4,'층 사이에 연결이 없다면?',W/2,245 if not short else 390,fs,color='7ABDFF')
   label(4.4,9,'TSV · 실리콘을 관통하는 연결',W/2,245 if not short else 390,fs,color='FFE7A0')
   label(9,end,'TSV: 실리콘 / TGV: 유리',W/2,245 if not short else 390,fs)
  if name=='interposer':
   label(0,6.2,'위로 쌓은 메모리는 GPU 옆에',W/2,245 if not short else 390,fs)
   label(6.2,end,'수직 연결 + 아래의 수평 배선',W/2,245 if not short else 390,fs,color='FFE7A0')
  label(start,end,'구조·시간을 단순화한 원리 설명 · 성능 비교 실측 아님',W/2,860 if not short else 1740,23 if not short else 24,color='DDDDDD')
 else:
  # Non-core cinematic shots keep the environment, with sequential guides tied to speech.
  sequences={
   'kitchen':[(2.4,6.8,'식재료 → 좁은 문 → 요리사'),(6.8,10.6,'요리사를 늘려도 문은 그대로'),(10.6,end,'데이터 → 연결 통로 → GPU')],
   'weights':[(0,7,'학습한 숫자 + 지금까지의 대화'),(7,11,'캐시: 가까이에 둔 작은 저장 공간'),(11,end,'큰 메모리에서 읽기 → 계산 → 다음 말')],
   'decode':[(0,8,'메모리에서 읽기 → 다음 토큰 계산'),(8,11,'토큰 = 나누어 처리하는 글자 단위'),(11,end,'작업에 따라 연산 성능이 제한이 되기도')],
   'numbers':[(2.7,10.5,'H200  ·  141 GB / 4.8 TB/s'),(10.5,14,'141 GB = 담는 양 / 4.8 TB/s = 옮기는 양'),(14,end,'메모리 ↔ GPU   (인터넷 속도와 다름)')],
   'daily':[(3.1,11.8,'데이터 공급 대기 감소 → 답변 생성에 도움'),(11.8,end,'정확도 상승·가격 인하를 보장하는 것은 아님')],
   'context':[(0,6,'긴 대화 → 보관할 정보 증가'),(6,12,'동시 사용자 증가 → 메모리 부담 증가'),(12,end,'빠른 연결 + 필요한 저장 공간')],
   'cost':[(0,5.5,'왜 내 PC에는 흔하지 않을까?'),(5.5,9,'정밀하게 쌓고 연결하기'),(9,14,'쌓기 전·후, 불량 검사'),(14,end,'복잡한 패키징 → 생산 난도·비용 증가')],
   'heat':[(0,6,'촘촘한 구조 → 열 배출 설계 필요'),(6,13.5,'연결당 효율 ≠ 시스템 전체 소비 전력'),(13.5,end,'적층 + 접합 + 냉각 + 안정성')],
   'makers':[(0,5,'메모리: SK하이닉스 · 마이크론 등'),(5,12,'메모리 + 계산칩 + 패키징'),(12,end,'전력·냉각까지 함께 맞추는 시스템')],
   'limits':[(0,4.5,'통로를 넓힌 다음에는?'),(4.5,10,'요리사 속도 · 다른 지점과 연락'),(10,end,'메모리 → 연산 → 서버 간 통신')]
  }
  for lo,hi,txt in sequences.get(name,[]):
   if short and len(txt)>22:
    k=txt.rfind(' ',0,len(txt)//2+4);txt=txt[:k]+r'\N'+txt[k+1:]
   label(lo,hi,txt,W/2,290 if not short else 520,fs)
 return ''.join(out)
