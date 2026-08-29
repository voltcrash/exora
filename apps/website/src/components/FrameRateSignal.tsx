import { frameRateStrength } from "../frame-rate.ts";
import sharedStyles from "./ExperienceShared.module.css";
import { bindStyles } from "../styles/bind-styles.ts";

const cx = bindStyles(sharedStyles);

interface FrameRateSignalProps {
  fps: string;
}

export const FrameRateSignal = ({ fps }: FrameRateSignalProps) => {
  const displayedFps = fps.trim() !== "" && Number.isFinite(Number(fps)) ? fps : "∞";

  return (
    <span className={cx("frame-rate-signal")}>
      <span className={cx("frame-rate-count")}>
        <span className={cx("frame-rate-reading")} data-testid="frame-rate-reading">
          <span
            className={cx("signal-bars")}
            data-testid="signal-bars"
            data-strength={frameRateStrength(fps)}
            aria-hidden="true"
          >
            <i />
            <i />
            <i />
            <i />
          </span>
          <strong>{displayedFps}</strong>
        </span>
        <small>FPS</small>
      </span>
    </span>
  );
};
