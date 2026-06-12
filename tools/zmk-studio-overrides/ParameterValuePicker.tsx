import { BehaviorParameterValueDescription } from "@zmkfirmware/zmk-studio-ts-client/behaviors";
import { HidUsagePicker } from "./HidUsagePicker";

export interface ParameterValuePickerProps {
  value?: number;
  values: BehaviorParameterValueDescription[];
  layers: { id: number; name: string }[];
  onValueChanged: (value?: number) => void;
}

const chipClass = (selected: boolean) =>
  `min-h-9 rounded-md border px-3 py-1.5 text-sm font-medium transition-colors ${
    selected
      ? "border-primary bg-primary text-primary-content"
      : "border-base-300 bg-base-100 hover:bg-base-300"
  }`;

const ChipRow = ({
  label,
  choices,
  value,
  onValueChanged,
}: {
  label?: string;
  choices: { value: number; label: string }[];
  value?: number;
  onValueChanged: (value?: number) => void;
}) => (
  <div className="grid gap-1">
    {label && (
      <span className="text-xs font-semibold text-base-content/60">
        {label}
      </span>
    )}
    <div className="flex flex-wrap gap-1.5">
      {choices.map((choice) => (
        <button
          key={choice.value}
          type="button"
          onClick={() => onValueChanged(choice.value)}
          className={chipClass(choice.value === value)}
        >
          {choice.label}
        </button>
      ))}
    </div>
  </div>
);

export const ParameterValuePicker = ({
  value,
  values,
  layers,
  onValueChanged,
}: ParameterValuePickerProps) => {
  if (values.length == 0) {
    return <></>;
  } else if (values.every((v) => v.constant !== undefined)) {
    return (
      <ChipRow
        choices={values.map((v) => ({ value: v.constant!, label: v.name }))}
        value={value}
        onValueChanged={onValueChanged}
      />
    );
  } else if (values.length == 1) {
    if (values[0].range) {
      return (
        <div>
          <label>{values[0].name}: </label>
          <input
            type="number"
            min={values[0].range.min}
            max={values[0].range.max}
            value={value}
            onChange={(e) => onValueChanged(parseInt(e.target.value))}
          />
        </div>
      );
    } else if (values[0].hidUsage) {
      return (
        <HidUsagePicker
          onValueChanged={onValueChanged}
          label={values[0].name}
          value={value}
          usagePages={[
            { id: 7, min: 4, max: values[0].hidUsage.keyboardMax },
            { id: 12, max: values[0].hidUsage.consumerMax },
          ]}
        />
      );
    } else if (values[0].layerId) {
      return (
        <ChipRow
          label={values[0].name}
          choices={layers.map(({ name, id }) => ({ value: id, label: name }))}
          value={value}
          onValueChanged={onValueChanged}
        />
      );
    }
  } else {
    console.log("Not sure how to handle", values);
    return (
      <>
        <p>Some composite?</p>
      </>
    );
  }

  return <></>;
};
