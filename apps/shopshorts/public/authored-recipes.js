import {GATESHEAD_ID,GATESHEAD_SCENES} from './gateshead-recipe.js';
import {typographyLines} from './video-typography.js';
// Reviewed data and fixed renderer IDs only; never accept executable source or paths.
export const RECIPE_ID='sapporo-hovering-v1';
export const RECIPE_TITLE='8,300톤짜리 축구장을 공기로 움직인다고?';
export const RECIPE_SCENES=[
  {
    "id": "hook",
    "narration": "팔천삼백 톤짜리 축구장이, 공기를 타고 움직입니다.",
    "prompt": "High angle Sapporo dome and full natural grass stage outside; slow glide into giant open side wall. Air gap only centimeters, never flying. The grass stage itself visibly translates relative to fixed paving and stationary roof. First frame modern title overlay: 8,300톤을 / 공기로 띄운다? visible3.8s.",
    "duration": 6,
    "kind": "video",
    "webtoon": {
      "artPrompt": "One continuous six second premium realistic architectural documentary shot, vertical 9:16. Preserve the provided Sapporo-inspired silver enclosed stadium and its giant rectangular natural grass tray. The enormous grass pitch translates very slowly a few meters toward the open SIDE of the stadium on its undercarriage. The silver roof stays fixed and closed. Camera smoothly descends and moves forward above the grass edge to reveal the immense scale. Late afternoon sunlight, tactile natural turf, subtle metallic reflections, realistic shadows. No flying platform, no roof opening, no impossible transformation, no glowing energy, no text, no labels, no logos. Mechanism is air-assisted wheel transport, only centimeter clearance.",
      "answer": "움직이는 것은 지붕이 아니라 천연잔디 경기장이다.",
      "layers": [
        {
          "id": "pitch",
          "label": "천연잔디",
          "meaning": "돔으로 들어가는 잔디판",
          "shape": "rect",
          "color": "#689447",
          "from": [
            50,
            75
          ],
          "to": [
            50,
            50
          ],
          "size": [
            65,
            45
          ],
          "start": 0,
          "end": 1,
          "motion": "move"
        }
      ]
    },
    "hybrid": {
      "renderer": "auto",
      "focus": "pitch",
      "depth": 8
    }
  },
  {
    "id": "sunlight",
    "narration": "일본 삿포로 돔은 지붕이 덮여 있죠. 그래서 진짜 잔디는 햇빛을 받도록 밖에서 키웁니다.",
    "prompt": "Sunlit outdoor grass stage beside roofed arena. Camera descends from roof edge toward detailed turf; maintain spatial continuity.",
    "duration": 7,
    "kind": "video",
    "hybrid": {
      "renderer": "3d",
      "authored": {
        "id": "sapporo-hovering-v1",
        "shot": "sunlight"
      }
    }
  },
  {
    "id": "load",
    "narration": "경기할 때는 잔디와 흙, 받침대까지 통째로 옮깁니다. 하지만 이 무게를 바퀴만으로 받치면 부담이 크겠죠.",
    "prompt": "Continuous close approach to turf tray edge, soil layer, structural ribs and wheel bogies; same pitch with fixed roof in background.",
    "duration": 7.5,
    "kind": "video",
    "hybrid": {
      "renderer": "3d",
      "authored": {
        "id": "sapporo-hovering-v1",
        "shot": "load"
      }
    }
  },
  {
    "id": "air",
    "narration": "받침대 밑 공간에 공기를 계속 불어 넣어 압력을 만듭니다. 이 압력이 넓은 바닥 전체를 위로 밀어, 하중의 약 구십 퍼센트를 받쳐 줍니다.",
    "prompt": "Conceptual half-section of same grass tray: blower sends air into bounded underfloor chamber, distributed rising arrows push tray up a few centimeters; not balloons. Detail schematic, actual rise7.5cm. Burn in a small legible Korean label: 원리 개념도 · 실제 상승7.5cm.",
    "duration": 10,
    "kind": "video",
    "hybrid": {
      "renderer": "3d",
      "authored": {
        "id": "sapporo-hovering-v1",
        "shot": "air"
      }
    }
  },
  {
    "id": "wheels",
    "narration": "무게가 사라진 게 아니라, 공기와 바퀴가 나눠 받는 거죠. 바퀴는 남은 하중을 받으면서 잔디판을 천천히 옮깁니다.",
    "prompt": "Detailed powered wheel and bogie with hub, drive unit, steel chassis; wheel rotates while entire platform translates along concrete. Air remains supporting, no mass vanishes.",
    "duration": 7.5,
    "kind": "video",
    "hybrid": {
      "renderer": "3d",
      "authored": {
        "id": "sapporo-hovering-v1",
        "shot": "wheels"
      }
    }
  },
  {
    "id": "ending",
    "narration": "지붕을 여는 대신, 잔디를 움직인 거죠. 햇빛이 필요한 잔디와, 날씨를 피하는 경기장을 함께 살린 선택입니다.",
    "prompt": "Return to wide contextual stadium. Pitch enters side opening while roof remains fixed, then camera settles on sunlit grass at threshold. Complete answer and1.5s hold; not looping cliffhanger.",
    "duration": 8.5,
    "kind": "video",
    "hybrid": {
      "renderer": "3d",
      "authored": {
        "id": "sapporo-hovering-v1",
        "shot": "ending"
      }
    }
  }
];
export const RECIPE_RESEARCH={"sources": [{"id": "venue", "url": "https://www.sapporo-dome.co.jp/dome/hovering/", "title": "시설 공식 호버링 스테이지 설명"}, {"id": "maker", "url": "https://global.kawasaki.com/en/corp/newsroom/news/detail/ba010801.html", "title": "Kawasaki Hovering Stage delivery technical description"}], "limitations": ["단면은 작동 원리를 위한 개념도이며 실제 제작 도면이 아닙니다."], "facts": [{"claim": "120×85m,8300t,7.5cm 상승,34개 바퀴,분당4m 이동. 지붕 아닌 측면 무빙월 개방.", "sourceIds": ["venue", "maker"]}, {"claim": "공기가 하중90%를 분담한다. 질량이90%줄어드는 뜻이 아니다.", "sourceIds": ["maker"]}]};
export function authoredSpec(value,scene){
 if(value===undefined)return undefined;
 const registered=value?.id===GATESHEAD_ID?GATESHEAD_SCENES:value?.id===RECIPE_ID?RECIPE_SCENES.filter(s=>s.id!=='hook'):[];
 const expected=registered.find(s=>s.id===value?.shot);
 if(!value||!expected||Object.keys(value).some(k=>!['id','shot'].includes(k))||scene.narration!==expected.narration||scene.prompt!==expected.prompt||scene.id!==expected.id)throw Object.assign(Error('검증된 건축 장면과 대본이 일치하지 않습니다. 새 내용에는 새 장면 설계가 필요합니다.'),{status:400});
 return {id:value.id,shot:value.shot};
}

