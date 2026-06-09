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

const hidUsagePickerPath = path.join(studioDir, "src/behaviors/HidUsagePicker.tsx");
fs.writeFileSync(
  hidUsagePickerPath,
  `import {
  Button,
  Checkbox,
  CheckboxGroup,
  Label,
  Radio,
  RadioGroup,
} from "react-aria-components";
import {
  hid_usage_from_page_and_id,
  hid_usage_get_label,
  hid_usage_page_get_ids,
} from "../hid-usages";
import { useCallback, useEffect, useMemo, useState } from "react";

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

const keyboardGroup = (id: number) => {
  if (id >= 0x04 && id <= 0x1d) return "Letters";
  if (id >= 0x1e && id <= 0x27) return "Numbers";
  if (
    (id >= 0x2d && id <= 0x38) ||
    id === 0x64 ||
    id === 0x87 ||
    id === 0x89
  ) {
    return "Symbols";
  }
  if (id >= 0x3a && id <= 0x45) return "Function";
  if (id >= 0x4a && id <= 0x52) return "Navigation";
  if (id >= 0xe0 && id <= 0xe7) return "Modifiers";
  if ([0x28, 0x29, 0x2a, 0x2b, 0x2c, 0x39].includes(id)) return "Control";
  return "Other";
};

const consumerGroup = (id: number, label: string) => {
  if ([0xb0, 0xb1, 0xb3, 0xb4, 0xb5, 0xb6, 0xb7, 0xcd, 0xe2, 0xe9, 0xea].includes(id)) {
    return "Media";
  }
  if (id >= 0x30 && id <= 0x37) return "Power";
  if (id >= 0x180 && id <= 0x1ff) return "Browser / App";
  if (label.toLowerCase().includes("keyboard")) return "Keyboard";
  return "Other";
};

const usageGroup = (choice: UsageChoice) => {
  if (choice.pageId === 7) return keyboardGroup(choice.id);
  if (choice.pageId === 12) return consumerGroup(choice.id, choice.label);
  return "Other";
};

const displayChoiceLabel = (choice: UsageChoice) => {
  if (choice.pageId === 7) {
    return choice.label.replace(/^Keyboard\\s+/, "");
  }

  return choice.label;
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
  const selectedPageIdFromValue = useMemo(() => {
    for (const { page, choices } of choicesByPage) {
      if (choices.some((choice) => choice.value === currentUsage)) return page.id;
    }

    return choicesByPage[0]?.page.id;
  }, [choicesByPage, currentUsage]);
  const [selectedPageId, setSelectedPageId] = useState<number | undefined>(
    selectedPageIdFromValue
  );
  const activePageId = selectedPageId ?? selectedPageIdFromValue;
  const activeChoices =
    choicesByPage.find(({ page }) => page.id === activePageId)?.choices || [];
  const groupNames = useMemo(
    () => Array.from(new Set(activeChoices.map(usageGroup))),
    [activeChoices]
  );
  const selectedGroupFromValue = useMemo(() => {
    const found = activeChoices.find((choice) => choice.value === currentUsage);
    return found ? usageGroup(found) : groupNames[0];
  }, [activeChoices, currentUsage, groupNames]);
  const [selectedGroup, setSelectedGroup] = useState<string | undefined>(
    selectedGroupFromValue
  );
  const activeGroup = selectedGroup ?? selectedGroupFromValue;
  const visibleChoices = activeChoices.filter(
    (choice) => usageGroup(choice) === activeGroup
  );

  useEffect(() => {
    setSelectedGroup(selectedGroupFromValue);
  }, [selectedGroupFromValue]);

  const selectedLabel = useMemo(() => {
    for (const { choices } of choicesByPage) {
      const found = choices.find((choice) => choice.value === currentUsage);
      if (found) return displayChoiceLabel(found);
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
        <RadioGroup
          aria-label="大カテゴリ"
          value={activePageId?.toString()}
          onChange={(pageId) => {
            const nextPageId = parseInt(pageId);
            setSelectedPageId(nextPageId);
            const firstChoice =
              choicesByPage.find((entry) => entry.page.id === nextPageId)
                ?.choices[0];
            setSelectedGroup(firstChoice ? usageGroup(firstChoice) : undefined);
          }}
          className="grid gap-2"
        >
          <h3 className="text-sm font-semibold text-base-content/60">大カテゴリ</h3>
          <div className="flex flex-wrap gap-1.5">
            {choicesByPage.map(({ page }) => {
              return (
                <Radio
                  key={page.id}
                  value={page.id.toString()}
                  className="min-h-9 rounded-md border border-base-300 bg-base-100 px-4 py-2 text-sm font-semibold transition-colors hover:bg-base-300 rac-selected:border-primary rac-selected:bg-primary rac-selected:text-primary-content"
                >
                  {sectionLabel(page.id)}
                </Radio>
              );
            })}
          </div>
        </RadioGroup>
        <RadioGroup
          aria-label="中カテゴリ"
          value={activeGroup}
          onChange={setSelectedGroup}
          className="grid gap-2"
        >
          <h3 className="text-sm font-semibold text-base-content/60">中カテゴリ</h3>
          <div className="flex flex-wrap gap-1.5">
            {groupNames.map((group) => {
              return (
                <Radio
                  key={group}
                  value={group}
                  className="min-h-9 rounded-md border border-base-300 bg-base-100 px-4 py-2 text-sm font-semibold transition-colors hover:bg-base-300 rac-selected:border-primary rac-selected:bg-primary rac-selected:text-primary-content"
                >
                  {group}
                </Radio>
              );
            })}
          </div>
        </RadioGroup>
        <section className="grid gap-2">
          <h3 className="text-sm font-semibold text-base-content/60">キー</h3>
          <div className="flex flex-wrap gap-1.5">
            {visibleChoices.map((choice) => {
              const selected = choice.value === currentUsage;
              return (
                <Button
                  key={choice.value}
                  type="button"
                  onPress={() => chooseUsage(choice.value)}
                  className={\`min-h-9 rounded-md border px-3 py-1.5 text-sm font-medium transition-colors \${selected ? "border-primary bg-primary text-primary-content" : "border-base-300 bg-base-100 hover:bg-base-300"}\`}
                >
                    {displayChoiceLabel(choice)}
                  </Button>
              );
            })}
          </div>
        </section>
      </div>
    </div>
  );
};
`
);
