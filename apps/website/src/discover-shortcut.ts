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

export interface ShortcutTarget {
  isContentEditable: boolean;
  tagName: string;
  type?: string | undefined;
}

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

export const togglesDiscoverShortcut = (event: DiscoverShortcutEvent): boolean => {
  if (event.key !== "Backspace" && event.key !== "Delete") return false;
  if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey || event.repeat)
    return false;
  return !isTextEntryTarget(event.target);
};
