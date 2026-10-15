# Hanmadi 음악 음정·리듬 기술 검증 — 2026-10-15

## 결론과 다음 구현 기준

**음정·박자 추출의 로컬 실행 가능성을 확인했다. 반주가 섞인 원곡을 보컬 정답으로 삼는 자동 채점은 검증되지 않았고, 이번 시험에서 잘못된 기준이 될 수 있는 결과를 확인했다.** 관리자·학습 앱에 연결하거나 운영에 배포하지 않았다.

다음 M08 구현은 (1) 권리 확인된 파일 입력과 출처/분석 버전 보존, (2) 관리자에게 음정·박자 후보를 보여주고 기준 멜로디를 검수, (3) 검수된 단선율 기준과 사용자의 분리된 녹음을 비교하는 순서로 한다. 동기화 가사와 발음 평가는 별도 작업이다. 원곡의 단일 F0 추정이나 전체 BPM만으로 노래 점수를 만들지 않는다.

담당은 현재 Codex 단독. 구현 브랜치는 `spike/hanmadi-audio-feasibility`, 기준 `bf2bdfdc4f6dfa74003e0b4e606ba0da1fbd1973`(origin/main). 도구는 `tools/hanmadi-audio-proof/`. 기존 설계의 기술 검증 단계에 해당하며, 42개 기능 구현 완료를 뜻하지 않는다. 이전 HTML 설계 검토 페이지는 앞선 설계의 정적 사본이며 이 실험과 자동 동기화되지 않는다.

## 1. REA: Basic Pitch 배포물

| 항목 | 관찰 |
|---|---|
| 공식 배포물 | `@spotify/basic-pitch` **1.0.1**, npm metadata의 tarball URL로 취득 |
| tarball | 599,714 bytes, SHA-256 `8efee25e266e4a06bb2a8f3a86ad934179a2db2845c1544a9b2e43b37a74a874` |
| 무결성 | registry `dist.integrity` SHA-512와 실제 다운로드 일치 |
| 모델 | 포함된 shard 742,392 bytes, SHA-256 `b142a95737a52e1e412d5f92e73d8bb80dfe8d04941acc0702f11f4524fb377c` |
| REA | 6.4.0 CLI, Evidence `ev_2969d45a16a0eb138de0c844ad75b4df86eff9708ba0cd23395084ffdcfc6967` |
| 디렉터리 지문 | `6756f1f7464080505540f534244ce486c13e263d8e7986b817f9d6d0d2b6ae8c` |
| 범위 | 관련 파일 60, JS 파싱 40, AST 18,903 nodes, 파싱 실패 0. 배포물 내 JS/TS/map 정적 사실이며 모델 가중치의 의미나 런타임 정확도 검증이 아님 |
| 환경 | 기존 Swift/SDK 불일치는 프로세스 한정 `SDKROOT=.../MacOSX14.4.sdk` 사용. 전역 도구 설치/전환 없음 |

`src/inference.ts:150–184`는 22,050 Hz mono를 요구한다. AudioBuffer는 sample rate/channel을 검사하지만 Float32Array 경로에서는 호출자가 이미 변환했다고 가정한다. 즉 파일을 넘기기만 하면 자동 정규화되는 계약으로 구현하면 안 된다.

`src/inference.ts`의 `evaluateModel`은 frames/onsets/contours를 반환하고, `src/toMidi.ts:327` 이후 `outputToNotesPoly`는 onset/frame 임계치·최소 길이·주파수 범위 등으로 note event를 만든다. 이 결과에는 가사, 화자/보컬 식별, 발음 점수나 학습자 채점이 없다. 별도 어댑터와 기준이 필요하다는 자체 설계 판단이다.

