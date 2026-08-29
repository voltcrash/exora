import type { SceneHost, XrStatus } from "../scene-host.ts";
import { DiscoverTrigger } from "./DiscoverTrigger.tsx";
import sharedStyles from "./ExperienceShared.module.css";
import { bindStyles } from "../styles/bind-styles.ts";

const cx = bindStyles(sharedStyles);

const xrAvailabilityCopy: Record<XrStatus, "AR AVAILABLE" | "NOT AVAILABLE" | "VR AVAILABLE"> = {
  checking: "NOT AVAILABLE",
  entering: "NOT AVAILABLE",
  "in-xr": "NOT AVAILABLE",
  "ready-ar": "AR AVAILABLE",
  "ready-ar-launch": "AR AVAILABLE",
  "ready-vr": "VR AVAILABLE",
  unavailable: "NOT AVAILABLE",
};

const readyStatuses = new Set<XrStatus>(["ready-ar", "ready-ar-launch", "ready-vr"]);

const ImmersiveModeIcon = () => (
  <svg
    className={cx("immersive-mode-icon")}
    data-testid="immersive-mode-icon"
    viewBox="0 0 32 28"
    aria-hidden="true"
  >
    <path d="M4.5 10.5C5.2 7 8.3 5 12.5 5h7c4.2 0 7.3 2 8 5.5l.7 5.4c.4 3.1-1.5 5.1-4.4 5.1h-3.1c-2.1 0-2.8-2.8-4.7-2.8S13.4 21 11.3 21H8.2c-2.9 0-4.8-2-4.4-5.1l.7-5.4Z" />
    <path className={cx("visor-highlight")} d="M7.5 10c4.4-2.2 12.6-2.2 17 0" />
    <path d="M3.8 12H1.5M28.2 12h2.3" />
  </svg>
);

export interface ControlHint {
  key: string;
  meaning: string;
}

interface MissionControlProps {
  chromeHidden: boolean;
  hints: ControlHint[];
  onToggleChrome: () => void;
  onOpenDiscover: () => void;
  sceneFailed: boolean;
  xr?: { host: SceneHost | null; status: XrStatus } | undefined;
}

export const MissionControl = ({
  chromeHidden,
  hints,
  onToggleChrome,
  onOpenDiscover,
  sceneFailed,
  xr,
}: MissionControlProps) => (
  <footer className={cx("mission-control")} data-testid="mission-control">
    {sceneFailed ? (
      <p className={cx("scene-alert")} role="status">
        RENDERER UNAVAILABLE
      </p>
    ) : (
      <div className={cx("interaction-hint")} aria-label="Desktop controls">
        {hints.map((hint) => (
          <span key={hint.key}>
            <kbd>{hint.key}</kbd>
            <small>{hint.meaning}</small>
          </span>
        ))}
      </div>
    )}

    <div className={cx("control-deck")} data-testid="control-deck">
      <DiscoverTrigger onClick={onOpenDiscover} />

      <div className={cx("deck-group deck-utility")}>
        <button
          className={cx("clear-view")}
          data-testid="clear-view"
          type="button"
          aria-label={chromeHidden ? "Show the interface" : "Hide the interface"}
          aria-pressed={chromeHidden}
          onClick={onToggleChrome}
        >
          <svg
            className={cx("clear-view-icon")}
            data-testid="clear-view-icon"
            viewBox="0 0 28 28"
            aria-hidden="true"
          >
            <path d="M3 14s4-7 11-7 11 7 11 7-4 7-11 7S3 14 3 14Z" />
            <circle cx="14" cy="14" r="3.5" />
            {!chromeHidden ? <path className={cx("eye-slash")} d="m5 23 18-18" /> : null}
          </svg>
          <span>
            <small>{chromeHidden ? "RESTORE VIEW" : "CLEAR VIEW"}</small>
            <strong>{chromeHidden ? "SHOW INTERFACE" : "HIDE INTERFACE"}</strong>
          </span>
          <kbd className={cx("shortcut-icon")} data-testid="clear-view-shortcut" aria-label="Tab">
            ⇥
          </kbd>
        </button>
      </div>

      {xr ? (
        <div className={cx("deck-group deck-actions")}>
          <button
            className={cx("enter-vr")}
            data-testid="enter-vr"
            type="button"
            aria-label={`XR: ${xrAvailabilityCopy[xr.status]}`}
            disabled={!readyStatuses.has(xr.status)}
            onClick={() =>
              void xr.host?.enterImmersive().catch((error: unknown) => console.error(error))
            }
          >
            <ImmersiveModeIcon />
            <span>
              <small>XR</small>
              <strong>{xrAvailabilityCopy[xr.status]}</strong>
            </span>
          </button>
        </div>
      ) : null}
    </div>
  </footer>
);
