#!/bin/sh
# Second Brain launcher (macOS / Linux). Double-click friendly:
#  - if the server is already running, just opens the browser
#  - first run installs dependencies automatically
#  - loads .env, starts the server, opens the browser
set -e

DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$DIR"

# Load .env FIRST so PORT etc. shape the URL below. Real environment variables
# take precedence over .env. Tolerates quoted values with spaces, CRLF files,
# BOM, and malformed lines (skipped — a bad line must not kill the launcher,
# since `export` is a special builtin that aborts the shell under set -e).
if [ -f .env ]; then
  CR="$(printf '\r')"
  while IFS= read -r line || [ -n "$line" ]; do
    line="${line%"$CR"}"
    case "$line" in ''|\#*) continue ;; esac
    case "$line" in *=*) ;; *) continue ;; esac
    key="${line%%=*}"
    case "$key" in ''|[!A-Za-z_]*|*[!A-Za-z0-9_]*) continue ;; esac
    if env | grep -q "^$key="; then continue; fi
    val="${line#*=}"
    val="${val#\"}"; val="${val%\"}"
    export "$key=$val"
  done < .env
fi

PORT="${PORT:-8787}"
URL="http://localhost:$PORT"

open_browser() {
  if command -v open >/dev/null 2>&1; then open "$URL"          # macOS
  elif command -v xdg-open >/dev/null 2>&1; then xdg-open "$URL" # Linux
  else echo "브라우저에서 열어주세요: $URL"
  fi
}

# Already running? Just open the browser and exit.
if command -v curl >/dev/null 2>&1 && curl -sf "$URL/health" >/dev/null 2>&1; then
  echo "🧠 이미 실행 중입니다 — 브라우저를 엽니다: $URL"
  open_browser
  exit 0
fi

if ! command -v node >/dev/null 2>&1; then
  echo "✗ Node.js가 설치되어 있지 않습니다."
  echo "  https://nodejs.org 에서 LTS 버전을 설치한 뒤 다시 실행해주세요."
  printf "엔터를 누르면 닫힙니다..." && read -r _
  exit 1
fi

if [ ! -d node_modules ]; then
  echo "📦 첫 실행: 의존성을 설치합니다 (1-2분)…"
  npm run setup
fi

echo "🧠 Second Brain 시작: $URL  (중지: Ctrl+C)"
( sleep 2; open_browser ) &
exec node server.mjs
