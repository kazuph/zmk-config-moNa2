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
  "  const pixelWidth = width * oneU - 2;\n  const pixelHeight = height * oneU - 2;\n",
  "  const pixelWidth = width * oneU - 2;\n  const pixelHeight = height * oneU - 2;\n  const centeredHeader = typeof header !== \"undefined\" && shortNames[header]?.center;\n  const headerText = shortenHeader(header);\n"
);

keySource = keySource.replace(
  "      <div className={`absolute text-xs ${selected ? \"text-primary-content\" : \"z1text-base-content\"} opacity-80 top-1 text-nowrap left-1/2 font-light -translate-x-1/2 text-center`}>{shortenHeader(header)}</div>\n      {children}",
  "      {!centeredHeader && <div className={`absolute text-xs ${selected ? \"text-primary-content\" : \"z1text-base-content\"} opacity-80 top-1 text-nowrap left-1/2 font-light -translate-x-1/2 text-center`}>{headerText}</div>}\n      {centeredHeader ? <span className=\"text-4xl font-medium leading-none\">{headerText}</span> : children}"
);

fs.writeFileSync(keyPath, keySource);
