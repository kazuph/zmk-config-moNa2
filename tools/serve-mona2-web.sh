#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PORT="${PORT:-14242}"
HOST="${HOST:-127.0.0.1}"
APP_DIR="$ROOT_DIR/tools/uf2-flasher"
FIRMWARE_ROOT="${FIRMWARE_ROOT:-$HOME/Downloads/moNa2-firmware}"
STUDIO_DIR="${ZMK_STUDIO_DIR:-$ROOT_DIR/.external/zmk-studio}"
REPO_URL="https://github.com/zmkfirmware/zmk-studio"

if ! type -P python3 >/dev/null 2>&1; then
    echo "ERROR: python3 is required" >&2
    exit 1
fi
if ! type -P git >/dev/null 2>&1; then
    echo "ERROR: git is required" >&2
    exit 1
fi
if ! type -P npm >/dev/null 2>&1; then
    echo "ERROR: npm is required" >&2
    exit 1
fi
if ! type -P node >/dev/null 2>&1; then
    echo "ERROR: node is required" >&2
    exit 1
fi

PYTHON_BIN="$(type -P python3)"
GIT_BIN="$(type -P git)"
NPM_BIN="$(type -P npm)"
NODE_BIN="$(type -P node)"
TAILSCALE_BIN="$(type -P tailscale || true)"
if [[ -z "$TAILSCALE_BIN" && -x /Applications/Tailscale.app/Contents/MacOS/Tailscale ]]; then
    TAILSCALE_BIN="/Applications/Tailscale.app/Contents/MacOS/Tailscale"
fi

if [[ ! -d "$STUDIO_DIR/.git" ]]; then
    mkdir -p "$(dirname "$STUDIO_DIR")"
    "$GIT_BIN" clone "$REPO_URL" "$STUDIO_DIR"
else
    "$GIT_BIN" -C "$STUDIO_DIR" pull --ff-only
fi

(
    cd "$STUDIO_DIR"
    "$NPM_BIN" ci
    MONA2_REPO_ROOT="$ROOT_DIR" "$NODE_BIN" -e '
const fs = require("fs");
const path = require("path");
const studioPath = path.join(process.cwd(), "src/keyboard/behavior-short-names.json");
const overlayPath = path.join(process.env.MONA2_REPO_ROOT, "tools/zmk-studio-mona2-short-names.json");
const base = JSON.parse(fs.readFileSync(studioPath, "utf8"));
const overlay = JSON.parse(fs.readFileSync(overlayPath, "utf8"));
fs.writeFileSync(studioPath, JSON.stringify({ ...base, ...overlay }, null, 2) + "\n");
'
    "$NPM_BIN" run build -- --base=/studio/
)

cat <<INFO

moNa2 web tools
Local URL:
  http://$HOST:$PORT

ZMK Studio:
  http://$HOST:$PORT/studio/

UF2 flasher:
  http://$HOST:$PORT/

Firmware preset root:
  $FIRMWARE_ROOT

Chrome treats localhost as a secure context, so File System Access API works there.
For access through a Tailscale URL, expose it over HTTPS:
  ${TAILSCALE_BIN:-tailscale} serve --bg --https=$PORT http://127.0.0.1:$PORT

INFO

MONA2_APP_DIR="$APP_DIR" \
MONA2_REPO_ROOT="$ROOT_DIR" \
MONA2_FIRMWARE_ROOT="$FIRMWARE_ROOT" \
MONA2_STUDIO_DIST="$STUDIO_DIR/dist" \
"$PYTHON_BIN" "$APP_DIR/server.py" --host "$HOST" --port "$PORT"
