moNa2 ZMK ビルド要点（あるべき状態）

- `zephyr/module.yml`: `build.settings.board_root: config` を設定する。
- `config/moNa2.keymap`:
  - `#define ZMK_POINTING_DEFAULT_SCRL_VAL 100` を `<dt-bindings/zmk/pointing.h>` をインクルードする前に置く。
  - `macros` / `behaviors` の各ノードで `label` プロパティを使用しない。
- `config/boards/shields/moNa2/`:
  - 左右のオーバーレイ等（`moNa2_L.overlay` / `moNa2_R.overlay` など）はここに配置する。
  - DTS 内（例: `kscan0` など）のノードで `label` プロパティを使用しない。
- ビルド（シールド指定の正しい形式）:
  - スペース区切りをクォート: `-DSHIELD="moNa2_L rgbled_adapter"`
  - またはセミコロン区切り: `-DSHIELD=moNa2_L;rgbled_adapter`
  - 例（左手側）: `west build -s zmk/app -d <build_dir> -b seeeduino_xiao_ble -- -DZMK_CONFIG=<path>/config -DSHIELD="moNa2_L rgbled_adapter"`
  - 例（右手側）: `west build -s zmk/app -d <build_dir> -b seeeduino_xiao_ble -- -DZMK_CONFIG=<path>/config -DSHIELD="moNa2_R rgbled_adapter"`
