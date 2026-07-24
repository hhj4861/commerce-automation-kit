#!/bin/bash
# 매일 자동 수집 + 텔레그램 리포트 — launchd(09:30 KST)가 실행. 수동 실행도 동일:
#   bash scripts/daily-collect.sh
# 설계: 예산 게이트·DLQ·재시도가 코드에 있으므로 스크립트는 얇게. 실패해도 다음 단계 진행,
# 모든 출력은 data/daily.log 에 남긴다(수집 JSON stdout 은 SQLite 에 있으므로 버림).
set -u
cd "$(dirname "$0")/.."

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
  # 네트워크 준비 대기: launchd 는 머신 wake 직후에도 실행되는데 그 시점엔 DNS 가 아직
  # 안 올라와 있을 수 있다(실측 2026-07-24: 182건 전량 ENOTFOUND). 최대 5분 대기.
  for i in $(seq 1 30); do
    if nc -z -G 2 openapi.naver.com 443 >/dev/null 2>&1; then
      [ "$i" -gt 1 ] && echo "[daily] 네트워크 준비됨 (${i}회 시도 후)"
      break
    fi
    if [ "$i" -eq 30 ]; then
      echo "[daily] 네트워크 미준비 5분 경과 — 그래도 진행(코드가 재시도·예산환불 처리)"
    else
      sleep 10
    fi
  done
  npm run -s collect -- --file seeds/g2-seeds.txt > /dev/null || echo "[daily] collect 실패 exit=$?"
  npm run -s report || echo "[daily] report 실패 exit=$?"
  echo "=== 완료 $(date '+%H:%M:%S') ==="
} >> data/daily.log 2>&1
