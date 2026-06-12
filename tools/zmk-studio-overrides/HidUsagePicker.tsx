import {
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
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

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
  display: string;
  longName: string;
  group: string;
  shifted?: boolean;
  hasShiftTwin?: boolean;
  keywords: string[];
}

const LSHIFT_FLAG = 0x02;

// US配列でShiftを併用して入力する記号。選択時は基本キー+Shift(implicit mod)を自動設定する。
const SHIFTED_SYMBOLS: Record<number, string> = {
  0x1e: "!",
  0x1f: "@",
  0x20: "#",
  0x21: "$",
  0x22: "%",
  0x23: "^",
  0x24: "&",
  0x25: "*",
  0x26: "(",
  0x27: ")",
  0x2d: "_",
  0x2e: "+",
  0x2f: "{",
  0x30: "}",
  0x31: "|",
  0x33: ":",
  0x34: '"',
  0x35: "~",
  0x36: "<",
  0x37: ">",
  0x38: "?",
};

const BASE_SYMBOLS: Record<number, string> = {
  0x2d: "-",
  0x2e: "=",
  0x2f: "[",
  0x30: "]",
  0x31: "\\",
  0x33: ";",
  0x34: "'",
  0x35: "`",
  0x36: ",",
  0x37: ".",
  0x38: "/",
};

const SYMBOL_KEYWORDS: Record<string, string[]> = {
  "!": ["exclamation", "excl", "bang"],
  "@": ["at", "atmark", "atsign"],
  "#": ["hash", "sharp", "pound"],
  $: ["dollar", "dllr"],
  "%": ["percent", "prcnt"],
  "^": ["caret", "hat"],
  "&": ["ampersand", "amps", "and"],
  "*": ["asterisk", "star"],
  "(": ["paren", "lpar"],
  ")": ["paren", "rpar"],
  _: ["underscore", "under"],
  "+": ["plus"],
  "{": ["brace", "lbrc"],
  "}": ["brace", "rbrc"],
  "|": ["pipe"],
  ":": ["colon"],
  '"': ["quote", "dquote", "doublequote"],
  "~": ["tilde"],
  "<": ["less", "angle", "lt"],
  ">": ["greater", "angle", "gt"],
  "?": ["question", "qmark"],
  "-": ["minus", "hyphen", "dash"],
  "=": ["equal"],
  "[": ["bracket", "lbkt"],
  "]": ["bracket", "rbkt"],
  "\\": ["backslash", "bslh"],
  ";": ["semicolon", "semi"],
  "'": ["apostrophe", "squote", "quote"],
  "`": ["grave", "backtick"],
  ",": ["comma"],
  ".": ["period", "dot"],
  "/": ["slash", "fslh"],
};

const GROUP_ORDER = [
  "記号",
  "文字",
  "数字",
  "制御",
  "移動",
  "Fn",
  "修飾",
  "日本語",
  "メディア",
  "テンキー",
  "電源",
  "アプリ",
  "その他",
];

const keyboardGroup = (id: number, longName: string): string => {
  if (id >= 0x04 && id <= 0x1d) return "文字";
  if (id >= 0x1e && id <= 0x27) return "数字";
  if ((id >= 0x2d && id <= 0x38) || id === 0x64) return "記号";
  if ([0x28, 0x29, 0x2a, 0x2b, 0x2c, 0x39, 0x46, 0x47, 0x48, 0x49, 0x4c].includes(id)) {
    return "制御";
  }
  if ((id >= 0x3a && id <= 0x45) || (id >= 0x68 && id <= 0x73)) return "Fn";
  if (id >= 0x4a && id <= 0x52) return "移動";
  if (longName.startsWith("Keypad")) return "テンキー";
  if ((id >= 0x87 && id <= 0x8f) || (id >= 0x90 && id <= 0x98)) return "日本語";
  if (id >= 0xe0 && id <= 0xe7) return "修飾";
  return "その他";
};

const consumerGroup = (id: number): string => {
  if (
    [
      0x6f, 0x70, 0xb0, 0xb1, 0xb3, 0xb4, 0xb5, 0xb6, 0xb7, 0xcd, 0xe2, 0xe9,
      0xea, 0x29d,
    ].includes(id)
  ) {
    return "メディア";
  }
  if (id >= 0x30 && id <= 0x37) return "電源";
  if (id >= 0x180 && id <= 0x1ff) return "アプリ";
  return "その他";
};

