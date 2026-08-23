/**
 * The page-level Tab shortcut: it puts the interface away, and it brings the interface back.
 *
 * Tab is the browser's own focus key, so taking it is only defensible if it is taken narrowly.
 * This rule answers on the main screen and nowhere else — not over a dialog or a recovery screen,
 * not in a text field, and not as part of a chord. Shift+Tab is deliberately left alone: forward
 * traversal is what the shortcut spends, so backward traversal is what still reaches every
 * control on the page from the keyboard.
 *
 * Kept free of DOM types so the rule is unit-testable without a document, in the same spirit as
 * `search-shortcut.ts`, whose reading of what counts as a text field it borrows.
 */

import { isTextEntryTarget, type ShortcutTarget } from "./search-shortcut.ts";

/** The parts of a key press the shortcut reads, plus what the press landed on. */
export interface ClearViewShortcutEvent {
  altKey: boolean;
  ctrlKey: boolean;
  key: string;
  metaKey: boolean;
  /** Whether a destination is showing with nothing — dialog, recovery screen — layered over it. */
  onMainScreen: boolean;
  shiftKey: boolean;
  target: ShortcutTarget | null;
}

/**
 * Whether this key press should toggle the interface away or back.
 *
 * Unlike the `/` shortcut, Shift counts here. `/` needs Shift on most keyboard layouts to be
 * typed at all, whereas Tab is one key on every layout there is — so a shifted Tab is not this
 * shortcut being asked for, it is the browser's own backward traversal being asked for.
 */
export const togglesClearView = (event: ClearViewShortcutEvent): boolean => {
  if (event.key !== "Tab") return false;
  if (!event.onMainScreen) return false;
  if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return false;
  return !isTextEntryTarget(event.target);
};
