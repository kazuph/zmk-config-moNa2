#!/bin/bash

# XIAO-SENSE UF2 flasher.
# Default flow is recovery/full flash: reset -> R -> reset -> L.
# For normal keymap-only updates after a successful build, use --right-only.

set -euo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m'

REPO="kazuph/zmk-config-moNa2"
ARTIFACT_NAME="firmware"
MOUNT_POINT="/Volumes/XIAO-SENSE"
FIRMWARE_ROOT="$HOME/Downloads/moNa2-firmware"
DOWNLOAD_BUILD=true
CHECK_ONLY=false
FLASH_MODE="all"
MOUNT_TIMEOUT=120

log_step() {
    echo -e "${BOLD}${CYAN}$1${NC}"
}

log_success() {
    echo -e "${GREEN}OK: $1${NC}"
}

log_warn() {
    echo -e "${YELLOW}WARN: $1${NC}"
}

log_error() {
    echo -e "${RED}ERROR: $1${NC}" >&2
}

usage() {
    cat <<'USAGE'
Usage: ./xiao-firmware-flash.sh [options]

Options:
  --right-only           Flash only moNa2_R firmware. Use for keymap-only updates.
  --all                  Flash reset -> R -> reset -> L. Default.
  --firmware-dir <path>  Use an existing firmware directory.
  --skip-build           Do not download GitHub Actions artifacts.
  --check-only           Validate artifact/files and exit before touching USB.
  --mount-point <path>   Override mount point. Default: /Volumes/XIAO-SENSE
  --mount-timeout <sec>  Seconds to wait for XIAO-SENSE. Default: 120
  --help                 Show this help.
USAGE
}

die() {
    log_error "$1"
    exit 1
}

require_cmd() {
    type -P "$1" >/dev/null 2>&1 || die "$1 が見つかりません"
}

cmd_path() {
    type -P "$1"
}

repo_head_sha() {
    "$GIT_BIN" rev-parse HEAD
}

repo_short_sha() {
    "$GIT_BIN" rev-parse --short HEAD
}

firmware_dir_for_head() {
    echo "$FIRMWARE_ROOT/$(repo_short_sha)"
}

FIRMWARE_DIR=""

while [[ $# -gt 0 ]]; do
    case "$1" in
        --right-only)
            FLASH_MODE="right"
            shift
            ;;
        --all)
            FLASH_MODE="all"
            shift
            ;;
        --firmware-dir)
            [[ $# -ge 2 ]] || die "--firmware-dir requires a path"
            FIRMWARE_DIR="$2"
            shift 2
            ;;
        --skip-build)
            DOWNLOAD_BUILD=false
            shift
            ;;
        --check-only)
            CHECK_ONLY=true
            shift
            ;;
        --mount-point)
            [[ $# -ge 2 ]] || die "--mount-point requires a path"
            MOUNT_POINT="$2"
            shift 2
            ;;
        --mount-timeout)
            [[ $# -ge 2 ]] || die "--mount-timeout requires seconds"
            MOUNT_TIMEOUT="$2"
            shift 2
            ;;
        --help)
            usage
            exit 0
            ;;
        *)
            usage
            die "不明なオプション: $1"
            ;;
    esac
done

require_cmd gh
require_cmd jq
require_cmd git
require_cmd cp
require_cmd rm

GH_BIN="$(cmd_path gh)"
JQ_BIN="$(cmd_path jq)"
GIT_BIN="$(cmd_path git)"
CP_BIN="$(cmd_path cp)"
RM_BIN="$(cmd_path rm)"

find_run_for_head() {
    local expected_sha="$1"

    "$GH_BIN" run list -R "$REPO" --limit 50 \
        --json status,conclusion,databaseId,headSha,workflowName,displayTitle \
        --jq ".[] | select(.headSha == \"$expected_sha\") | select(.workflowName == \".github/workflows/build.yml\")" \
        | "$JQ_BIN" -s 'sort_by(.databaseId) | reverse | .[0]'
}

wait_for_run() {
    local run_id="$1"

    while true; do
        local run
        run="$("$GH_BIN" run view "$run_id" -R "$REPO" --json status,conclusion,databaseId,headSha)"
        local status conclusion
        status="$("$JQ_BIN" -r '.status' <<<"$run")"
        conclusion="$("$JQ_BIN" -r '.conclusion' <<<"$run")"

        case "$status" in
            completed)
                [[ "$conclusion" == "success" ]] || die "対象 commit の build が失敗しています: $conclusion"
                log_success "対象 commit の build が成功しています"
                return 0
                ;;
            queued|in_progress|waiting|pending)
                log_step "Build 実行中です。10秒後に再確認します: $status"
                sleep 10
                ;;
            *)
                die "不明な build 状態です: $status"
                ;;
        esac
    done
}

