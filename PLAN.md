# moNa2 keymap ecosystem plan

## ゴール

moNa2 の通常 keymap 変更フローから、他人の Web サイト、GitHub OAuth、main 直 push、毎回の GitHub Actions build、artifact 手動ダウンロードを外す。

最終形は次の 2 系統に分ける。

1. 普段の keymap 変更
   - self-host した ZMK Studio 系 UI から USB 経由で右側 central に流す。
   - firmware は毎回ビルドしない。
2. 復旧・大変更・初回 Studio 化
   - self-host した UF2 flasher から、選択した `.uf2` を `XIAO-SENSE` に流す。
   - GitHub OAuth は使わない。

## 前提

- moNa2 は右側が central / master、左側が peripheral / slave。
- keymap を解釈して Mac/PC に HID 入力を送るのは右側 central。
- 左側は基本的にキー位置イベントを右側へ送る側。
- `config/moNa2.keymap` の通常のキー配置変更だけなら、右側 firmware の更新で反映される。
- 左側 firmware が必要になるのは、左側 overlay、matrix、GPIO、encoder、split 通信、左右両方に関係する firmware 設定を変えたとき。
- ZMK Studio を使うには、最初に一度だけ Studio 対応 firmware を焼く必要がある。
- Studio 管理を始めた後は、repo の `.keymap` 変更はそのまま runtime keymap に反映されない。必要なら Studio の Restore Stock Settings で stock keymap に戻す。

## やらないこと

- `nickcoutsos.github.io/keymap-editor` を通常運用に使わない。
- GitHub OAuth で外部サービスに repo 書き込み権限を渡さない。
- keymap 変更ごとに GitHub Actions で firmware をビルドしない。
- 最新 Actions artifact を commit 対応確認なしに焼かない。
- `cp ... || true` で firmware 書き込み失敗を成功扱いしない。

## Phase 1: 現状固定とリスク除去

### 1. 現在の repo 状態を記録する

実装:
- `git status --short --branch` で作業ツリーが clean か確認する。
- `git log --oneline -5` で現在の復旧基準 commit を記録する。
- 最新 GitHub Actions run が現在 commit と一致して成功しているか確認する。

検証:
- `gh run list --limit 1 --json headSha,status,conclusion,databaseId`
- `git rev-parse HEAD`
- `headSha == HEAD` かつ `status == completed` かつ `conclusion == success` であること。

### 2. 既存 flasher の危険な成功扱いを止める

実装:
- `xiao-firmware-flash.sh` の `cp "$src_file" "$MOUNT_POINT/" 2>/dev/null || true` をやめる。
- コピー開始前に `XIAO-SENSE` の存在を確認する。
- コピーコマンドの終了コード、コピー後の自動アンマウント、既知の macOS UF2 エラーを区別する。
- 少なくとも「コピー開始前に mount がない」「source file がない」「対象ファイル名が左右と合わない」は失敗にする。

検証:
- `bash -n xiao-firmware-flash.sh`
- mount がない状態で実行し、成功表示にならないこと。
- 存在しない `.uf2` を指定した場合に失敗すること。

### 3. artifact と commit の対応を必須にする

実装:
- flasher が使う artifact は `HEAD` の workflow run からのみ取得する。
- `gh run list --commit "$(git rev-parse HEAD)"` 相当で run を選ぶ。
- artifact 保存先を `~/Downloads/moNa2-firmware/<short-sha>/` にする。
- 保存後に `SOURCE_COMMIT` などの manifest を同ディレクトリへ書く。

検証:
- `~/Downloads/moNa2-firmware/<short-sha>/SOURCE_COMMIT` が `git rev-parse HEAD` と一致すること。
- 別 commit の artifact を選ぼうとしたとき失敗すること。

## Phase 2: ZMK Studio 対応 firmware を作る

### 4. 右側 central の Studio build を追加する

実装:
- `build.yaml` の `moNa2_R rgbled_adapter` build に ZMK Studio 用設定を追加する。
- 右側だけに `snippet: studio-rpc-usb-uart` を付ける。
- 右側だけに `cmake-args: -DCONFIG_ZMK_STUDIO=y` を付ける。
- 左側 build と `settings_reset` build は通常どおり残す。

検証:
- GitHub Actions で右側、左側、settings reset の全 build が成功すること。
- artifact に `moNa2_R rgbled_adapter-seeeduino_xiao_ble-zmk.uf2` が出ること。

### 5. Studio unlock を追加する

実装:
- `config/moNa2.keymap` に `&studio_unlock` を配置する。
- 誤操作しにくい場所、または既存の管理レイヤー `layer_3` に置く。
- 既存の bootloader / BT 操作と衝突しない位置にする。

検証:
- ZMK build が成功すること。
- 実機で Studio 接続時に unlock できること。

