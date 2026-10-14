// Fixed-script independent review; changes invalidate its digest.
export const review={
  "version": "explanation-depth-v1",
  "digest": "086104f4102ef02100e2505d0b3259b8ee9f5b3b2a99bdfe9d4072e9f8cad67f",
  "checks": {
    "focus": {
      "pass": true,
      "reason": "중심 질문은 ‘8,300톤의 잔디 경기장을 공기로 어떻게 움직이는가’로 유지됩니다. 밖에서 키우는 이유, 통째로 옮길 때의 하중 문제, 공기의 지지와 바퀴의 이동 역할이 이 질문의 선행 설명으로 연결됩니다. 결말도 잔디를 움직이는 선택의 의미로 돌아와 별도 주제로 이탈하지 않습니다.",
      "evidence": [
        {
          "sceneId": "hook",
          "field": "narration",
          "quote": "팔천삼백 톤짜리 축구장이, 공기를 타고 움직입니다."
        },
        {
          "sceneId": "wheels",
          "field": "narration",
          "quote": "무게가 사라진 게 아니라, 공기와 바퀴가 나눠 받는 거죠. 바퀴는 남은 하중을 받으면서 잔디판을 천천히 옮깁니다."
        }
      ]
    },
    "why": {
      "pass": true,
      "reason": "지붕이 덮인 경기장과 햇빛이 필요한 잔디의 조건을 먼저 설명하고, 잔디를 밖에서 키우므로 경기 때 옮겨야 한다는 필요성을 제시합니다. 잔디뿐 아니라 흙과 받침대까지 이동한다는 설명이 바퀴의 하중 부담으로 이어져 공기 보조가 필요한 이유를 납득할 수 있습니다.",
      "evidence": [
        {
          "sceneId": "sunlight",
          "field": "narration",
          "quote": "일본 삿포로 돔은 지붕이 덮여 있죠. 그래서 진짜 잔디는 햇빛을 받도록 밖에서 키웁니다."
        },
        {
          "sceneId": "load",
          "field": "narration",
          "quote": "경기할 때는 잔디와 흙, 받침대까지 통째로 옮깁니다. 하지만 이 무게를 바퀴만으로 받치면 부담이 크겠죠."
        }
      ]
    },
    "mechanism": {
      "pass": true,
      "reason": "받침대 아래에 공기를 계속 공급하는 행동에서 압력 형성, 넓은 바닥을 위로 미는 힘, 하중 약 90% 지지, 바퀴의 나머지 하중 지지와 이동으로 인과가 이어집니다. 공기가 직접 수평으로 추진하거나 질량을 줄이는 것으로 설명하지 않으며, 제공 근거의 하중 분담과도 일치합니다.",
      "evidence": [
        {
          "sceneId": "air",
          "field": "narration",
          "quote": "받침대 밑 공간에 공기를 계속 불어 넣어 압력을 만듭니다. 이 압력이 넓은 바닥 전체를 위로 밀어, 하중의 약 구십 퍼센트를 받쳐 줍니다."
        },
        {
          "sceneId": "wheels",
          "field": "narration",
          "quote": "무게가 사라진 게 아니라, 공기와 바퀴가 나눠 받는 거죠. 바퀴는 남은 하중을 받으면서 잔디판을 천천히 옮깁니다."
        }
      ]
    },
    "example": {
      "pass": true,
      "reason": "삿포로 돔의 같은 잔디판을 밖에서 키우는 상태부터 흙·받침대와 함께 이동하는 과정까지 따라갑니다. 바퀴만으로 받칠 경우의 부담과 공기가 하중을 분담하는 작동 상태가 같은 대상에 적용됩니다. 사례 이름이나 비유만 제시하지 않고 실제 구성물과 작동을 연결합니다.",
      "evidence": [
        {
          "sceneId": "sunlight",
          "field": "narration",
          "quote": "일본 삿포로 돔은 지붕이 덮여 있죠. 그래서 진짜 잔디는 햇빛을 받도록 밖에서 키웁니다."
        },
        {
          "sceneId": "load",
          "field": "narration",
          "quote": "경기할 때는 잔디와 흙, 받침대까지 통째로 옮깁니다."
        },
        {
          "sceneId": "air",
          "field": "narration",
          "quote": "이 압력이 넓은 바닥 전체를 위로 밀어, 하중의 약 구십 퍼센트를 받쳐 줍니다."
        }
      ]
    },
    "payoff": {
      "pass": true,
      "reason": "공기는 하중을 받치고 바퀴가 옮긴다는 답을 준 뒤, 고정된 지붕 아래로 잔디를 이동시키는 이유로 마무리합니다. 첫 장면의 ‘공기를 타는 축구장’을 하중 분담 장치로 다시 이해하게 합니다. 잔디 생육과 경기장 이용이라는 의미를 제시하되 비용·속도 향상 등을 보장하지 않으며, 계속되는 공기 공급과 바퀴의 역할로 작동 조건도 설명합니다.",
      "evidence": [
        {
          "sceneId": "air",
          "field": "narration",
          "quote": "받침대 밑 공간에 공기를 계속 불어 넣어 압력을 만듭니다."
        },
        {
          "sceneId": "wheels",
          "field": "narration",
          "quote": "무게가 사라진 게 아니라, 공기와 바퀴가 나눠 받는 거죠."
        },
        {
          "sceneId": "ending",
          "field": "narration",
          "quote": "지붕을 여는 대신, 잔디를 움직인 거죠. 햇빛이 필요한 잔디와, 날씨를 피하는 경기장을 함께 살린 선택입니다."
        }
      ]
    },
    "pacing": {
      "pass": true,
      "reason": "첫 화면의 질문과 첫 대사의 의외성이 즉시 도입을 만들고, 필요성→하중 문제→압력 지지→바퀴 이동→결말 순서에 인과 점프가 없습니다. 계획 합계 46.5초는 목표 48초 안이며, 제공된 실측 구간은 지정된 음성 뒤 여유를 포함해 각 계획에 들어갑니다. air의 두 문장은 10초 계획에서 명백한 과밀로 판단할 근거가 없으므로 대본 단계에서는 합격입니다. 다만 수정된 air와 전체 타임라인의 최종 시간 적합성은 아직 검증되지 않았습니다.",
      "evidence": [
        {
          "sceneId": "hook",
          "field": "narration",
          "quote": "팔천삼백 톤짜리 축구장이, 공기를 타고 움직입니다."
        },
        {
          "sceneId": "air",
          "field": "narration",
          "quote": "받침대 밑 공간에 공기를 계속 불어 넣어 압력을 만듭니다. 이 압력이 넓은 바닥 전체를 위로 밀어, 하중의 약 구십 퍼센트를 받쳐 줍니다."
        },
        {
          "sceneId": "ending",
          "field": "narration",
          "quote": "지붕을 여는 대신, 잔디를 움직인 거죠. 햇빛이 필요한 잔디와, 날씨를 피하는 경기장을 함께 살린 선택입니다."
        }
      ]
    },
    "visuals": {
      "pass": true,
      "reason": "화면 계획은 같은 잔디판의 외부 위치, 받침대 단면, 공기 공급과 상승, 바퀴 회전 및 전체 이동, 측면 진입을 이어 보여줍니다. 고정된 지붕과 바닥을 기준으로 움직임을 확인하게 하며, 첫 화면에는 무음으로도 대상과 질문을 읽을 수 있는 제목이 지정되어 있습니다. 개념도 표시도 포함되어 있습니다. 이는 계획의 합격이며 실제 렌더의 연속성·가독성·동작 구현을 확인한 판정은 아닙니다.",
      "evidence": [
        {
          "sceneId": "hook",
          "field": "prompt",
          "quote": "The grass stage itself visibly translates relative to fixed paving and stationary roof. First frame modern title overlay: 8,300톤을 / 공기로 띄운다? visible3.8s."
        },
        {
          "sceneId": "air",
          "field": "prompt",
          "quote": "Conceptual half-section of same grass tray: blower sends air into bounded underfloor chamber, distributed rising arrows push tray up a few centimeters; not balloons. Detail schematic, actual rise7.5cm. Burn in a small legible Korean label: 원리 개념도 · 실제 상승7.5cm."
        },
        {
          "sceneId": "wheels",
          "field": "prompt",
          "quote": "Detailed powered wheel and bogie with hub, drive unit, steel chassis; wheel rotates while entire platform translates along concrete. Air remains supporting, no mass vanishes."
        },
        {
          "sceneId": "ending",
          "field": "prompt",
          "quote": "Return to wide contextual stadium. Pitch enters side opening while roof remains fixed, then camera settles on sunlit grass at threshold. Complete answer and1.5s hold; not looping cliffhanger."
        }
      ]
    }
  },
  "passed": true
};
