# AI 기술 카드뉴스 — 텔레그램 일일 브리핑

매일 아침 AI 개발 도구의 공식 릴리스를 모아 한국어 카드(1080×1350)로 만들고 운영자 본인의
텔레그램 채팅에 앨범으로 보낸다. 같은 내용으로 릴스·쇼츠용 9:16 슬라이드(1080×1920)도 만든다.

2026-10-15 `hhj4861/wp-auto-blog`의 `wp-post/ai-news-card-bot`에서 이 저장소로 옮겼다.
콘텐츠 생성을 shopshorts 플랫폼 하나로 모으기 위해서다. 원본은 전환 후 14일 안정 운영을 확인한 뒤 삭제한다.

원본 대비 변경(2026-10-15 기준, 함수 AST 비교로 확인):
- 그대로: 발송(`send_telegram`)·원장(`delivery_*`, `mark_delivery`)·선택(`select_news`)·검증(`validate_edits`)·
  레이아웃(`base`, `fit`, `wrap`) 함수와 소스 목록, 프롬프트 문구. `render`는 TOP 3 정렬을 `ranked()`로 뺀 것만 다르다.
- 바뀜: 수집은 소스별 실패를 돌려주고 전 소스 실패를 오류로 본다. 편집은 OpenAI·Gemini API 키 대신
  카드뉴스 전용 ChatGPT 구독 로그인으로 Codex CLI를 실행한다(2026-10-15 사용자 결정, wp-auto-blog와 같은 방식).
- 추가: 실행 모드와 레거시 교차 확인, 9:16 슬라이드, 실패 경보(`alert.py`), 해시 고정 설치.

- 코드: `main.py`, 로그인 복원·저장 `codex_auth.py`, 경보 `alert.py`(표준 라이브러리만), 테스트 `test_main.py`,
  워크플로 `.github/workflows/ai-card-news.yml`
- 실행 위치: GitHub 호스티드 러너. Cloudflare Pages, D1, Mac 워커를 쓰지 않는다.
- 이 디렉터리는 Pages 배포(`public/`)와 shopshorts 테스트(`test/*.test.mjs`)에 포함되지 않는다.

## 수집과 편집

- 소스는 코드에 적힌 GitHub 공식 릴리스 10개 저장소와 OpenAI 공식 RSS뿐이다. 인기 순위를 주장하지 않는다.
- 릴리스의 `published_at`, RSS의 `published`만 쓴다. 최근 24시간 우선, 부족하면 72시간까지 본다.
- 프로젝트·URL·제목으로 중복을 없애고 최대 7건을 고른다. 없으면 보내지 않는다.
- 소스별 실패는 `news.json`/`status.json`의 `failures`와 Actions 경고로 남긴다. 11개 소스가 모두
  실패하면 "뉴스 없음"이 아니라 장애로 보고 실패 처리한다.
- 요약은 카드뉴스 전용 ChatGPT 구독 로그인으로 `codex exec`를 실행해 쓴다. API 키 과금 경로와 자동 대체 제공자는 없다.
  - Codex는 읽기 전용 샌드박스, 웹 검색·셸·앱·이미지 생성 꺼짐, `--ephemeral`, 사용자 설정 무시로 실행한다.
  - Codex에는 `PATH`, `HOME`, `LANG`, `SSL_CERT_FILE`, `CODEX_HOME`만 넘긴다. 텔레그램·GitHub 토큰은 넘기지 않는다.
  - 실패하면 CLI 출력 대신 고정된 원인 분류만 남긴다(`refresh_token_reused`, `usage_limit` 등).
  - 모델은 Codex 기본값이다. 바꾸려면 저장소 변수 `CARD_NEWS_CODEX_MODEL`을 쓴다.
  - 기록되는 제공자 값은 `codex-subscription`이다.
- Gemini 구독은 쓰지 않는다. wp-auto-blog와 shopshorts 계정 연결 모두 Gemini 구독 경로가 없다. 편집이 실패하면
  대체 없이 그날 실행이 실패하고 경보가 간다.
- 필드 길이·한국어·원문 매핑을 검증하고, 카드에 들어가지 않으면 잘라내지 않고 실패한다.

## 실행 모드

