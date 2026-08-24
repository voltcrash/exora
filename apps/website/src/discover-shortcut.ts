/**
 * The page-level Discover shortcut: Backspace (Delete on an Apple keyboard) toggles the screen.
 *
 * A deletion key belongs to the focused editor before it belongs to the page. The shortcut
 * therefore yields to text fields, selects and editable content, and ignores held-key repeats so
 * one physical press cannot open and immediately close Discover again.
 *
 * Kept free of DOM types so the rule is unit-testable without a document.
 */

const NON_TEXTUAL_INPUT_TYPES = new Set([
  "button",
  "checkbox",
  "color",
  "file",
  "hidden",
  "image",
  "radio",
  "range",
  "reset",
  "submit",
]);

/** The element a key press landed on, described in the terms the shortcut cares about. */
export interface ShortcutTarget {
  /** Whether the element is a `contenteditable` host, or sits inside one. */
  isContentEditable: boolean;
  /** The element's tag name, in any case. */
  tagName: string;
  /** An `<input>`'s resolved `type`; ignored for every other tag. */
  type?: string | undefined;
}

/** Whether a deletion key belongs to this element rather than to the page. */
export const isTextEntryTarget = (target: ShortcutTarget | null): boolean => {
  if (!target) return false;
  if (target.isContentEditable) return true;

  switch (target.tagName.toLowerCase()) {
    case "input":
      return !NON_TEXTUAL_INPUT_TYPES.has((target.type ?? "text").toLowerCase());
    case "select":
    case "textarea":
      return true;
    default:
      return false;
  }
};

export interface DiscoverShortcutEvent {
  altKey: boolean;
  ctrlKey: boolean;
  key: string;
  metaKey: boolean;
  repeat: boolean;
  shiftKey: boolean;
  target: ShortcutTarget | null;
}

/** Whether this key press should toggle Discover. */
export const togglesDiscoverShortcut = (event: DiscoverShortcutEvent): boolean => {
  if (event.key !== "Backspace" && event.key !== "Delete") return false;
  if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey || event.repeat)
    return false;
  return !isTextEntryTarget(event.target);
};
