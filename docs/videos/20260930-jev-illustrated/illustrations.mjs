// Original vector characters, objects and choreography. Illustrative, not a real API session.
const P={paper:'#f7f2e7',ink:'#293b35',green:'#4f866d',light:'#c9ddbf',mint:'#dfebd8',orange:'#ce7958',peach:'#f4c4a0',gold:'#dfb453',purple:'#9581ae',lavender:'#e4dbea',gray:'#809085',white:'#fffdf7'};
const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]));
const clamp=x=>Math.max(0,Math.min(1,x));
const ease=x=>1-(1-clamp(x))**3;
const lerp=(a,b,p)=>a+(b-a)*p;
const tx=(s,x,y,size=25,color=P.ink,font='Jua')=>`<text x="${x}" y="${y}" text-anchor="middle" fill="${color}" font-size="${size}" font-family="${font}">${esc(s)}</text>`;
const path=(d,fill='none',stroke=P.ink,w=4)=>`<path d="${d}" fill="${fill}" stroke="${stroke}" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round"/>`;
const circle=(x,y,r,fill,stroke='none',w=4)=>`<circle cx="${x}" cy="${y}" r="${r}" fill="${fill}" stroke="${stroke}" stroke-width="${w}"/>`;
const rect=(x,y,w,h,fill,stroke=P.ink,r=12)=>`<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${r}" fill="${fill}" stroke="${stroke}" stroke-width="4"/>`;
const ellipse=(x,y,rx,ry,fill)=>`<ellipse cx="${x}" cy="${y}" rx="${rx}" ry="${ry}" fill="${fill}"/>`;
const group=(x,y,s,body,angle=0)=>`<g transform="translate(${x} ${y}) scale(${s}) rotate(${angle})">${body}</g>`;
const enter=(body,t,delay=0)=>`<g opacity="${ease((t-delay)/.6)}" transform="translate(0 ${24*(1-ease((t-delay)/.6))})">${body}</g>`;
const check=(x,y,s=1)=>group(x,y,s,circle(0,0,24,P.green)+path('M-11 0 L-3 9 L13 -10','none',P.white,5));
const question=(x,y,s=1)=>group(x,y,s,circle(0,0,29,P.white,P.ink)+tx('?',0,11,38,P.orange));
const sparkle=(x,y,t,s=1)=>group(x,y,s*(.8+.2*Math.sin(t*3)),path('M0 -17 Q2 -2 17 0 Q2 2 0 17 Q-2 2 -17 0 Q-2 -2 0 -17',P.gold,'none'));
function paper(x,y,s=1,t=0,marked=false){return group(x,y,s,rect(-33,-43,66,86,P.white)+path('M-19 -23H19 M-19 -9H12 M-19 5H19','none',P.gray,4)+(marked?check(13,28,.55):path('M-19 21H6','none',P.gray,4)),Math.sin(t)*3);}
function envelope(x,y,s=1,angle=0){return group(x,y,s,rect(-40,-27,80,54,P.white)+path('M-36 -22L0 5L36 -22 M-36 24L-10 1 M36 24L10 1','none',P.green,3),angle);}
function box(x,y,s=1,t=0){return group(x,y,s,path('M-42 -24L0 -46L43 -23L43 25L0 48L-42 24Z','#d9b27e')+path('M-42 -24L0 0L43 -23 M0 0V48 M-20 -35L23 -12V8', 'none',P.ink,3)+path('M21 -35L-21 -12', 'none','#f4dfad',9),Math.sin(t)*3);}
function person(x,y,s=1,t=0,{mood='happy',shirt=P.orange,wave=false,phone=false}={}){
 const bob=Math.sin(t*2)*2,arm=wave?Math.sin(t*3)*12:0;
 return group(x,y+bob,s,ellipse(0,105,61,10,'#dedbce')+path('M-24 46L-30 96 M22 46L30 96','none',P.ink,22)+path('M-41 104H-22 M20 104H42','none',P.ink,12)+path('M-38 -4Q0 -23 38 -4L46 56Q0 68 -46 56Z',shirt)+path('M-35 6Q-65 29 -50 53','none',shirt,21)+path(`M36 7Q${phone?66:69} ${wave?-27:32} ${phone?66:65} ${wave?-65+arm:49}`,'none',shirt,20)+circle(-50,54,10,P.peach,P.ink,3)+circle(phone?66:65,wave?-65+arm:49,10,P.peach,P.ink,3)+rect(-10,-44,20,30,P.peach)+circle(0,-74,43,P.peach,P.ink)+path('M-41 -78Q-49 -127 0 -123Q47 -124 44 -72L30 -83L23 -101Q0 -81 -31 -99L-35 -71Z',P.ink)+circle(-15,-72,3.5,P.ink)+circle(15,-72,3.5,P.ink)+(mood==='worried'?path('M-12 -47Q0 -57 12 -47')+path('M-24 -84L-9 -80 M10 -80L23 -86'):path('M-13 -53Q0 -40 14 -54'))+(phone?group(66,31,.7,rect(-21,-39,42,76,P.purple)+rect(-15,-29,30,49,P.white,'none',4)+circle(0,29,3,P.white),-12):''));
}
function robot(x,y,s=1,t=0,{type='jev',point=false,uncertain=false}={}){
 const col=type==='llm'?P.orange:P.green,bob=Math.sin(t*2)*3,blink=Math.sin(t*1.4)>.988;
 return group(x,y+bob,s,ellipse(0,123,71,12,'#dedbce')+path('M-27 71V107 M27 71V107','none',P.ink,15)+rect(-50,104,40,19,col)+rect(10,104,40,19,col)+rect(-55,-13,110,93,col)+rect(-38,10,76,42,P.white)+tx(type==='jev'?'Jev':'LLM',0,40,27,col)+path('M-54 9L-81 45','none',P.ink,13)+circle(-82,47,12,col,P.ink)+path(`M54 9L84 ${point?-21+Math.sin(t*3)*8:43}`,'none',P.ink,13)+circle(84,point?-21+Math.sin(t*3)*8:43,12,col,P.ink)+rect(-69,-112,138,91,P.light)+rect(-57,-96,114,59,P.white)+path('M0 -113V-133','none',P.ink,5)+circle(0,-142,10,P.gold,P.ink)+rect(-80,-85,12,36,col)+rect(68,-85,12,36,col)+(blink?path('M-32 -71H-15 M16 -71H33','none',P.ink,5):circle(-23,-72,6,P.ink)+circle(23,-72,6,P.ink))+path(uncertain?'M-11 -50L0 -54L11 -50':'M-12 -56Q0 -45 12 -56')+(type==='llm'?group(99,point?-7:54,1,path('M-7 -35L7 -35L7 30L0 42L-7 30Z',P.gold)+path('M-7 30H7')+path('M0 37V42','none',P.ink,4),32+Math.sin(t*4)*8):''));
}
function app(x,y,s=1,t=0){return group(x,y,s,ellipse(0,98,90,12,'#dedbce')+rect(-85,-97,170,140,P.purple)+rect(-70,-81,140,92,P.white)+path('M-45 -49H-11V-22H35 M-11 -49H43 M-11 -49V-69','none',P.purple,6)+circle(-45,-49,8,P.green)+circle(43,-49,8,P.gold)+circle(35,-22,8,P.orange)+circle(-11,-69,8,P.green)+rect(-92,43,184,45,P.lavender)+circle(-56,65,8,P.green)+circle(-27,65,8,P.gold)+circle(55,63,12,P.orange)+path(`M55 63L${55+Math.sin(t*2)*9} ${52+Math.cos(t*2)*4}`,'none',P.ink,4)+path('M-56 89V101 M56 89V101','none',P.ink,9));}
function server(x,y,s=1,t=0){return group(x,y,s,ellipse(0,92,74,10,'#dedbce')+[-60,-12,36].map((a,i)=>rect(-61,a,122,41,i===1?P.lavender:P.white)+circle(-41,a+20,5,Math.sin(t*3+i)>0?P.green:P.gold)+path(`M-19 ${a+14}H43 M-19 ${a+26}H43`,'none',P.gray,3)).join(''))}
function laptop(x,y,s=1,t=0){return group(x,y,s,rect(-87,-80,174,120,P.purple)+rect(-74,-65,148,90,P.ink)+path('M-95 42H95L121 72H-121Z',P.lavender)+path('M-58 -43L-73 -29L-58 -16 M56 -43L72 -29L56 -16 M15 -50L-4 -9','none',P.light,5)+path(`M-52 7H${-52+104*((t*.25)%1)}`,'none',P.gold,4));}
function house(x,y,s=1){return group(x,y,s,rect(-77,-27,154,126,P.white)+path('M-94 -25L0 -104L94 -25Z',P.orange)+rect(-15,24,47,75,P.green)+rect(-58,6,29,33,P.gold)+rect(39,6,27,33,P.gold)+circle(20,60,3,P.gold)+path('M-60 21H-29 M-44 6V39 M40 21H65 M52 6V39','none',P.ink,3));}
function truck(x,y,s=1,t=0){return group(x,y,s,rect(-112,-64,144,103,P.green)+path('M32 -35H77L110 1V39H32Z',P.gold)+path('M47 -21H73L93 0H47Z',P.white)+circle(-65,46,24,P.ink)+circle(72,46,24,P.ink)+circle(-65,46,11,P.white)+circle(72,46,11,P.white)+[-65,72].map(a=>group(a,46,1,path('M-7 0H7 M0 -7V7','none',P.gray,3),t*150)).join('')+group(-41,-13,.42,path('M-40 -25H40V25H-40Z',P.peach)+path('M0 -25V25')));}
function speech(x,y,s=1,icon='dots'){return group(x,y,s,path('M-57 -42H57Q76 -42 76 -23V21Q76 40 57 40H-29L-54 61L-49 40H-57Q-76 40 -76 21V-23Q-76 -42 -57 -42Z',P.white)+(icon==='?'?tx('?',0,16,49,P.orange):[-27,0,27].map(a=>circle(a,0,6,P.green)).join('')));}
function folder(x,y,s=1){return group(x,y,s,path('M-63 -33V-55H-14L2 -37H64V47H-63Z',P.gold)+path('M-64 -17H69L52 50H-64Z','#edd6a2'));}
function shield(x,y,s=1){return group(x,y,s,path('M0 -55L45 -39V-4Q45 34 0 57Q-45 34 -45 -4V-39Z',P.mint)+path('M-19 -3L-3 13L22 -18','none',P.green,7));}
function calendar(x,y,s=1){return group(x,y,s,rect(-53,-50,106,105,P.white)+rect(-53,-50,106,27,P.orange)+path('M-28 -63V-42 M28 -63V-42','none',P.ink,6)+check(0,15,1));}
function rail(points,color=P.gray){return path('M'+points.map(p=>p.join(' ')).join('L'),'none',color,4);}
function travel(points,t,delay=0,s=.55,kind='mail',duration=3){const p=((Math.max(0,t-delay)/duration)%1),dist=points.slice(1).map((a,i)=>Math.hypot(a[0]-points[i][0],a[1]-points[i][1])),total=dist.reduce((a,b)=>a+b,0);let rem=p*total,i=0;while(i<dist.length-1&&rem>dist[i])rem-=dist[i++];const q=dist[i]?rem/dist[i]:0,x=lerp(points[i][0],points[i+1][0],q),y=lerp(points[i][1],points[i+1][1],q);return kind==='box'?box(x,y,s,t):kind==='dot'?circle(x,y,9,P.gold,P.ink,2):envelope(x,y,s);}
const ground=(y=1086)=>ellipse(360,y,304,37,'#e9e5d8');
const name=(s,x,y,color=P.ink)=>tx(s,x,y,25,color);
const heads=['판단하는 AI','두 AI의 역할','앱 만들기','함께 일하는 구조','상황을 모으기','판단 돌려받기','갈림길 선택','응답 전달','택배는 어디에?','사과 답장 쓰기','애매하면 물어보기','세 역할의 조합'];
export function illustratedFrame(scene,t,index,scenes,total){
 const v=scene.visual,progress=(scenes.slice(0,index).reduce((a,s)=>a+s.duration,0)+t)/total;
 let b='',foot='개념 설명 애니메이션';
 const p=clamp(t/scene.duration);
 if(v==='concept'){
  b=ground(550)+robot(360,382,1.32,t,{point:true})+envelope(111,301+Math.sin(t*2)*14,.8,-12)+paper(604,336,.8,t)+sparkle(570,212,t)+sparkle(159,430,t,.7);
  const route=[[100,861],[298,861],[365,903],[549,1008]];
  b+=rail(route)+travel(route,t,0,.55)+box(155,1012,1,t)+paper(361,1010,1.1,t,true)+speech(568,1010,.7)+name('분류',155,1140)+name('점수',360,1140)+name('판단',568,1140)+group(360,847,1,rect(-115,-23,230,46,P.green,'none',23)+circle(-79,0,13,P.gold)+circle(0,0,13,P.white)+circle(79,0,13,P.orange));
 }else if(v==='roles'){
  b=ground(551)+robot(187,362,1.22,t,{point:true})+robot(528,362,1.22,t,{type:'llm',point:true})+box(117,953,.9,t)+box(233,990,.8,t)+paper(474,966,1.2,t)+group(540+Math.sin(t*3)*18,958+Math.sin(t*6)*10,1,path('M-7 -44H7V31L0 47L-7 31Z',P.gold),35)+check(201,844,.9)+sparkle(560,851,t);
 }else if(v==='build'){
  b=ground(547)+person(163,387,1.1,t,{shirt:P.green})+laptop(348,421,1.08,t)+robot(570,394,.74,t,{type:'llm'})+name('Claude Code · Codex',375,219)+paper(584,250,.6,t)+sparkle(381,274,t);
  const r=[[245,902],[361,902],[465,902]];
  b+=rail(r)+travel(r,t,0,.5)+app(160,947,1.02,t)+robot(570,943,.83,t,{point:true})+name('완성된 앱',160,1128,P.purple)+name('Jev API',570,1128,P.green)+group(363,1047,1,path('M-16 -24L-33 0L-16 24 M16 -24L33 0L16 24','none',P.purple,7));
 }else if(v==='architecture'){
  const r1=[[161,366],[274,366]],r2=[[402,343],[526,343]],r3=[[531,419],[431,419]],branch=[[360,478],[360,544],[678,544],[678,789],[358,789]];
  b=rail(r1)+rail(r2)+rail(r3,P.gold)+rail(branch,P.purple)+travel(r1,t,0,.4)+travel(r2,t,.6,.4)+travel(r3,t,1,.4)+travel(branch,t,0,.25,'dot',4)+person(99,386,.62,t,{phone:true})+app(342,379,.71,t)+robot(591,376,.67,t)+name('사용자',99,533)+name('앱',342,533,P.purple)+name('Jev',591,533,P.green);
  b+=rail([[113,790],[113,875]])+rail([[359,790],[359,856]])+rail([[597,790],[597,864]])+rail([[113,790],[597,790]],P.purple)+server(113,952,.87,t)+robot(359,958,.7,t,{type:'llm',point:true})+person(595,961,.72,t,{shirt:P.green,wave:true})+name('도구',113,1130)+name('LLM',359,1130,P.orange)+name('사람',595,1130);
  const sel=Math.floor(t/2)%3;b+=circle([113,359,597][sel],818,9,P.gold,P.ink,2);
 }else if(v==='state'){
  b=person(149,386,1.15,t,{phone:true})+speech(166,231,.67)+folder(528,350,1.12)+paper(535+Math.sin(t)*8,264,.82,t)+shield(536,479,.64)+ground(1101)+app(360,967,1.16,t);
  const r=[[84,486],[42,528],[42,847],[250,893]],q=[[570,479],[671,528],[671,846],[475,891]];
  b=rail(r)+rail(q)+travel(r,t,0,.5)+travel(q,t,1,.5)+b+question(568,974,.87)+name('상황',183,1138)+name('기준',541,1138);
 }else if(v==='decision'){
  b=ground(558)+robot(360,370,1.35,t,{point:true})+paper(136,367,.83,t)+question(584,355,.85);
  b+=group(166,950,1,rect(-61,-76,122,155,P.white)+check(0,-21,1.1)+path('M-32 27H32 M-32 46H13','none',P.gray,5));
  b+=group(371,983,1,[[-40,90],[-2,49],[36,25]].map(([x,h],i)=>rect(x,35-h*ease(t-.5),24,h*ease(t-.5),[P.green,P.gold,P.orange][i],'none',7)).join(''));
  b+=group(562,950,1,path('M-62 24A64 64 0 0 1 62 24','none',P.light,19)+path(`M0 24L${49*Math.cos(-2.6+ease(t-1)*1.8)} ${24+49*Math.sin(-2.6+ease(t-1)*1.8)}`,'none',P.ink,5)+circle(0,24,9,P.gold,P.ink));
  b+=name('선택',165,1129)+name('확률',371,1129)+name('확신도',563,1129);foot='그래프·계기는 개념 표현';
 }else if(v==='route'){
  b=ground(547)+app(360,373,1.55,t)+shield(587,405,.8);
  const roads=[[[359,777],[359,824],[118,894]],[[359,777],[359,888]],[[359,777],[359,824],[594,894]]];
  b+=roads.map(r=>rail(r,P.purple)).join('')+travel(roads[Math.floor(t/2.6)%3],t,0,.53,'mail',2.6)+server(119,1000,.75,t)+robot(360,1008,.63,t,{type:'llm',point:true})+person(592,1007,.64,t,{wave:true,shirt:P.green})+name('조회',119,1150)+name('작성',360,1150)+name('확인',592,1150);
 }else if(v==='response'){
  b=ground(556)+server(130,402,1,t)+robot(358,396,1,t,{type:'llm',point:true})+paper(590,397,1,t,true)+rail([[197,365],[265,365]])+travel([[197,365],[265,365]],t,0,.4)+sparkle(573,240,t);
  const r=[[172,949],[388,949],[459,906]];
  b+=rail(r)+travel(r,t,0,.65)+app(138,955,.8,t)+person(541,964,1,t,{phone:true})+speech(566,795,.6)+check(466,864,.7);
 }else if(v==='example_lookup'){
  b=person(152,405,1.14,t,{phone:true,mood:p<.65?'worried':'happy'})+speech(251,244,.69,'?')+app(476,401,.94,t)+robot(610,496,.36,t);
  const r=[[252,355],[367,355]];b+=rail(r)+travel(r,t,0,.45)+ground(1139)+path('M44 1103H672','none',P.gray,4)+house(556,1007,1.0);
  const x=lerp(159,328,ease((t-1)/5));b+=truck(x,1031,.84,t)+(p>.55?enter(box(454,1073,.57,t),t,scene.duration*.55):'')+calendar(558,823,.72)+check(326,834,.85);foot='가상 주문·조회 결과';
 }else if(v==='example_write'){
  b=ground(553)+robot(263,371,1.25,t,{type:'llm',point:true})+paper(548,381,1.2,t)+group(555+Math.sin(t*4)*13,395+Math.cos(t*6)*9,.7,path('M-7 -48H7V25L0 41L-7 25Z',P.gold),32)+box(112,448,.7,t);
  const r=[[204,932],[362,932],[469,902]];b+=rail(r)+travel(r,t,0,.7)+envelope(136,972,1.4,-8)+person(558,958,1,t,{shirt:P.green,phone:true})+check(464,804,1)+name('담당자 검토',546,1141);foot='가상 답장 초안';
 }else if(v==='ambiguous'){
  b=person(157,398,1.14,t,{mood:'worried',phone:true})+speech(168,230,.66,'?')+robot(538,394,1.14,t,{uncertain:true})+question(384,375,.8)+box(363,517,.48,t);
  b+=ground(1103)+person(550,970,1,t,{shirt:P.green,wave:true})+speech(192,929,1.35,'?')+envelope(342,1048,.65,Math.sin(t*2)*8)+group(361,839,1,circle(0,0,34,P.orange)+path('M-10 -16V16 M10 -16V16','none',P.white,7));
 }else{
  b=ground(554)+robot(129,408,.85,t,{point:true})+robot(361,408,.85,t,{type:'llm',point:true})+app(592,402,.91,t)+name('Jev',129,226,P.green)+name('LLM',361,226,P.orange)+name('앱',592,226,P.purple)+sparkle(247,299,t,.7)+sparkle(474,307,t+1,.7);
  b+=ground(1100)+person(361,964,1.22,t,{shirt:P.green,wave:true})+box(120,983,.94,t)+envelope(588,955,1.25,-8)+check(596,831,.85)+paper(117,823,.75,t,true);
 }
 return `<svg xmlns="http://www.w3.org/2000/svg" width="720" height="1280" viewBox="0 0 720 1280"><rect width="720" height="1280" fill="${P.paper}"/>${tx('JEV',73,70,23,P.green)}${tx(String(index+1).padStart(2,'0')+' / 12',634,70,19,P.gray)}${tx(heads[index],360,139,37)}${b}${tx(foot,360,1211,16,P.gray,'NanumGothic')}<rect x="48" y="1254" width="${624*progress}" height="4" rx="2" fill="${P.green}"/></svg>`;
}
