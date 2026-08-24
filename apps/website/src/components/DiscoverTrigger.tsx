interface DiscoverTriggerProps {
  onClick: () => void;
}

/** The single doorway into every catalog and creation tool. */
export const DiscoverTrigger = ({ onClick }: DiscoverTriggerProps) => (
  <button
    id="open-discover"
    className="discover-trigger"
    type="button"
    aria-label="Open Discover"
    onClick={onClick}
  >
    <span className="discover-trigger-mark" aria-hidden="true">
      <span />
      <span />
      <span />
    </span>
    <span className="discover-trigger-copy">
      <small>EXPLORE &amp; CREATE</small>
      <strong>DISCOVER</strong>
    </span>
    <kbd>/</kbd>
  </button>
);
