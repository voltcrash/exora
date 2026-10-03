import type { TabListApi } from "../../use-tab-list.ts";
import styles from "./ui.module.css";

interface TabBarProps<Value extends string> {
  api: TabListApi<Value>;
  items: readonly { count?: number | undefined; id: Value; label: string }[];
  onSelect: (value: Value) => void;
  variant?: "pill" | "underline";
}

/** A row of tabs wired to `useTabList`, so arrow keys and the panel's labelling come with it. */
export const TabBar = <Value extends string>({
  api,
  items,
  onSelect,
  variant = "underline",
}: TabBarProps<Value>) => (
  <div className={styles["tabs"]} data-variant={variant} {...api.tabListProps}>
    {items.map((item) => (
      <button
        key={item.id}
        className={styles["tab"]}
        {...api.tabProps(item.id)}
        onClick={() => onSelect(item.id)}
      >
        {item.label}
        {item.count === undefined ? null : (
          <span className={styles["tab-count"]}>{item.count}</span>
        )}
      </button>
    ))}
  </div>
);
