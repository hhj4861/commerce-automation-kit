// Original vector characters, objects and choreography. Illustrative, not a real API session.
const P={paper:'#f7f2e7',ink:'#293b35',green:'#4f866d',light:'#c9ddbf',mint:'#dfebd8',orange:'#ce7958',peach:'#f4c4a0',gold:'#dfb453',purple:'#9581ae',lavender:'#e4dbea',gray:'#809085',white:'#fffdf7'};
const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]));
const clamp=x=>Math.max(0,Math.min(1,x));
const ease=x=>1-(1-clamp(x))**3;
const lerp=(a,b,p)=>a+(b-a)*p;
const tx=(s,x,y,size=25,color=P.ink,font='NanumGothic')=>`<text x="${x}" y="${y}" text-anchor="middle" fill="${color}" font-size="${size}" font-family="${font}">${esc(s)}</text>`;
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
 return group(x,y+bob,s,ellipse(0,105,61,10,'#dedbce')+path('M-24 46L-30 96 M22 46L30 96','none',P.ink,22)+path('M-41 104H-22 M20 104H42','none',P.ink,12)+path('M-38 -4Q0 -23 38 -4L46 56Q0 68 -46 56Z',shirt)+path('M-35 6Q-65 29 -50 53','none',shirt,21)+path(`M36 7Q${phone?66:69} ${wave?-27:32} ${phone?66:65} ${wave?-65+arm:49}`,'none',shirt,20)+circle(-50,54,10,P.peach,P.ink,3)+circle(phone?66:65,wave?-65+arm:49,10,P.peach,P.ink,3)+rect(-10,-44,20,30,P.peach)+circle(0,-74,43,P.peach,P.ink)+path('M-41 -78Q-49 -127 0 -123Q47 -124 44 -72L30 -83L23 -101Q0 -81 -31 -99L-35 -71Z',P.ink)+circle(-15,-72,3.5,P.ink)+circle(15,-72,3.5,P.ink)+(mood==='neutral'?path('M-12 -49H12'):mood==='worried'?path('M-12 -47Q0 -57 12 -47')+path('M-24 -84L-9 -80 M10 -80L23 -86'):path('M-13 -53Q0 -40 14 -54'))+(phone?group(66,31,.7,rect(-21,-39,42,76,P.purple)+rect(-15,-29,30,49,P.white,'none',4)+circle(0,29,3,P.white),-12):''));
}
function robot(x,y,s=1,t=0,{type='helper',point=false,uncertain=false}={}){
 const col=type==='llm'?P.orange:P.green,bob=Math.sin(t*2)*3,blink=Math.sin(t*1.4)>.988;
 return group(x,y+bob,s,ellipse(0,123,71,12,'#dedbce')+path('M-27 71V107 M27 71V107','none',P.ink,15)+rect(-50,104,40,19,col)+rect(10,104,40,19,col)+rect(-55,-13,110,93,col)+rect(-38,10,76,42,P.white)+circle(0,29,12,P.gold,P.ink,3)+path('M-54 9L-81 45','none',P.ink,13)+circle(-82,47,12,col,P.ink)+path(`M54 9L84 ${point?-21+Math.sin(t*3)*8:43}`,'none',P.ink,13)+circle(84,point?-21+Math.sin(t*3)*8:43,12,col,P.ink)+rect(-69,-112,138,91,P.light)+rect(-57,-96,114,59,P.white)+path('M0 -113V-133','none',P.ink,5)+circle(0,-142,10,P.gold,P.ink)+rect(-80,-85,12,36,col)+rect(68,-85,12,36,col)+(blink?path('M-32 -71H-15 M16 -71H33','none',P.ink,5):circle(-23,-72,6,P.ink)+circle(23,-72,6,P.ink))+path(uncertain?'M-11 -50L0 -54L11 -50':'M-12 -56Q0 -45 12 -56')+(type==='llm'?group(99,point?-7:54,1,path('M-7 -35L7 -35L7 30L0 42L-7 30Z',P.gold)+path('M-7 30H7')+path('M0 37V42','none',P.ink,4),32+Math.sin(t*4)*8):''));
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
function travel(points,t,delay=0,s=.55,kind='mail',duration=3){const p=((Math.max(0,t-delay)/duration)%1),dist=points.slice(1).map((a,i)=>Math.hypot(a[0]-points[i][0],a[1]-points[i][1])),total=dist.reduce((a,b)=>a+b,0);let rem=p*total,i=0;while(i<dist.length-1&&rem>dist[i])rem-=dist[i++];const q=dist[i]?rem/dist[i]:0,x=lerp(points[i][0],points[i+1][0],q),y=lerp(points[i][1],points[i+1][1],q);return kind==='box'?box(x,y,s,t):kind==='document'?paper(x,y,s,t):kind==='dot'?circle(x,y,9,P.gold,P.ink,2):envelope(x,y,s);}

export {P,esc,clamp,ease,tx,path,circle,rect,ellipse,group,enter,check,question,sparkle,paper,envelope,box,person,robot,app,server,laptop,house,truck,speech,folder,shield,calendar,rail,travel};
