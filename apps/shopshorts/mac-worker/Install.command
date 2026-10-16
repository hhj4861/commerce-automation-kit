#!/bin/bash
set -euo pipefail
cd -- "$(dirname -- "$0")"
if [[ "$(uname -s)" != Darwin ]]; then echo 'Mac 전용 패키지입니다.'; exit 1; fi
# Do not install anything on the source (company) Mac, even on accidental double-click.
if [[ ! -x /usr/bin/python3 ]]; then echo 'Apple Command Line Tools의 Python 3을 먼저 준비한 뒤 다시 실행하세요.'; exit 1; fi
/usr/bin/python3 control.py prepare-check
/usr/bin/osascript -e 'display dialog "새 개인 Mac에 Shopshorts 제작 환경을 설치합니다. Homebrew와 Node·FFmpeg·Python·Blender를 설치/사용하고 자막 도구를 내려받습니다. 기존 워커는 변경하지 않습니다." buttons {"취소", "설치"} default button "취소" cancel button "취소"'
BREW=''
WORK="$HOME/Library/Mobile Documents/com~apple~CloudDocs/gpt 작업/commerce-automation-kit/mac-worker"
mkdir -p -- "$WORK/install-cache"
export HOMEBREW_CACHE="$WORK/install-cache/homebrew"
export PIP_CACHE_DIR="$WORK/install-cache/pip"
export npm_config_cache="$WORK/install-cache/npm"
for p in /opt/homebrew/bin/brew /usr/local/bin/brew; do
  if [[ -x "$p" ]]; then BREW="$p"; break; fi
done
if [[ -z "$BREW" ]]; then
  echo 'Homebrew의 공식 설치 프로그램을 실행합니다. 필요한 경우 이 Mac의 관리자 승인이 표시됩니다.'
  # TLS verification stays enabled; execute the downloaded file, never shell-expanded output.
  BREW_SCRIPT="$WORK/install-cache/homebrew-install.sh"
  mkdir -p -- "$(dirname -- "$BREW_SCRIPT")"
  /usr/bin/curl --fail --location --proto '=https' --tlsv1.2 https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh -o "$BREW_SCRIPT"
  /bin/bash "$BREW_SCRIPT"
  rm -- "$BREW_SCRIPT"
  for p in /opt/homebrew/bin/brew /usr/local/bin/brew; do
    if [[ -x "$p" ]]; then BREW="$p"; break; fi
  done
fi
if [[ -z "$BREW" ]]; then echo 'Homebrew 설치를 완료한 뒤 다시 실행하세요.'; exit 1; fi
"$BREW" install node@22 ffmpeg python@3.11
if [[ ! -x /Applications/Blender.app/Contents/MacOS/Blender ]]; then "$BREW" install --cask blender; fi
PYTHON="$("$BREW" --prefix python@3.11)/bin/python3.11"
NODE="$("$BREW" --prefix node@22)/bin/node"
export PATH="$(dirname -- "$NODE"):$("$BREW" --prefix)/bin:/usr/bin:/bin:/usr/sbin:/sbin"
exec "$PYTHON" control.py install --apply --node "$NODE" --python "$PYTHON"
