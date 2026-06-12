import { useEffect, useMemo, useState } from "react";

import {
  GetBehaviorDetailsResponse,
  BehaviorBindingParametersSet,
} from "@zmkfirmware/zmk-studio-ts-client/behaviors";
import { BehaviorBinding } from "@zmkfirmware/zmk-studio-ts-client/keymap";
import { BehaviorParametersPicker } from "./BehaviorParametersPicker";
import { validateValue } from "./parameters";
import BehaviorShortNames from "../keyboard/behavior-short-names.json";

export interface BehaviorBindingPickerProps {
  binding: BehaviorBinding;
  behaviors: GetBehaviorDetailsResponse[];
  layers: { id: number; name: string }[];
  onBindingChanged: (binding: BehaviorBinding) => void;
}

interface BehaviorShortName {
  short?: string;
  center?: boolean;
}

const shortNames: Record<string, BehaviorShortName> = BehaviorShortNames;

const GROUP_ORDER = [
  "基本",
  "マクロ",
  "レイヤー",
  "マウス",
  "接続",
  "システム",
  "その他",
];

const STANDARD_GROUPS: Record<string, string> = {
  "Key Press": "基本",
  Transparent: "基本",
  None: "基本",
  "Mod Tap": "基本",
  "Sticky Key": "基本",
  "Key Repeat": "基本",
  "Key Toggle": "基本",
  "Caps Word": "基本",
  "Grave/Escape": "基本",
  "Momentary Layer": "レイヤー",
  "Toggle Layer": "レイヤー",
  "To Layer": "レイヤー",
  "Layer Tap": "レイヤー",
  "Sticky Layer": "レイヤー",
  Bluetooth: "接続",
  "Output Selection": "接続",
  "External Power": "システム",
  Backlight: "システム",
  "RGB Underglow": "システム",
  Reset: "システム",
  "System Reset": "システム",
  Bootloader: "システム",
  "Studio Unlock": "システム",
  "Soft Off": "システム",
};

const behaviorGroup = (displayName: string): string => {
  if (STANDARD_GROUPS[displayName]) return STANDARD_GROUPS[displayName];
  if (displayName.toLowerCase().includes("mouse")) return "マウス";
  if (displayName.toLowerCase().includes("layer")) return "レイヤー";
  // ユーザー定義のmacro/mod-morphノード名（例: atmark, caret_tilde_morph）
  if (/^[a-z0-9_]+$/.test(displayName)) return "マクロ";
  return "その他";
};

const behaviorChipLabel = (displayName: string): string => {
  const short = shortNames[displayName]?.short;
  if (behaviorGroup(displayName) === "マクロ" && short) return short;
  return displayName;
};

function validateBinding(
  metadata: BehaviorBindingParametersSet[],
  layerIds: number[],
  param1?: number,
  param2?: number
): boolean {
  if (
    (param1 === undefined || param1 === 0) &&
    metadata.every((s) => !s.param1 || s.param1.length === 0)
  ) {
    return true;
  }

  let matchingSet = metadata.find((s) =>
    validateValue(layerIds, param1, s.param1)
  );

  if (!matchingSet) {
    return false;
  }

  return validateValue(layerIds, param2, matchingSet.param2);
}

export const BehaviorBindingPicker = ({
  binding,
  layers,
  behaviors,
  onBindingChanged,
}: BehaviorBindingPickerProps) => {
  const [behaviorId, setBehaviorId] = useState(binding.behaviorId);
  const [param1, setParam1] = useState<number | undefined>(binding.param1);
  const [param2, setParam2] = useState<number | undefined>(binding.param2);

  const metadata = useMemo(
    () => behaviors.find((b) => b.id == behaviorId)?.metadata,
    [behaviorId, behaviors]
  );

  const groupedBehaviors = useMemo(() => {
    const sorted = [...behaviors].sort((a, b) =>
      a.displayName.localeCompare(b.displayName)
    );

    const groups = new Map<string, GetBehaviorDetailsResponse[]>();
    for (const behavior of sorted) {
      const group = behaviorGroup(behavior.displayName);
      const entries = groups.get(group) || [];
      entries.push(behavior);
      groups.set(group, entries);
    }

    return GROUP_ORDER.filter((group) => groups.has(group)).map((group) => ({
      group,
      entries: groups.get(group)!,
    }));
  }, [behaviors]);

  useEffect(() => {
    if (
      binding.behaviorId === behaviorId &&
      binding.param1 === param1 &&
      binding.param2 === param2
    ) {
      return;
    }

    if (!metadata) {
      console.error(
        "Can't find metadata for the selected behaviorId",
        behaviorId
      );
      return;
    }

    if (
      validateBinding(
        metadata,
        layers.map(({ id }) => id),
        param1,
        param2
      )
    ) {
      onBindingChanged({
        behaviorId,
        param1: param1 || 0,
        param2: param2 || 0,
      });
    }
  }, [behaviorId, param1, param2]);

  useEffect(() => {
    setBehaviorId(binding.behaviorId);
    setParam1(binding.param1);
    setParam2(binding.param2);
  }, [binding]);

  return (
    <div className="flex flex-col gap-2">
      <div className="grid gap-2 max-h-[30vh] overflow-auto pr-2">
        {groupedBehaviors.map(({ group, entries }) => (
          <div key={group} className="grid gap-1">
            <h4 className="text-xs font-semibold text-base-content/60">
              {group}
            </h4>
            <div className="flex flex-wrap gap-1.5">
              {entries.map((b) => (
                <button
                  key={b.id}
                  type="button"
                  title={b.displayName}
                  onClick={() => {
                    setBehaviorId(b.id);
                    setParam1(0);
                    setParam2(0);
                  }}
                  className={`min-h-9 rounded-md border px-3 py-1.5 text-sm font-medium transition-colors ${
                    b.id === behaviorId
                      ? "border-primary bg-primary text-primary-content"
                      : "border-base-300 bg-base-100 hover:bg-base-300"
                  }`}
                >
                  {behaviorChipLabel(b.displayName)}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
      {metadata && (
        <BehaviorParametersPicker
          metadata={metadata}
          param1={param1}
          param2={param2}
          layers={layers}
          onParam1Changed={setParam1}
          onParam2Changed={setParam2}
        />
      )}
    </div>
  );
};
