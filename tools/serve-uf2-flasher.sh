#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PORT="${PORT:-8787}"
HOST="${HOST:-127.0.0.1}"
APP_DIR="$ROOT_DIR/tools/uf2-flasher"

if ! command -v python3 >/dev/null 2>&1; then
    echo "ERROR: python3 is required" >&2
    exit 1
fi

cat <<INFO

moNa2 UF2 flasher
Local URL:
  http://$HOST:$PORT

Chrome treats localhost as a secure context, so File System Access API works there.
For access through a Tailscale URL, expose it over HTTPS:
  tailscale serve --bg http://127.0.0.1:$PORT
  tailscale serve --bg --https=443 http://127.0.0.1:$PORT

INFO

cd "$APP_DIR"
python3 -m http.server "$PORT" --bind "$HOST"
