import { frameRateStrength } from "../frame-rate.ts";

interface FrameRateSignalProps {
  fps: string;
}

export const FrameRateSignal = ({ fps }: FrameRateSignalProps) => {
  const displayedFps = fps.trim() !== "" && Number.isFinite(Number(fps)) ? fps : "∞";

  return (
    <span className="frame-rate-signal">
      <span className="frame-rate-count">
        <span className="frame-rate-reading">
          <span className="signal-bars" data-strength={frameRateStrength(fps)} aria-hidden="true">
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
