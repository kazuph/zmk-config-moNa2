#!/bin/bash

# XIAO-SENSE 自動ファームウェア転送スクリプト
# フロー: reset → R → reset → L

set -e

# 色付きログ出力
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# 設定
MOUNT_POINT="/Volumes/XIAO-SENSE"
DOWNLOADS_DIR="$HOME/Downloads"
DRY_RUN=false

# 使用方法を表示
usage() {
    echo "使用方法: $0 [オプション]"
    echo "オプション:"
    echo "  --dry-run    実際のコピーは行わず、動作確認のみ"
    echo "  --help       ヘルプを表示"
    exit 1
}

# 引数解析
while [[ $# -gt 0 ]]; do
    case $1 in
        --dry-run)
            DRY_RUN=true
            log_warning "ドライランモードが有効です（実際のコピーは行いません）"
            shift
            ;;
        --help)
            usage
            ;;
        *)
            log_error "不明なオプション: $1"
            usage
            ;;
    esac
done

# 最新のファームウェアフォルダを検出
find_latest_firmware() {
    local latest_num=0
    local latest_dir=""
    
    # firmwareフォルダをチェック
    if [[ -d "$DOWNLOADS_DIR/firmware" ]]; then
        latest_dir="$DOWNLOADS_DIR/firmware"
    fi
    
    # firmware (N) 形式のフォルダをチェック
    for dir in "$DOWNLOADS_DIR"/firmware\ \(*\); do
        if [[ -d "$dir" ]]; then
            # 括弧内の数字を抽出
            if [[ "$dir" =~ firmware\ \(([0-9]+)\)$ ]]; then
                local num=${BASH_REMATCH[1]}
                if (( num > latest_num )); then
                    latest_num=$num
                    latest_dir="$dir"
                fi
            fi
        fi
    done
    
    if [[ -n "$latest_dir" ]]; then
        echo "$latest_dir"
    else
        log_error "ファームウェアフォルダが見つかりません"
        exit 1
    fi
}

# ファームウェアファイルの存在確認
check_firmware_files() {
    local firmware_dir="$1"
    local reset_file="$firmware_dir/settings_reset-seeeduino_xiao_ble-zmk.uf2"
    local left_file="$firmware_dir/moNa2_L rgbled_adapter-seeeduino_xiao_ble-zmk.uf2"
    local right_file="$firmware_dir/moNa2_R rgbled_adapter-seeeduino_xiao_ble-zmk.uf2"
    
    if [[ ! -f "$reset_file" ]]; then
        log_error "リセットファイルが見つかりません: $reset_file"
        exit 1
    fi
    
    if [[ ! -f "$left_file" ]]; then
        log_error "左側ファームウェアが見つかりません: $left_file"
        exit 1
    fi
    
    if [[ ! -f "$right_file" ]]; then
        log_error "右側ファームウェアが見つかりません: $right_file"
        exit 1
    fi
    
    log_success "ファームウェアファイルの確認完了"
}

# マウント待ち
wait_for_mount() {
    local step="$1"
    log_info "Step $step: XIAO-SENSEのマウントを待っています..."
    log_warning "XIAO-SENSEをブートローダーモードで接続してください"
    
    while [[ ! -d "$MOUNT_POINT" ]]; do
        sleep 1
        echo -n "."
    done
    echo
    log_success "XIAO-SENSE がマウントされました: $MOUNT_POINT"
    
    # マウント後少し待機（安定化のため）
    sleep 3
    
    # マウント安定性確認
    if [[ ! -d "$MOUNT_POINT" ]]; then
        log_warning "マウントが不安定ですが、処理を継続します"
    fi
}

# ファームウェアコピー
copy_firmware() {
    local src_file="$1"
    local step="$2"
    local description="$3"
    
    if [[ ! -f "$src_file" ]]; then
        log_error "ファイルが見つかりません: $src_file"
        exit 1
    fi
    
    log_info "Step $step: $description をコピー中..."
    log_info "Source: $(basename "$src_file")"
    log_info "Destination: $MOUNT_POINT/"
    
    if [[ "$DRY_RUN" == "true" ]]; then
        log_warning "[DRY RUN] cp '$src_file' '$MOUNT_POINT/'"
    else
        # コピー前にマウント状態を再確認
        if [[ ! -d "$MOUNT_POINT" ]]; then
            log_warning "コピー実行時にマウントポイントが見つかりません（処理継続）"
            return 0
        fi
        
        # マウント状態の簡易確認
        log_info "マウントポイント確認: $(ls -ld "$MOUNT_POINT" 2>/dev/null | awk '{print $1}' || echo "確認不可")"
        
        # ファイルコピー実行（エラーは握りつぶし）
        log_info "ファイルコピーを実行中..."
        
        if cp "$src_file" "$MOUNT_POINT/" 2>/dev/null; then
            log_success "コピー完了"
        else
            log_warning "コピー時にエラーが発生しましたが、処理を継続します"
            log_info "（注意：ファームウェア転送では一部エラーが正常動作です）"
        fi
    fi
    
    # アンマウント待ち
    log_info "自動アンマウントを待っています..."
    while [[ -d "$MOUNT_POINT" ]]; do
        sleep 1
        echo -n "."
    done
    echo
    log_success "XIAO-SENSE がアンマウントされました"
    sleep 2
}

# メイン処理
main() {
    log_info "=== XIAO-SENSE 自動ファームウェア転送開始 ==="
    
    # 最新ファームウェア検出
    firmware_dir=$(find_latest_firmware)
    log_info "最新ファームウェアフォルダ: $(basename "$firmware_dir")"
    
    # ファームウェアファイル確認
    check_firmware_files "$firmware_dir"
    
    # ファームウェアパス設定
    reset_file="$firmware_dir/settings_reset-seeeduino_xiao_ble-zmk.uf2"
    left_file="$firmware_dir/moNa2_L rgbled_adapter-seeeduino_xiao_ble-zmk.uf2"
    right_file="$firmware_dir/moNa2_R rgbled_adapter-seeeduino_xiao_ble-zmk.uf2"
    
    log_info ""
    log_info "転送フロー: リセット → 右側 → リセット → 左側"
    log_info ""
    
    # Step 1: リセット
    wait_for_mount "1"
    copy_firmware "$reset_file" "1" "設定リセット"
    
    # Step 2: 右側
    wait_for_mount "2"
    copy_firmware "$right_file" "2" "右側ファームウェア"
    
    # Step 3: リセット（再び）
    wait_for_mount "3"
    copy_firmware "$reset_file" "3" "設定リセット（再実行）"
    
    # Step 4: 左側
    wait_for_mount "4"
    copy_firmware "$left_file" "4" "左側ファームウェア"
    
    log_success "=== ファームウェア転送完了！ ==="
    log_info "ZMKキーボードが正常に動作することを確認してください"
}

# 実行
main "$@"