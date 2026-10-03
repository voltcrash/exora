import { useEffect, useState } from "react";
import { shareDestination, type ShareOutcome } from "../share-destination.ts";
import { Button } from "./ui/Button.tsx";

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
      <Button
        data-outcome={outcome ?? undefined}
        data-testid="share-destination"
        icon={outcome === "copied" ? "check" : "share"}
        size="sm"
        variant="ghost"
        aria-label="Share this destination"
        title={announcement || "Share this destination"}
        onClick={() =>
          void shareDestination({ title: document.title, url: window.location.href }).then(
            setOutcome,
          )
        }
      />
      <span className="visually-hidden" role="status">
        {announcement}
      </span>
    </>
  );
};
