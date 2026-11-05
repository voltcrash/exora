import { useEffect, useRef, useState } from "react";
import { shareDestination, type ShareOutcome } from "../share-destination.ts";
import { Button } from "./ui/Button.tsx";

const ANNOUNCEMENTS: Partial<Record<ShareOutcome, string>> = {
  copied: "Link copied",
  failed: "Could not copy the link",
};

const ANNOUNCEMENT_MS = 2_400;

export const ShareButton = () => {
  const busy = useRef(false);
  const alive = useRef(true);
  const [pending, setPending] = useState(false);
  const [result, setResult] = useState<{ outcome: ShareOutcome } | null>(null);
  const outcome = result?.outcome ?? null;
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  useEffect(() => {
    if (!outcome) return;
    const timer = window.setTimeout(() => setResult(null), ANNOUNCEMENT_MS);
    return () => window.clearTimeout(timer);
  }, [result]);

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
        disabled={pending}
        aria-busy={pending}
        onClick={() => {
          if (busy.current) return;
          busy.current = true;
          setPending(true);
          void shareDestination({ title: document.title, url: window.location.href })
            .then((next) => {
              if (alive.current) setResult({ outcome: next });
            })
            .finally(() => {
              busy.current = false;
              if (alive.current) setPending(false);
            });
        }}
      />
      <span className="visually-hidden" role="status">
        {announcement}
      </span>
    </>
  );
};
