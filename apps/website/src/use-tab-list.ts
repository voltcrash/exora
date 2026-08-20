import { type KeyboardEvent, useCallback } from "react";
import { nextTabIndex, tabId, tabPanelId } from "./tab-list.ts";

/**
 * Wires a set of views up as an ARIA tab list: roving focus, arrow-key traversal, and the
 * `aria-controls`/`aria-labelledby` pair that tells a screen reader which panel a tab opens.
 *
 * `values` must be a stable array — define it at module scope, not inline in the component.
 */
export interface TabListOptions<Value extends string> {
  /** Accessible name for the list as a whole, e.g. "Planet discovery views". */
  label: string;
  /** Prefix that keeps the generated ids unique when two lists share a page. */
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
      // Traversal starts from where focus actually is, not from the rendered selection. Two key
      // presses inside one React batch would otherwise both read the same pre-update `value` and
      // move to the same tab, leaving the second press looking dead.
      const focused = controls.indexOf(event.target as HTMLElement);
      const index = nextTabIndex(
        event.key,
        focused >= 0 ? focused : values.indexOf(value),
        values.length,
      );
      if (index === null) return;

      const target = values[index];
      if (!target) return;

      // Home and End would otherwise scroll the dialog out from under the selection.
      event.preventDefault();
      onSelect(target);
      // Every tab is mounted whichever panel is showing, so the new tab can take focus in this
      // same turn; only its `tabIndex` waits for the re-render that the selection triggers.
      event.currentTarget.querySelector<HTMLElement>(`[id="${tabId(list, target)}"]`)?.focus();
    },
    [list, onSelect, value, values],
  );

  return {
    tabListProps: { "aria-label": label, onKeyDown, role: "tablist" },
    tabProps: (target) => ({
      // Only the open panel is mounted, so pointing an unselected tab at it would leave a
      // dangling IDREF — worse for a screen reader than saying nothing.
      "aria-controls": target === value ? tabPanelId(list, target) : undefined,
      "aria-selected": target === value,
      id: tabId(list, target),
      role: "tab",
      // Roving tab index: the selected tab is the list's single stop in the page's tab order.
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
