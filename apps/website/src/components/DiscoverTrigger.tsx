import sharedStyles from "./ExperienceShared.module.css";
import { bindStyles } from "../styles/bind-styles.ts";

const cx = bindStyles(sharedStyles);
interface DiscoverTriggerProps {
  onClick: () => void;
}

export const DiscoverTrigger = ({ onClick }: DiscoverTriggerProps) => (
  <button
    id="open-discover"
    className={cx("discover-trigger")}
    data-testid="discover-trigger"
    type="button"
    aria-label="Open Discover"
    onClick={onClick}
  >
    <span className={cx("discover-trigger-mark")} aria-hidden="true">
      <svg
        className={cx("discover-trigger-icon")}
        data-testid="discover-trigger-icon"
        viewBox="0 0 28 28"
      >
        <path d="m7 9.5 12-4 2 6-12 4z" />
        <path d="m19 5.5 2.8-1 2 6-2.8 1M10 15l4 3.5M14 18.5l-4 5M14 18.5l5 5" />
        <circle cx="7.5" cy="12.5" r="2.7" />
      </svg>
    </span>
    <span className={cx("discover-trigger-copy")}>
      <small>EXPLORE &amp; CREATE</small>
      <strong>DISCOVER</strong>
    </span>
    <kbd
      className={cx("shortcut-icon")}
      data-testid="discover-shortcut"
      aria-label="Backspace or Delete"
    >
      ⌫
    </kbd>
  </button>
);
