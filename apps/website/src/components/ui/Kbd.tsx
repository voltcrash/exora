import styles from "./ui.module.css";

/** A key as it is printed on the keyboard, set beside the control it reaches. */
export const Kbd = ({ children, label }: { children: string; label?: string }) => (
  <kbd className={styles["kbd"]} aria-label={label}>
    {children}
  </kbd>
);

/** ⌘ on Apple platforms, Ctrl everywhere else. */
export const MODIFIER_KEY =
  typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform) ? "⌘" : "Ctrl";
