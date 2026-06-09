#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
STUDIO_URL="${STUDIO_URL:-http://127.0.0.1:5173}"
FLASHER_URL="${FLASHER_URL:-http://127.0.0.1:8787}"
TAILSCALE_HOST="${TAILSCALE_HOST:-macbook-air-3.tail5f04b.ts.net}"

ok() {
    echo "OK: $1"
}

warn() {
    echo "WARN: $1"
}

fail() {
    echo "FAIL: $1"
}

have() {
    type -P "$1" >/dev/null 2>&1
}

need() {
    have "$1" || {
        fail "$1 is required"
        exit 1
    }
}

need curl
need jq
need git

HEAD_SHA="$(git -C "$ROOT_DIR" rev-parse HEAD)"
SHORT_SHA="$(git -C "$ROOT_DIR" rev-parse --short HEAD)"
FIRMWARE_DIR="$HOME/Downloads/moNa2-firmware/$SHORT_SHA"

echo "moNa2 flow check"
echo "repo: $ROOT_DIR"
echo "head: $HEAD_SHA"
echo ""

if [[ -d "$FIRMWARE_DIR" ]]; then
    ok "firmware directory exists: $FIRMWARE_DIR"
else
    fail "firmware directory missing: $FIRMWARE_DIR"
fi

if [[ -f "$FIRMWARE_DIR/SOURCE_COMMIT" ]]; then
    MANIFEST_SHA="$(grep '^commit=' "$FIRMWARE_DIR/SOURCE_COMMIT" | cut -d= -f2-)"
    if [[ "$MANIFEST_SHA" == "$HEAD_SHA" ]]; then
        ok "SOURCE_COMMIT matches HEAD"
    else
        fail "SOURCE_COMMIT does not match HEAD: $MANIFEST_SHA"
    fi
else
    fail "SOURCE_COMMIT missing"
fi

for file in \
    "moNa2_R rgbled_adapter-seeeduino_xiao_ble-zmk.uf2" \
    "moNa2_L rgbled_adapter-seeeduino_xiao_ble-zmk.uf2" \
    "settings_reset-seeeduino_xiao_ble-zmk.uf2"; do
    if [[ -f "$FIRMWARE_DIR/$file" ]]; then
        ok "firmware file exists: $file"
    else
        fail "firmware file missing: $file"
    fi
done

echo ""
if curl -fsS -I "$STUDIO_URL" >/dev/null; then
    ok "ZMK Studio reachable: $STUDIO_URL"
else
    fail "ZMK Studio not reachable: $STUDIO_URL"
fi

FLASHER_JSON="$(curl -fsS "$FLASHER_URL/api/firmware" || true)"
if [[ -n "$FLASHER_JSON" ]]; then
    PRESET_SHA="$(jq -r '.shortCommit // empty' <<<"$FLASHER_JSON")"
    PRESET_COUNT="$(jq -r '.files | length' <<<"$FLASHER_JSON")"
    if [[ "$PRESET_SHA" == "$SHORT_SHA" && "$PRESET_COUNT" == "3" ]]; then
        ok "UF2 flasher presets match HEAD: $FLASHER_URL"
    else
        fail "UF2 flasher presets are not aligned: shortCommit=$PRESET_SHA files=$PRESET_COUNT"
    fi
else
    fail "UF2 flasher API not reachable: $FLASHER_URL/api/firmware"
fi

TAILSCALE_BIN="$(type -P tailscale || true)"
if [[ -z "$TAILSCALE_BIN" && -x /Applications/Tailscale.app/Contents/MacOS/Tailscale ]]; then
    TAILSCALE_BIN="/Applications/Tailscale.app/Contents/MacOS/Tailscale"
fi

if [[ -n "$TAILSCALE_BIN" ]]; then
    SERVE_JSON="$("$TAILSCALE_BIN" serve status --json 2>/dev/null || true)"
    if [[ "$SERVE_JSON" == *"$TAILSCALE_HOST:5173"* ]]; then
        ok "Tailscale Studio route exists: https://$TAILSCALE_HOST:5173/"
    else
        warn "Tailscale Studio route missing: https://$TAILSCALE_HOST:5173/"
    fi

    if [[ "$SERVE_JSON" == *"$TAILSCALE_HOST:8787"* ]]; then
        ok "Tailscale flasher route exists: https://$TAILSCALE_HOST:8787/"
    else
        warn "Tailscale flasher route missing: https://$TAILSCALE_HOST:8787/"
    fi
else
    warn "tailscale CLI not found"
fi

echo ""
USB_TEXT="$(system_profiler SPUSBDataType 2>/dev/null || true)"
if rg -qi 'moNa2|ZMK Project' <<<"$USB_TEXT"; then
    ok "moNa2 USB device is visible"
else
    warn "moNa2 USB device is not visible"
fi

if [[ -d /Volumes/XIAO-SENSE ]]; then
    ok "XIAO-SENSE bootloader volume is mounted"
else
    warn "XIAO-SENSE bootloader volume is not mounted"
fi

echo ""
echo "Next manual checks:"
echo "1. Open $STUDIO_URL or https://$TAILSCALE_HOST:5173/"
echo "2. Connect moNa2_R via WebUSB and press studio_unlock"
echo "3. Change one harmless key, save, power-cycle, and confirm it persists"
echo "4. For UF2 flashing, open $FLASHER_URL or https://$TAILSCALE_HOST:8787/ and select the right preset"
