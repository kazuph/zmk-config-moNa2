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

const appPath = path.join(studioDir, "src/App.tsx");
let appSource = fs.readFileSync(appPath, "utf8");

appSource = appSource.replace(
  `  ...(navigator.bluetooth && navigator.userAgent.indexOf("Linux") >= 0
    ? [{ label: "BLE", connect: gatt_connect }]
    : []),`,
  `  ...(navigator.bluetooth
    ? [{ label: "BLE", connect: gatt_connect }]
    : []),`
);

appSource = appSource.replace(
  `    // TODO: Show a proper toast/alert not using \`window.alert\`
    window.alert("Failed to connect to the chosen device");`,
  `    (window as any).mona2ShowError?.("Failed to connect to the chosen device");`
);

fs.writeFileSync(appPath, appSource);

const connectModalPath = path.join(studioDir, "src/ConnectModal.tsx");
let connectModalSource = fs.readFileSync(connectModalPath, "utf8");

connectModalSource = connectModalSource.replace(
  `          Web Bluetooth
        </ExternalLink>{" "}
        (Linux only) to connect to ZMK devices.`,
  `          Web Bluetooth
        </ExternalLink>{" "}
        to connect to ZMK devices.`
);

connectModalSource = connectModalSource
  .replace(
    `.catch((e) => alert(e));`,
    `.catch((e) =>
            (window as any).mona2ShowError?.(e instanceof Error ? e.message : String(e))
          );`
  )
  .replace(
    `alert(e.message);`,
    `(window as any).mona2ShowError?.(e.message);`
  );

fs.writeFileSync(connectModalPath, connectModalSource);

const gattTransportPath = path.join(
  studioDir,
  "node_modules/@zmkfirmware/zmk-studio-ts-client/lib/transport/gatt.js"
);
let gattTransportSource = fs.readFileSync(gattTransportPath, "utf8");

gattTransportSource = gattTransportSource.replace(
  `    let dev = await navigator.bluetooth.requestDevice({
        filters: [
            { services: [SERVICE_UUID] },
            { namePrefix: 'moNa2' },
        ],
        optionalServices: [SERVICE_UUID],
    }).catch((e) => {`,
  `    let dev = await navigator.bluetooth.requestDevice({
        filters: [{ services: [SERVICE_UUID] }],
        optionalServices: [SERVICE_UUID],
    }).catch((e) => {`
);

gattTransportSource = gattTransportSource.replace(
  `    let char = await svc.getCharacteristic(RPC_CHRC_UUID);
    let readable = new ReadableStream({
        async start(controller) {
            // Reconnect to the same device will lose notifications if we don't first force a stop before starting again.
            await char.stopNotifications();
            await char.startNotifications();`,
  `    let char = await svc.getCharacteristic(RPC_CHRC_UUID);
    // Reconnect to the same device will lose notifications if we don't first force a stop before starting again.
    // Wait for the CCC write to complete before any RPC bytes are written, otherwise the first response can be dropped.
    await char.stopNotifications();
    await char.startNotifications();
    let readable = new ReadableStream({
        async start(controller) {`
);

// Rebuild the notification ReadableStream wholesale:
// - Copy the exact notified byte range (Chrome may reuse/over-allocate the event buffer).
// - Detach listeners when the stream is cancelled or closed, so stale listeners from a
//   previous connect attempt don't throw "enqueue on closed stream" on every notification.
const gattReadableFixed = `    let streamClosed = false;
    let detachStream = () => {};
    let readable = new ReadableStream({
        async start(controller) {
            const dbg = typeof mona2BleDebug === 'function'
                ? mona2BleDebug
                : (stage, data) => console.info('[moNa2 BLE]', stage, data);
            let vc = (ev) => {
                if (streamClosed) {
                    return;
                }
                const view = ev.target?.value;
                if (!view) {
                    return;
                }
                const bytes = new Uint8Array(view.buffer.slice(view.byteOffset, view.byteOffset + view.byteLength));
                dbg('notification:bytes', {
                    byteLength: bytes.byteLength,
                    byteOffset: view.byteOffset,
                    bufferTotal: view.buffer.byteLength,
                });
                try {
                    controller.enqueue(bytes);
                } catch (e) {
                    dbg('notification:enqueue-after-close', { message: String(e) });
                    detachStream();
                }
            };
            let cb = async () => {
                detachStream();
                try {
                    controller.close();
                } catch {
                    // already closed or cancelled
                }
            };
            detachStream = () => {
                streamClosed = true;
                char.removeEventListener('characteristicvaluechanged', vc);
                dev.removeEventListener('gattserverdisconnected', cb);
            };
            char.addEventListener('characteristicvaluechanged', vc);
            dev.addEventListener('gattserverdisconnected', cb);
        },
        cancel() {
            detachStream();
        },
    });`;

