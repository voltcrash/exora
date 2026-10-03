import { useChrome } from "../../chrome-context.ts";
import type { SceneHost, XrStatus } from "../../scene-host.ts";
import { Button } from "../ui/Button.tsx";
import { Icon } from "../ui/Icon.tsx";
import { Kbd, MODIFIER_KEY } from "../ui/Kbd.tsx";
import { BrandMark } from "./BrandMark.tsx";
import styles from "./shell.module.css";

const XR_LABELS: Partial<Record<XrStatus, string>> = {
  entering: "Entering…",
  "ready-ar": "View in AR",
  "ready-ar-launch": "View in AR",
  "ready-vr": "Enter VR",
};

const XR_READY = new Set<XrStatus>(["ready-ar", "ready-ar-launch", "ready-vr"]);

interface TopBarProps {
  host: SceneHost | null;
  xrStatus: XrStatus;
}

/*
 * Everything a view can be asked to do, in one row: go somewhere by name, browse, clear the view,
 * or step into it with a headset. The immersive control only appears once the device can honour
 * it — a disabled "not available" button is a promise the page cannot keep.
 */
export const TopBar = ({ host, xrStatus }: TopBarProps) => {
  const { chromeHidden, openDiscover, openPalette, toggleChrome } = useChrome();
  const xrLabel = XR_LABELS[xrStatus];

  return (
    <header className={styles["topbar"]} data-testid="topbar">
      <a className={styles["brand"]} href="/" aria-label="Exora home">
        <BrandMark />
        <span className={styles["brand-name"]}>Exora</span>
      </a>

      <button
        className={styles["search"]}
        data-testid="open-palette"
        type="button"
        aria-label="Go anywhere"
        aria-keyshortcuts="Meta+K Control+K /"
        onClick={openPalette}
      >
        <Icon name="search" size={17} />
        <span className={styles["search-label"]}>Go anywhere</span>
        <span className={styles["search-keys"]} aria-hidden="true">
          <Kbd>{`${MODIFIER_KEY} K`}</Kbd>
        </span>
      </button>

      <div className={styles["actions"]} data-testid="control-deck">
        <Button
          id="open-discover"
          className={styles["explore"]}
          data-testid="discover-trigger"
          icon="compass"
          variant="primary"
          aria-keyshortcuts="Backspace"
          onClick={openDiscover}
        >
          Explore
        </Button>
        <Button
          data-testid="clear-view"
          icon={chromeHidden ? "eye" : "eye-off"}
          variant="surface"
          aria-label={chromeHidden ? "Show the interface" : "Hide the interface"}
          aria-pressed={chromeHidden}
          aria-keyshortcuts="H"
          title="Hide the interface (H)"
          onClick={toggleChrome}
        />
        {xrLabel ? (
          <Button
            className={styles["xr"]}
            data-testid="enter-vr"
            icon="headset"
            variant="surface"
            disabled={!XR_READY.has(xrStatus)}
            onClick={() =>
              void host?.enterImmersive().catch((error: unknown) => console.error(error))
            }
          >
            {xrLabel}
          </Button>
        ) : null}
      </div>
    </header>
  );
};