const keyboardDisplay = (id: number, label: string): string => {
  if (BASE_SYMBOLS[id]) return BASE_SYMBOLS[id];
  const base = label.replace(/\s+and\s+.*$/i, "");
  if (id >= 0x04 && id <= 0x1d) return base.toUpperCase();
  if (id >= 0xe0 && id <= 0xe3) return `L${base}`;
  if (id >= 0xe4 && id <= 0xe7) return `R${base.replace(/^Right\s*/i, "")}`;
  return base;
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

  const choices: UsageChoice[] = [];

  for (const u of usages) {
    const value = hid_usage_from_page_and_id(id, u.Id);
    const label = hid_usage_get_label(id, u.Id) || u.Name;

    if (id === 7) {
      const display = keyboardDisplay(u.Id, label);
      choices.push({
        pageId: id,
        id: u.Id,
        value,
        display,
        longName: u.Name,
        group: keyboardGroup(u.Id, u.Name.replace(/^Keyboard\s+/, "")),
        hasShiftTwin: SHIFTED_SYMBOLS[u.Id] !== undefined,
        keywords: SYMBOL_KEYWORDS[display] || [],
      });

      const shifted = SHIFTED_SYMBOLS[u.Id];
      if (shifted) {
        choices.push({
          pageId: id,
          id: u.Id,
          value,
          display: shifted,
          longName: u.Name,
          group: "記号",
          shifted: true,
          keywords: SYMBOL_KEYWORDS[shifted] || [],
        });
      }
    } else {
      choices.push({
        pageId: id,
        id: u.Id,
        value,
        display: label,
        longName: u.Name,
        group: id === 12 ? consumerGroup(u.Id) : "その他",
        keywords: [],
      });
    }
  }

  return choices;
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

const SEARCH_LIMIT = 80;

const chipClass = (selected: boolean) =>
  `min-h-9 rounded-md border px-3 py-1.5 text-sm font-medium transition-colors ${
    selected
      ? "border-primary bg-primary text-primary-content"
      : "border-base-300 bg-base-100 hover:bg-base-300"
  }`;

export const HidUsagePicker = ({
  label,
  value,
  usagePages,
  onValueChanged,
}: HidUsagePickerProps) => {
  const currentUsage = value !== undefined ? mask_mods(value) : undefined;
  const modFlags = value ? value >>> 24 : 0;
  const shiftOn = (modFlags & LSHIFT_FLAG) !== 0;

  const allChoices = useMemo(
    () => usagePages.flatMap((page) => usageChoices(page)),
    [usagePages]
  );

  const isSelected = useCallback(
    (choice: UsageChoice) =>
      choice.value === currentUsage &&
      (choice.shifted ? shiftOn : !(choice.hasShiftTwin && shiftOn)),
    [currentUsage, shiftOn]
  );

  const groupNames = useMemo(() => {
    const present = new Set(allChoices.map((choice) => choice.group));
    return GROUP_ORDER.filter((group) => present.has(group));
  }, [allChoices]);

  const selectedGroupFromValue = useMemo(() => {
    const found = allChoices.find(isSelected);
    return found ? found.group : groupNames[0];
  }, [allChoices, isSelected, groupNames]);

  const [selectedGroup, setSelectedGroup] = useState<string | undefined>(
    selectedGroupFromValue
  );
  const activeGroup = selectedGroup ?? selectedGroupFromValue;

  const [query, setQuery] = useState("");
  const lastChosen = useRef<number | undefined>(undefined);

  useEffect(() => {
    setSelectedGroup(selectedGroupFromValue);
  }, [selectedGroupFromValue]);

  useEffect(() => {
    if (lastChosen.current !== value) {
      setQuery("");
    }
    lastChosen.current = value;
  }, [value]);

  const searchResults = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return undefined;

    return allChoices.filter((choice) => {
      if (choice.display.toLowerCase().includes(q)) return true;
      if (choice.longName.toLowerCase().includes(q)) return true;
      return choice.keywords.some((keyword) => keyword.startsWith(q));
    });
  }, [allChoices, query]);

  const visibleChoices =
    searchResults !== undefined
      ? searchResults.slice(0, SEARCH_LIMIT)
      : allChoices.filter((choice) => choice.group === activeGroup);

  const selectedLabel = useMemo(() => {
    const found = allChoices.find(isSelected);
    if (found) return found.display;

    return currentUsage !== undefined && currentUsage !== 0
      ? `0x${currentUsage.toString(16)}`
      : "未選択";
  }, [allChoices, isSelected, currentUsage]);

  const mods = useMemo(() => {
    return all_mods.filter((m) => m & modFlags).map((m) => m.toLocaleString());
  }, [modFlags]);

  const chooseUsage = useCallback(
    (choice: UsageChoice) => {
      let nextFlags = modFlags;
      if (choice.shifted) {
        nextFlags |= LSHIFT_FLAG;
      } else if (choice.hasShiftTwin) {
        nextFlags &= ~LSHIFT_FLAG;
      }

      const nextValue = choice.value | (nextFlags << 24);
      lastChosen.current = nextValue;
      onValueChanged(nextValue);
    },
    [onValueChanged, modFlags]
  );

  const modifiersChanged = useCallback(
    (m: string[]) => {
      if (!value) {
        return;
      }

      const nextFlags = mods_to_flags(m.map((flag) => parseInt(flag)));
      const nextValue = mask_mods(value) | (nextFlags << 24);
      lastChosen.current = nextValue;
      onValueChanged(nextValue);
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
      <input
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="キーを検索（例: @ / enter / F5 / かな）"
        aria-label="キー検索"
        className="w-full rounded-md border border-base-300 bg-base-100 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
      />
      <div className="grid gap-3 max-h-[42vh] overflow-auto pr-2">
        {searchResults === undefined && (
          <div className="flex flex-wrap gap-1.5" role="tablist" aria-label="カテゴリ">
            {groupNames.map((group) => (
              <Button
                key={group}
                type="button"
                onPress={() => setSelectedGroup(group)}
                className={`min-h-9 rounded-md border px-4 py-2 text-sm font-semibold transition-colors ${
                  group === activeGroup
                    ? "border-primary bg-primary text-primary-content"
                    : "border-base-300 bg-base-100 hover:bg-base-300"
                }`}
              >
                {group}
              </Button>
            ))}
          </div>
        )}
        <section className="grid gap-2">
          {searchResults !== undefined && (
            <h3 className="text-sm font-semibold text-base-content/60">
              検索結果 {searchResults.length}件
              {searchResults.length > SEARCH_LIMIT
                ? `（先頭${SEARCH_LIMIT}件を表示）`
                : ""}
            </h3>
          )}
          <div className="flex flex-wrap gap-1.5">
            {visibleChoices.map((choice) => (
              <Button
                key={`${choice.value}-${choice.shifted ? "s" : "b"}`}
                type="button"
                onPress={() => chooseUsage(choice)}
                className={chipClass(isSelected(choice))}
              >
                {choice.display}
              </Button>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
};