| 모드 | 언제 | 하는 일 |
|---|---|---|
| `dry_run` | 수동 실행에서 `dry_run=true`(기본값) | 카드·슬라이드 생성만. 텔레그램·태그·레거시 확인 없음 |
| `shadow` | `CARD_NEWS_CUTOVER_DATE`가 없거나 오늘(KST)보다 뒤 | 생성 + 봇 `getMe`, 채팅 `getChat` 읽기 확인 + 레거시 태그 읽기. 발송·태그 쓰기 없음 |
| `live` | 오늘(KST)이 전환일 이상 | 원장 확인 → 레거시 확인 → 생성 → 레거시 재확인 → claim 태그 → 앨범 1회 → sent 태그 |

- `live`는 `refs/heads/main`에서만 동작한다. 다른 브랜치에서 실행하면 발송 전에 실패한다.
- 섀도 실행은 `status.json`의 `chat_type`에 채팅 종류(`private`, `group`, `channel`)를 남긴다.
  `private`가 아니면 무인 발송이 "공개 발행"에 해당할 수 있으므로 전환 전에 다시 판단한다.
- 드라이런·섀도도 Codex로 요약하므로 구독 사용량을 쓴다.

## 설정

저장소 시크릿(Settings → Secrets and variables → Actions → Secrets).

| 이름 | 내용 | 필수 |
|---|---|---|
| `CARD_NEWS_CODEX_AUTH_JSON` | 카드뉴스 전용 ChatGPT 로그인의 `auth.json` 전체 | 예 |
| `CARD_NEWS_SECRET_WRITE_TOKEN` | 갱신된 로그인을 위 시크릿에 다시 저장하는 GitHub 토큰 | 아니오. 없으면 `ATOMWORKS_READ_TOKEN`을 쓴다 |
| `CARD_NEWS_TELEGRAM_BOT_TOKEN` | wp-auto-blog `TELEGRAM_BOT_TOKEN`과 같은 봇 토큰 | 예 |
| `CARD_NEWS_TELEGRAM_CHAT_ID` | wp-auto-blog `TELEGRAM_CHAT_ID`와 같은 채팅 ID | 예 |

### 발급 방법

1. **카드뉴스 전용 ChatGPT 로그인.** wp-auto-blog의 `CODEX_AUTH_JSON`을 복사하지 않는다. 같은 로그인을 두 곳에서
   쓰면 한쪽이 토큰을 갱신할 때 다른 쪽이 `refresh_token_reused`로 실패한다. 새로 로그인해 별도 세션을 만든다.
   ```sh
   export CARD_CODEX_HOME="$(mktemp -d)"
   CODEX_HOME="$CARD_CODEX_HOME" codex -c 'cli_auth_credentials_store="file"' -c 'forced_login_method="chatgpt"' login --device-auth
   CODEX_HOME="$CARD_CODEX_HOME" codex login status
   gh secret set CARD_NEWS_CODEX_AUTH_JSON -R hhj4861/commerce-automation-kit < "$CARD_CODEX_HOME/auth.json"
   rm -rf "$CARD_CODEX_HOME"; unset CARD_CODEX_HOME
   ```
   화면에 나오는 주소와 코드로 브라우저에서 ChatGPT 구독 계정에 로그인한다. `auth_mode`가 `chatgpt`가 아닌 파일은 거부한다.
   로컬 사본은 바로 지운다. 이후에는 Actions가 갱신본을 시크릿에 저장한다.
2. **갱신 저장 토큰.** GitHub → Settings → Developer settings → Personal access tokens → Fine-grained tokens.
   저장소는 `hhj4861/commerce-automation-kit` 하나만, 권한은 Repository permissions의 Secrets: Read and write만 준다.
   만료일을 정하고 만료 전에 교체한다. `gh secret set CARD_NEWS_SECRET_WRITE_TOKEN -R hhj4861/commerce-automation-kit`로 등록한다.
   **현재 운영 결정(2026-10-15):** 전용 토큰 대신 기존 fine-grained 토큰 `atomworks-ci-read`(시크릿 `ATOMWORKS_READ_TOKEN`)에
   이 저장소와 Secrets: Read and write 권한을 더해 함께 쓴다. `CARD_NEWS_SECRET_WRITE_TOKEN`이 등록돼 있으면 그쪽을 먼저 쓴다.
   같은 토큰을 드라마 CI도 쓰므로 그 토큰이 새면 이 저장소 시크릿도 바뀔 수 있다. 토큰을 교체하거나 권한을 줄일 때 카드뉴스도 함께 확인한다.
   이 토큰은 로그인 복원 단계와 종료 후 저장 단계에만 넘기고 Codex나 발송 단계에는 넘기지 않는다. 복원 단계는
   Codex 실행 전에 같은 로그인을 시크릿에 다시 써서 토큰의 쓰기 권한을 매번 확인한다. 저장은 일시 오류에 대비해 3회까지 시도한다.