download_artifact_for_head() {
    local expected_sha short_sha run run_id artifact_dir tmp_dir
    expected_sha="$(repo_head_sha)"
    short_sha="$(repo_short_sha)"
    artifact_dir="$(firmware_dir_for_head)"

    log_step "GitHub Actions artifact を commit 対応確認つきで取得します"
    log_step "Expected commit: $expected_sha"

    run="$(find_run_for_head "$expected_sha")"
    [[ "$run" != "null" && -n "$run" ]] || die "現在の HEAD に対応する GitHub Actions run が見つかりません"

    run_id="$("$JQ_BIN" -r '.databaseId' <<<"$run")"
    wait_for_run "$run_id"

    tmp_dir="$(mktemp -d)"
    mkdir -p "$FIRMWARE_ROOT"

    if "$GH_BIN" run download "$run_id" -R "$REPO" -D "$tmp_dir" -n "$ARTIFACT_NAME"; then
        "$RM_BIN" -rf "$artifact_dir"
        mkdir -p "$artifact_dir"

        if [[ -d "$tmp_dir/$ARTIFACT_NAME" ]]; then
            "$CP_BIN" -R "$tmp_dir/$ARTIFACT_NAME"/. "$artifact_dir/"
        else
            "$CP_BIN" -R "$tmp_dir"/. "$artifact_dir/"
        fi

        {
            echo "commit=$expected_sha"
            echo "short_commit=$short_sha"
            echo "run_id=$run_id"
            echo "repo=$REPO"
            echo "downloaded_at=$(date -u +%Y-%m-%dT%H:%M:%SZ)"
        } > "$artifact_dir/SOURCE_COMMIT"

        "$RM_BIN" -rf "$tmp_dir"
        FIRMWARE_DIR="$artifact_dir"
        log_success "firmware を保存しました: $artifact_dir"
    else
        "$RM_BIN" -rf "$tmp_dir"
        die "artifact download に失敗しました"
    fi
}

resolve_firmware_dir() {
    if [[ "$DOWNLOAD_BUILD" == "true" ]]; then
        download_artifact_for_head
        return
    fi

    if [[ -z "$FIRMWARE_DIR" ]]; then
        FIRMWARE_DIR="$(firmware_dir_for_head)"
    fi

    [[ -d "$FIRMWARE_DIR" ]] || die "firmware directory が見つかりません: $FIRMWARE_DIR"
}

check_source_commit() {
    local manifest="$FIRMWARE_DIR/SOURCE_COMMIT"

    if [[ ! -f "$manifest" ]]; then
        log_warn "SOURCE_COMMIT がありません。--firmware-dir 指定時のみ許容します: $FIRMWARE_DIR"
        return 0
    fi

    local expected actual
    expected="$(repo_head_sha)"
    actual="$(grep '^commit=' "$manifest" | cut -d= -f2-)"
    [[ "$actual" == "$expected" ]] || die "firmware commit が現在の HEAD と一致しません: $actual != $expected"
}

firmware_path() {
    local kind="$1"
    case "$kind" in
        reset) echo "$FIRMWARE_DIR/settings_reset-seeeduino_xiao_ble-zmk.uf2" ;;
        right) echo "$FIRMWARE_DIR/moNa2_R rgbled_adapter-seeeduino_xiao_ble-zmk.uf2" ;;
        left) echo "$FIRMWARE_DIR/moNa2_L rgbled_adapter-seeeduino_xiao_ble-zmk.uf2" ;;
        *) die "unknown firmware kind: $kind" ;;
    esac
}