패키지 LICENSE는 Apache-2.0. [공식 프로젝트](https://github.com/spotify/basic-pitch-ts)의 설명과 대조했다. 모델 추론은 **실행하지 않았다**. REA는 inert source 분석이며 정적 관계는 실행·성능 증거가 아니다. LR/Migaku·자막 SDK의 선행 조사와 마찬가지로 서버 알고리즘이나 상업곡 카탈로그 복원을 의미하지 않는다.

## 2. 실제 실행한 엔진·도구

Basic Pitch와 독립적으로 **librosa 0.11.0 pYIN + onset/beat_track**를 실행했다. librosa는 일반 공개 Python 소스·문서로 검토했으며 REA가 Python 알고리즘을 복원했다고 주장하지 않는다.

- Python 3.14.0 / macOS 15.1 arm64; NumPy 2.3.5, SciPy 1.16.3, Numba 0.63.1. FFmpeg로 mono 22,050 Hz float PCM 디코딩.
- pYIN: C2–C6, window 1,024 / hop 256 samples, 무성 프레임 null, RMS 1e-4 이하 제외. 확률·usable은 정답 신뢰도나 음성 판별 정확도가 아니다.
- 31개 의존성의 실제 버전을 lock 파일에 기록. 로컬 venv에서 기존 system packages를 참조했고 `pip check` 통과. 새 완전 격리 환경·다른 OS 실행은 미검증이다.
- 실제 모델/API 과금 0. YouTube 다운로드·오디오 추출·분리·확장 설치·운영 변경 없음.

참고: [pYIN 계약](https://librosa.org/doc/0.11.0/generated/librosa.pyin.html), [beat_track 계약](https://librosa.org/doc/0.11.0/generated/librosa.beat.beat_track.html), [librosa ISC license](https://github.com/librosa/librosa/blob/0.11.0/LICENSE.md). 패키지·모델·동봉 의존성 라이선스의 최종 배포 확인은 제품 통합 때 별도 수행한다.

## 3. 정답이 있는 합성 신호

| 사례 | 측정 결과 | 해석 |
|---|---|---|
| 220 / 261.63 / 329.63 / 440 Hz 각 1초, 반음 올린 버전 포함 | 8개 음 구간의 중앙 절대 오차 모두 0.001cent 미만, 각 구간 95백분위 최대 10.000002cent | 정수 반음 격자에 맞춘 깨끗한 정현파의 제한된 확인. 일반 가창 정확도가 아님 |
| 120BPM, 31개 타격음 | 120.1853BPM, onset 31개, 가장 가까운 onset 최대 오차 14.785ms | 정답 클릭에 대한 검사. 복잡한 곡·음절 타이밍 검증 아님 |
| 3초 무음 | 음정 0프레임, onset/beat 0, BPM 0 | 무음을 정상 음정으로 채점하지 않음 |
| 낮은 110Hz + 약한 목표 330Hz 혼합 | 추정 음정 중앙값 110Hz | 두 음원 중 목표 보컬을 선택하지 못한다는 반례 |

중요한 제한: 타격음 사례도 일부 프레임(9.72%)에 음정이 추정됐다. 지속 혼합음에는 onset 29개·143.55BPM이 반환됐다. 따라서 **음정/박자 값 존재 자체가 보컬·유효한 리듬·정답임을 입증하지 않는다.** 합성 음계의 오차를 제품 정확도 수치로 재사용하지 않는다.

## 4. 자체 제작 네 언어 연습곡

기존 자체 가사 + ElevenLabs 공식 Music API로 만든 파일이다. provenance는 `apps/hanmadi/public/study/music/README.md`, 입력 기준은 소스 `cc17c81cf8fe6cb78a68cbb3230d01adfddd0776`. 기존 파일을 읽었고 새 음원을 만들거나 변경하지 않았다. 네 파일 모두 512,462 bytes / 약 32.026초, 원본 SHA-256이 기존 README와 일치한다.

| 곡 | 실행 시간¹ | 음정 추정 프레임 비율² | 추정 BPM³ | 디코더 peak / 적용 gain |
|---|---:|---:|---:|---|
| 영어 | 5.377초 | 81.12% | 166.71 | 0.8160 / 1.0000 |
| 일본어 | 5.933초 | 80.50% | 156.61 | 1.1042 / 0.9057 |
| 태국어 | 5.596초 | 79.30% | 129.20 | 1.2175 / 0.8214 |
| 스페인어 | 5.245초 | 82.82% | 161.50 | 0.9535 / 1.0000 |

¹ 분석 함수 소요 시간; 라이브러리 초기 import, FFmpeg 디코딩, cold compile, 서버 네트워크·배포 비용 제외. 1회 측정이며 SLA나 브라우저 실시간 성능이 아니다.

² 알고리즘 결과와 RMS 문턱을 통과한 비율. 실제 보컬 검출률이나 정확도가 아니다. 영어는 유효 추정 중 **63.67%가 하한 C2의 20cent 이내**에 몰려, 그대로 멜로디 정답으로 사용하기 부적합한 징후다. 원인은 악기·옥타브·추정 하한 등 미분리 상태다.

³ 독립적으로 주석한 BPM/멜로디 정답이 없어 이 값이 맞는지 판정하지 않았다. 네 파일의 실행·JSON 산출 성공만 확인했다. 실제 사용자 마이크 녹음·보컬 분리·곡의 멜로디 검수는 미수행이다.

첫 run-1은 영어 성공 후 일본어 float PCM peak가 1을 넘어 입력 검사에서 실패했다. 가설은 정상 MP3 디코더 overshoot를 불량 PCM으로 취급한 경계 결함이었다. 원 peak와 적용 gain을 보존하며 균일 rescale하도록 수정했다. 원본은 바꾸지 않고 clipping도 하지 않았다. 회귀 검사와 run-2에서 4곡 모두 성공했다. run-1 증적도 보존한다.

## 5. 완료·남은 경계

- 완료: REA Basic Pitch 배포물 분석, 오프라인 검증 도구, 정답 신호/무음/경계/오류 보존 6개 검사, 자체 4곡 실행, 의존성 검사. 단일 파일 CLI는 실패 JSON+비정상 종료를 보존하고 기존 출력 덮어쓰기를 거부한다.
- M08 부분 확인: F0/onset/beat 원시값 생성. 제품 채점·기준 멜로디 승인·성능 최적화·마이크 정렬·브라우저 UI/E2E는 미완료.
- 자막/가사: Supadata·Musixmatch·LyricFind 실호출과 Pretender 가사 확보는 여전히 미검증. 이번에 조회한 root/reference worktree의 `.env*`에는 확인할 로컬 설정 파일이 없었다. 운영/비밀 저장소의 설정 부재를 뜻하지 않는다. 새 키 발급·유료 호출은 하지 않았다.
- 독립 문서인 기존 HTML 설계 페이지는 그대로이며 이 코드 PR은 별도 검토 대상이다. main 머지·배포는 수행하지 않는다.

## 6. 증거 위치·재현

보존 폴더: `/Users/admin/Library/Mobile Documents/com~apple~CloudDocs/gpt 작업/commerce-automation-kit/20261015-hanmadi-audio-proof/`

- `basic-pitch-metadata.json`, `basic-pitch.tgz`, 추출된 `basic-pitch/package/`
- `basic-pitch-rea.json`: SHA-256 `d2e53ecde7cd8688b66c4ed414ffcd239453228157f927ab543b5ddc78bf346b`
- `pip-report.json`: SHA-256 `d5cbcbe115d63b82dae35a7ce2173a28e2d78bbfd6badb1186fd832400e01629`
- `tests-final.log`, `run-1.log` 및 중단 시점 결과, `run-2.log`
- `run-2/summary.json`: SHA-256 `40790b29b233e7e3b769296aea7acfa8c4575634f49ee5dd1e272034cdd6ffe6`
- `run-2/`의 5개 합성 사례 + 4개 실곡 JSON: 프레임별 원시 추정·설정·입력 지문. 비밀값 없음. iCloud 동기화 완료까지 주장하지 않는다.

재현 명령은 [도구 README](../../tools/hanmadi-audio-proof/README.md). 고정된 입력·라이브러리·함수 설정에만 이 증거를 재사용한다.
