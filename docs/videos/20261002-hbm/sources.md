# 3탄 HBM — 사실·시각화 검토

확인일: 2026-10-02. 설명용 자체 3D이며 특정 칩의 실측 배치나 실험 장면이 아니다.

- [NVIDIA H200 공식 사양](https://www.nvidia.com/en-au/data-center/h200/): 141GB HBM3e, 4.8TB/s. 저장 용량과 메모리 대역폭을 구분한다. 인터넷 속도, 실제 모든 작업의 달성 속도, 최신 최고 사양이라고 표현하지 않는다.
- [NVIDIA: Inference Optimization](https://developer.nvidia.com/blog/mastering-llm-techniques-inference-optimization/): 추론의 메모리 접근·캐시와 최적화. 모든 AI 계산이 항상 메모리 병목이라는 단정을 피한다.
- [NVIDIA: Hardware-Friendly LLM Design](https://developer.nvidia.com/blog/ai-model-co-design-hardware-friendly-llm-design/): 낮은 동시성의 지연 민감 디코딩에서 메모리 접근이 중요하다는 설명 근거. 큰 배치·학습·연산 제한 구간과 구분한다.
- [SK hynix: TSV technology](https://news.skhynix.com/en/creating-new-values-in-dram-using-through-silicon-via-technology-for-continued-scaling-in-memory-system-performance-and-capacity/): 적층·TSV의 개념. TGV와 관통 재료/위치를 구분한다.
- [SK hynix–TSMC 협업](https://news.skhynix.com/sk-hynix-partners-with-tsmc-to-strengthen-hbm-technological-leadership/): 메모리 적층·베이스 다이와 로직/HBM 패키징 협업. 대표 기업을 짧게 언급하며 순위·투자 수익을 주장하지 않는다.
- [Micron HBM3E](https://www.micron.com/products/memory/hbm/hbm3e): 메모리 적층과 넓은 인터페이스, AI 활용. 제조사의 경쟁사 대비 효율 수치를 일반 사실로 옮기지 않는다.
- [Micron: HBM3E와 짧은 데이터 경로](https://www.micron.com/about/blog/applications/ai/microns-hbm3e-powering-the-future-of-ai-with-high-bandwidth-memory): 짧은 호스트–메모리 연결의 효율. 비트당 효율과 전체 시스템 소비 전력을 구분한다.
- [SK hynix 패키징 기술](https://news.skhynix.com/en/gyujei-lee-next-gen-packaging-tech-key-to-hbm-success/): 얇은 칩, 휨 제어, 방열 소재 등 적층 제조 난도.

## 표현과 장면 원칙

- 칩 옆 HBM 스택 → 인터포저 배선 → 연산 다이 구조를 보여준다. HBM을 GPU 위에 무조건 쌓는 것처럼 묘사하지 않는다.
- 주방·창고·통로와 움직이는 빛은 설명 비유/개념 표시다. 빛이 실제 전자 이동 속도, 통로 수가 실제 버스 폭이라고 주장하지 않는다.
- ‘기다림’은 가능한 병목 설명이다. GPU 전체가 완전히 멈춘다는 표현이나 특정 제품의 이용률 숫자를 만들지 않는다.
- HBM 교체로 정확도·서비스 요금이 자동 개선된다는 주장 금지. 성능은 워크로드·소프트웨어·네트워크 등에도 좌우된다.
- HBM의 필요성은 유리기판 채택을 전제하지 않는다. 시리즈 순서와 기술 도입의 필수 순서를 혼동하지 않는다.
- 기존 완성본은 보존. 이번 신규 편부터 환경·재질·카메라·9:16 전체 구도 기준을 적용한다.
