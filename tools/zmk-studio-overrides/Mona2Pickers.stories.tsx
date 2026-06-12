import type { Meta, StoryObj } from "@storybook/react";
import { useState } from "react";
import { HidUsagePicker } from "./HidUsagePicker";
import { BehaviorBindingPicker } from "./BehaviorBindingPicker";
import { BehaviorBinding } from "@zmkfirmware/zmk-studio-ts-client/keymap";

const meta = {
  title: "Mona2/Pickers",
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

const ControlledHidUsagePicker = () => {
  const [value, setValue] = useState<number | undefined>(undefined);

  return (
    <div className="grid gap-2 w-[60rem]">
      <div data-testid="raw-value" className="text-xs font-mono">
        value: {value !== undefined ? `0x${(value >>> 0).toString(16)}` : "none"}
      </div>
      <HidUsagePicker
        label="Keycode"
        value={value}
        usagePages={[{ id: 7 }, { id: 12 }]}
        onValueChanged={setValue}
      />
    </div>
  );
};

export const ControlledKeyPicker: Story = {
  render: () => <ControlledHidUsagePicker />,
};

const moNa2LikeBehaviors = [
  {
    id: 1,
    displayName: "Key Press",
    metadata: [
      {
        param1: [
          {
            name: "Keycode",
            hidUsage: { keyboardMax: 0xff, consumerMax: 0x2ff },
          },
        ],
        param2: [],
      },
    ],
  },
  { id: 2, displayName: "Transparent", metadata: [] },
  {
    id: 3,
    displayName: "Momentary Layer",
    metadata: [
      {
        param1: [{ name: "Layer", layerId: {} }],
        param2: [],
      },
    ],
  },
  { id: 4, displayName: "Toggle Layer", metadata: [] },
  { id: 5, displayName: "Bluetooth", metadata: [] },
  { id: 6, displayName: "Output Selection", metadata: [] },
  { id: 7, displayName: "Bootloader", metadata: [] },
  { id: 8, displayName: "Studio Unlock", metadata: [] },
  { id: 9, displayName: "Mouse Button Press", metadata: [] },
  { id: 10, displayName: "atmark", metadata: [] },
  { id: 11, displayName: "backslash", metadata: [] },
  { id: 12, displayName: "brace", metadata: [] },
  { id: 13, displayName: "bracket", metadata: [] },
  { id: 14, displayName: "caret_tilde_morph", metadata: [] },
  { id: 15, displayName: "colon", metadata: [] },
  { id: 16, displayName: "dquote", metadata: [] },
  { id: 17, displayName: "exclamation", metadata: [] },
  { id: 18, displayName: "hash", metadata: [] },
  { id: 19, displayName: "jpquote", metadata: [] },
  { id: 20, displayName: "minus_equal_morph", metadata: [] },
  { id: 21, displayName: "paren", metadata: [] },
  { id: 22, displayName: "pipe", metadata: [] },
  { id: 23, displayName: "underscore", metadata: [] },
];

const ControlledBehaviorPicker = () => {
  const [binding, setBinding] = useState<BehaviorBinding>({
    behaviorId: 1,
    param1: 0,
    param2: 0,
  });

  return (
    <div className="grid gap-2 w-[60rem]">
      <div data-testid="raw-binding" className="text-xs font-mono">
        binding: {JSON.stringify(binding)}
      </div>
      <BehaviorBindingPicker
        binding={binding}
        behaviors={moNa2LikeBehaviors}
        layers={[
          { id: 0, name: "Base" },
          { id: 1, name: "Sym" },
          { id: 2, name: "Num" },
          { id: 3, name: "Util" },
        ]}
        onBindingChanged={setBinding}
      />
    </div>
  );
};

export const ControlledBehaviorBindingPicker: Story = {
  render: () => <ControlledBehaviorPicker />,
};