if (!gattTransportSource.includes("detachStream")) {
  gattTransportSource = gattTransportSource.replace(
    /    let readable = new ReadableStream\(\{[\s\S]*?\n    \}\);/,
    gattReadableFixed
  );
}

if (!gattTransportSource.includes("detachStream")) {
  throw new Error("Failed to patch gatt.js notification stream lifecycle");
}

fs.writeFileSync(gattTransportPath, gattTransportSource);

const hidUsagesPath = path.join(studioDir, "src/hid-usages.ts");
let hidUsagesSource = fs.readFileSync(hidUsagesPath, "utf8");

if (!hidUsagesSource.includes("moNa2HidLabel")) {
  hidUsagesSource = hidUsagesSource.replace(
    "const overrides: Record<string, Record<string, HidLabels>> = HidOverrides;\n",
    `const overrides: Record<string, Record<string, HidLabels>> = HidOverrides;

const moNa2HidLabel = (usagePage: number, label?: string) =>
  usagePage === 7 ? label?.replace(/^Keyboard\\s+/, "") : label;
`
  );

  hidUsagesSource = hidUsagesSource.replace(
    `export const hid_usage_get_label = (
  usage_page: number,
  usage_id: number
): string | undefined =>
  overrides[usage_page.toString()]?.[usage_id.toString()]?.short ||
  UsagePages.find((p) => p.Id === usage_page)?.UsageIds?.find(
    (u) => u.Id === usage_id
  )?.Name;`,
    `export const hid_usage_get_label = (
  usage_page: number,
  usage_id: number
): string | undefined =>
  moNa2HidLabel(
    usage_page,
    overrides[usage_page.toString()]?.[usage_id.toString()]?.short ||
      UsagePages.find((p) => p.Id === usage_page)?.UsageIds?.find(
        (u) => u.Id === usage_id
      )?.Name
  );`
  );

  hidUsagesSource = hidUsagesSource.replace(
    `export const hid_usage_get_labels = (
  usage_page: number,
  usage_id: number
): { short?: string; med?: string; long?: string } =>
  overrides[usage_page.toString()]?.[usage_id.toString()] || {
    short: UsagePages.find((p) => p.Id === usage_page)?.UsageIds?.find(
      (u) => u.Id === usage_id
    )?.Name,
  };`,
    `export const hid_usage_get_labels = (
  usage_page: number,
  usage_id: number
): { short?: string; med?: string; long?: string } => {
  const labels = overrides[usage_page.toString()]?.[usage_id.toString()] || {
    short: UsagePages.find((p) => p.Id === usage_page)?.UsageIds?.find(
      (u) => u.Id === usage_id
    )?.Name,
  };

  return {
    short: moNa2HidLabel(usage_page, labels.short),
    med: moNa2HidLabel(usage_page, labels.med),
    long: moNa2HidLabel(usage_page, labels.long),
  };
};`
  );
}

fs.writeFileSync(hidUsagesPath, hidUsagesSource);

const keyPath = path.join(studioDir, "src/keyboard/Key.tsx");
let keySource = fs.readFileSync(keyPath, "utf8");

if (!keySource.includes("center?: boolean;")) {
  keySource = keySource.replace(
    "interface BehaviorShortName {\n  short?: string;\n}",
    "interface BehaviorShortName {\n  short?: string;\n  center?: boolean;\n}"
  );
}

if (!keySource.includes("centerLabel?: string;")) {
  keySource = keySource.replace(
    "interface KeyProps {\n  selected?: boolean;\n  width: number;\n  height: number;\n  oneU: number;\n  header?: string;\n  onClick?: () => void;\n}",
    "interface KeyProps {\n  selected?: boolean;\n  width: number;\n  height: number;\n  oneU: number;\n  header?: string;\n  centerLabel?: string;\n  onClick?: () => void;\n}"
  );
}

if (!keySource.includes("  centerLabel,\n  onClick,")) {
  keySource = keySource.replace(
    "  header,\n  onClick,\n  children,",
    "  header,\n  centerLabel,\n  onClick,\n  children,"
  );
}

if (!keySource.includes("const centeredHeader =")) {
  keySource = keySource.replace(
    "  const pixelWidth = width * oneU - 2;\n  const pixelHeight = height * oneU - 2;\n",
    "  const pixelWidth = width * oneU - 2;\n  const pixelHeight = height * oneU - 2;\n  const centeredHeader = typeof header !== \"undefined\" && shortNames[header]?.center;\n  const headerText = shortenHeader(header);\n"
  );
}

