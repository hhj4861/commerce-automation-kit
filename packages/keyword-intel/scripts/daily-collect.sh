#!/bin/bash
# 매일 자동 수집 + 텔레그램 리포트 — launchd(09:30 KST)가 실행. 수동 실행도 동일:
#   bash scripts/daily-collect.sh
# 설계: 예산 게이트·DLQ·재시도가 코드에 있으므로 스크립트는 얇게. 실패해도 다음 단계 진행,
# 모든 출력은 data/daily.log 에 남긴다(수집 JSON stdout 은 SQLite 에 있으므로 버림).
set -u
# cd 실패 시(경로 이동·권한 문제) 잘못된 디렉토리에서 수집이 돌면 안 된다 — 즉시 중단.
cd "$(dirname "$0")/.." || { echo "[daily] cd 실패 — 중단" >&2; exit 1; }

# nvm 노드 로드 (launchd 는 로그인 셸 PATH 가 없다)
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"
export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"

mkdir -p data
# 로그 로테이션: 5MB 초과 시 1세대 보관(무한 성장 방지)
LOG=data/daily.log
if [ -f "$LOG" ] && [ "$(stat -f%z "$LOG" 2>/dev/null || echo 0)" -gt 5242880 ]; then
  mv "$LOG" "$LOG.old"
fi
{
  echo "=== daily-collect $(date '+%Y-%m-%d %H:%M:%S %Z') ==="
  # 네트워크(DNS) 준비 대기(1차 방어선): launchd 는 머신 wake 직후에도 실행되는데 그 시점엔 DNS 가
  # 아직 안 올라와 있을 수 있다. 실측 2026-07-24 09:37: 기존 `nc -z` 프로브가 통과했으나(첫 시도
  # 성공) 직후 undici 182건 전량 ENOTFOUND. 원인은 해석 경로 차이가 아니라(nc 도 getaddrinfo 사용)
  # **단발 프로브의 타이밍** — wake 전이 순간에 한 번 통과해버린 것. 그래서 (1) 앱과 동일한 경로
  # (Node getaddrinfo)로, (2) 연속 2회 성공을 요구해 순간 성공을 걸러낸다. 각 프로브는 3초 타임아웃
  # (해석기가 멈춰도 5분 예산을 넘기지 않게). 단, 이 프로브는 짧은 창만 보므로 flap 을 완전히는 못
  # 막는다 — 데이터 손실의 실제 보증은 아래 collect 재시도 + 코드의 예산환불이다.
  dns_ok() { node -e 'const t=setTimeout(()=>process.exit(1),3000);require("dns").promises.lookup("openapi.naver.com").then(()=>process.exit(0),()=>process.exit(1)).finally(()=>clearTimeout(t))' >/dev/null 2>&1; }
  dns_ready=0
  for i in $(seq 1 30); do
    if dns_ok && { sleep 2; dns_ok; }; then
      [ "$i" -gt 1 ] && echo "[daily] DNS 준비됨 (${i}회 시도 후, 연속 2회 확인)"
      dns_ready=1
      break
    fi
    [ "$i" -lt 30 ] && sleep 10
  done
  [ "$dns_ready" -eq 0 ] && echo "[daily] DNS 미준비 ~5분 경과 — 그래도 진행(collect 재시도·예산환불이 보증)"

  # collect 자가 복구(실제 보증): 전량 미도달(wake 직후 DNS·네트워크 미준비)이면 CLI 가 exit 75
  # (EX_TEMPFAIL)로 끝난다 → **75일 때만** 대기 후 재수집해 하루치 손실을 복구한다. exit 0(성공·부분
  # 실패·예산스킵)이나 다른 비정상 종료(1=크래시·저장실패)는 재시도하지 않는다 — 후자를 재시도하면
  # 성공한 호출의 쿼터를 헛되이 재소비하기 때문(적대적 리뷰 확정). 미도달은 코드가 예산을 환불하므로
  # 재시도는 쿼터 무손실.
  collect_ok=0
  collect_attempts=0
  self_heal_triggered=0
  for attempt in 1 2 3; do
    collect_attempts=$attempt
    npm run -s collect -- --file seeds/g2-seeds.txt > /dev/null
    rc=$?
    if [ "$rc" -eq 0 ]; then collect_ok=1; break; fi
    if [ "$rc" -ne 75 ]; then
      echo "[daily] collect exit=$rc (전량 미도달 아님 — 재시도 안 함, 리포트가 상태 표시)"
      break
    fi
    self_heal_triggered=1
    echo "[daily] collect 시도 ${attempt} 전량 미도달(exit 75)"
    [ "$attempt" -lt 3 ] && { echo "[daily] 60초 후 재시도"; sleep 60; }
  done
  [ "$collect_ok" -eq 0 ] && echo "[daily] collect 자가복구 실패 — 리포트가 '전량 실패' 배너로 알림"

  npm run -s report || echo "[daily] report 실패 exit=$?"

  # 상태파일 발행(비밀정보 없음) → 레포에 커밋·푸시 → 클라우드 GHA 가 읽어 검증(wp-auto-blog data/*.json 방식).
  # 수집 자체엔 영향 없게 전 과정 비치명적. push 는 SSH 키 비대화형 접근에 의존(실패 시 GHA 가 stale 로 감지).
  ST_DAY="$(date '+%Y-%m-%d')" \
  ST_DNS="$([ "$dns_ready" -eq 1 ] && echo true || echo false)" \
  ST_ATTEMPTS="$collect_attempts" \
  ST_SELFHEAL="$([ "$self_heal_triggered" -eq 1 ] && echo true || echo false)" \
  ST_OK="$([ "$collect_ok" -eq 1 ] && echo true || echo false)" \
    node scripts/emit-status.cjs || echo "[daily] status 발행 실패(비치명적)"
  ROOT="$(git rev-parse --show-toplevel 2>/dev/null || true)"
  if [ -n "$ROOT" ]; then
    ( cd "$ROOT" \
      && git add packages/keyword-intel/status/daily-status.json 2>/dev/null \
      && ! git diff --cached --quiet \
      && git commit -q -m "chore(keyword-intel): daily status $(date '+%Y-%m-%d') [skip ci]" \
      && GIT_SSH_COMMAND="ssh -o BatchMode=yes -o ConnectTimeout=15" git push -q origin HEAD:main ) \
      2>&1 || echo "[daily] status 커밋/푸시 생략·실패(비치명적)"
  fi

  echo "=== 완료 $(date '+%H:%M:%S') ==="
} >> data/daily.log 2>&1
