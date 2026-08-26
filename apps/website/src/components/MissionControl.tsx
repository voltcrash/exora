import type { SceneHost, XrStatus } from "../scene-host.ts";
import { DiscoverTrigger } from "./DiscoverTrigger.tsx";

const immersiveButtonCopy: Record<XrStatus, "ENTER AR" | "ENTER AR/VR" | "ENTER VR"> = {
  checking: "ENTER AR/VR",
  entering: "ENTER AR/VR",
  "in-xr": "ENTER AR/VR",
  "ready-ar": "ENTER AR",
  "ready-ar-launch": "ENTER AR",
  "ready-vr": "ENTER VR",
  unavailable: "ENTER AR/VR",
};

const readyStatuses = new Set<XrStatus>(["ready-ar", "ready-ar-launch", "ready-vr"]);

type ImmersiveMode = "ar" | "neutral" | "vr";

const immersiveMode = (status: XrStatus): ImmersiveMode =>
  status === "ready-vr"
    ? "vr"
    : status === "ready-ar" || status === "ready-ar-launch"
      ? "ar"
      : "neutral";

/** A phone-and-cube for AR, a headset for VR, and a combined spatial visor before detection. */
const ImmersiveModeIcon = ({ mode }: { mode: ImmersiveMode }) => (
  <svg className="immersive-mode-icon" data-mode={mode} viewBox="0 0 28 28" aria-hidden="true">
    {mode === "ar" ? (
      <>
        <rect x="7" y="2.5" width="14" height="23" rx="3" />
        <path d="m10.5 11.5 3.5-2 3.5 2v4L14 18l-3.5-2.5v-4Z" />
        <path d="m10.5 11.5 3.5 2 3.5-2M14 13.5V18" />
      </>
    ) : (
      <>
        <path d="M5 9.5h18l2 3.5-2.4 6H17l-3-3-3 3H5.4L3 13l2-3.5Z" />
        <path d="M8 13h3M17 13h3" />
        {mode === "neutral" ? <path d="M14 5V2.5M8 6 6.5 4M20 6l1.5-2" /> : null}
      </>
    )}
  </svg>
);

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
          <svg className="clear-view-icon" viewBox="0 0 28 28" aria-hidden="true">
            <path d="M3 14s4-7 11-7 11 7 11 7-4 7-11 7S3 14 3 14Z" />
            <circle cx="14" cy="14" r="3.5" />
            {!chromeHidden ? <path className="eye-slash" d="m5 23 18-18" /> : null}
          </svg>
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
            aria-label={`Immersive mode: ${immersiveButtonCopy[xr.status]}`}
            disabled={!readyStatuses.has(xr.status)}
            onClick={() =>
              void xr.host?.enterImmersive().catch((error: unknown) => console.error(error))
            }
          >
            <ImmersiveModeIcon mode={immersiveMode(xr.status)} />
            <span>
              <strong>{immersiveButtonCopy[xr.status]}</strong>
            </span>
          </button>
        </div>
      ) : null}
    </div>
  </footer>
);
