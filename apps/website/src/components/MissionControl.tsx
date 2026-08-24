import type { SceneHost, XrStatus } from "../scene-host.ts";
import { DiscoverTrigger } from "./DiscoverTrigger.tsx";

const xrButtonCopy: Record<XrStatus, string> = {
  checking: "CHECKING HEADSET",
  entering: "ENTERING SESSION",
  "in-xr": "SESSION ACTIVE",
  ready: "ENTER IMMERSIVE VR",
  unavailable: "VR UNAVAILABLE",
};

/** One key, and what it does to the scene under the deck. */
export interface ControlHint {
  key: string;
  meaning: string;
}

interface MissionControlProps {
  /** The host's last frame-rate reading, or `--` before one has been taken. */
  fps: string;
  /** The legend for this view: every gesture the scene answers to, in reading order. */
  hints: ControlHint[];
  onHideChrome: () => void;
  onOpenDiscover: () => void;
  /** Printed beside the frame rate by the views that pick a render tier. */
  qualityTier?: string | undefined;
  /** Whether the world under the deck failed to build. */
  sceneFailed: boolean;
  /** Left out by the views with no immersive scene to enter. */
  xr?: { host: SceneHost | null; status: XrStatus } | undefined;
}

/**
 * MISSION CONTROL — the single deck at the bottom centre holding everything a view can be told.
 *
 * Discover, the gesture legend, the frame-rate readout, the clear-view switch and the immersive
 * entry each used to hold a different corner of the screen. They are one instrument here, so
 * there is one place to look rather than four, and every destination gets the same one: the deck
 * is shared, and a view supplies only the parts that differ — its legend, and whether it has an
 * immersive scene to offer at all.
 *
 * Discover leads because it is the only control that goes somewhere. It keeps its own lit
 * surface for that reason; the rest sit flat in the deck until they are hovered.
 */
export const MissionControl = ({
  fps,
  hints,
  onHideChrome,
  onOpenDiscover,
  qualityTier,
  sceneFailed,
  xr,
}: MissionControlProps) => (
  <footer className="mission-control">
    <div className="control-deck">
      <DiscoverTrigger onClick={onOpenDiscover} />

      {/*
       * A renderer that could not build the world has no gestures to advertise and no frames to
       * count, so the readout is what the alert replaces. Discover stays either way — travelling
       * somewhere else is the way out of a world that would not assemble.
       */}
      {sceneFailed ? (
        <div className="deck-group">
          <p className="scene-alert" role="status">
            RENDERER UNAVAILABLE
          </p>
        </div>
      ) : (
        <div className="deck-group deck-readout">
          <div className="interaction-hint" aria-label="Desktop controls">
            {hints.map((hint) => (
              <span key={hint.key}>
                <kbd>{hint.key}</kbd>
                <small>{hint.meaning}</small>
              </span>
            ))}
          </div>
          <span className="performance-readout">
            <strong>{fps}</strong>
            <small>{qualityTier === undefined ? "FPS" : `FPS · ${qualityTier}`}</small>
          </span>
        </div>
      )}

      <div className="deck-group deck-actions">
        <button
          className="clear-view"
          type="button"
          aria-label="Hide the interface"
          onClick={onHideChrome}
        >
          <span className="clear-view-mark" aria-hidden="true" />
          <span>
            <small>CLEAR VIEW</small>
            <strong>HIDE INTERFACE</strong>
          </span>
          <kbd>TAB</kbd>
        </button>
        {xr ? (
          <button
            className="enter-vr"
            type="button"
            // The copy inside is dropped on a phone and the orbit mark left behind is decorative,
            // so the button's name has to come from somewhere the media query cannot reach. It
            // carries the status because the status is what the visible copy says.
            aria-label={`Immersive mode: ${xrButtonCopy[xr.status]}`}
            disabled={xr.status !== "ready"}
            onClick={() => void xr.host?.enterVr().catch((error: unknown) => console.error(error))}
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
        ) : null}
      </div>
    </div>
  </footer>
);
