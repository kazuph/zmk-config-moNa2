#!/usr/bin/env node

const fs = require("fs");
const path = require("path");

const studioDir = process.argv[2];
if (!studioDir) {
  console.error("Usage: patch-zmk-studio-mona2-ui.js <zmk-studio-dir>");
  process.exit(1);
}

const repoRoot = path.resolve(__dirname, "..");

const mergeFlatJson = (targetPath, overlayPath) => {
  const base = JSON.parse(fs.readFileSync(targetPath, "utf8"));
  const overlay = JSON.parse(fs.readFileSync(overlayPath, "utf8"));
  fs.writeFileSync(targetPath, JSON.stringify({ ...base, ...overlay }, null, 2) + "\n");
};

const mergeNestedJson = (targetPath, overlayPath) => {
  const base = JSON.parse(fs.readFileSync(targetPath, "utf8"));
  const overlay = JSON.parse(fs.readFileSync(overlayPath, "utf8"));
  for (const [page, values] of Object.entries(overlay)) {
    base[page] = { ...(base[page] || {}), ...values };
  }
  fs.writeFileSync(targetPath, JSON.stringify(base, null, 2) + "\n");
};

mergeFlatJson(
  path.join(studioDir, "src/keyboard/behavior-short-names.json"),
  path.join(repoRoot, "tools/zmk-studio-mona2-short-names.json")
);

mergeNestedJson(
  path.join(studioDir, "src/hid-usage-name-overrides.json"),
  path.join(repoRoot, "tools/zmk-studio-mona2-hid-overrides.json")
);

const keyPath = path.join(studioDir, "src/keyboard/Key.tsx");
let keySource = fs.readFileSync(keyPath, "utf8");

keySource = keySource.replace(
  "interface BehaviorShortName {\n  short?: string;\n}",
  "interface BehaviorShortName {\n  short?: string;\n  center?: boolean;\n}"
);

keySource = keySource.replace(
  "interface KeyProps {\n  selected?: boolean;\n  width: number;\n  height: number;\n  oneU: number;\n  header?: string;\n  onClick?: () => void;\n}",
  "interface KeyProps {\n  selected?: boolean;\n  width: number;\n  height: number;\n  oneU: number;\n  header?: string;\n  centerLabel?: string;\n  onClick?: () => void;\n}"
);

keySource = keySource.replace(
  "  header,\n  onClick,\n  children,",
  "  header,\n  centerLabel,\n  onClick,\n  children,"
);

keySource = keySource.replace(
  "  const pixelWidth = width * oneU - 2;\n  const pixelHeight = height * oneU - 2;\n",
  "  const pixelWidth = width * oneU - 2;\n  const pixelHeight = height * oneU - 2;\n  const centeredHeader = typeof header !== \"undefined\" && shortNames[header]?.center;\n  const headerText = shortenHeader(header);\n"
);

keySource = keySource.replace(
  "      <div className={`absolute text-xs ${selected ? \"text-primary-content\" : \"z1text-base-content\"} opacity-80 top-1 text-nowrap left-1/2 font-light -translate-x-1/2 text-center`}>{shortenHeader(header)}</div>\n      {children}",
  "      {!centerLabel && !centeredHeader && <div className={`absolute text-xs ${selected ? \"text-primary-content\" : \"z1text-base-content\"} opacity-80 top-1 text-nowrap left-1/2 font-light -translate-x-1/2 text-center`}>{headerText}</div>}\n      {centerLabel ? <span className=\"text-3xl font-medium leading-tight whitespace-pre-line text-center\">{centerLabel}</span> : centeredHeader ? <span className=\"text-4xl font-medium leading-none\">{headerText}</span> : children}"
);

fs.writeFileSync(keyPath, keySource);

const keymapPath = path.join(studioDir, "src/keyboard/Keymap.tsx");
let keymapSource = fs.readFileSync(keymapPath, "utf8");

keymapSource = keymapSource.replace(
  "type BehaviorMap = Record<number, GetBehaviorDetailsResponse>;\n",
  `type BehaviorMap = Record<number, GetBehaviorDetailsResponse>;

const moNa2CenterLabel = (
  layerIndex: number,
  keyPosition: number,
  behaviorName: string,
  binding: { param1?: number; param2?: number },
) => {
  if (behaviorName === "Transparent") return "透過";
  if (behaviorName === "Bootloader") return "書込";
  if (behaviorName === "Studio Unlock") return "Studio\\n解除";
  if (behaviorName === "Momentary Layer") return \`L\${binding.param1}\`;
  if (behaviorName === "Toggle Layer") return \`L\${binding.param1}\\n切替\`;
  if (behaviorName.toLowerCase().includes("mouse")) {
    const labels: Record<number, string> = {
      1: "🖱\\n左",
      2: "🖱\\n右",
      3: "🖱\\n中",
    };
    return labels[binding.param1 || 0] || "🖱";
  }
  if (behaviorName === "Bluetooth") {
    if (layerIndex === 3) {
      const labels: Record<number, string> = {
        5: "BT0",
        6: "BT1",
        7: "BT2",
        8: "BT\\n削除",
        9: "BT\\n全削除",
      };
      return labels[keyPosition] || "BT";
    }
    return "BT";
  }
  return undefined;
};
`
);

keymapSource = keymapSource.replace(
  `    return {
      id: \`\${keymap.layers[selectedLayerIndex].id}-\${i}\`,
      header:
        behaviors[keymap.layers[selectedLayerIndex].bindings[i].behaviorId]
          ?.displayName || "Unknown",`,
  `    const binding = keymap.layers[selectedLayerIndex].bindings[i];
    const behaviorName =
      behaviors[binding.behaviorId]?.displayName || "Unknown";
    const centerLabel = moNa2CenterLabel(
      selectedLayerIndex,
      i,
      behaviorName,
      binding,
    );

    return {
      id: \`\${keymap.layers[selectedLayerIndex].id}-\${i}\`,
      header: centerLabel ? undefined : behaviorName,
      centerLabel,`
);

keymapSource = keymapSource.replace(
  "          hid_usage={keymap.layers[selectedLayerIndex].bindings[i].param1}",
  "          hid_usage={binding.param1}"
);

fs.writeFileSync(keymapPath, keymapSource);
