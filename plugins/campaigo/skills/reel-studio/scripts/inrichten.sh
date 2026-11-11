#!/bin/sh
# Richt de Reel-studio van Campaigo in op Mac of Linux (op Windows geeft dit door aan inrichten.ps1).
#   sh inrichten.sh ["<map>"]
# Staat er geen Node 18 of nieuwer op de computer, dan zet dit een eigen Node in <studio>/.studio/node
# (zonder installatie en zonder beheerdersrechten). Daarna draait het inrichten.mjs; de uitkomst is JSON.
set -e
STUDIO="${1:-$HOME/Campaigo Reels}"
HIER="$(cd "$(dirname "$0")" && pwd)"
case "$(uname -s)" in
  MINGW*|MSYS*|CYGWIN*)
    exec powershell.exe -NoProfile -ExecutionPolicy Bypass -File "$(cygpath -w "$HIER/inrichten.ps1")" -Studio "$(cygpath -w "$STUDIO")" ;;
esac
NODEV=v24.11.1
EIGEN="$STUDIO/.studio/node/bin/node"
goed() { v=$("$1" --version 2>/dev/null) || return 1; m=$(echo "$v" | sed 's/^v\([0-9]*\).*/\1/'); [ "$m" -ge 18 ]; }
if [ -x "$EIGEN" ]; then
  NODE="$EIGEN"
elif command -v node >/dev/null 2>&1 && goed node; then
  NODE="$(command -v node)"
else
  case "$(uname -s)" in Darwin) OS=darwin ;; *) OS=linux ;; esac
  case "$(uname -m)" in arm64|aarch64) ARCH=arm64 ;; *) ARCH=x64 ;; esac
  NAAM="node-$NODEV-$OS-$ARCH"
  mkdir -p "$STUDIO/.studio"
  TMP="$(mktemp -d)"
  if ! curl -fsSL "https://nodejs.org/dist/$NODEV/$NAAM.tar.gz" -o "$TMP/node.tar.gz"; then
    echo '{"ok": false, "fout": "Node downloaden lukte niet. Controleer het internet."}'
    rm -rf "$TMP"; exit 1
  fi
  tar -xzf "$TMP/node.tar.gz" -C "$TMP"
  rm -rf "$STUDIO/.studio/node"
  mv "$TMP/$NAAM" "$STUDIO/.studio/node"
  rm -rf "$TMP"
  NODE="$EIGEN"
fi
exec "$NODE" "$HIER/inrichten.mjs" --studio "$STUDIO"
