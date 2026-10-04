/** Daily Fortune content engine. Fortune computation is an independent upstream contract. */
import {createProject,validateScenes,fail,validateEdit,changeProject} from './studio.js';
import {cinematicEdit} from './cinematic-production.js';
const worlds={school:['학교','school classroom','친구','발표 자료를 고쳐보자.','선생님이 제목만 바꾸라고 하셨어.','함께 발표를 준비한다'],office:['회사','modern office','동료','시안을 수정해주세요.','고객이 색만 바꾸면 좋겠대요.','함께 시안을 완성한다'],store:['마트','supermarket aisle','매장 동료','진열을 바꿔주세요.','행사 상품 위치만 바꾸면 돼요.','함께 진열하고 손님을 맞는다'],home:['집','family dining room','가족','식탁을 정리해줄래?','함께 밥 먹을 자리를 만들고 싶어서.','함께 식탁을 준비한다'],community:['동네 모임','community center','모임 친구','계획을 조금 바꾸자.','걷기 편한 길로 바꾸자는 뜻이야.','함께 산책 계획을 정한다']};
export const FORTUNE_THEMES={communication:{label:'대화와 협력',summary:'오해가 생길 수 있지만 먼저 확인하면 함께할 기회가 열립니다.',tip:'혼자 짐작하기보다 먼저 한 번 물어보세요.'},focus:{label:'집중과 완수',summary:'여러 일을 벌이기보다 중요한 한 가지에 집중하면 성취를 느낄 수 있습니다.',tip:'오늘 꼭 끝낼 일 하나를 정해보세요.'},spending:{label:'소비와 균형',summary:'충동적인 지출을 잠시 미루면 필요한 것과 원하는 것을 구분할 수 있습니다.',tip:'구매하기 전에 필요한 이유를 한 번 적어보세요.'}};
const string=(v,max,label)=>{if(typeof v!=='string'||!v.trim()||v.length>max)fail(`${label}을 확인하세요.`);return v.trim().normalize('NFC');};
export async function digest(value){return [...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(value))))].map(n=>n.toString(16).padStart(2,'0')).join('');}
export function fortuneInput(input){
 if(!input||typeof input!=='object'||Array.isArray(input))fail('입력을 확인하세요.');
 const age=input.profile?.age;if(!Number.isInteger(age)||age<5||age>120)fail('나이를 확인하세요.');
 const p=input.profile;const life=p.life==='auto'?(age<20?'school':age>=65?'community':'office'):p.life;
 const setting=p.setting==='auto'?life:p.setting;if(!worlds[life]||!worlds[setting])fail('생활환경과 배경을 확인하세요.');
 const profile={name:string(p.name,20,'이름'),age,gender:string(p.gender,40,'성별'),hair:string(p.hair,100,'머리 스타일'),clothes:string(p.clothes,120,'옷차림'),life,setting};
 if(!['webtoon','motion','video'].includes(input.output))fail('웹툰·음성 영상·생성 영상 중 선택하세요.');
 const date=string(input.date,10,'날짜');if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||Number.isNaN(Date.parse(date))||new Date(date).toISOString().slice(0,10)!==date)fail('날짜를 확인하세요.');
 const theme=input.fortune?.theme;if(!Object.hasOwn(FORTUNE_THEMES,theme))fail('지원하는 운세 테마를 선택하세요.');
 const source=input.fortune?.source;if(!['example','provided'].includes(source))fail('계산된 사주 결과는 검증된 서버 어댑터로만 연결할 수 있습니다.');
 const definition=FORTUNE_THEMES[theme];
 const fortune={theme,source,summary:source==='example'?definition.summary:string(input.fortune.summary,500,'운세 원문'),tip:source==='example'?definition.tip:string(input.fortune.tip,200,'행동 팁')};
 return {profile,date,output:input.output,fortune};
}
export async function fortuneProject(input,owner){
 const value=fortuneInput(input),fingerprint=await digest({engine:'fortune-v1',owner,...value});
 const hash=fingerprint.slice(0,32),id=`${hash.slice(0,8)}-${hash.slice(8,12)}-${hash.slice(12,16)}-${hash.slice(16,20)}-${hash.slice(20)}`;
 const p=value.profile,w=worlds[p.setting],f=value.fortune;
 const identity=`Korean protagonist ${p.name}, age ${p.age}, gender ${p.gender}, hair ${p.hair}, clothes ${p.clothes}. Setting ${w[1]}. Preserve face, age, outfit and art style from the supplied character reference. Age-appropriate Korean webtoon illustration, expressive acting, no baked-in words, no logos.`;
 const narration=f.theme==='communication'?[`${w[0]}에서 ${w[2]}의 말. ${w[3]}`,`${p.name}은 자신을 탓하는 말로 받아들인다.`,`${p.name}은 오늘의 운세를 떠올린다. 먼저 확인해보자.`,`${p.name}은 묻는다. 어떤 부분을 바꾸면 좋을까요?`,`${w[2]}는 설명한다. ${w[4]}`,`${p.name}은 오해를 풀고 ${w[5]}.`]:f.theme==='focus'?[`${p.name}의 ${w[0]}에서 할 일이 한꺼번에 쌓인다.`,`${p.name}은 여러 일을 오가며 지친다.`,`오늘의 운세를 떠올린다. 중요한 하나에 집중하자.`,`${p.name}은 가장 중요한 일을 먼저 적는다.`,`${w[2]}와 역할을 나누고 하나씩 마무리한다.`,`작은 완수를 보고 ${p.name}은 미소 짓는다.`]:[`${p.name}은 ${w[0]}에서 할인 알림을 본다.`,`꼭 필요한지 모르지만 구매하고 싶은 마음이 든다.`,`오늘의 운세를 떠올린다. 잠시 미뤄보자.`,`${p.name}은 필요한 이유를 메모한다.`,`${w[2]}와 이야기하며 이미 가진 물건을 떠올린다.`,`구매를 미룬 ${p.name}은 여유로운 마음으로 하루를 마친다.`];
 narration[2]=`${p.name}은 오늘의 운세를 떠올린다. ${f.summary} ${f.tip}`;
 const actions=f.theme==='communication'?['Receiving peer feedback','Feeling worried about a misunderstanding','Remembering the daily theme on a phone','Asking a peer calmly','Listening to a friendly explanation','Collaborating with relief']:f.theme==='focus'?['Several tasks on a desk','Feeling distracted','Pausing and reflecting','Writing a single priority','Working alongside a peer','Feeling satisfied by a finished task']:['Seeing a shopping promotion','Hesitating before buying','Pausing before buying','Writing reasons in a notebook','Talking with a peer about already owned objects','Closing the shopping page with relief'];
 const project=createProject({category:'직접 입력',topic:`${p.name}의 오늘 · ${FORTUNE_THEMES[f.theme].label}`,format:'short',duration:36,direction:`${identity}\n오늘의 운세 원문: ${f.summary}\n행동 팁: ${f.tip}. 오락적 일상 이야기이며 예언·진단이 아니다.`,productionStyle:'cinematic'});
 project.id=id;project.brief.mediaProvider='higgsfield';project.visualStyle=identity;project.voicePreference='none';
 // Character sheet is generated first and omitted from the episode/video timeline.
 project.scenes=validateScenes([{id:'fortune-reference',kind:'image',duration:1,narration:'주인공 외형 참고 이미지',prompt:`${identity} Character reference sheet, single person front and three-quarter portrait, neutral plain background.`,shot:'medium',camera:'locked'},...narration.map((text,i)=>({id:`fortune-${i+1}`,narration:text,prompt:`${identity}\n${actions[i]}. Depict precisely: ${text}`,duration:6,kind:value.output==='video'?'video':'image',shot:['wide','close','detail','medium','medium','wide'][i],camera:'locked'}))]);
 const characterFingerprint=await digest({engine:'fortune-character-v1',owner,name:p.name,age:p.age,gender:p.gender,hair:p.hair,clothes:p.clothes});
 project.fortune={version:1,owner,input:value,fingerprint,characterFingerprint,referenceSceneId:'fortune-reference',sceneIds:narration.map((_,i)=>`fortune-${i+1}`),sourceStatus:f.source==='example'?'EXAMPLE':'USER_PROVIDED',paidAuthorization:null};
 return project;
}
export function fortuneGuard(project,action,body){
 if(!project.fortune)return;
 if(action==='publish')fail('운세 샘플에서는 외부 게시를 지원하지 않습니다.');
 if(['scenes','scenario'].includes(action))fail('운세 입력과 주인공을 바꾸려면 새 에피소드를 생성하세요.');
 if(action==='media'&&!project.fortune.paidAuthorization)fail('생성 제공자·크레딧 한도를 먼저 확인하세요.',428);
 if(action==='media'&&body.sceneId==='fortune-reference'&&project.fortune.sceneIds.some(id=>project.assets[id]))fail('기준 캐릭터 변경은 새 에피소드로 생성하세요.');
}
export function fortuneEdit(project){
 const episode={...project,scenes:project.scenes.filter(s=>project.fortune.sceneIds.includes(s.id)),voicePreference:project.voicePreference||'none',edit:null};
 return validateEdit(cinematicEdit(episode),project);
}

// Advance inside the persisted worker completion, even after the browser closes.
export function continueFortune(project){
 if(!project.fortune||project.task?.action!=='narration'||project.task.state!=='done')return project;
 const next={...project,edit:fortuneEdit(project)};
 return changeProject(next,'render',{});
}
