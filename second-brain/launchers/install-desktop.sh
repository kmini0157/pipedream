#!/bin/sh
# Creates a desktop shortcut for Second Brain (run once).
#   macOS -> ~/Desktop/Second Brain.command
#   Linux -> ~/Desktop/second-brain.desktop
set -e

DIR="$(cd "$(dirname "$0")" && pwd)"
OS="$(uname -s)"

desktop_dir() {
  if command -v xdg-user-dir >/dev/null 2>&1; then
    d="$(xdg-user-dir DESKTOP 2>/dev/null || true)"
    [ -n "$d" ] && [ -d "$d" ] && { echo "$d"; return; }
  fi
  echo "$HOME/Desktop"
}

DESKTOP="$(desktop_dir)"
mkdir -p "$DESKTOP"

case "$OS" in
  Darwin)
    TARGET="$DESKTOP/Second Brain.command"
    cat > "$TARGET" <<EOF
#!/bin/sh
exec "$DIR/start.sh"
EOF
    chmod +x "$TARGET"
    # Double-clicking .command files opens Terminal and runs them.
    echo "✓ 바탕화면에 만들었습니다: $TARGET"
    echo "  더블클릭으로 실행하세요. (처음 한 번 '열기' 확인이 뜰 수 있어요)"
    ;;
  Linux)
    TARGET="$DESKTOP/second-brain.desktop"
    cat > "$TARGET" <<EOF
[Desktop Entry]
Type=Application
Name=Second Brain
Comment=개인 지식 레이어 - 두 번째 뇌
Exec="$DIR/start.sh"
Icon=$DIR/icon.svg
Terminal=true
Categories=Utility;
EOF
    chmod +x "$TARGET"
    # GNOME requires marking the launcher as trusted (best-effort).
    command -v gio >/dev/null 2>&1 && gio set "$TARGET" metadata::trusted true 2>/dev/null || true
    echo "✓ 바탕화면에 만들었습니다: $TARGET"
    echo "  더블클릭으로 실행하세요. (배포판에 따라 우클릭 → '실행 허용'이 필요할 수 있어요)"
    ;;
  *)
    echo "지원하지 않는 OS: $OS (Windows는 install-desktop.bat 사용)"
    exit 1
    ;;
esac
