import { frameRateStrength } from "../frame-rate.ts";

interface FrameRateSignalProps {
  /** The host's last frame-rate reading, or `--` before one has been taken. */
  fps: string;
  /** Printed under the count by the views that pick a render tier. */
  qualityTier?: string | undefined;
}

/**
 * THE SIGNAL — the renderer's frame rate, in the corner of the archive panel's heading.
 *
 * Four bars have always sat there. They were a drawing of a signal and said nothing; the number
 * they now read was down on the control deck, in a cell that spent deck width on a figure nobody
 * travels anywhere by. Putting the two together costs no space at all and turns both into one
 * instrument: the bars say at a glance whether the world is being drawn well, and the count says
 * exactly how well for anyone who looks twice.
 *
 * The count stays visible text rather than a label on the bars, so a reader who cannot see the
 * meter still gets the reading — and stays out of a live region, because a figure that changes
 * every second is not worth announcing over whatever else is being read.
 */
export const FrameRateSignal = ({ fps, qualityTier }: FrameRateSignalProps) => (
  <span className="frame-rate-signal">
    <span className="signal-bars" data-strength={frameRateStrength(fps)} aria-hidden="true">
      <i />
      <i />
      <i />
      <i />
    </span>
    <span className="frame-rate-count">
      <strong>{fps}</strong>
      <small>{qualityTier === undefined ? "FPS" : `FPS · ${qualityTier}`}</small>
    </span>
  </span>
);
