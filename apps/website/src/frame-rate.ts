/**
 * The frame rate, read as a signal strength.
 *
 * The renderer's frame counter now lives in the telemetry panel's heading, where the four bars
 * beside it stopped being decoration and became the meter for it. That means turning a number
 * into a count of lit bars, which is this.
 *
 * The thresholds are refresh-rate landmarks rather than quarters of sixty. A display's own rate is
 * the ceiling a scene can be drawn at, and a panel that reports 57 while it is being asked for 60
 * is running as well as that panel allows — so full strength is claimed a little under the number,
 * or the last bar would be reserved for a reading the hardware never produces. Below that, the
 * steps are where a moving scene stops feeling continuous: fifty-ish is smooth, the thirties are
 * visibly cheaper but still fluid, and under twenty-five is a slideshow.
 *
 * Kept pure and out of React so the thresholds can be read and tested on their own, in the same
 * spirit as the other small, pure UI helpers.
 */

/** How many of the four bars are lit for a reading, `0` before the host has produced one. */
export type SignalStrength = 0 | 1 | 2 | 3 | 4;

/**
 * Resolves the host's last reading — the same string the readout prints — into lit bars.
 *
 * It takes the printed reading rather than a number because that is what a view holds: the counter
 * is sampled once a second into display state, and `--` until the first sample lands. Anything
 * that is not a reading lights nothing, which is what an empty meter should mean.
 */
export const frameRateStrength = (fps: string): SignalStrength => {
  const reading = Number.parseFloat(fps);
  if (!Number.isFinite(reading)) return 0;
  if (reading >= 55) return 4;
  if (reading >= 40) return 3;
  if (reading >= 25) return 2;
  return 1;
};