### 6. 初回だけ右側へ Studio firmware を焼く

実装:
- 右側を bootloader mode にする。
- `moNa2_R rgbled_adapter-seeeduino_xiao_ble-zmk.uf2` を `XIAO-SENSE` へコピーする。
- keymap 変更だけなら `settings_reset` は流さない。
- 左側はこの時点では焼かない。

検証:
- 右側が通常起動すること。
- USB 接続時に ZMK Studio が右側を認識すること。
- 左側のキー入力が右側経由で反映されること。

## Phase 3: self-host ZMK Studio を通常運用にする

### 7. ZMK Studio を self-host する

実装:
- `zmkfirmware/zmk-studio` を確認し、ライセンスと build 方法を確認する。
- local build できることを確認する。
- GitHub Pages、Cloudflare Pages、またはローカル静的配信のどれかで自分用 URL を用意する。
- public に置く場合でも OAuth や repo 権限は使わない。

検証:
- self-host URL を Chrome/Edge で開けること。
- USB connection flow が起動すること。
- moNa2_R に接続できること。

### 8. self-host Studio で keymap を変更する

実装:
- 右側を USB 接続する。
- Studio unlock を押す。
- self-host Studio から keymap を変更する。
- 変更を保存する。

検証:
- firmware build なしでキー配置が変わること。
- 左側の物理キーも、右側 central の keymap 解釈に従って変わること。
- 電源再投入後も変更が残ること。

## Phase 4: self-host UF2 flasher を用意する

### 9. ブラウザ UF2 flasher の方式を決める

実装:
- WebUSB ではなく、まず File System Access API で `XIAO-SENSE` に `.uf2` を書く方針にする。
- 理由: XIAO nRF52840 の bootloader は通常 UF2 mass storage として見えるため。
- WebUSB / WebSerial flashing は bootloader 側が対応 protocol を持つ場合だけ検討する。

検証:
- Chrome/Edge で `showDirectoryPicker()` が使えること。
- `XIAO-SENSE` ドライブをユーザーが選択できること。

### 10. 最小 flasher UI を作る

実装:
- `~/Downloads/moNa2-firmware/<現在の commit>/` の `.uf2` をプリセット表示。
- プリセットがない場合や別ファイルを使う場合の `.uf2` ファイル選択。
- 書き込み先ディレクトリ選択。
- 選択ファイル名が `moNa2_R` / `moNa2_L` / `settings_reset` のどれかを表示。
- 書き込み前に「右に焼くファイルか、左に焼くファイルか」を明示する。
- コピー中にドライブが消えることを正常系として扱う。

検証:
- self-host flasher に現在 commit の右側、左側、settings reset がプリセット表示されること。
- dummy directory への書き込みでファイルコピーが成功すること。
- 実機 bootloader の `XIAO-SENSE` へコピーして自動アンマウントすること。
- 誤った左右ファイルを選んだときに警告が出ること。

## Phase 5: 旧フローをドキュメントから降格する

### 11. README / onboarding を更新する

実装:
- 通常フローを self-host ZMK Studio に変更する。
- KeymapEditor + GitHub OAuth + Actions build は legacy / fallback 扱いにする。
- 「keymap だけなら右側だけ」を明記する。
- 「左側も焼く条件」を明記する。
- firmware 流し込みは self-host flasher または手動 UF2 コピーに整理する。

検証:
- 初見でも次の判断ができること。
  - keymap 変更だけ: Studio で USB 更新。
  - Studio 初回化: 右側 firmware を一度焼く。
  - hardware / config 変更: firmware build と対象側の UF2 flash。
  - 復旧: settings reset と左右 firmware。

### 12. 旧スクリプトの位置づけを決める

実装:
- `xiao-firmware-flash.sh` を安全化して残す、または legacy script として README から外す。
- 残す場合は commit SHA 対応確認を必須にする。
- self-host flasher が安定したら、通常運用から shell script を外す。

検証:
- README の推奨フローと script の挙動が矛盾しないこと。
- 「最新 artifact を勝手に焼く」導線が残っていないこと。

## 完了条件

- 通常 keymap 変更で GitHub OAuth を使わない。
- 通常 keymap 変更で GitHub Actions build を待たない。
- 通常 keymap 変更で firmware を焼かない。
- keymap 変更は self-host Studio から USB で反映できる。
- firmware が必要なときだけ、自分の flasher または手動 UF2 コピーで流せる。
- 右だけでよい場合と、左も必要な場合が README 上で矛盾なく説明されている。

## 参考

- ZMK Studio: https://zmk.dev/docs/features/studio
- ZMK keymaps: https://zmk.dev/docs/keymaps
- ZMK flashing issues: https://zmk.dev/docs/troubleshooting/flashing-issues
- ZMK Studio repository: https://github.com/zmkfirmware/zmk-studio
