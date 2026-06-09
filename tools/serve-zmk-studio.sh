#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
STUDIO_DIR="${ZMK_STUDIO_DIR:-$ROOT_DIR/.external/zmk-studio}"
PORT="${PORT:-5173}"
HOST="${HOST:-127.0.0.1}"
REPO_URL="https://github.com/zmkfirmware/zmk-studio"

if ! type -P git >/dev/null 2>&1; then
    echo "ERROR: git is required" >&2
    exit 1
fi

if ! type -P npm >/dev/null 2>&1; then
    echo "ERROR: npm is required" >&2
    exit 1
fi

GIT_BIN="$(type -P git)"
NPM_BIN="$(type -P npm)"
TAILSCALE_BIN="$(type -P tailscale || true)"
if [[ -z "$TAILSCALE_BIN" && -x /Applications/Tailscale.app/Contents/MacOS/Tailscale ]]; then
    TAILSCALE_BIN="/Applications/Tailscale.app/Contents/MacOS/Tailscale"
fi

mkdir -p "$(dirname "$STUDIO_DIR")"

if [[ ! -d "$STUDIO_DIR/.git" ]]; then
    "$GIT_BIN" clone --depth 1 "$REPO_URL" "$STUDIO_DIR"
else
    "$GIT_BIN" -C "$STUDIO_DIR" pull --ff-only
fi

cd "$STUDIO_DIR"
"$NPM_BIN" ci

cat <<INFO

ZMK Studio self-host server
Local URL:
  http://$HOST:$PORT

For WebUSB from another device, expose this local server over HTTPS.
With Tailscale Serve, prefer a dedicated HTTPS port so existing :443 routes are not overwritten:
  ${TAILSCALE_BIN:-tailscale} serve --bg --https=$PORT http://127.0.0.1:$PORT

INFO

"$NPM_BIN" run dev -- --host "$HOST" --port "$PORT"
