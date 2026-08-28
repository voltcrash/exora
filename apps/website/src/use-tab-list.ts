import { type KeyboardEvent, useCallback } from "react";
import { nextTabIndex, tabId, tabPanelId } from "./tab-list.ts";

export interface TabListOptions<Value extends string> {
  label: string;
  list: string;
  onSelect: (value: Value) => void;
  value: Value;
  values: readonly Value[];
}

export interface TabListApi<Value extends string> {
  panelProps: (value: Value) => {
    "aria-labelledby": string;
    id: string;
    role: "tabpanel";
  };
  tabListProps: {
    "aria-label": string;
    onKeyDown: (event: KeyboardEvent<HTMLDivElement>) => void;
    role: "tablist";
  };
  tabProps: (value: Value) => {
    "aria-controls": string | undefined;
    "aria-selected": boolean;
    id: string;
    role: "tab";
    tabIndex: number;
    type: "button";
  };
}

export const useTabList = <Value extends string>({
  label,
  list,
  onSelect,
  value,
  values,
}: TabListOptions<Value>): TabListApi<Value> => {
  const onKeyDown = useCallback(
    (event: KeyboardEvent<HTMLDivElement>): void => {
      const controls = [...event.currentTarget.querySelectorAll<HTMLElement>('[role="tab"]')];
      const focused = controls.indexOf(event.target as HTMLElement);
      const index = nextTabIndex(
        event.key,
        focused >= 0 ? focused : values.indexOf(value),
        values.length,
      );
      if (index === null) return;

      const target = values[index];
      if (!target) return;

      event.preventDefault();
      onSelect(target);
      event.currentTarget.querySelector<HTMLElement>(`[id="${tabId(list, target)}"]`)?.focus();
    },
    [list, onSelect, value, values],
  );

  return {
    tabListProps: { "aria-label": label, onKeyDown, role: "tablist" },
    tabProps: (target) => ({
      "aria-controls": target === value ? tabPanelId(list, target) : undefined,
      "aria-selected": target === value,
      id: tabId(list, target),
      role: "tab",
      tabIndex: target === value ? 0 : -1,
      type: "button",
    }),
    panelProps: (target) => ({
      "aria-labelledby": tabId(list, target),
      id: tabPanelId(list, target),
      role: "tabpanel",
    }),
  };
};
