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

const hidUsagePickerPath = path.join(studioDir, "src/behaviors/HidUsagePicker.tsx");
fs.writeFileSync(
  hidUsagePickerPath,
  `import {
  Button,
  Checkbox,
  CheckboxGroup,
  Label,
} from "react-aria-components";
import {
  hid_usage_from_page_and_id,
  hid_usage_get_label,
  hid_usage_page_get_ids,
} from "../hid-usages";
import { useCallback, useMemo } from "react";

export interface HidUsagePage {
  id: number;
  min?: number;
  max?: number;
}

export interface HidUsagePickerProps {
  label?: string;
  value?: number;
  usagePages: HidUsagePage[];
  onValueChanged: (value?: number) => void;
}

interface UsageChoice {
  pageId: number;
  id: number;
  value: number;
  label: string;
}

const sectionLabel = (pageId: number) => {
  if (pageId === 7) return "Keyboard";
  if (pageId === 12) return "Consumer";
  return hid_usage_page_get_ids(pageId)?.Name || \`Page \${pageId}\`;
};

const usageChoices = ({ id, min, max }: HidUsagePage): UsageChoice[] => {
  const info = hid_usage_page_get_ids(id);
  let usages = info?.UsageIds || [];

  if (max || min) {
    usages = usages.filter(
      (i) =>
        (i.Id <= (max || Number.MAX_SAFE_INTEGER) && i.Id >= (min || 0)) ||
        (id === 7 && i.Id >= 0xe0 && i.Id <= 0xe7)
    );
  }

  return usages.map((i) => {
    const value = hid_usage_from_page_and_id(id, i.Id);
    return {
      pageId: id,
      id: i.Id,
      value,
      label: hid_usage_get_label(id, i.Id) || i.Name,
    };
  });
};

enum Mods {
  LeftControl = 0x01,
  LeftShift = 0x02,
  LeftAlt = 0x04,
  LeftGUI = 0x08,
  RightControl = 0x10,
  RightShift = 0x20,
  RightAlt = 0x40,
  RightGUI = 0x80,
}

const mod_labels: Record<Mods, string> = {
  [Mods.LeftControl]: "L ⌃",
  [Mods.LeftShift]: "L ⇧",
  [Mods.LeftAlt]: "L ⌥",
  [Mods.LeftGUI]: "L ⌘",
  [Mods.RightControl]: "R ⌃",
  [Mods.RightShift]: "R ⇧",
  [Mods.RightAlt]: "R ⌥",
  [Mods.RightGUI]: "R ⌘",
};

const all_mods = [
  Mods.LeftControl,
  Mods.LeftShift,
  Mods.LeftAlt,
  Mods.LeftGUI,
  Mods.RightControl,
  Mods.RightShift,
  Mods.RightAlt,
  Mods.RightGUI,
];

function mods_to_flags(mods: Mods[]): number {
  return mods.reduce((a, v) => a + v, 0);
}

function mask_mods(value: number) {
  return value & ~(mods_to_flags(all_mods) << 24);
}

export const HidUsagePicker = ({
  label,
  value,
  usagePages,
  onValueChanged,
}: HidUsagePickerProps) => {
  const currentUsage = value ? mask_mods(value) : undefined;
  const choicesByPage = useMemo(
    () =>
      usagePages.map((page) => ({
        page,
        choices: usageChoices(page),
      })),
    [usagePages]
  );

  const selectedLabel = useMemo(() => {
    for (const { choices } of choicesByPage) {
      const found = choices.find((choice) => choice.value === currentUsage);
      if (found) return found.label;
    }

    return currentUsage ? \`0x\${currentUsage.toString(16)}\` : "未選択";
  }, [choicesByPage, currentUsage]);

  const mods = useMemo(() => {
    const flags = value ? value >> 24 : 0;
    return all_mods.filter((m) => m & flags).map((m) => m.toLocaleString());
  }, [value]);

  const chooseUsage = useCallback(
    (nextValue: number) => {
      const modFlags = mods_to_flags(mods.map((m) => parseInt(m)));
      onValueChanged(nextValue | (modFlags << 24));
    },
    [onValueChanged, mods]
  );

  const modifiersChanged = useCallback(
    (m: string[]) => {
      if (!value) {
        return;
      }

      const modFlags = mods_to_flags(m.map((m) => parseInt(m)));
      onValueChanged(mask_mods(value) | (modFlags << 24));
    },
    [onValueChanged, value]
  );

  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap items-center gap-2">
        {label && <Label id="hid-usage-picker">{label}:</Label>}
        <div className="rounded-md bg-base-300 px-3 py-2 text-base font-medium">
          {selectedLabel}
        </div>
        <CheckboxGroup
          aria-label="Implicit Modifiers"
          className="grid grid-flow-col gap-x-px auto-cols-[minmax(min-content,1fr)] content-stretch divide-x rounded-md"
          value={mods}
          onChange={modifiersChanged}
        >
          {all_mods.map((m) => (
            <Checkbox
              key={m}
              value={m.toLocaleString()}
              className="text-nowrap cursor-pointer grid px-3 py-2 content-center justify-center rac-selected:bg-primary border-base-100 bg-base-300 hover:bg-base-100 first:rounded-s-md last:rounded-e-md rac-selected:text-primary-content"
            >
              {mod_labels[m]}
            </Checkbox>
          ))}
        </CheckboxGroup>
      </div>
      <div className="grid gap-3 max-h-[42vh] overflow-auto pr-2">
        {choicesByPage.map(({ page, choices }) => (
          <section key={page.id} className="grid gap-2">
            <h3 className="text-sm font-semibold text-base-content/60">
              {sectionLabel(page.id)}
            </h3>
            <div className="flex flex-wrap gap-1.5">
              {choices.map((choice) => {
                const selected = choice.value === currentUsage;
                return (
                  <Button
                    key={choice.value}
                    type="button"
                    onPress={() => chooseUsage(choice.value)}
                    className={\`min-h-9 rounded-md border px-3 py-1.5 text-sm font-medium transition-colors \${selected ? "border-primary bg-primary text-primary-content" : "border-base-300 bg-base-100 hover:bg-base-300"}\`}
                  >
                    {choice.label}
                  </Button>
                );
              })}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
};
`
);
