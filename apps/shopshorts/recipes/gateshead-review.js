// Exact integrated script independently reviewed through Codex.
export const review={
  "version": "explanation-depth-v1",
  "digest": "c150f5c8c2e577b299c0b29f331c2cd0bb269951e4428a3f6fdee167d20bed79",
  "checks": {
    "focus": {
      "pass": true,
      "reason": "배가 지나갈 공간을 다리를 끊지 않고 어떻게 만드는지 한 질문에 집중한다. 구조, 회전, 통과, 복귀가 모두 그 답에 연결된다.",
      "evidence": [
        {
          "sceneId": "hook",
          "field": "narration",
          "quote": "다리를 자르지도, 접지도 않았는데 배가 지나갑니다. 어떻게 가능한 걸까요?"
        },
        {
          "sceneId": "passage",
          "field": "narration",
          "quote": "길을 끊어서 틈을 낸 게 아니라, 휘어진 길 전체를 기울여 높인 겁니다."
        }
      ]
    },
    "why": {
      "pass": true,
      "reason": "같은 배의 돛대가 낮은 보행로에 걸려 멈춘다는 문제를 먼저 보여줘 다리를 움직여야 하는 이유가 분명하다.",
      "evidence": [
        {
          "sceneId": "conflict",
          "field": "narration",
          "quote": "지금 다리 앞에 멈춘 배를 보세요. 돛대가 낮은 보행로에 걸려 지나갈 수 없죠."
        }
      ]
    },
    "mechanism": {
      "pass": true,
      "reason": "옆으로 휜 보행로가 케이블로 지지되는 구조를 소개한 뒤, 유압 장치가 두 아치를 함께 회전시키면 고정된 축에서 떨어진 보행로 가운데가 올라간다는 인과를 설명한다.",
      "evidence": [
        {
          "sceneId": "structure",
          "field": "narration",
          "quote": "위에서 보면 길이 옆으로 둥글게 휘어 있습니다. 그 위의 큰 아치는 케이블로 보행로를 지지하죠."
        },
        {
          "sceneId": "tilt",
          "field": "narration",
          "quote": "유압 장치가 두 아치를 한 덩어리로 돌립니다. 양끝을 잇는 축은 그대로지만, 축에서 옆으로 떨어진 보행로 가운데는 위로 올라갑니다."
        }
      ]
    },
    "example": {
      "pass": true,
      "reason": "처음에 멈춘 배 한 척을 계속 따라가며, 보행로가 돛대보다 높아진 뒤 그 배가 통과하는 전후 차이를 설명한다.",
      "evidence": [
        {
          "sceneId": "conflict",
          "field": "narration",
          "quote": "지금 다리 앞에 멈춘 배를 보세요. 돛대가 낮은 보행로에 걸려 지나갈 수 없죠."
        },
        {
          "sceneId": "passage",
          "field": "narration",
          "quote": "보행로가 돛대보다 높아지자, 아까 멈췄던 그 배가 아래로 지나갑니다."
        }
      ]
    },
    "payoff": {
      "pass": true,
      "reason": "배의 통과와 다리의 복귀까지 마쳐 첫 질문에 답한다. 열린 다리 아래에 들어갈 높이의 배만 통과할 수 있다는 한계도 대사로 밝힌다.",
      "evidence": [
        {
          "sceneId": "limit",
          "field": "narration",
          "quote": "물론 아무 배나 통과하는 건 아닙니다. 열린 다리 아래에 들어갈 높이여야 하죠."
        },
        {
          "sceneId": "return",
          "field": "narration",
          "quote": "배가 지나간 뒤 다리가 돌아오면 다시 사람이 건넙니다. 사람의 낮은 길과 배의 높은 길. 같은 자리에서 두 길을 번갈아 여는 겁니다."
        }
      ]
    },
    "pacing": {
      "pass": true,
      "reason": "첫 문장에서 의외의 현상과 질문을 제시하고, 멈춤→구조→회전→통과→복귀 순서로 진행한다. 제공된 장면별 시간만으로 실제 TTS 적합성을 확정할 수는 없지만, 대본에는 긴 예고나 결말 절단이 없다.",
      "evidence": [
        {
          "sceneId": "hook",
          "field": "narration",
          "quote": "다리를 자르지도, 접지도 않았는데 배가 지나갑니다. 어떻게 가능한 걸까요?"
        },
        {
          "sceneId": "return",
          "field": "narration",
          "quote": "같은 자리에서 두 길을 번갈아 여는 겁니다."
        }
      ]
    },
    "visuals": {
      "pass": true,
      "reason": "첫 화면에 기울어지는 다리와 접근하는 배, 짧은 질문을 함께 제시한다. 이후 같은 배와 다리를 유지하며 회전축, 보행로의 상승, 통과 높이, 복귀를 화면 동작으로 보여주도록 계획했다. 실제 렌더 결과는 이 입력만으로 판정할 수 없다.",
      "evidence": [
        {
          "sceneId": "hook",
          "field": "prompt",
          "quote": "첫 프레임부터 같은 다리 전체가 기울어 보행로 가운데가 올라간다. 물 위에서 접근하는 배와 강둑 양 끝을 동시에 보여준다. 첫 3.5초 질문 헤더: 다리를 끊지 않고 / 배가 지나간다고?"
        },
        {
          "sceneId": "tilt",
          "field": "prompt",
          "quote": "보행로·아치·케이블이 모두 한 강체로 함께 회전, 분리·스케일 변화 없음. 아래로 휘어진 수평 보행로 가운데가 올라가고 위 아치는 내려간다."
        },
        {
          "sceneId": "passage",
          "field": "prompt",
          "quote": "앞에서 기다렸던 동일한 배 한 척이 가운데 보행로 아래로 통과한다. 물높이와 배 높이는 일정하고 다리만 이동해 확보한 여유를 보여준다."
        }
      ]
    }
  },
  "passed": true
};
