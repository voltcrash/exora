import type { SceneHost, XrStatus } from "../scene-host.ts";
import { DiscoverTrigger } from "./DiscoverTrigger.tsx";

const xrButtonCopy: Record<XrStatus, string> = {
  checking: "CHECKING HEADSET",
  entering: "ENTERING SESSION",
  "in-xr": "SESSION ACTIVE",
  "ready-ar": "PLACE IN YOUR SPACE",
  "ready-ar-launch": "OPEN AR ON IPHONE",
  "ready-vr": "ENTER IMMERSIVE VR",
  unavailable: "VR UNAVAILABLE",
};

const readyStatuses = new Set<XrStatus>(["ready-ar", "ready-ar-launch", "ready-vr"]);

/** One key, and what it does to the scene under the deck. */
export interface ControlHint {
  key: string;
  meaning: string;
}

interface MissionControlProps {
  chromeHidden: boolean;
  /** The legend for this view: every gesture the scene answers to, in reading order. */
  hints: ControlHint[];
  onToggleChrome: () => void;
  onOpenDiscover: () => void;
  /** Whether the world under the deck failed to build. */
  sceneFailed: boolean;
  /** Left out by the views with no immersive scene to enter. */
  xr?: { host: SceneHost | null; status: XrStatus } | undefined;
}

/**
 * MISSION CONTROL — the navigation deck at the top right, and the instruction line at the bottom.
 *
 * Discover, the gesture legend, the frame counter, the clear-view switch and the immersive entry
 * each used to hold a different corner of the screen. Gathering them cost nothing but showed what
 * each one was: three of them are controls and two of them are reading matter, and a tray of five
 * cells made no distinction between pressing something and being told something.
 *
 * So the deck is now the three controls alone — Discover, clear view, the immersive entry — in
 * the same order a visitor moves from navigation to presentation to the optional headset mode.
 * The frame counter went to the archive panel's signal bars; the legend, and the alert that
 * replaces it, sit outside the deck as copy rather than as cells that look pressable and are not.
 */
export const MissionControl = ({
  chromeHidden,
  hints,
  onToggleChrome,
  onOpenDiscover,
  sceneFailed,
  xr,
}: MissionControlProps) => (
  <footer className="mission-control">
    {/*
     * A renderer that could not build the world has no gestures to advertise, so the alert takes
     * the legend's line rather than a place of its own. The deck below is untouched by either —
     * travelling somewhere else is the way out of a world that would not assemble.
     */}
    {sceneFailed ? (
      <p className="scene-alert" role="status">
        RENDERER UNAVAILABLE
      </p>
    ) : (
      <div className="interaction-hint" aria-label="Desktop controls">
        {hints.map((hint) => (
          <span key={hint.key}>
            <kbd>{hint.key}</kbd>
            <small>{hint.meaning}</small>
          </span>
        ))}
      </div>
    )}

    <div className="control-deck">
      <DiscoverTrigger onClick={onOpenDiscover} />

      <div className="deck-group deck-utility">
        <button
          className="clear-view"
          type="button"
          aria-label={chromeHidden ? "Show the interface" : "Hide the interface"}
          aria-pressed={chromeHidden}
          onClick={onToggleChrome}
        >
          <span className="clear-view-mark" aria-hidden="true" />
          <span>
            <small>{chromeHidden ? "RESTORE VIEW" : "CLEAR VIEW"}</small>
            <strong>{chromeHidden ? "SHOW INTERFACE" : "HIDE INTERFACE"}</strong>
          </span>
          <kbd className="shortcut-icon" aria-label="Tab">
            ⇥
          </kbd>
        </button>
      </div>

      {/* Rendered only where there is a scene to enter: an absent group leaves no empty slot. */}
      {xr ? (
        <div className="deck-group deck-actions">
          <button
            className="enter-vr"
            type="button"
            // The copy inside is dropped on a phone and the orbit mark left behind is decorative,
            // so the button's name has to come from somewhere the media query cannot reach. It
            // carries the status because the status is what the visible copy says.
            aria-label={`Immersive mode: ${xrButtonCopy[xr.status]}`}
            disabled={!readyStatuses.has(xr.status)}
            onClick={() =>
              void xr.host?.enterImmersive().catch((error: unknown) => console.error(error))
            }
          >
            <span className="button-orbit" aria-hidden="true" />
            <span>
              <small>IMMERSIVE MODE</small>
              <strong>{xrButtonCopy[xr.status]}</strong>
            </span>
            <span className="button-arrow" aria-hidden="true">
              ↗
            </span>
          </button>
        </div>
      ) : null}
    </div>
  </footer>
);