3. **텔레그램.** 지금 카드를 받는 봇을 그대로 쓴다. @BotFather → `/mybots` → 봇 선택 → API Token에서 토큰을 본다.
   "Revoke current token"은 누르지 않는다(wp 카드봇과 쿠팡 답장 워커가 멈춘다). 1:1 채팅의 ID는 본인 텔레그램
   사용자 ID와 같다. 텔레그램 데스크톱 설정 → 고급 → 실험적 설정 → "Show Peer IDs in Profile"로 확인한다.

shopshorts 스튜디오의 계정 연결(ChatGPT·Claude)은 로그인 사용자별로 Mac 워커가 쓰는 경로다. 매일 무인으로 도는
카드뉴스는 그 경로를 쓰지 않는다. 각자 별도 로그인 세션이므로 서로의 토큰을 무효화하지 않는다.

저장소 변수(같은 화면의 Variables).

| 이름 | 값 | 의미 |
|---|---|---|
| `CARD_NEWS_SCHEDULE` | `on` | 매일 07:47 KST 예약 실행을 켠다. 없으면 수동 실행만 된다 |
| `CARD_NEWS_CUTOVER_DATE` | `YYYY-MM-DD` | 이 날짜(KST)부터 실제 발송한다. 없으면 섀도 |
| `CARD_NEWS_LEGACY_REPOSITORY` | 비움 또는 `off` | 비우면 `hhj4861/wp-auto-blog`를 교차 확인한다. wp 카드봇 삭제 뒤 `off` |

| `CARD_NEWS_CODEX_MODEL` | 비움 또는 모델 ID | 비우면 Codex 기본 모델 |

```sh
gh secret set CARD_NEWS_TELEGRAM_BOT_TOKEN -R hhj4861/commerce-automation-kit
gh secret set CARD_NEWS_TELEGRAM_CHAT_ID -R hhj4861/commerce-automation-kit
gh variable set CARD_NEWS_SCHEDULE --body on -R hhj4861/commerce-automation-kit
```

같은 Codex 로그인을 두 실행이 동시에 갱신하지 않도록, PR 테스트를 뺀 모든 실행은 한 줄로 대기한다
(`concurrency` + `queue: max`, wp-auto-blog와 같은 설정). 대기 중인 예약 실행이 뒤에 들어온 수동 실행에 밀려 취소되지 않는다.

다른 CAK 워크플로는 credential-broker로 키를 받지만, 이 잡은 우선 저장소 시크릿을 쓴다. 브로커로 옮기려면
브로커의 키 허용 정책을 바꿔야 하므로 별도 결정과 PR로 진행한다. 같은 봇 토큰을 wp-auto-blog의 쿠팡 답장
워커도 쓰므로 토큰을 교체할 때 두 저장소의 시크릿을 함께 바꾼다. 이 잡은 메시지 송신과 `getMe`/`getChat`만
호출하고 업데이트 수신이나 웹훅은 건드리지 않는다(테스트로 고정).

## 중복 방지

- 날짜 키는 실행 시작 시점의 KST 날짜다. 예약 실행과 수동 실행이 같은 키를 쓴다.
- 이 저장소의 `refs/tags/ai-card-claimed/<날짜>`를 발송 직전에 만들고, 텔레그램 성공 응답 뒤
  `refs/tags/ai-card-sent/<날짜>`를 만든다. 태그는 실행한 커밋만 가리키고 비밀값을 담지 않는다.
- sent가 있으면 정상 종료한다. claimed만 있으면 결과가 불확실하므로 자동 재전송하지 않고 실패한다.
- 텔레그램에는 멱등 키가 없어 "정확히 한 번"을 보장할 수 없다. 장애 시 **최대 한 번 시도**를 택한다.
- 레거시 교차 확인: 발송 전과 claim 직전에 `hhj4861/wp-auto-blog`의 같은 날짜 태그를 읽는다.
  먼저 저장소 자체를 읽을 수 있는지 확인한다(태그 없음과 접근 불가가 둘 다 404이기 때문). 그다음
  sent가 있으면 보내지 않고 정상 종료, claimed만 있으면 실패, 200/404 외 응답이면 보내지 않고 실패한다.
  wp-auto-blog 쪽 가드도 이 저장소의 태그를 같은 방식으로 확인한다.

## 전환 절차

전제: 이 PR과 wp-auto-blog 가드 PR이 머지됐고, 시크릿·`CARD_NEWS_SCHEDULE=on`이 설정됐다.

