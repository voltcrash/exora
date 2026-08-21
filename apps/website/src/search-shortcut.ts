/**
 * The one page-level keyboard shortcut: `/` opens the planet catalog.
 *
 * A bare-character shortcut bound to `document` competes with every other use of that character
 * on the page, and `/` is one people type — into the star catalog's search field, into the World
 * Forge's name and seed fields. Firing there goes wrong twice over: a dialog nobody asked for
 * opens, and the `preventDefault` that suppresses the browser's own quick-find swallows the
 * character that was actually being typed. So the shortcut yields wherever the key already means
 * something to whatever has focus.
 *
 * Kept free of DOM types so the rule is unit-testable without a document, in the same spirit as
 * `tab-list.ts`.
 */

/**
 * Input types that cannot receive typed text, where a `/` is unambiguously a shortcut.
 *
 * Deliberately a denylist of the non-textual types rather than an allowlist of the textual ones:
 * a type this build has never heard of is far likelier to be a text field than a slider, and of
 * the two ways to be wrong, swallowing someone's keystroke is the one they notice.
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

/** Whether a typed character belongs to this element rather than to the page. */
export const isTextEntryTarget = (target: ShortcutTarget | null): boolean => {
  if (!target) return false;
  if (target.isContentEditable) return true;

  switch (target.tagName.toLowerCase()) {
    case "input":
      // An `<input>` with no type attribute is a text field: `type` defaults to "text".
      return !NON_TEXTUAL_INPUT_TYPES.has((target.type ?? "text").toLowerCase());
    // A `<select>` reads typed characters as type-ahead, so the character is the list's.
    case "select":
    case "textarea":
      return true;
    default:
      return false;
  }
};

/** The parts of a key press the shortcut reads. */
export interface SearchShortcutEvent {
  altKey: boolean;
  ctrlKey: boolean;
  key: string;
  metaKey: boolean;
  target: ShortcutTarget | null;
}

export interface SearchShortcutState {
  /**
   * Whether a modal dialog already owns the page — the catalog itself included.
   *
   * A modal makes everything behind it inert, which is the whole point of one. A page-level
   * shortcut reaching over that to stack a second dialog on top contradicts the mode the wearer
   * of that dialog is in.
   */
  dialogOpen: boolean;
}

/**
 * Whether this key press should open the catalog.
 *
 * Shift is deliberately not checked: plenty of keyboard layouts need it to produce `/` at all,
 * so requiring it to be up would make the shortcut unreachable outside US layouts. Ctrl, Meta
 * and Alt are checked, because those combinations belong to the browser and the operating
 * system rather than to Exora.
 */
export const opensSearchShortcut = (
  event: SearchShortcutEvent,
  { dialogOpen }: SearchShortcutState,
): boolean => {
  if (event.key !== "/") return false;
  if (event.altKey || event.ctrlKey || event.metaKey) return false;
  if (dialogOpen) return false;
  return !isTextEntryTarget(event.target);
};
