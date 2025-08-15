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
CHECK_BUILD=true

# 使用方法を表示
usage() {
    echo "使用方法: $0 [オプション]"
    echo "オプション:"
    echo "  --skip-build   GitHub Actionsビルド確認をスキップ"
    echo "  --help         ヘルプを表示"
    exit 1
}

# 引数解析
while [[ $# -gt 0 ]]; do
    case $1 in
        --skip-build)
            CHECK_BUILD=false
            echo "${YELLOW}⏭️ ビルド確認スキップモード${NC}"
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

# 最新のファームウェアフォルダを検出（作成日時順）
find_latest_firmware() {
    # firmwareで始まるディレクトリを作成日時順で取得
    local latest_dir=$(ls -1dt "$DOWNLOADS_DIR"/firmware* 2>/dev/null | grep -E 'firmware( \([0-9]+\))?$' | head -1)
    
    if [[ -n "$latest_dir" && -d "$latest_dir" ]]; then
        echo "$latest_dir"
    else
        log_error "ファームウェアフォルダが見つかりません"
        exit 1
    fi
}

# GitHub Actionsビルド状況確認
check_github_build() {
    if [[ "$CHECK_BUILD" == "false" ]]; then
        log_step "⏭️ ビルド確認をスキップします"
        return 0
    fi
    
    log_step "🔍 GitHub Actionsビルド状況を確認中..."
    
    # 必要なコマンドの存在確認
    if ! command -v gh &> /dev/null; then
        log_error "GitHub CLI (gh) がインストールされていません"
        echo "インストール: brew install gh"
        exit 1
    fi
    
    if ! command -v jq &> /dev/null; then
        log_error "jq がインストールされていません"
        echo "インストール: brew install jq"
        exit 1
    fi
    
    # 最新runの情報を取得
    local run_info=$(gh run list -R kazuph/zmk-config-moNa2 --limit 1 --json status,conclusion,databaseId,workflowName 2>/dev/null)
    if [[ $? -ne 0 ]]; then
        log_error "GitHub Actionsの情報取得に失敗しました"
        exit 1
    fi
    
    local build_status=$(echo "$run_info" | jq -r '.[0].status')
    local conclusion=$(echo "$run_info" | jq -r '.[0].conclusion')
    local run_id=$(echo "$run_info" | jq -r '.[0].databaseId')
    
    log_step "📊 最新ビルド状況: $build_status"
    
    case "$build_status" in
        "completed")
            if [[ "$conclusion" == "success" ]]; then
                log_success "ビルド成功! Artifactをダウンロードします"
                download_latest_artifact "$run_id"
            else
                log_error "ビルドが失敗しています: $conclusion"
                say_jp "ビルドが失敗しています"
                exit 1
            fi
            ;;
        "in_progress"|"queued")
            log_step "⏳ ビルドが実行中です。完了を待機..."
            say_jp "ビルド実行中。完了を待機します"
            wait_for_build_completion "$run_id"
            ;;
        *)
            log_error "不明なビルド状況: $build_status"
            exit 1
            ;;
    esac
}

# ビルド完了待機
wait_for_build_completion() {
    local run_id="$1"
    local check_interval=10
    
    # 10秒間隔でチェック
    local check_count=0
    while true; do
        ((check_count++))
        log_step "🔍 ビルド状況チェック #${check_count}"
        
        local run_info=$(gh run list -R kazuph/zmk-config-moNa2 --limit 1 --json status,conclusion,databaseId 2>/dev/null)
        local build_status=$(echo "$run_info" | jq -r '.[0].status')
        local conclusion=$(echo "$run_info" | jq -r '.[0].conclusion')
        local current_run_id=$(echo "$run_info" | jq -r '.[0].databaseId')
        
        # run_idが変わった場合は新しいビルドが開始されている
        if [[ "$current_run_id" != "$run_id" ]]; then
            log_step "🔄 新しいビルドが開始されました"
            run_id="$current_run_id"
        fi
        
        case "$build_status" in
            "completed")
                if [[ "$conclusion" == "success" ]]; then
                    log_success "ビルド完了! Artifactをダウンロードします"
                    say_jp "ビルド完了"
                    download_latest_artifact "$run_id"
                    return 0
                else
                    log_error "ビルドが失敗しました: $conclusion"
                    say_jp "ビルドが失敗しました"
                    exit 1
                fi
                ;;
            "in_progress"|"queued")
                log_step "⏳ まだ実行中... ${check_interval}秒後に再チェック"
                sleep $check_interval
                ;;
            *)
                log_error "不明なビルド状況: $build_status"
                exit 1
                ;;
        esac
    done
}

# 最新Artifactダウンロード
download_latest_artifact() {
    local run_id="$1"
    local artifact_name="firmware"
    local download_dir="$DOWNLOADS_DIR"
    local temp_dir="./temp_artifact_download"
    
    log_step "📦 Artifact '$artifact_name' をダウンロード中..."
    say_jp "アーティファクトをダウンロード中"
    
    # 既存のfirmwareフォルダをバックアップ
    if [[ -d "$download_dir/firmware" ]]; then
        local backup_name="firmware_backup_$(date +%Y%m%d_%H%M%S)"
        log_step "🗂️ 既存フォルダを $backup_name にバックアップ"
        mv "$download_dir/firmware" "$download_dir/$backup_name"
    fi
    
    # 一時ディレクトリを作成してダウンロード
    mkdir -p "$temp_dir"
    
    # Artifactダウンロード（現在のgitリポジトリで実行）
    if gh run download "$run_id" -R kazuph/zmk-config-moNa2 -D "$temp_dir" -n "$artifact_name" 2>/dev/null; then
        log_success "Artifactダウンロード完了"
        say_jp "ダウンロード完了"
        
        # ダウンロードディレクトリに移動
        if [[ -d "$temp_dir/$artifact_name" ]]; then
            mv "$temp_dir/$artifact_name" "$download_dir/firmware"
        elif [[ -f "$temp_dir/$artifact_name.zip" ]]; then
            log_step "📂 zipファイルを展開中..."
            unzip -q "$temp_dir/$artifact_name.zip" -d "$download_dir/"
            log_success "zip展開完了"
        else
            # 直接ファイルがある場合（単一ファイルArtifact）
            mkdir -p "$download_dir/firmware"
            mv "$temp_dir"/* "$download_dir/firmware/"
        fi
        
        # 一時ディレクトリをクリーンアップ
        rm -rf "$temp_dir"
        
        # firmwareフォルダの確認
        if [[ -d "$download_dir/firmware" ]]; then
            log_success "最新ファームウェアの準備完了"
        else
            log_error "firmwareフォルダが見つかりません"
            exit 1
        fi
    else
        log_error "Artifactダウンロードに失敗しました"
        rm -rf "$temp_dir"
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
    
    # GitHub Actionsビルド確認・Artifactダウンロード
    check_github_build
    
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