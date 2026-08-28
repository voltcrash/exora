import { isTextEntryTarget, type ShortcutTarget } from "./discover-shortcut.ts";

export interface ClearViewShortcutEvent {
  altKey: boolean;
  ctrlKey: boolean;
  key: string;
  metaKey: boolean;
  onMainScreen: boolean;
  shiftKey: boolean;
  target: ShortcutTarget | null;
}

export const togglesClearView = (event: ClearViewShortcutEvent): boolean => {
  if (event.key !== "Tab") return false;
  if (!event.onMainScreen) return false;
  if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return false;
  return !isTextEntryTarget(event.target);
};
