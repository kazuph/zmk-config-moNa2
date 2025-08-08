# macOSでの日本語入力切り替え設定

## 問題の概要
ZMKファームウェアには、macOSでINT4/INT5（変換/無変換）やLANG1/LANG2キーが正しく動作しない既知の問題があります。これはZMKファームウェアのissue #1236として報告されています。

## 解決方法
この問題を回避するため、以下の設定を行いました：

### 1. ZMK側の設定
- `INT_MUHENKAN` → `F13` に変更（英数入力用）
- `INT_HENKAN` → `F14` に変更（かな入力用）
- NKROを無効化してF13-F24キーが動作するように設定

### 2. macOS側の設定（Karabiner-Elements）

#### インストール
1. [Karabiner-Elements](https://karabiner-elements.pqrs.org/)をダウンロードしてインストール

#### 設定方法
1. Karabiner-Elementsを起動
2. 「Simple Modifications」タブを選択
3. 以下のマッピングを追加：
   - `F13` → `英数キー (Japanese eisuu)`
   - `F14` → `かなキー (Japanese kana)`

#### 代替設定（コマンドキーを使用する場合）
左右のコマンドキーで切り替えたい場合は、「Complex Modifications」から以下の設定をインポート：
- 左コマンド単押し → 英数
- 右コマンド単押し → かな

## トラブルシューティング

### F13/F14が認識されない場合
1. ZMKの設定で`CONFIG_ZMK_HID_REPORT_TYPE_NKRO=n`が正しく設定されているか確認
2. キーボードを再接続してみる
3. Karabiner-Elementsを再起動してみる

### 切り替えが効かない場合
1. macOSのシステム設定 → キーボード → 入力ソースで日本語入力が有効になっているか確認
2. Karabiner-Elementsのイベントビューアーで、F13/F14キーが正しく認識されているか確認

## 参考リンク
- [ZMK Issue #1236](https://github.com/zmkfirmware/zmk/issues/1236)
- [Karabiner-Elements公式サイト](https://karabiner-elements.pqrs.org/)
- [日本語環境でのKarabiner-Elements設定例](https://misclog.jp/karabiner-elements/)