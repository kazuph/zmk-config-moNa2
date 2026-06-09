#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
STUDIO_DIR="${ZMK_STUDIO_DIR:-$ROOT_DIR/.external/zmk-studio}"
PORT="${PORT:-5173}"
HOST="${HOST:-127.0.0.1}"
REPO_URL="https://github.com/zmkfirmware/zmk-studio"

if ! command -v git >/dev/null 2>&1; then
    echo "ERROR: git is required" >&2
    exit 1
fi

if ! command -v npm >/dev/null 2>&1; then
    echo "ERROR: npm is required" >&2
    exit 1
fi

mkdir -p "$(dirname "$STUDIO_DIR")"

if [[ ! -d "$STUDIO_DIR/.git" ]]; then
    git clone --depth 1 "$REPO_URL" "$STUDIO_DIR"
else
    git -C "$STUDIO_DIR" pull --ff-only
fi

cd "$STUDIO_DIR"
npm ci

cat <<INFO

ZMK Studio self-host server
Local URL:
  http://$HOST:$PORT

For Web Serial from another device, expose this local server over HTTPS.
With Tailscale Serve, use one of these from another shell:
  tailscale serve --bg http://127.0.0.1:$PORT
  tailscale serve --bg --https=443 http://127.0.0.1:$PORT

INFO

npm run dev -- --host "$HOST" --port "$PORT"
