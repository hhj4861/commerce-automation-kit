#!/usr/bin/env python3
"""Failure alert for the AI card news job.

Standard library only: it must still work when dependency installation, setup or tests
failed. Text only and no secrets. Delivery failures are reported only in live mode.
A failure to save the refreshed Codex login is reported in every mode, because the next
run (including tomorrow's delivery) may then fail authentication.
"""
from __future__ import annotations
import datetime as dt
import json
import os
import re
import sys
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

KST = dt.timezone(dt.timedelta(hours=9))
OUT = Path(__file__).resolve().parent / "output"


def mode(now):
    if os.getenv("DRY_RUN") == "1":
        return "dry_run"
    raw = os.getenv("CARD_NEWS_CUTOVER_DATE", "").strip()
    if not raw:
        return "shadow"
    try:
        if not re.fullmatch(r"\d{4}-\d{2}-\d{2}", raw):
            raise ValueError
        cutover = dt.date.fromisoformat(raw)
    except ValueError:
        return "config_error"  # main.py refused to run; nothing could be sent today.
    return "live" if now.date() >= cutover else "shadow"


def delivered_today(now):
    try:
        receipt = json.loads((OUT/"delivery.json").read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return False
    return isinstance(receipt, dict) and receipt.get("status") == "delivered" and receipt.get("date") == f"{now:%Y-%m-%d}"


PERSIST_BODY = ("Codex 로그인 갱신 내용을 저장하지 못했습니다. 다음 실행이 인증 오류로 실패할 수 있습니다. "
                "시크릿 쓰기 토큰(CARD_NEWS_SECRET_WRITE_TOKEN 또는 ATOMWORKS_READ_TOKEN)의 만료일, 저장소 선택, "
                "Secrets 쓰기 권한을 먼저 확인하고, "
                "codex login으로 카드뉴스 전용 로그인을 다시 만들어 CARD_NEWS_CODEX_AUTH_JSON에 등록해 주세요.")


def delivery_body(now, state):
    if state == "config_error":
        return ("설정 오류로 발송하지 못했습니다. 저장소 변수 CARD_NEWS_CUTOVER_DATE를 YYYY-MM-DD 형식으로 "
                "고친 뒤 다시 실행해 주세요.")
    if delivered_today(now):
        return ("앨범은 발송됐지만 이후 기록 단계가 실패했습니다. 다시 보내지 마세요. "
                "발송 기록(claim 태그)도 지우지 마세요.")
    return ("오늘 브리핑을 보내지 못했습니다. 발송 기록(claim)이 남아 있으면 자동으로 다시 보내지 않습니다. "
            "채팅방과 실행 기록을 확인해 주세요.")


def message(now, bodies, run_url):
    link = run_url if run_url.startswith("https://github.com/") else "(GitHub Actions 실행 기록 확인)"
    return "\n".join([f"AI 카드뉴스 실패 알림 · {now:%Y-%m-%d} KST", *bodies, f"실행 기록: {link}"])


def main(now=None):
    now = now or dt.datetime.now(KST)
    state = mode(now)
    bodies = []
    if os.getenv("DELIVER_OUTCOME", "failure") != "success" and state in ("live", "config_error"):
        bodies.append(delivery_body(now, state))
    if os.getenv("PERSIST_OUTCOME", "") == "failure":
        bodies.append(PERSIST_BODY)
    if not bodies:
        print(f"Failure alert skipped in {state} mode")
        return 0
    token = os.getenv("TELEGRAM_BOT_TOKEN", "").strip()
    chat = os.getenv("TELEGRAM_CHAT_ID", "").strip()
    if not token or not chat:
        print("::error::Failure alert not sent: TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID missing")
        return 1
    data = urllib.parse.urlencode({"chat_id": chat, "text": message(now, bodies, os.getenv("RUN_URL", ""))}).encode()
    request = urllib.request.Request(f"https://api.telegram.org/bot{token}/sendMessage", data=data, method="POST")
    try:
        with urllib.request.urlopen(request, timeout=30) as response:
            status = response.status
    except urllib.error.HTTPError as exc:
        print(f"::error::Failure alert HTTP {exc.code}")
        return 1
    except (urllib.error.URLError, OSError):
        print("::error::Failure alert transport failed")
        return 1
    print(f"Failure alert sent (HTTP {status})")
    return 0


if __name__ == "__main__":
    sys.exit(main())
