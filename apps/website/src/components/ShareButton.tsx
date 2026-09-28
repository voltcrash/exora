import { useEffect, useState } from "react";
import { shareDestination, type ShareOutcome } from "../share-destination.ts";
import hudStyles from "./DestinationHud.module.css";
import { bindStyles } from "../styles/bind-styles.ts";

const cx = bindStyles(hudStyles);

const ANNOUNCEMENTS: Partial<Record<ShareOutcome, string>> = {
  copied: "Link copied",
  failed: "Could not copy the link",
};

const ANNOUNCEMENT_MS = 2_400;

export const ShareButton = () => {
  const [outcome, setOutcome] = useState<ShareOutcome | null>(null);

  useEffect(() => {
    if (!outcome) return;
    const timer = window.setTimeout(() => setOutcome(null), ANNOUNCEMENT_MS);
    return () => window.clearTimeout(timer);
  }, [outcome]);

  const announcement = outcome ? (ANNOUNCEMENTS[outcome] ?? "") : "";

  return (
    <>
      <button
        className={cx("panel-share")}
        data-outcome={outcome ?? undefined}
        data-testid="share-destination"
        type="button"
        aria-label="Share this destination"
        title={announcement || "Share this destination"}
        onClick={() =>
          void shareDestination({ title: document.title, url: window.location.href }).then(
            setOutcome,
          )
        }
      >
        <svg viewBox="0 0 16 16" aria-hidden="true">
          {outcome === "copied" ? (
            <path d="m3.5 8.5 3 3 6-7" />
          ) : (
            <>
              <path d="M8 10V2.5M5 5.25 8 2.5l3 2.75" />
              <path d="M5.5 7H4.25A1.25 1.25 0 0 0 3 8.25v4.5A1.25 1.25 0 0 0 4.25 14h7.5A1.25 1.25 0 0 0 13 12.75v-4.5A1.25 1.25 0 0 0 11.75 7H10.5" />
            </>
          )}
        </svg>
      </button>
      <span className={cx("visually-hidden")} role="status">
        {announcement}
      </span>
    </>
  );
};
