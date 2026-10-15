export const GATESHEAD_ID="gateshead-tilting-v1";
export const GATESHEAD_TITLE="다리를 끊지 않고 배가 지나간다고?";
export const GATESHEAD_BRIEF={
  "category": "건축학",
  "topic": "게이츠헤드 밀레니엄 브리지는 다리를 끊지 않고 어떻게 배를 통과시킬까?",
  "direction": "이번 편은 사용자 승인으로 도입부터 전체 Blender 3D. Kyle 1.1배속, modern-v1 자막. 고정 길이로 설명을 잘라내지 않고 실제 TTS 길이에 맞춘다. 2026-10-14 승인.",
  "format": "short",
  "aspect": "9:16",
  "voiceId": "RU7aSi6lT4uQBXMLgDxK",
  "narrationSpeed": 1.1,
  "typography": "modern-v1",
  "duration": 66,
  "productionStyle": "blender",
  "workflow": "explainer-v1",
  "captionPosition": "bottom"
};
export const GATESHEAD_SCENES=[
  {
    "id": "hook",
    "duration": 6,
    "narration": "다리를 자르지도, 접지도 않았는데 배가 지나갑니다. 어떻게 가능한 걸까요?",
    "prompt": "첫 프레임부터 같은 다리 전체가 기울어 보행로 가운데가 올라간다. 물 위에서 접근하는 배와 강둑 양 끝을 동시에 보여준다. 첫 3.5초 질문 헤더: 다리를 끊지 않고 / 배가 지나간다고?",
    "kind": "video",
    "hybrid": {
      "renderer": "3d",
      "authored": {
        "id": "gateshead-tilting-v1",
        "shot": "hook"
      }
    }
  },
  {
    "id": "conflict",
    "duration": 9,
    "narration": "영국의 게이츠헤드 밀레니엄 브리지입니다. 지금 다리 앞에 멈춘 배를 보세요. 돛대가 낮은 보행로에 걸려 지나갈 수 없죠.",
    "prompt": "하나의 연속된 공간. 낮은 다리 위 보행자와 다리 앞에서 기다리는 같은 작은 선박. 배는 다리에 충돌하지 않고 멈춘다. 가까운 강둑에서 멀리까지 시선이 이어진다.",
    "kind": "video",
    "hybrid": {
      "renderer": "3d",
      "authored": {
        "id": "gateshead-tilting-v1",
        "shot": "conflict"
      }
    }
  },
  {
    "id": "structure",
    "duration": 10,
    "narration": "비밀은 보행로의 모양입니다. 위에서 보면 길이 옆으로 둥글게 휘어 있습니다. 그 위의 큰 아치는 케이블로 보행로를 지지하죠.",
    "prompt": "동일한 실제 형태를 참고한 자체 개념 모델: 수평으로 휘어진 보행로와 수직에 가까운 지지 아치, 그 사이의 케이블. 보행로를 따뜻한 색, 지지 아치를 밝은 청백색으로 구별. 카메라가 사선으로 이동해 두 평면을 보여준다.  위쪽 사선 시점에서 옆으로 휜 보행로와 양끝 사이의 직선 회전축을 함께 보여준다. 보행로 중앙이 축에서 옆으로 떨어져 있음을 짧은 민트색 보조선으로 표시한다.",
    "kind": "video",
    "hybrid": {
      "renderer": "3d",
      "authored": {
        "id": "gateshead-tilting-v1",
        "shot": "structure"
      }
    }
  },
  {
    "id": "tilt",
    "duration": 12,
    "narration": "유압 장치가 두 아치를 한 덩어리로 돌립니다. 양끝을 잇는 축은 그대로지만, 축에서 옆으로 떨어진 보행로 가운데는 위로 올라갑니다.",
    "prompt": "공통 부모가 세계 X축을 중심으로 회전한다. 양끝 X=-10,+10의 고정점을 잇는 선과 핀을 강조. 보행로·아치·케이블이 모두 한 강체로 함께 회전, 분리·스케일 변화 없음. 아래로 휘어진 수평 보행로 가운데가 올라가고 위 아치는 내려간다. 유압 구동은 양끝 지지부를 민트로 강조해 위치를 짚는다. 내부 구동부의 세부 형상은 이 영상의 설명 범위 밖이므로 임의의 피스톤 메커니즘을 그려 넣지 않는다.",
    "kind": "video",
    "hybrid": {
      "renderer": "3d",
      "authored": {
        "id": "gateshead-tilting-v1",
        "shot": "tilt"
      }
    }
  },
  {
    "id": "passage",
    "duration": 12,
    "narration": "보행로가 돛대보다 높아지자, 아까 멈췄던 그 배가 아래로 지나갑니다. 길을 끊어서 틈을 낸 게 아니라, 휘어진 길 전체를 기울여 높인 겁니다.",
    "prompt": "기울어진 다리를 고정. 앞에서 기다렸던 동일한 배 한 척이 가운데 보행로 아래로 통과한다. 물높이와 배 높이는 일정하고 다리만 이동해 확보한 여유를 보여준다. 배가 교량이나 케이블을 관통하지 않도록 실제 모델 위치를 검증한다.",
    "kind": "video",
    "hybrid": {
      "renderer": "3d",
      "authored": {
        "id": "gateshead-tilting-v1",
        "shot": "passage"
      }
    }
  },
  {
    "id": "limit",
    "duration": 6,
    "narration": "물론 아무 배나 통과하는 건 아닙니다. 열린 다리 아래에 들어갈 높이여야 하죠.",
    "prompt": "동일한 배가 완전히 빠져나가는 중이다. 통과 지점의 수면부터 열린 보행로 하부까지를 민트색 수직선으로 표시하고, 같은 수면 기준에서 이 배의 돛대 최고 높이를 짧은 눈금으로 함께 표시해 비교한다. 강바닥 기준을 쓰지 않는다. 구체적인 미터 수치는 넣지 않고 이 배는 통과하지만 더 높은 배는 보장하지 않는다는 한계를 표현한다. 배나 교량은 갑자기 크기가 달라지지 않는다.",
    "kind": "video",
    "hybrid": {
      "renderer": "3d",
      "authored": {
        "id": "gateshead-tilting-v1",
        "shot": "limit"
      }
    }
  },
  {
    "id": "return",
    "duration": 11,
    "narration": "배가 지나간 뒤 다리가 돌아오면 다시 사람이 건넙니다. 사람의 낮은 길과 배의 높은 길. 같은 자리에서 두 길을 번갈아 여는 겁니다.",
    "prompt": "동일 축을 중심으로 복귀하고, 완전히 낮아진 뒤에만 보행자를 보여준다. 선박은 다리에서 멀어진다. 마지막 0.4초까지 공간을 유지, 문장·음성을 절단하지 않는다.",
    "kind": "video",
    "hybrid": {
      "renderer": "3d",
      "authored": {
        "id": "gateshead-tilting-v1",
        "shot": "return"
      }
    }
  }
];
export const GATESHEAD_RESEARCH={
  "sources": [
    {
      "id": "source-1",
      "title": "WilkinsonEyre — Gateshead Millennium Bridge",
      "url": "https://wilkinsoneyre.com/projects/gateshead-millennium-bridge"
    },
    {
      "id": "source-2",
      "title": "Gateshead Council — Bridge design (검색 색인 본문 확인)",
      "url": "https://www.gateshead.gov.uk/article/4610/Bridge-design"
    },
    {
      "id": "source-3",
      "title": "LUSAS — Support Hinge Assemblies for the Gateshead Millennium Bridge",
      "url": "https://www.lusas.com/case/analyst/kvaerner.html"
    }
  ],
  "facts": [
    {
      "claim": "영국 게이츠헤드의 타인강 다리는 뉴캐슬 북쪽 강둑과 게이츠헤드 퀘이스를 연결하는 보행자·자전거 교량이다.",
      "sourceIds": [
        "source-1"
      ]
    },
    {
      "claim": "교량은 두 강철 아치로 구성되며 하나는 보행·자전거 데크이고 다른 하나는 지지 아치다.",
      "sourceIds": [
        "source-1"
      ]
    },
    {
      "claim": "두 아치는 공통 회전점을 중심으로 회전하여 선박이 아래로 통과할 수 있게 한다. 다리 전체가 기울어지며 넓은 아치 형태로 변화하는 동작을 설계자는 눈이 열리는 움직임에 비유한다.",
      "sourceIds": [
        "source-1"
      ]
    },
    {
      "claim": "운영기관의 교량 설계 설명에 따르면 보행·자전거 데크는 거의 수평으로 휘어진 곡선이며 지지 아치의 케이블에 매달려 있다. 교량은 하나의 강체로 기울고, 위 아치가 내려갈 때 보행로가 올라간다.",
      "sourceIds": [
        "source-2"
      ]
    },
    {
      "claim": "힌지 설계에 사용된 LUSAS의 실제 프로젝트 설명은 닫힌 상태에서 작은 배가 지나가지만 더 큰 배를 위해서는 두 아치 구조를 양끝 교대에서 회전시켜 아래 선박 통과 공간을 확보한다고 설명한다.",
      "sourceIds": [
        "source-3"
      ]
    },
    {
      "claim": "이 다리의 양 끝에서 데크와 아치는 같은 지지 힌지 조립체에 모인다. 유압 실린더가 축에 연결된 강철 패들을 밀어 전체 구조를 회전시킨다.",
      "sourceIds": [
        "source-3"
      ]
    }
  ],
  "limitations": [
    "현재 운영 일정, 특정 선박 통과 기록, 실제 개방 각도·무게·운항 높이는 확인하지 않았다.",
    "배 한 척의 접근→통과→복귀는 확인된 작동 원리를 설명하는 자체 재현이다. 실제 특정 운항 영상이 아니다.",
    "확보한 공간 안에 들어가야 통과한다는 설명은 기하학적 조건이며 실제 운항 승인 기준이나 최대 수치로 제시하지 않는다."
  ]
};
