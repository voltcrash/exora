import { Icon, type IconName } from "./Icon.tsx";
import styles from "./ui.module.css";

interface SegmentedProps<Value extends string> {
  label: string;
  onChange: (value: Value) => void;
  options: readonly { icon?: IconName; id: Value; label: string }[];
  value: Value;
}

/** A small set of mutually exclusive choices that change how something is shown, not what. */
export const Segmented = <Value extends string>({
  label,
  onChange,
  options,
  value,
}: SegmentedProps<Value>) => (
  <div className={styles["segmented"]} role="group" aria-label={label}>
    {options.map((option) => (
      <button
        key={option.id}
        type="button"
        aria-pressed={option.id === value}
        onClick={() => onChange(option.id)}
      >
        {option.icon ? <Icon name={option.icon} size={16} /> : null}
        <span>{option.label}</span>
      </button>
    ))}
  </div>
);