check_firmware_files() {
    local reset_file right_file left_file
    reset_file="$(firmware_path reset)"
    right_file="$(firmware_path right)"
    left_file="$(firmware_path left)"

    [[ -f "$right_file" ]] || die "右側 firmware が見つかりません: $right_file"

    if [[ "$FLASH_MODE" == "all" ]]; then
        [[ -f "$reset_file" ]] || die "settings reset firmware が見つかりません: $reset_file"
        [[ -f "$left_file" ]] || die "左側 firmware が見つかりません: $left_file"
    fi

    log_success "firmware file を確認しました: $FIRMWARE_DIR"
}

assert_side_file() {
    local src="$1"
    local side="$2"
    local base
    base="$(basename "$src")"

    case "$side" in
        reset) [[ "$base" == settings_reset-* ]] || die "settings reset ではない file です: $base" ;;
        right) [[ "$base" == moNa2_R* ]] || die "右側 firmware ではない file です: $base" ;;
        left) [[ "$base" == moNa2_L* ]] || die "左側 firmware ではない file です: $base" ;;
        *) die "unknown side: $side" ;;
    esac
}

wait_for_mount() {
    local step="$1"
    local label="$2"
    local count=0

    echo ""
    log_step "[$step] $label"
    log_step "リセットボタンを2回押して XIAO-SENSE を mount してください"

    while [[ ! -d "$MOUNT_POINT" ]]; do
        if (( count >= MOUNT_TIMEOUT )); then
            die "mount timeout: $MOUNT_POINT が見つかりません"
        fi
        printf "\r${YELLOW}waiting... %ds${NC}" "$count"
        sleep 1
        ((count++))
    done

    printf "\r${GREEN}mounted: %s${NC}\n" "$MOUNT_POINT"
}

wait_for_unmount() {
    local count=0

    while [[ -d "$MOUNT_POINT" ]]; do
        if (( count >= 30 )); then
            die "UF2 コピー後に自動 unmount しませんでした: $MOUNT_POINT"
        fi
        printf "\r${CYAN}unmount wait... %ds${NC}" "$count"
        sleep 1
        ((count++))
    done

    printf "\r${GREEN}unmounted${NC}\n"
}

copy_firmware() {
    local src_file="$1"
    local description="$2"
    local side="$3"

    [[ -f "$src_file" ]] || die "firmware file が見つかりません: $src_file"
    [[ -d "$MOUNT_POINT" ]] || die "copy 前に mount point がありません: $MOUNT_POINT"
    assert_side_file "$src_file" "$side"

    log_step "$description を書き込みます: $(basename "$src_file")"

    if "$CP_BIN" "$src_file" "$MOUNT_POINT/" 2>/tmp/mona2-uf2-copy.err; then
        wait_for_unmount
        log_success "$description 完了"
        return 0
    fi

    if [[ ! -d "$MOUNT_POINT" ]]; then
        log_warn "copy は非ゼロ終了でしたが、UF2 bootloader が自動 unmount しました。正常系として扱います。"
        log_success "$description 完了"
        return 0
    fi

    log_error "copy に失敗しました:"
    cat /tmp/mona2-uf2-copy.err >&2 || true
    exit 1
}

main() {
    echo -e "${BOLD}${CYAN}moNa2 XIAO-SENSE UF2 flasher${NC}"

    resolve_firmware_dir
    check_source_commit
    check_firmware_files

    echo "firmware dir: $FIRMWARE_DIR"
    echo "mode: $FLASH_MODE"

    if [[ "$CHECK_ONLY" == "true" ]]; then
        log_success "check-only 完了。USB には触っていません。"
        return 0
    fi

    if [[ "$FLASH_MODE" == "right" ]]; then
        wait_for_mount "1/1" "右側 R firmware"
        copy_firmware "$(firmware_path right)" "右側 firmware" "right"
        return 0
    fi

    wait_for_mount "1/4" "右側 settings reset"
    copy_firmware "$(firmware_path reset)" "右側 settings reset" "reset"

    wait_for_mount "2/4" "右側 R firmware"
    copy_firmware "$(firmware_path right)" "右側 firmware" "right"

    wait_for_mount "3/4" "左側 settings reset"
    copy_firmware "$(firmware_path reset)" "左側 settings reset" "reset"

    wait_for_mount "4/4" "左側 L firmware"
    copy_firmware "$(firmware_path left)" "左側 firmware" "left"
}

main "$@"