if (!keySource.includes("centerLabel ? <span")) {
  keySource = keySource.replace(
    "      <div className={`absolute text-xs ${selected ? \"text-primary-content\" : \"z1text-base-content\"} opacity-80 top-1 text-nowrap left-1/2 font-light -translate-x-1/2 text-center`}>{shortenHeader(header)}</div>\n      {children}",
    "      {!centerLabel && !centeredHeader && <div className={`absolute text-xs ${selected ? \"text-primary-content\" : \"z1text-base-content\"} opacity-80 top-1 text-nowrap left-1/2 font-light -translate-x-1/2 text-center`}>{headerText}</div>}\n      {centerLabel ? <span className=\"text-3xl font-medium leading-tight whitespace-pre-line text-center\">{centerLabel}</span> : centeredHeader ? <span className=\"text-4xl font-medium leading-none\">{headerText}</span> : children}"
  );
}

fs.writeFileSync(keyPath, keySource);

const keymapPath = path.join(studioDir, "src/keyboard/Keymap.tsx");
let keymapSource = fs.readFileSync(keymapPath, "utf8");

if (!keymapSource.includes("const moNa2CenterLabel =")) {
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
}

if (!keymapSource.includes("const centerLabel = moNa2CenterLabel(")) {
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
}

keymapSource = keymapSource.replace(
  "          hid_usage={keymap.layers[selectedLayerIndex].bindings[i].param1}",
  "          hid_usage={binding.param1}"
);

fs.writeFileSync(keymapPath, keymapSource);
// Stream the in-page BLE/RPC debug ring buffer to the local server so traces can be
// inspected from the repo (.artifacts/studio-key-picker-ux/ble-trace.json) without
// manual copy/paste from DevTools.
const indexHtmlPath = path.join(studioDir, "index.html");
let indexHtmlSource = fs.readFileSync(indexHtmlPath, "utf8");

if (!indexHtmlSource.includes("mona2ShowError")) {
  indexHtmlSource = indexHtmlSource.replace(
    "</head>",
    `  <script>
      (() => {
        window.mona2ShowError = (message) => {
          const text = typeof message === "string" ? message : String(message);
          console.error("[moNa2 Studio]", text);
          let panel = document.getElementById("mona2-error-panel");
          if (!panel) {
            panel = document.createElement("div");
            panel.id = "mona2-error-panel";
            panel.setAttribute("role", "alert");
            panel.style.cssText = [
              "position:fixed",
              "top:56px",
              "right:16px",
              "z-index:2147483647",
              "max-width:420px",
              "padding:12px 14px",
              "border-radius:6px",
              "background:#991b1b",
              "color:white",
              "font:14px/1.4 system-ui,-apple-system,BlinkMacSystemFont,sans-serif",
              "box-shadow:0 12px 32px rgba(0,0,0,.22)",
              "white-space:pre-wrap",
            ].join(";");
            document.body.appendChild(panel);
          }
          panel.textContent = text;
        };
      })();
    </script>
  </head>`
  );
}

if (!indexHtmlSource.includes("/api/ble-debug")) {
  indexHtmlSource = indexHtmlSource.replace(
    "</head>",
    `  <script>
      (() => {
        const seen = new Set();
        const all = [];
        let dirty = false;
        setInterval(() => {
          const buf = window.__mona2BleDebug || [];
          for (const e of buf) {
            const k = e.t + "|" + e.stage + "|" + JSON.stringify(e.data || {});
            if (!seen.has(k)) {
              seen.add(k);
              all.push(e);
              dirty = true;
            }
          }
        }, 200);
        setInterval(() => {
          if (!dirty) return;
          dirty = false;
          fetch("/api/ble-debug", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              updatedAt: new Date().toISOString(),
              userAgent: navigator.userAgent,
              count: all.length,
              events: all.slice(-600),
            }),
          }).catch(() => {});
        }, 1000);
      })();
    </script>
  </head>`
  );
}

fs.writeFileSync(indexHtmlPath, indexHtmlSource);

const overridesDir = path.join(repoRoot, "tools/zmk-studio-overrides");
const overrideFiles = [
  "HidUsagePicker.tsx",
  "BehaviorBindingPicker.tsx",
  "ParameterValuePicker.tsx",
  "Mona2Pickers.stories.tsx",
];

for (const file of overrideFiles) {
  fs.copyFileSync(
    path.join(overridesDir, file),
    path.join(studioDir, "src/behaviors", file)
  );
}
