# shared-ai 호스팅 비용·운영 비교 — 2026-10-10

## 결론과 판단 범위

현재는 Cloud Run 최소 인스턴스 0 + 절전 가능한 외부 DB를 우선 검증한다. 최저가 확정이 아니라, 기존 컨테이너·GCP 권한·배포 자산을 재사용하면서 유휴 컴퓨팅을 줄이는 후보라는 뜻이다. 상시 CPU·백그라운드 작업이 필수라면 이미 축소한 e2-small VM 유지가 더 경제적일 수 있다. 기존 Vercel Pro의 미사용 크레딧이 있다면 Vercel도 비용 경쟁력이 있다.

이번 변경은 분석 문서뿐이다. 다른 플랫폼 배포·구독 변경·VM 중지·운영 전환을 실행하지 않았다. 승인된 Phase 2 측정과 별개이며 해당 측정의 완료를 의미하지 않는다.

## 실제 확인한 기준

- 개인 GCP 프로젝트 replay-live-508202의 shared-ai는 RUNNING, e2-small이다. 연결 디스크 shared-ai-data는 80 GiB pd-balanced, 외부 IP 설정 1개다(2026-10-10 읽기 전용 조회).
- 따라서 비교 기준은 이전 e2-standard-2의 추정 $60가 아니다. e2-small 컴퓨팅은 730시간 × $0.016752855 = 약 $12.23, 80 GiB balanced 디스크를 $0.10/GiB-month로 계산하면 $8, 사용 중 IPv4 $0.005/h를 적용하면 $3.65, 합계 약 $23.88다. 할인·크레딧·세금·스냅샷·전송·기존 edge 비용을 제외한 정가 계산이며 실제 청구서가 아니다.
- 기존 DB 로그에서 2026-09-27~10-09 날짜별 호출 수는 30,125,573,175,321,116,47,100,61,94,79,17,2였다. 짧은 기간·시험 트래픽·미완료 날짜가 섞였으며 전체 HTTP 트래픽이나 정상 한 달 사용량을 대표하지 않는다.
- Cloud Run 스테이징은 LiteLLM 1 vCPU/1 GiB와 edge 1 vCPU/0.5 GiB, min=0이다. 기능 확인과 절전 사전 관측은 통과했지만 콜드 지연·종료 시 기록 보존·24시간 비용 게이트 전체가 끝난 것은 아니다.
- Vercel Pro/Workers Paid의 실제 구독 여부, 남은 공용 크레딧, 계정 전체 Cloud Run 무료량 소진 여부는 미확인이다. 무료량을 이 서비스만 독점한다고 가정하지 않는다.

## 같은 역할의 서비스 비교

| 안 | LiteLLM 실행 방식 | 비용 구조 | 주요 조건·이전 부담 |
|---|---|---|---|
| 현재 GCE VM | 기존 Docker + 같은 VM PostgreSQL | 요청이 없어도 컴퓨팅·디스크·IP 비용 | 이전 작업 최소, 백그라운드 실행 용이. OS·백업·복구 운영 필요. 2 GiB 자원 여유와 장애 복구는 별도 검증 |
| Cloud Run | 기존 OCI 이미지, 현재 GCP 운영 자산 재사용 | 요청 기반은 요청 처리 시간의 할당 CPU·RAM 과금. min=0 유휴 축소 | 콜드 시작과 DB 재접속, 응답 후 사용 기록 저장·예산 초기화 검증 필요. edge와 LiteLLM 양쪽 비용 포함 |
| Vercel Services / Container Functions | Dockerfile/컨테이너 지원. Services는 Functions 과금·제약 적용 | Active CPU + 요청 중 RAM + 호출·전송. Pro $20/월, $20 사용 크레딧 포함 | 단순히 Docker 미지원으로 제외하면 안 됨. 컨테이너를 올려도 상시 데몬이 되지 않음. 종료·백그라운드·요청 제한 및 현재 LiteLLM 호환성 미실측. Services beta |
| Cloudflare Containers | Worker + 컨테이너 + Durable Object | Workers Paid $5/월부터, 실제 CPU + 실행 중 할당 RAM·디스크, Worker/DO/전송 별도 | basic은 0.25 vCPU/1 GiB, 1 vCPU는 6 GiB. 기동 시간·sleep·배치·수명주기 검증과 배포 재작성 필요 |
| 관리형 AI Gateway로 LiteLLM 대체 | 기존 게이트웨이 기능을 다른 제품으로 대체 | 서버·DB 운영을 줄일 가능성, 제품별 과금 | JEV TypeSafe 경로, Gemini native, TTS/STT, 가상 키·팀별 예산·로그·기존 API 계약의 동등성 미확인. 지금의 단순 호스팅 이전과 다른 프로젝트 |