1. **섀도 3일 이상.** 매일 07:47 섀도 실행이 성공하고, 08:00 wp-auto-blog가 평소처럼 보내는지 본다.
   두 실행의 artifact `news.json`에서 고른 URL과 카드 수를 비교하고, `chat_type`을 확인한다.
   "Save refreshed Codex login" 단계가 매일 성공하는지(`unchanged` 또는 `saved`)도 본다.
2. **전환 전날(D-1) 10:00~20:00 KST, 이 순서대로.** 끄기를 먼저 하므로 최악의 경우에도 하루 빠질 뿐 중복은 없다.
   ```sh
   gh variable set CARD_NEWS_CUTOVER_DATE --body <D> -R hhj4861/wp-auto-blog
   gh workflow disable wp-post-ai-card-news.yml -R hhj4861/wp-auto-blog
   gh variable set CARD_NEWS_CUTOVER_DATE --body <D> -R hhj4861/commerce-automation-kit
   # 두 값이 모두 <D>인지 대조한다.
   gh variable get CARD_NEWS_CUTOVER_DATE -R hhj4861/wp-auto-blog
   gh variable get CARD_NEWS_CUTOVER_DATE -R hhj4861/commerce-automation-kit
   gh workflow run ai-card-news.yml --ref main -f dry_run=false -R hhj4861/commerce-automation-kit
   # 로그에 `mode=shadow cutover=<D>`가 찍혀야 한다. `cutover=unset`이면 변수가 빠진 것이다.
   ```
3. **전환일(D) 08:45 KST까지 확인.** CAK 로그가 `mode=live`이고 실행 성공, 채팅에 앨범 정확히 1개,
   CAK에 claimed·sent 태그 존재, wp-auto-blog에 그 날짜 태그 없음.
   - 실행이 `mode=shadow`로 끝났으면 CAK 변수를 고친 뒤 아래 명령으로 다시 실행한다.
   - 08:45까지 실행이 시작되지 않았으면
     `gh workflow run ai-card-news.yml --ref main -f dry_run=false -R hhj4861/commerce-automation-kit`.
     늦게 뜬 예약 실행과 겹쳐도 concurrency와 태그가 중복을 막는다.
4. **정리.** D부터 14일 연속 sent(또는 no_news)이고 불확실 0건이면 wp-auto-blog 카드봇 삭제 PR을 올린다.
   그때까지 원본은 비활성 상태로 남겨 아래 롤백에 쓴다. 삭제 PR이 머지되면
   `gh variable set CARD_NEWS_LEGACY_REPOSITORY --body off -R hhj4861/commerce-automation-kit`로 교차 확인을 끈다.
   이후 별도 PR로 `legacy_status`와 관련 테스트를 지운다. `ai-card-*` 태그는 양쪽 모두 감사 기록으로 보존한다.

### 장애와 롤백

- **claim 전에 실패**(CAK claimed 없음): 원인을 고쳐 다시 실행한다. 당일 복구가 어렵다면 wp로 한 번 보낸다.
  두 저장소가 동시에 실행되지 않게 CAK를 먼저 멈추고, 끝나면 되돌린다.
  ```sh
  gh workflow disable ai-card-news.yml -R hhj4861/commerce-automation-kit
  gh run list --workflow ai-card-news.yml -R hhj4861/commerce-automation-kit --limit 5   # 진행·대기 중 실행이 없어야 한다
  gh workflow enable wp-post-ai-card-news.yml -R hhj4861/wp-auto-blog
  gh workflow run wp-post-ai-card-news.yml -R hhj4861/wp-auto-blog -f force_legacy=true
  # 앨범 도착 확인 후
  gh workflow disable wp-post-ai-card-news.yml -R hhj4861/wp-auto-blog
  gh workflow enable ai-card-news.yml -R hhj4861/commerce-automation-kit
  ```
  wp 가드는 이 저장소에 그날 태그가 없음을 확인한 뒤 한 번만 보낸다.
- **claimed만 남음**(전송 불확실): 자동 재전송하지 않는다. 채팅에 앨범이 있으면 그대로 둔다. 없다고 확인된
  경우에만 `gh api -X DELETE repos/hhj4861/commerce-automation-kit/git/refs/tags/ai-card-claimed/<D>` 후 다시 실행한다.
  이 경우 wp `force_legacy`는 쓰지 않는다.
- **영구 롤백**: 이 저장소의 `CARD_NEWS_CUTOVER_DATE`를 먼저 지워 섀도로 돌린 뒤, wp-auto-blog 변수를 지우고
  워크플로를 다시 켠다. 두 쪽을 동시에 발송 상태로 두지 않는다.