// Registered narration uses complete semantic phrases, not a hard character cut.
export function authoredCaptionPhrases(scene){
 const parts=scene.id==='air'?[
  '받침대 밑 공간에 공기를 계속 불어 넣어 압력을 만듭니다.',
  '이 압력이 넓은 바닥 전체를 위로 밀어,',
  '하중의 약 구십 퍼센트를 받쳐 줍니다.'
 ]:scene.narration.match(/[^.!?]+[.!?]+/gu)?.map(s=>s.trim());
 if(!parts?.length||parts.join('').replace(/\s/gu,'')!==scene.narration.replace(/\s/gu,''))throw Error('등록 자막과 대본이 일치하지 않습니다.');
 return parts;
}

export function authoredCaptionLayout(text){
 const words=text.trim().split(/\s+/u);
 for(let size=62;size>=48;size--){
  if(typographyLines(text,size,880).length===1)return {text,size};
  const choices=words.slice(1).map((_,i)=>[words.slice(0,i+1).join(' '),words.slice(i+1).join(' ')]).filter(pair=>pair.every(line=>typographyLines(line,size,880).length===1));
  choices.sort((a,b)=>Math.abs(a[0].length-a[1].length)-Math.abs(b[0].length-b[1].length));
  if(choices.length)return {text:choices[0].join('\n'),size};
 }
 throw Error('자막을 의미 단위로 더 나누어 주세요.');
}