Workers/Pages 정적 호스팅 무료 가격을 LiteLLM 전체 서버 가격과 비교하지 않는다. Vercel/Cloudflare에 옮겨도 PostgreSQL 비용은 별도로 필요하다. 프런트엔드와 AI 서버를 같은 회사에 둘 의무도 없다.

## 저사용량 예시: 단가가 총비용으로 이어지는 과정

아래는 예측 청구서가 아니라 산식 비교다. 월 5,000회, 요청당 10초, 비중첩, 실제 앱 CPU 0.1초/요청을 가정한다. 콜드 시작·CPU boost·재시도·전송·빌드·로그 비용은 제외하므로 이를 전체 견적으로 쓰면 안 된다. DB는 별도이며 동일 성능을 측정한 벤치마크도 아니다.

| 안 | 예시 계산 | 구독·무료량을 반영한 해석 |
|---|---|---|
| Cloud Run 2단 경로 | 100,000 vCPU-s × $0.000024 + 75,000 GiB-s × $0.0000025 + 10,000회 × $0.40/백만 = $2.5915 | 계정 무료량이 충분하면 이 요청 처리분은 $0. 부족하면 최대 위 정가. 시작·종료 비용 추가 |
| Vercel 단일 서비스, RAM 2 GB 가정 | 500 CPU-s × $0.128/3600 + 100,000 GB-s × $0.0106/3600 + 5,000회 × $0.60/백만 = 약 $0.315 | Pro 신규면 플랫폼 $20가 출발점이고 사용량은 크레딧에서 차감. 기존 Pro에 크레딧이 남으면 추가 청구 $0 가능. 서비스 간 호출·네트워크 등 제외 |
| Cloudflare basic, 월 실행 50시간 가정 | CPU 500초는 포함량 이내, RAM (50−25) GiB-h × $0.009 = $0.225, 디스크 4×50=200 GB-h는 포함량 이내 | 신규 Workers Paid $5 + 컨테이너 초과분 $0.225. Worker/DO 등 별도. 50시간은 유휴 대기를 포함한 가정이며 실제 sleep 정책에 따라 증가. 0.25 vCPU에서 동일 속도는 보장 안 됨 |

이 예시에서는 Cloud Run과 기존 Pro의 추가 비용 차이가 수 달러보다 작다. 새 플랫폼 이전·검증 비용까지 감안하면 그 차이만으로 재이전할 근거가 약하다. 반면 대기 시간이 긴 대량 스트리밍에서는 Vercel/Cloudflare의 실제 CPU 과금이 유리할 수 있어 요청 수만으로 Cloud Run 우위를 일반화할 수 없다.

## 가장 큰 변수: DB와 상시 실행

Neon Launch의 $0.106/CU-hour, 저장 $0.35/GB-month로 0.25 CU 고정·데이터 1 GB를 가정하면:

- 하루 3시간, 월 90시간 활성: $2.385 + $0.35 = 약 $2.74.
- 월 730시간 상시 활성: $19.345 + $0.35 = 약 $19.70.

복구 이력·추가 분기·전송 등은 별도다. 실제 CU 자동확장·여러 DB/compute를 합산해야 한다. 스테이징 Free를 운영 비용 $0의 근거로 쓰지 않는다. LiteLLM 하트비트·보온 ping이 DB 절전을 막는다면 서버보다 DB가 더 비싸질 수 있다.

상시 실행 시 Cloud Run도 자동으로 싸지지 않는다. instance 기반 1 vCPU/1 GiB를 730시간 유지하면 무료량 전 정가 약 $52.56다. 요청 기반 min=1의 유휴 CPU+RAM만 계산하면 약 $13.14지만, 이것이 상시 CPU 실행을 보장하는 설정은 아니다. 여기에 활성 요청·DB 비용이 붙는다. VM의 shared-core와 성능이 같은 비교도 아니다.

