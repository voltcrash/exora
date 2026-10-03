import { frameRateStrength } from "../frame-rate.ts";
import styles from "./Destination.module.css";

interface FrameRateSignalProps {
  fps: string;
}

export const FrameRateSignal = ({ fps }: FrameRateSignalProps) => {
  const displayedFps = fps.trim() !== "" && Number.isFinite(Number(fps)) ? fps : "∞";

  return (
    <span className={styles["frame-rate"]} title="Frames drawn per second">
      <span className={styles["frame-rate-reading"]} data-testid="frame-rate-reading">
        <span
          className={styles["signal-bars"]}
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
  );
};