- **Codex 인증 오류**(`refresh_token_reused`, `refresh_token_expired`, `auth_file_invalid`, `unauthorized` 등):
  위 발급 방법 1로 새 로그인을 만들어 `CARD_NEWS_CODEX_AUTH_JSON`을 다시 등록하고 실행한다. 같은 오류가 며칠 간격으로
  반복되면 갱신 저장이 실패하고 있는 것이니 시크릿 쓰기 토큰의 만료와 권한부터 확인한다. `usage_limit`이면
  구독 한도가 풀린 뒤, `network_or_service`면 잠시 뒤 다시 실행한다.
- **로그인 복원 단계 실패**("cannot write repository secrets"): 갱신 저장 토큰이 만료됐거나 Secrets 쓰기 권한이 없다.
  토큰에 이 저장소와 Secrets: Read and write가 있는지 확인하거나, 전용 토큰을 만들어 `CARD_NEWS_SECRET_WRITE_TOKEN`으로 등록한다.
  이때 로그인은 아직 갱신되지 않았으므로 그대로 쓸 수 있다.
- 경보: `alert.py`가 같은 채팅에 텍스트 경보 1건을 보낸다(실행 링크 포함, 비밀값 없음). 표준 라이브러리만 쓰므로
  설치·테스트 단계가 실패해도 동작한다.
  - 발송 실패는 live 모드에서만 알린다. 앨범이 이미 나간 뒤 기록 단계만 실패했으면 "다시 보내지 말라"는 문구로,
    날짜 변수 형식이 틀리면 설정 오류로 알린다.
  - 갱신된 Codex 로그인을 저장하지 못하면 모든 모드에서 알린다. 다음 실행이 인증 오류로 실패할 수 있기 때문이다.
  - 발송과 저장이 성공한 뒤 artifact 업로드만 실패한 경우는 알리지 않는다.

## 릴스·쇼츠용 9:16 슬라이드

- 매 실행 artifact의 `stories/story_NN.png`(1080×1920)와 `stories.json`이 생긴다. 표지, 중요도 순 상위 최대 5건, 마무리 순이다.
- 글자는 y 250~1440 안에만 둔다. 위 250px와 아래 480px는 플랫폼 UI와 스튜디오 자막 자리이고, 그 구간에는
  배경과 패널 가장자리(y 210~1460)만 있다(테스트로 고정).
- `stories.json`의 `narration`은 검증된 `headline`과 `summary`를 이어 붙인 것이다. 새 LLM 호출이 없다.
- 슬라이드 실패는 경고와 `stories.json`의 `status: failed`로 남고, 텔레그램 브리핑을 막지 않는다.
- 텔레그램으로는 보내지 않는다. 공개 업로드는 shopshorts 스튜디오의 사람 게이트 2개(대본 승인, 발행 확인)를 거친다.

스튜디오 시험 제작(새 코드 없음): 스튜디오에서 숏폼(9:16), cinematic, `explainer-v1` 프로젝트를 만들고
슬라이드마다 이미지 장면을 하나씩 둔다. 장면 설명에는 URL이나 "다운로드" 같은 단어를 넣지 않는다(외부 소스 lint).
대본을 승인한 뒤 PNG를 "직접 만든 파일"로 올리고, 내레이션 생성 → 렌더 → 검수 → 발행 순서로 진행한다.
원문 URL은 설명란에 넣는다. 첫 3건은 YouTube 비공개로만 올린다.

## 테스트

```sh
cd apps/shopshorts/card-news
python -m pip install --require-hashes -r build-requirements.txt
python -m pip install --require-hashes --no-build-isolation -r requirements.txt
python -m unittest -v test_main   # Linux는 fonts-noto-cjk 필요
# macOS: CARD_FONT=/System/Library/Fonts/AppleSDGothicNeo.ttc CARD_BOLD_FONT=/System/Library/Fonts/AppleSDGothicNeo.ttc
```

의존성을 바꿀 때는 `requirements.in`(또는 `build-requirements.in`)을 고치고
`uv pip compile requirements.in --generate-hashes --python-version 3.12 --universal -o requirements.txt`로 다시 만든다.
sgmllib3k는 sdist만 있어 빌드가 필요하다. 그래서 setuptools도 해시로 고정해 먼저 설치하고 빌드 격리를 끈다.

Secret 값, 텔레그램 요청 URL, 응답 원문은 로그에 남기지 않는다. 설정 누락은 이름만 출력한다.
