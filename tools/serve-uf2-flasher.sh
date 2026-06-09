#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PORT="${PORT:-8787}"
HOST="${HOST:-127.0.0.1}"
APP_DIR="$ROOT_DIR/tools/uf2-flasher"
FIRMWARE_ROOT="${FIRMWARE_ROOT:-$HOME/Downloads/moNa2-firmware}"

if ! type -P python3 >/dev/null 2>&1; then
    echo "ERROR: python3 is required" >&2
    exit 1
fi

PYTHON_BIN="$(type -P python3)"

cat <<INFO

moNa2 UF2 flasher
Local URL:
  http://$HOST:$PORT

Firmware preset root:
  $FIRMWARE_ROOT

Chrome treats localhost as a secure context, so File System Access API works there.
For access through a Tailscale URL, expose it over HTTPS:
  tailscale serve --bg http://127.0.0.1:$PORT
  tailscale serve --bg --https=443 http://127.0.0.1:$PORT

INFO

MONA2_APP_DIR="$APP_DIR" \
MONA2_REPO_ROOT="$ROOT_DIR" \
MONA2_FIRMWARE_ROOT="$FIRMWARE_ROOT" \
"$PYTHON_BIN" "$APP_DIR/server.py" --host "$HOST" --port "$PORT"