Cloudflare basic을 730시간 유지하면 CPU를 제외해도 기본료+RAM+디스크는 약 $12.03다. 1 vCPU인 standard-2는 6 GiB RAM/12 GB 디스크여서 같은 계산이 약 $46.35다. CPU·Worker/DO·DB는 추가다. 가장 작은 SKU가 LiteLLM의 기동·동시 요청 요구를 만족하는지 확인해야 한다.

기존 계획의 Cloud SQL 약 $9.4도 인스턴스·최소 디스크 중심 추정이다. 백업·IP·가용성·지원되는 구성까지 포함한 견적 전에는 확정 상한이나 Neon과의 정확한 손익분기점으로 쓰지 않는다.

## 권장 최적화 순서

1. 이미 축소한 VM을 기준선으로 유지하고, 현재 승인된 Cloud Run min=0 검증을 마친다. 스테이징의 기능 성공만으로 운영 전환하지 않는다.
2. 24시간 관측에서 DB 활성 시간/CU-hour, Cloud Run 기동·요청 비용, 콜드 첫 응답, 사용 기록 누락·예산 갱신을 함께 판정한다. 보온은 측정 실험 외 기본 활성화하지 않는다.
3. 모든 이전 대상(LiteLLM뿐 아니라 discovery/accounts 및 남은 VM 서비스)을 포함한 총비용이 현재 약 $24 정가 기준보다 충분히 낮고 기능 게이트를 통과하면 Cloud Run을 채택한다. 월 $10 이하를 내부 목표로 제안하되 보장이나 기존 승인 조건으로 취급하지 않는다.
4. 상시 실행·DB 상시 활성화가 필요해 비용 우위가 없어지면 작은 VM 유지가 기본 대안이다. 수 달러 절약을 위해 여러 플랫폼에 운영 체계를 새로 만드는 작업은 보류한다.
5. 기존 Vercel Pro에 여유 크레딧이 있고 장기적으로 Vercel에 운영을 통합할 계획이라면 Container Functions의 한정 호환성 PoC를 차순위로 검토한다. Cloudflare는 이미 Workers Paid를 쓰거나 높은 전송량·긴 I/O 대기가 주요 비용일 때 후보 우선순위를 높인다. 현재 둘 다 새 배포를 실행하지 않았다.
6. VM을 실제 폐기하기 전까지 VM 고정비와 새 서버리스 비용은 함께 발생한다. LiteLLM만 이전한 뒤 VM 비용 전체를 절감액으로 계산하지 않는다. 디스크·정적 IP 보존 비용과 백업도 종료 계획에 포함한다.

공통 총비용식: 플랫폼 기본료 + 컴퓨팅 + DB + 네트워크 + 저장·백업 + 시크릿·로그·빌드 + 기존 VM 잔존 비용. 동일 모델 호출 비용은 플랫폼 비교에서 공통으로 별도 취급하되 재시도 증가분은 포함한다. 인력·장애 대응·추가 이전 비용도 최종 선택에 반영한다.

## 출처와 검증 한계

2026-10-10 공식 자료 확인. 미국 리전 USD, 세금 제외. 현재 계정 청구서·할인·남은 크레딧·Vercel/Cloudflare 실배포 성능은 미확인이다.

- [GCE 정가](https://cloud.google.com/products/compute/pricing/general-purpose), [디스크](https://cloud.google.com/compute/disks-image-pricing), [IP·네트워크](https://cloud.google.com/vpc/network-pricing)
- [Cloud Run 과금](https://cloud.google.com/run/pricing), [과금 모드](https://docs.cloud.google.com/run/docs/configuring/billing-settings)
- [Vercel Services](https://vercel.com/docs/services), [Services 가격·제약](https://vercel.com/docs/services/pricing), [Fluid 단가](https://vercel.com/docs/functions/usage-and-pricing), [Pro](https://vercel.com/docs/plans/pro-plan)
- [Cloudflare Containers 가격·SKU·Worker/DO 별도 과금](https://developers.cloudflare.com/containers/platform/pricing/)
- [Neon CU 단가 인하](https://neon.com/blog/major-compute-price-reduction-on-neon), [최소 요금 제거 갱신](https://neon.com/blog/new-usage-based-pricing), [Neon 공식 계획 원문](https://github.com/neondatabase/website/blob/main/content/docs/introduction/plans.md)
- 로컬 증적: `docs/qa/20261009-serverless-phase2-handoff.md`, 기존 계획 `docs/20261009-shared-ai-serverless-migration-plan.md`(운영 worktree f84182f).
