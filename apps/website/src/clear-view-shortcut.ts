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

/*
 * H hides the interface and brings it back. It used to be Tab, which took the one key a keyboard
 * user moves between controls with; a letter leaves Tab to the browser.
 */
export const togglesClearView = (event: ClearViewShortcutEvent): boolean => {
  if (event.key.toLowerCase() !== "h") return false;
  if (!event.onMainScreen) return false;
  if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return false;
  return !isTextEntryTarget(event.target);
};
