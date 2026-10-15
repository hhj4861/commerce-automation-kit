#!/usr/bin/env python3
"""Live-mode failure alert for the AI card news job.

Standard library only: it must still work when dependency installation, setup or tests
failed. Text only and no secrets. Shadow and dry-run failures never message the chat.
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


def message(now, state, run_url):
    link = run_url if run_url.startswith("https://github.com/") else "(GitHub Actions 실행 기록 확인)"
    if state == "config_error":
        body = ("설정 오류로 발송하지 못했습니다. 저장소 변수 CARD_NEWS_CUTOVER_DATE를 YYYY-MM-DD 형식으로 "
                "고친 뒤 다시 실행해 주세요.")
    elif delivered_today(now):
        body = ("앨범은 발송됐지만 이후 기록 단계가 실패했습니다. 다시 보내지 마세요. "
                "발송 기록(claim 태그)도 지우지 마세요.")
    else:
        body = ("오늘 브리핑을 보내지 못했습니다. 발송 기록(claim)이 남아 있으면 자동으로 다시 보내지 않습니다. "
                "채팅방과 실행 기록을 확인해 주세요.")
    return f"AI 카드뉴스 실패 알림 · {now:%Y-%m-%d} KST\n{body}\n실행 기록: {link}"


def main(now=None):
    now = now or dt.datetime.now(KST)
    state = mode(now)
    if state in ("dry_run", "shadow"):
        print(f"Failure alert skipped in {state} mode")
        return 0
    token = os.getenv("TELEGRAM_BOT_TOKEN", "").strip()
    chat = os.getenv("TELEGRAM_CHAT_ID", "").strip()
    if not token or not chat:
        print("::error::Failure alert not sent: TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID missing")
        return 1
    data = urllib.parse.urlencode({"chat_id": chat, "text": message(now, state, os.getenv("RUN_URL", ""))}).encode()
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
