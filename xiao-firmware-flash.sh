#!/bin/bash

# XIAO-SENSE 自動ファームウェア転送スクリプト
# フロー: reset → R → reset → L

set -e

# 色付きログ出力
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m' # No Color

# 音声出力
say_jp() {
    # Terminatedメッセージを防ぐため、音声を順次再生
    say -v Kyoko "$1" >/dev/null 2>&1 || true
}

# 簡潔なログ出力
log_step() {
    echo -e "${BOLD}${CYAN}$1${NC}"
}

log_success() {
    echo -e "${GREEN}✅ $1${NC}"
}

log_error() {
    echo -e "${RED}❌ $1${NC}"
}

# 動的スピナー
spinner() {
    local pid=$!
    local delay=0.1
    local spinstr='|/-\'
    while [ "$(ps a | awk '{print $1}' | grep $pid)" ]; do
        local temp=${spinstr#?}
        printf "\r${CYAN}[%c] $1${NC}" "$spinstr"
        local spinstr=$temp${spinstr%"$temp"}
        sleep $delay
    done
    printf "\r"
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
            echo "${YELLOW}🧪 ドライランモード${NC}"
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
        log_error "リセットファイルが見つかりません"
        exit 1
    fi
    
    if [[ ! -f "$left_file" ]]; then
        log_error "左側ファームウェアが見つかりません"
        exit 1
    fi
    
    if [[ ! -f "$right_file" ]]; then
        log_error "右側ファームウェアが見つかりません"
        exit 1
    fi
    
    log_success "ファイル確認完了"
}

# マウント待ち
wait_for_mount() {
    local step="$1"
    local device_name="$2"
    local instruction="$3"
    
    echo ""
    log_step "[$step/4] $device_name"
    echo "📋 $instruction"
    
    case "$step" in
        "1") say_jp "右キーボードを接続" ;;
        "2") say_jp "再度右キーボードを接続" ;;
        "3") say_jp "左キーボードを接続" ;;
        "4") say_jp "再度左キーボードを接続" ;;
    esac
    
    local count=0
    while [[ ! -d "$MOUNT_POINT" ]]; do
        printf "\r\033[K${YELLOW}⏳ 接続待ち %ds (リセットボタン2回押し→USB)${NC}" $count
        sleep 1
        ((count++))
    done
    
    printf "\r\033[K${GREEN}✅ 接続確認! XIAO-SENSE検出${NC}\n"
    say_jp "接続確認"
    sleep 1
}

# ファームウェアコピー
copy_firmware() {
    local src_file="$1"
    local description="$2"
    
    if [[ ! -f "$src_file" ]]; then
        log_error "ファイルが見つかりません: $src_file"
        exit 1
    fi
    
    if [[ "$DRY_RUN" == "true" ]]; then
        echo "${YELLOW}[DRY RUN] $description${NC}"
        return 0
    fi
    
    # コピー処理
    printf "${CYAN}📁 $description を書き込み中...${NC}"
    cp "$src_file" "$MOUNT_POINT/" 2>/dev/null || true
    printf "\r\033[K${GREEN}✅ $description 完了${NC}\n"
    
    case "$description" in
        *"リセット"*) say_jp "リセット完了" ;;
        *"右"*) say_jp "右ファームウェア転送完了" ;;
        *"左"*) say_jp "左ファームウェア転送完了" ;;
    esac
    
    # アンマウント待ち
    local count=0
    while [[ -d "$MOUNT_POINT" ]]; do
        printf "\r\033[K${CYAN}⏳ 自動切断待ち... %ds${NC}" $count
        sleep 1
        ((count++))
    done
    
    printf "\r\033[K${GREEN}🔌 切断完了!${NC}\n"
    say_jp "切断完了"
    sleep 1
}

# メイン処理
main() {
    echo -e "${BOLD}${CYAN}🚀 XIAO-SENSE 自動ファームウェア転送${NC}"
    echo ""
    say_jp "ファームウェアを転送します"
    
    # 最新ファームウェア検出
    firmware_dir=$(find_latest_firmware)
    echo "📦 フォルダ: $(basename "$firmware_dir")"
    
    # ファームウェアファイル確認
    check_firmware_files "$firmware_dir"
    
    # ファームウェアパス設定
    reset_file="$firmware_dir/settings_reset-seeeduino_xiao_ble-zmk.uf2"
    left_file="$firmware_dir/moNa2_L rgbled_adapter-seeeduino_xiao_ble-zmk.uf2"
    right_file="$firmware_dir/moNa2_R rgbled_adapter-seeeduino_xiao_ble-zmk.uf2"
    
    echo -e "${YELLOW}🔄 手順: 右リセット → 右R書き込み → 左リセット → 左L書き込み${NC}"
    
    # Step 1: 右キーボードを接続してリセット
    wait_for_mount "1" "右（リセット）" "右キーボードを接続"
    copy_firmware "$reset_file" "リセットファームウェア"
    
    # Step 2: 右キーボードを接続して右ファームウェア転送
    wait_for_mount "2" "右（R書き込み）" "右キーボードを接続"
    copy_firmware "$right_file" "右ファームウェア"
    
    # Step 3: 左キーボードを接続してリセット
    wait_for_mount "3" "左（リセット）" "左キーボードを接続"
    copy_firmware "$reset_file" "リセットファームウェア"
    
    # Step 4: 左キーボードを接続して左ファームウェア転送
    wait_for_mount "4" "左（L書き込み）" "左キーボードを接続"
    copy_firmware "$left_file" "左ファームウェア"
    
    echo ""
    log_success "ファームウェア転送完了！"
    say_jp "すべての転送が完了しました。キーボードをテスト"
    echo "🎹 ZMKキーボードの動作確認"
}

# 実行
main "$@"