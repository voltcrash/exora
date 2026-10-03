import { useEffect, type CSSProperties, type ReactNode } from "react";
import { useChrome } from "../../chrome-context.ts";
import type { DestinationPanelModel } from "../../destination-panel.ts";
import type { SceneHost } from "../../scene-host.ts";
import { bindStyles } from "../../styles/bind-styles.ts";
import type { TravelPhase } from "../../travel-transition.ts";
import { useFrameRate, useXrStatus } from "../../use-scene-readouts.ts";
import { useTypographySettled } from "../../use-typography-settled.ts";
import { DestinationIdentity, type DestinationIdentityProps } from "../DestinationIdentity.tsx";
import { DestinationPanel } from "../DestinationPanel.tsx";
import { Button } from "../ui/Button.tsx";
import { ControlHints, type ControlHint } from "./ControlHints.tsx";
import { DestinationSheet } from "./DestinationSheet.tsx";
import { LoadingScreen } from "./LoadingScreen.tsx";
import { TopBar } from "./TopBar.tsx";
import styles from "./shell.module.css";

const cx = bindStyles(styles);

export type SceneState = "error" | "loading" | "ready";

interface DestinationShellProps {
  /** Extra state classes for the shell, such as `star-experience` or the planet's view mode. */
  className?: string;
  hints: readonly ControlHint[];
  host: SceneHost | null;
  identity: DestinationIdentityProps;
  /** The local star's light as an `r g b` triplet; see `star-light.ts`. */
  light: string;
  loading: { detail: string; title: string };
  panel: DestinationPanelModel;
  sceneState: SceneState;
  style?: CSSProperties;
  /** Planets descend to a surface, and the dark that covers the swap belongs to the shell. */
  surfaceVeil?: boolean;
  travelPhase: TravelPhase;
  children?: ReactNode;
}

/*
 * THE SHAPE OF EVERY DESTINATION
 *
 * A world, a star, a black hole, a diorama and a region differ in what they know, never in where
 * they say it: the bar of actions across the top, who this is and where to go next at the lower
 * left, the readings on the right, and on a phone the last two gathered into one sheet. Each
 * experience describes itself through `identity` and `panel` and the shell does the rest, so a
 * change to the chrome is made once.
 */
export const DestinationShell = ({
  children,
  className,
  hints,
  host,
  identity,
  light,
  loading,
  panel,
  sceneState,
  style,
  surfaceVeil = false,
  travelPhase,
}: DestinationShellProps) => {
  const { chromeHidden, toggleChrome } = useChrome();
  const fps = useFrameRate(host);
  const xrStatus = useXrStatus(host);
  const typographySettled = useTypographySettled();
  const travelling = travelPhase === "departing" || travelPhase === "crossing";
  const settled =
    (sceneState === "ready" && typographySettled) ||
    sceneState === "error" ||
    travelPhase !== "idle";

  // Overlays opened over this destination — Explore, the palette, a tour — read the same light.
  useEffect(() => {
    document.documentElement.style.setProperty("--light-rgb", light);
  }, [light]);

  useEffect(() => {
    if (host) document.body.dataset.qualityTier = host.qualityTier;
  }, [host]);

  return (
    <div
      className={cx(
        "experience-shell",
        className,
        settled && "scene-ready",
        sceneState === "error" && "scene-error",
        travelling && "travelling",
        chromeHidden && "chrome-hidden",
      )}
      style={{ "--light-rgb": light, ...style } as CSSProperties}
    >
      <div className={cx("space-haze")} aria-hidden="true" />
      {surfaceVeil ? <div className={cx("surface-veil")} aria-hidden="true" /> : null}

      <TopBar host={host} xrStatus={xrStatus} />

      <main className={cx("hud")} data-testid="hud">
        <DestinationSheet>
          <DestinationIdentity {...identity} links={panel.links} />
          <DestinationPanel fps={fps} model={panel} />
        </DestinationSheet>
      </main>

      <ControlHints failed={sceneState === "error"} hints={hints} />

      <div className={cx("restore")}>
        <Button
          data-testid="restore-view"
          icon="eye"
          variant="surface"
          aria-pressed={true}
          onClick={toggleChrome}
        >
          Show the interface
        </Button>
      </div>

      {children}

      <LoadingScreen title={loading.title} detail={loading.detail} />
    </div>
  );
};
